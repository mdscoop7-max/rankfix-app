import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { siteConsentValid } from "@/lib/fix-engine";
import { parseRecordedPolicy } from "@/lib/merge-policy";

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
    "SELECT repository,base_branch,verified_at,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at,autofix_required_checks FROM website_repositories WHERE user_id=$1 AND website_host=$2 LIMIT 1",
    [user.id,host]
  );
  if(!result.rowCount) return NextResponse.json({mapped:false,website_host:host,autofix:{enabled:false}});
  const row=result.rows[0];
  return NextResponse.json({mapped:true,website_host:host,repository:row.repository,baseBranch:row.base_branch,verifiedAt:row.verified_at,autofix:{enabled:siteConsentValid(row),consentedAt:row.autofix_consented_at||null,requiredChecks:publicPolicy(row.autofix_required_checks)}});
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
  await ensureDatabase();
  const result=await getDb().query(
    enable
      ? "UPDATE website_repositories SET autofix_publish=TRUE,autofix_repository=repository,autofix_branch=base_branch,autofix_consented_at=NOW(),autofix_required_checks=CASE WHEN $3::boolean THEN $4 ELSE autofix_required_checks END,updated_at=NOW() WHERE user_id=$1 AND website_host=$2 RETURNING repository,base_branch,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at,autofix_required_checks"
      : "UPDATE website_repositories SET autofix_publish=FALSE,autofix_repository=NULL,autofix_branch=NULL,autofix_consented_at=NULL,autofix_required_checks=CASE WHEN $3::boolean THEN $4 ELSE autofix_required_checks END,updated_at=NOW() WHERE user_id=$1 AND website_host=$2 RETURNING repository,base_branch,autofix_publish,autofix_repository,autofix_branch,autofix_consented_at,autofix_required_checks",
    [user.id,host,policyProvided,policyValue??null]
  );
  if(!result.rowCount) return NextResponse.json({error:"Koppel eerst de GitHub-repository van deze website.",code:"NOT_MAPPED"},{status:409});
  const row=result.rows[0];
  return NextResponse.json({ok:true,website_host:host,autofix:{enabled:siteConsentValid(row),consentedAt:row.autofix_consented_at||null,repository:row.repository,branch:row.base_branch,requiredChecks:publicPolicy(row.autofix_required_checks)}});
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
