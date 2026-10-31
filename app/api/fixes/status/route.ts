import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { decryptToken } from "@/lib/github";
import { advanceFix, publicFixView, autoPublishSupported, confirmedFixIsStale, fixActions, ACTIVE_FIX_STATUS_SQL, type FixRow } from "@/lib/fix-engine";
import { recoverLegacyEvidence, type StoredProposal } from "@/lib/fix-recovery";
import { createEngineDeps } from "@/lib/fix-engine-deps";
import { isTransientSeoCopy } from "@/lib/meta-description-fix";

function normalizeScanUrl(value:string){
  try{
    const url=new URL(value);
    url.hash="";
    url.hostname=url.hostname.toLowerCase().replace(/^www\./,"");
    url.pathname=url.pathname.replace(/\/+$/,"")||"/";
    return url.toString();
  }catch{return "";}
}

/**
 * Persisted Fix Engine status. Every call advances each active fix by at most one
 * safe step (merge with consent → deployment → live page), so progress continues
 * whenever the customer (re)opens RankFix, from any device.
 */
export async function GET(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const params=new URL(request.url).searchParams;
  const scannedUrl=normalizeScanUrl(params.get("url")||"");
  const issueFilter=(params.get("issue_id")||"").trim();
  const scanId=(params.get("scan_id")||"").trim();
  if(!scannedUrl) return NextResponse.json({error:"Ongeldige website URL."},{status:400});
  try{
    await ensureDatabase();
  }catch{
    return NextResponse.json({error:"De RankFix-database is tijdelijk niet bereikbaar. Er is niets gewijzigd; probeer het zo opnieuw.",code:"DATABASE_UNAVAILABLE"},{status:503});
  }
  const db=getDb();
  type ScanContext = NonNullable<Parameters<typeof confirmedFixIsStale>[1]> & {scanned_url:string;final_url?:string|null};
  let contextScan:ScanContext|null=null;
  if(scanId){
    const found=await db.query("SELECT created_at,scanned_url,final_url,result FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",[scanId,user.id]);
    if(!found.rowCount) return NextResponse.json({error:"Scan niet gevonden."},{status:404});
    contextScan=found.rows[0] as ScanContext;
    if(normalizeScanUrl(String(contextScan.final_url||contextScan.scanned_url))!==scannedUrl){
      return NextResponse.json({error:"De scan hoort niet bij deze website."},{status:400});
    }
  }
  // A historic successful Fix is not the same as the current state. Compare
  // every confirmation to the newest saved scan of this website, regardless
  // of which (older) report URL was opened.
  const latestResult=await db.query(
    "SELECT id::text AS id,created_at,result FROM scans WHERE user_id=$1 AND (scanned_url=$2 OR final_url=$2) ORDER BY created_at DESC LIMIT 1",
    [user.id,scannedUrl]
  );
  const latestScan=latestResult.rows[0]||null;
  const latestChecks=[
    ...(Array.isArray(latestScan?.result?.seo?.checks)?latestScan.result.seo.checks:[]),
    ...(Array.isArray(latestScan?.result?.geo?.checks)?latestScan.result.geo.checks:[])
  ];
  const latestCheck=latestChecks.find((c:{issue_id?:string;rule_id?:string})=>
    String(c.issue_id||c.rule_id||"").toUpperCase()===issueFilter.toUpperCase()
  );
  // Older saved scans keep their historical scoring rules. A temporary form
  // notification must not support a current verified SEO repair.
  const metaQualityIssue=isTransientSeoCopy(latestScan?.result?.metrics?.description);
  const latestScanInfo=latestScan
    ? {id:String(latestScan.id),created_at:latestScan.created_at,meta_quality_issue:metaQualityIssue,issue_status:latestCheck
        ? ((metaQualityIssue&&String(latestCheck.issue_id||latestCheck.rule_id||"")==="META_DESCRIPTION_GUIDANCE")?"WARNING":String(latestCheck.issue_status||latestCheck.status||"").toUpperCase()):null}
    : null;
  const pending=await db.query(
    `SELECT * FROM pending_fixes
     WHERE user_id=$1 AND scanned_url=$2
       AND (status IN (${ACTIVE_FIX_STATUS_SQL}) OR (status='VERIFIED_RESOLVED' AND updated_at>NOW()-INTERVAL '7 days'))
       AND ($3='' OR issue_id=$3)
       AND expires_at>NOW()
     ORDER BY updated_at DESC`,
    [user.id,scannedUrl,issueFilter]
  );
  const rows=pending.rows as FixRow[];
  const needsGithub=rows.some((row)=>row.status==="AWAITING_MERGE"||row.status==="PR_CREATED"||row.status==="AWAITING_DEPLOYMENT");
  let token:string|null=null;
  if(needsGithub){
    const connection=await db.query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1 LIMIT 1",[user.id]);
    if(connection.rowCount){ try{ token=decryptToken(connection.rows[0].access_token_encrypted); }catch{ token=null; } }
  }
  const deps=createEngineDeps(token);
  for(const row of rows.slice(0,10)){
    if(["AWAITING_MERGE","PR_CREATED","AWAITING_DEPLOYMENT","AWAITING_VERIFICATION","STILL_PRESENT"].includes(row.status)){
      await advanceFix(deps,row);
    }
  }
  // Always return fresh state: advanceFix can merge or change the database status.
  const refreshed=await db.query(
    `SELECT * FROM pending_fixes
     WHERE user_id=$1 AND scanned_url=$2
       AND (status IN (${ACTIVE_FIX_STATUS_SQL}) OR (status='VERIFIED_RESOLVED' AND updated_at>NOW()-INTERVAL '7 days'))
       AND ($3='' OR issue_id=$3)
       AND expires_at>NOW()
     ORDER BY updated_at DESC`,
    [user.id,scannedUrl,issueFilter]
  );
  const views=[];
  const alreadyReported=new Set<string>();
  for(const row of refreshed.rows as FixRow[]){
    // The newest repair wins. Never display two successful histories as two
    // currently resolved issues on either mobile or desktop.
    if(alreadyReported.has(row.issue_id)) continue;
    alreadyReported.add(row.issue_id);
    if(confirmedFixIsStale(row,latestScan)||confirmedFixIsStale(row,contextScan)) continue;
    if(row.status==="VERIFIED_RESOLVED" && row.issue_id==="META_DESCRIPTION_GUIDANCE" && metaQualityIssue) continue;
    const view=publicFixView(row);
    let review:null|{proposal_id:string;proposal_hash:string;scan_id:string;expected_value:string;summary:string}=null;
    // A previous Pull Request must not hide the customer approval action.
    // Expose only the stored, unexpired proposal for the exact authenticated owner,
    // repository, branch, file and issue. Never expose approval for AI rewrites.
    if(row.status==="AWAITING_MERGE"&&!row.auto_publish&&row.proposal_id&&row.pr_number){
      const saved=await db.query(
        "SELECT id,proposal_hash,scan_id,expected_value,summary,generator FROM fix_proposals WHERE id=$1 AND user_id=$2 AND issue_id=$3 AND repository=$4 AND base_branch=$5 AND file_path=$6 AND expires_at>NOW() LIMIT 1",
        [row.proposal_id,user.id,row.issue_id,row.repository,row.base_branch,row.file_path]
      );
      const proposal=saved.rows[0];
      if(proposal&&typeof proposal.expected_value==="string"&&proposal.expected_value.trim()&&autoPublishSupported(row.issue_id,String(proposal.generator||""))){
        review={proposal_id:String(proposal.id),proposal_hash:String(proposal.proposal_hash),scan_id:String(proposal.scan_id),expected_value:String(proposal.expected_value),summary:String(proposal.summary||"")};
      }
    }
    views.push({...view,review,pr_number:view.technical.pr_number,pr_url:view.technical.pr_url,branch:view.technical.branch,merged_at:view.technical.merged_at,verified_at:(row as FixRow & {verified_at?:string|null}).verified_at||null,verification_scan_id:(row as FixRow & {verification_scan_id?:string|null}).verification_scan_id||null});
  }
  return NextResponse.json({fixes:views,latest_scan:latestScanInfo});
}

/**
 * Owner recovery actions for a stopped AutoFix task (Astra F5). Nothing here
 * merges or skips a check: "resume" hands the task back to the fail-closed
 * engine with fresh evidence; "cancel" retires an unmerged task so a new
 * proposal can replace it. GitHub's PR state is authoritative.
 */
export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const body=await request.json().catch(()=>({}));
  const scannedUrl=normalizeScanUrl(typeof body?.url==="string"?body.url:"");
  const issueId=typeof body?.issue_id==="string"?body.issue_id.trim():"";
  const action=body?.action;
  if(!scannedUrl||!issueId||(action!=="resume"&&action!=="cancel")) return NextResponse.json({error:"Ongeldig verzoek.",code:"BAD_REQUEST"},{status:400});
  try{ await ensureDatabase(); }catch{ return NextResponse.json({error:"De RankFix-database is tijdelijk niet bereikbaar. Er is niets gewijzigd.",code:"DATABASE_UNAVAILABLE"},{status:503}); }
  const db=getDb();
  const found=await db.query(`SELECT * FROM pending_fixes WHERE user_id=$1 AND scanned_url=$2 AND issue_id=$3 AND status IN (${ACTIVE_FIX_STATUS_SQL}) ORDER BY updated_at DESC LIMIT 1`,[user.id,scannedUrl,issueId]);
  const row=found.rows[0] as FixRow|undefined;
  if(!row) return NextResponse.json({error:"Geen lopende Fix gevonden.",code:"NOT_FOUND"},{status:404});
  const allowed=fixActions(row);
  if(action==="resume"&&!allowed.resume) return NextResponse.json({error:"Deze Fix kan niet worden hervat; annuleer hem en maak een nieuw voorstel.",code:"NOT_RESUMABLE",reason_code:row.last_error_code||null},{status:409});
  if(action==="cancel"&&!allowed.cancel) return NextResponse.json({error:"Deze Fix kan niet meer worden geannuleerd (mogelijk al samengevoegd).",code:"NOT_CANCELLABLE"},{status:409});
  const connection=await db.query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1 LIMIT 1",[user.id]);
  let token:string|null=null;
  if(connection.rowCount){ try{ token=decryptToken(connection.rows[0].access_token_encrypted); }catch{ token=null; } }
  const deps=createEngineDeps(token);
  if(!deps.github||!row.repository||!row.pr_number) return NextResponse.json({error:"Verbind GitHub opnieuw om deze actie uit te voeren. Er is niets gewijzigd.",code:"GITHUB_NOT_CONNECTED"},{status:409});
  const gh=deps.github;
  try{
    if(action==="cancel"){
      const pr=await gh<{merged?:boolean;merged_at?:string|null}>(`/repos/${row.repository}/pulls/${Number(row.pr_number)}`);
      if(pr.merged||pr.merged_at){ await advanceFix(deps,row); return NextResponse.json({error:"Deze Fix is in GitHub al samengevoegd en kan niet worden geannuleerd.",code:"ALREADY_MERGED"},{status:409}); }
      const done=await db.query("UPDATE pending_fixes SET status='CANCELLED',auto_publish=FALSE,last_error_code='CANCELLED_BY_OWNER',next_check_at=NULL,updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status=$3 AND merged_at IS NULL RETURNING id",[row.id,user.id,row.status]);
      if(!done.rowCount) return NextResponse.json({error:"De Fix is intussen gewijzigd. Vernieuw de status.",code:"FIX_STATE_CHANGED"},{status:409});
      await db.query("INSERT INTO fix_events (proposal_id,pending_fix_id,user_id,stage,reason_code,detail) VALUES ($1,$2,$3,'CANCELLED','CANCELLED_BY_OWNER','{}'::jsonb)",[row.proposal_id||null,row.id,user.id]).catch(()=>{});
      return NextResponse.json({ok:true,cancelled:true,pr_url:row.pr_url||null,note:"De Pull Request staat nog open in GitHub; sluit hem daar als je hem niet meer nodig hebt."});
    }
    // Resume: refresh the owner's recorded policy from the CURRENT mapping (same
    // repository and branch only) and restore legacy evidence only when verified.
    const host=new URL(scannedUrl).hostname;
    const mapping=(await db.query("SELECT repository,base_branch,autofix_required_checks FROM website_repositories WHERE user_id=$1 AND website_host=$2 LIMIT 1",[user.id,host])).rows[0] as {repository?:string;base_branch?:string;autofix_required_checks?:string|null}|undefined;
    const sameTarget=Boolean(mapping&&String(mapping.repository||"").toLowerCase()===String(row.repository).toLowerCase()&&mapping.base_branch===row.base_branch);
    const fields:Record<string,unknown>={};
    if(sameTarget) fields.required_checks=mapping?.autofix_required_checks??null;
    if(!row.head_sha||!row.approved_content_sha256||!row.base_blob_sha){
      const proposal=row.proposal_id?(await db.query("SELECT proposed_content,base_blob_sha,file_path,repository,base_branch FROM fix_proposals WHERE id=$1 AND user_id=$2 LIMIT 1",[row.proposal_id,user.id])).rows[0] as StoredProposal|undefined:undefined;
      const recovered=await recoverLegacyEvidence(gh,row,proposal||null);
      if(!recovered.ok){
        await db.query("UPDATE pending_fixes SET last_error_code=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2",[row.id,user.id,recovered.code]);
        return NextResponse.json({error:"Het bewijs van de goedgekeurde wijziging kon niet worden hersteld. Annuleer deze Fix en maak een nieuw voorstel.",code:recovered.code},{status:409});
      }
      Object.assign(fields,recovered.fields);
    }
    const resumeStatus=row.merged_at?"AWAITING_DEPLOYMENT":"AWAITING_MERGE";
    const sets=["status=$3","phase_started_at=NOW()","next_check_at=NULL","last_error_code=NULL","updated_at=NOW()"];
    const params:unknown[]=[row.id,user.id,resumeStatus];
    for(const [key,value] of Object.entries(fields)){ params.push(value); sets.push(`${key}=$${params.length}`); }
    params.push(row.status);
    const updated=await db.query(`UPDATE pending_fixes SET ${sets.join(",")} WHERE id=$1 AND user_id=$2 AND status=$${params.length} RETURNING *`,params);
    if(!updated.rowCount) return NextResponse.json({error:"De Fix is intussen gewijzigd. Vernieuw de status.",code:"FIX_STATE_CHANGED"},{status:409});
    const fresh=updated.rows[0] as FixRow;
    await db.query("INSERT INTO fix_events (proposal_id,pending_fix_id,user_id,stage,reason_code,detail) VALUES ($1,$2,$3,$4,'RESUMED_BY_OWNER',$5::jsonb)",[fresh.proposal_id||null,fresh.id,user.id,resumeStatus,JSON.stringify({previous:row.last_error_code||null,recovered:Boolean(fields.head_sha)})]).catch(()=>{});
    await advanceFix(deps,fresh);
    const after=(await db.query("SELECT * FROM pending_fixes WHERE id=$1 AND user_id=$2",[fresh.id,user.id])).rows[0] as FixRow;
    return NextResponse.json({ok:true,fix:publicFixView(after)});
  }catch(error){
    const status=(error as {status?:number}).status;
    return NextResponse.json({error:"GitHub is nu niet bereikbaar. Er is niets gewijzigd; probeer het later opnieuw.",code:status===401?"GITHUB_NOT_CONNECTED":"GITHUB_UNAVAILABLE"},{status:503});
  }
}
