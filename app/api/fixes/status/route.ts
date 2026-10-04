import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { decryptToken, githubFetch } from "@/lib/github";

function normalizeScanUrl(value:string){
  try{
    const url=new URL(value);
    url.hash="";
    url.hostname=url.hostname.toLowerCase().replace(/^www\./,"");
    url.pathname=url.pathname.replace(/\/+$/,"")||"/";
    return url.toString();
  }catch{return "";}
}

export async function GET(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  await ensureDatabase();
  const rawUrl=new URL(request.url).searchParams.get("url")||"";
  const scannedUrl=normalizeScanUrl(rawUrl);
  if(!scannedUrl) return NextResponse.json({error:"Ongeldige website URL."},{status:400});

  const db=getDb();
  const pending=await db.query(
    `SELECT id,issue_id,status,repository,pr_number,pr_url,branch,merge_error,merged_at,verified_at,verification_scan_id
     FROM pending_fixes
     WHERE user_id=$1 AND scanned_url=$2
       AND status IN ('AWAITING_MERGE','AWAITING_VERIFICATION','STILL_PRESENT','VERIFIED_RESOLVED')
       AND expires_at>NOW()
     ORDER BY updated_at DESC`,
    [user.id,scannedUrl]
  );

  const needsGithub=pending.rows.some((row:any)=>row.status==="AWAITING_MERGE"&&row.repository&&row.pr_number);
  let token="";
  if(needsGithub){
    const connection=await db.query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1 LIMIT 1",[user.id]);
    if(connection.rowCount){
      try{token=decryptToken(connection.rows[0].access_token_encrypted);}catch{}
    }
  }

  if(token){
    for(const row of pending.rows){
      if(row.status!=="AWAITING_MERGE"||!row.repository||!row.pr_number) continue;
      try{
        const pr=await githubFetch<{merged?:boolean;merged_at?:string|null;state?:string}>(token,"/repos/"+row.repository+"/pulls/"+Number(row.pr_number));
        if(pr?.merged===true||pr?.merged_at){
          await db.query(
            "UPDATE pending_fixes SET status='AWAITING_VERIFICATION',merged_at=COALESCE(merged_at,NOW()),merge_error=NULL,updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='AWAITING_MERGE'",
            [row.id,user.id]
          );
          row.status="AWAITING_VERIFICATION";
          row.merged_at=row.merged_at||new Date().toISOString();
          row.merge_error=null;
        }
      }catch(error){
        console.error("RankFix AutoFix PR status refresh failed",error instanceof Error?error.message:"unknown");
      }
    }
  }

  return NextResponse.json({fixes:pending.rows.map((row:any)=>({
    issue_id:String(row.issue_id),
    status:String(row.status),
    pr_number:row.pr_number?Number(row.pr_number):null,
    pr_url:row.pr_url||null,
    branch:row.branch||null,
    merged_at:row.merged_at||null,
    verified_at:row.verified_at||null,
    verification_scan_id:row.verification_scan_id||null
  }))});
}
