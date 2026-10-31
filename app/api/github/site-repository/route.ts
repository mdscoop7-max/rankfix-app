import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { siteConsentValid, MERGE_CLAIM_TTL_MINUTES } from "@/lib/fix-engine";
import { evaluatePolicy, parsePolicySnapshot, parseRecordedPolicy, readServerPolicy } from "@/lib/merge-policy";
import { decryptToken, githubFetch } from "@/lib/github";

const publicPolicy=(value:unknown)=>{const p=parseRecordedPolicy(value);return {valid:p.valid,checks:p.checks.map(c=>({context:c.context,app_id:c.appId})),error:p.error||null};};

function normalizeHost(value:string){
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./,""); }
  catch { return ""; }
}

export async function GET(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const url=new URL(request.url).searchParams.get("url")||"";
  const host=normalizeHost(url);
  if(!host) return NextResponse.json({error:"Ongeldige website-URL."},{status:400});
  await ensureDatabase();
  const result=await getDb().query(
    "SELECT repository,base_branch,verified_at,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at,autofix_required_checks,autofix_policy_floor FROM website_repositories WHERE user_id=$1 AND website_host=$2 LIMIT 1",
    [user.id,host]
  );
  if(!result.rowCount) return NextResponse.json({mapped:false,website_host:host,autofix:{enabled:false}});
  const row=result.rows[0];
  // Astra F5 onboarding: what GitHub itself enforces for this branch, read with
  // the owner's own token. AutoFix merges only when this is "enforced".
  let serverPolicy:{state:string;code:string;checks:Array<{context:string;app_id:number|null;source:string}>}={state:"unknown",code:"GITHUB_NOT_CONNECTED",checks:[]};
  try{
    const connection=await getDb().query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1 LIMIT 1",[user.id]);
    if(connection.rowCount){
      const token=decryptToken(connection.rows[0].access_token_encrypted);
      const gh=<T,>(path:string,init?:RequestInit)=>githubFetch<T>(token,path,init);
      const server=await readServerPolicy(gh,String(row.repository),String(row.base_branch));
      const decision=evaluatePolicy({server,recorded:parseRecordedPolicy(row.autofix_required_checks),snapshot:parsePolicySnapshot(row.autofix_policy_floor)});
      serverPolicy={state:decision.verdict==="ok"?"enforced":decision.verdict==="wait"?"unavailable":"not_enforced",code:decision.code,checks:decision.required.map(c=>({context:c.context,app_id:c.appId,source:c.source}))};
    }
  }catch{ serverPolicy={state:"unavailable",code:"POLICY_UNAVAILABLE",checks:[]}; }
  return NextResponse.json({mapped:true,serverPolicy,website_host:host,repository:row.repository,baseBranch:row.base_branch,verifiedAt:row.verified_at,autofix:{enabled:siteConsentValid(row),consentedAt:row.autofix_consented_at||null,requiredChecks:publicPolicy(row.autofix_required_checks)}});
}

// Explicit, per-website AutoFix publication consent. It is bound to the exact
// repository + branch at the moment of consent; a later mapping change voids it.
export async function PATCH(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const body=await request.json().catch(()=>({}));
  const host=normalizeHost(typeof body?.url==="string"?body.url:"");
  if(!host) return NextResponse.json({error:"Ongeldige website-URL."},{status:400});
  const enable=body?.autofix_publish===true;
  if(enable && body?.confirm!=="AUTOFIX_PUBLISH_CONSENT") return NextResponse.json({error:"Bevestig eerst expliciet dat RankFix ondersteunde, veilige fixes automatisch mag publiceren.",code:"CONSENT_REQUIRED"},{status:400});
  // The owner may record EXTRA required CI checks ({context, app_id}). They never
  // replace server-enforced rules (lib/merge-policy.ts). Astra F5/F7: a missing
  // field keeps the stored policy; null or [] clears it explicitly; one invalid
  // item rejects the whole request (never silently shortened).
  const policyProvided=Object.prototype.hasOwnProperty.call(body||{},"required_checks");
  const recorded=policyProvided?parseRecordedPolicy(body.required_checks):null;
  if(recorded&&!recorded.valid) return NextResponse.json({error:"Ongeldige lijst verplichte controles: "+recorded.error,code:"POLICY_INVALID"},{status:400});
  const policyValue=recorded?(recorded.checks.length?JSON.stringify(recorded.checks.map(c=>({context:c.context,app_id:c.appId}))):null):undefined;
  // The strictest policy ever seen for this repository+branch only goes down by an
  // explicit, confirmed owner action (never as a side effect of PATCH or resume).
  const resetFloor=body?.reset_policy_floor===true;
  if(resetFloor&&body?.confirm_policy_reset!=="POLICY_FLOOR_RESET") return NextResponse.json({error:"Bevestig expliciet dat je de eerder strengere GitHub-controles wilt laten vervallen.",code:"CONFIRMATION_REQUIRED"},{status:400});
  await ensureDatabase();
  const result=await getDb().query(
    enable
      ? "UPDATE website_repositories SET autofix_publish=TRUE,autofix_repository=repository,autofix_branch=base_branch,autofix_consented_at=NOW(),autofix_required_checks=CASE WHEN $3::boolean THEN $4 ELSE autofix_required_checks END,autofix_policy_floor=CASE WHEN $5::boolean THEN NULL ELSE autofix_policy_floor END,updated_at=NOW() WHERE user_id=$1 AND website_host=$2 RETURNING repository,base_branch,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at,autofix_required_checks"
      : "UPDATE website_repositories SET autofix_publish=FALSE,autofix_repository=NULL,autofix_branch=NULL,autofix_consented_at=NULL,autofix_required_checks=CASE WHEN $3::boolean THEN $4 ELSE autofix_required_checks END,autofix_policy_floor=CASE WHEN $5::boolean THEN NULL ELSE autofix_policy_floor END,updated_at=NOW() WHERE user_id=$1 AND website_host=$2 RETURNING repository,base_branch,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at,autofix_required_checks",
    [user.id,host,policyProvided,policyValue??null,resetFloor]
  );
  if(!result.rowCount) return NextResponse.json({error:"Koppel eerst de GitHub-repository van deze website.",code:"NOT_MAPPED"},{status:409});
  const row=result.rows[0];
  // Astra review point 10: revoking AutoFix stops automatic publication of every
  // unmerged task of this website (they stay available as Pull Request only).
  let tasksMadePrOnly=0;
  let tasksMergeInProgress=0;
  if(!enable){
    // A task whose merge is already claimed cannot be stopped any more; it is
    // reported honestly instead of being shown as "PR-only" (31 Oct race fix).
    const hostSql="regexp_replace(lower(split_part(split_part(scanned_url,'://',2),'/',1)),'^www\\.','')=$2";
    const stopped=await getDb().query(
      `UPDATE pending_fixes SET auto_publish=FALSE,updated_at=NOW() WHERE user_id=$1 AND merged_at IS NULL AND auto_publish=TRUE AND status IN ('AWAITING_MERGE','PR_CREATED','NEEDS_ATTENTION') AND ${hostSql} AND (merge_claim IS NULL OR merge_claim_at < NOW() - INTERVAL '${MERGE_CLAIM_TTL_MINUTES} minutes') RETURNING id`,
      [user.id,host]
    );
    tasksMadePrOnly=stopped.rowCount||0;
    const busy=await getDb().query(
      `SELECT id FROM pending_fixes WHERE user_id=$1 AND merged_at IS NULL AND auto_publish=TRUE AND ${hostSql} AND merge_claim IS NOT NULL AND merge_claim_at >= NOW() - INTERVAL '${MERGE_CLAIM_TTL_MINUTES} minutes'`,
      [user.id,host]
    );
    tasksMergeInProgress=busy.rowCount||0;
  }
  return NextResponse.json({ok:true,website_host:host,tasksMadePrOnly,tasksMergeInProgress,autofix:{enabled:siteConsentValid(row),consentedAt:row.autofix_consented_at||null,repository:row.repository,branch:row.base_branch,requiredChecks:publicPolicy(row.autofix_required_checks)}});
}


export async function DELETE(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const body=await request.json().catch(()=>({}));
  const host=normalizeHost(typeof body?.url==="string"?body.url:"");
  if(!host) return NextResponse.json({error:"Ongeldige website-URL."},{status:400});
  await ensureDatabase();
  const result=await getDb().query(
    "DELETE FROM website_repositories WHERE user_id=$1 AND website_host=$2 RETURNING repository",
    [user.id,host]
  );
  return NextResponse.json({ok:true,mapped:false,website_host:host,previousRepository:result.rows[0]?.repository||null});
}
