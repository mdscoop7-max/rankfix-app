import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";

function host(value:string){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}}

export async function GET(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
  const websiteHost=host(new URL(request.url).searchParams.get("url")||"");
  if(!websiteHost) return NextResponse.json({error:"Ongeldige website-URL."},{status:400});
  await ensureDatabase();
  const result=await getDb().query(
    "SELECT event_type,rule_id,previous_status,current_status,severity,details,created_at FROM website_health_events WHERE user_id=$1 AND website_host=$2 AND event_type IN ('IMPROVEMENT','REGRESSION') ORDER BY created_at DESC LIMIT 20",
    [user.id,websiteHost]
  );
  const improvements=result.rows.filter((r:any)=>r.event_type==="IMPROVEMENT");
  const regressions=result.rows.filter((r:any)=>r.event_type==="REGRESSION");
  const latestScan=await getDb().query(
    "SELECT result,created_at FROM scans WHERE user_id=$1 AND lower(regexp_replace(split_part(split_part(final_url, '://', 2), '/', 1), '^www\\.', ''))=$2 ORDER BY created_at DESC LIMIT 2",
    [user.id,websiteHost]
  );
  const latestChecks=[...(latestScan.rows[0]?.result?.seo?.checks||[]),...(latestScan.rows[0]?.result?.geo?.checks||[])];
  const previousChecks=[...(latestScan.rows[1]?.result?.seo?.checks||[]),...(latestScan.rows[1]?.result?.geo?.checks||[])];
  const previous=new Map(previousChecks.map((x:any)=>[String(x.issue_id||x.rule_id||x.key),String(x.issue_status||x.status)]));
  let persistent=0;
  for(const item of latestChecks){
    const rule=String(item.issue_id||item.rule_id||item.key);
    const now=String(item.issue_status||item.status).toLowerCase();
    const before=String(previous.get(rule)||"").toLowerCase();
    if((now==="fail"||now==="warning")&&(before==="fail"||before==="warning")) persistent++;
  }
  return NextResponse.json({website_host:websiteHost,improvements:improvements.length,regressions:regressions.length,persistent,events:result.rows});
}
