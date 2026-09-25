import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { safeFetch } from "@/lib/safe-fetch";

const BATCH_SIZE=5;
const TIMEOUT_MS=12000;

function authorized(request:Request){
  const secret=process.env.MONITOR_SECRET;
  if(!secret) return false;
  const auth=request.headers.get("authorization")||"";
  return auth===`Bearer ${secret}`;
}

export async function POST(request:Request){
  if(!authorized(request)) return NextResponse.json({error:"Niet toegestaan."},{status:401});
  await ensureDatabase();
  const due=await getDb().query(
    "SELECT id,user_id,website_host,website_url,interval_hours FROM website_monitors WHERE enabled=TRUE AND (next_check_at IS NULL OR next_check_at<=NOW()) ORDER BY next_check_at NULLS FIRST LIMIT $1",
    [BATCH_SIZE]
  );
  const results:any[]=[];
  for(const monitor of due.rows){
    let status="ERROR"; let httpStatus:number|null=null; let detail="";
    try{
      const response=await safeFetch(String(monitor.website_url),{method:"GET",redirect:"manual",signal:AbortSignal.timeout(TIMEOUT_MS)});
      httpStatus=response.status;
      status=response.ok?"OK":"HTTP_ERROR";
      detail=`HTTP ${response.status}`;
    }catch(error){
      detail=error instanceof Error?error.message:"Controle mislukt.";
    }
    await getDb().query(
      "UPDATE website_monitors SET last_checked_at=NOW(),next_check_at=NOW()+(interval_hours||' hours')::interval,last_status=$2,consecutive_failures=CASE WHEN $2='OK' THEN 0 ELSE consecutive_failures+1 END,updated_at=NOW() WHERE id=$1",
      [monitor.id,status]
    );
    await getDb().query(
      "INSERT INTO website_health_events (user_id,website_host,scanned_url,event_type,details) VALUES ($1,$2,$3,'RECHECK',$4)",
      [monitor.user_id,monitor.website_host,monitor.website_url,JSON.stringify({status,httpStatus,detail,source:"scheduled_read_only_monitor"})]
    );
    results.push({website_host:monitor.website_host,status,httpStatus});
  }
  return NextResponse.json({checked:results.length,results});
}
