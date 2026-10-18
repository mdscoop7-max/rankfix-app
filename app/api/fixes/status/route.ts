import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { decryptToken } from "@/lib/github";
import { advanceFix, publicFixView, ACTIVE_FIX_STATUS_SQL, type FixRow } from "@/lib/fix-engine";
import { createEngineDeps } from "@/lib/fix-engine-deps";

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
  if(!scannedUrl) return NextResponse.json({error:"Ongeldige website URL."},{status:400});
  try{
    await ensureDatabase();
  }catch{
    return NextResponse.json({error:"De RankFix-database is tijdelijk niet bereikbaar. Er is niets gewijzigd; probeer het zo opnieuw.",code:"DATABASE_UNAVAILABLE"},{status:503});
  }
  const db=getDb();
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
  return NextResponse.json({fixes:rows.map((row)=>{
    const view=publicFixView(row);
    // Backwards-compatible fields used by the audit page.
    return {...view,pr_number:view.technical.pr_number,pr_url:view.technical.pr_url,branch:view.technical.branch,merged_at:view.technical.merged_at,verified_at:(row as FixRow & {verified_at?:string|null}).verified_at||null,verification_scan_id:(row as FixRow & {verification_scan_id?:string|null}).verification_scan_id||null};
  })});
}
