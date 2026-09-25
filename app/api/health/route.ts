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
  return NextResponse.json({website_host:websiteHost,improvements:improvements.length,regressions:regressions.length,events:result.rows});
}
