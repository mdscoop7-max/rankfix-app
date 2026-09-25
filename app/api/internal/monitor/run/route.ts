import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { safePublicFetch } from "@/lib/safe-fetch";

const BATCH_SIZE=5;
const TIMEOUT_MS=12000;

function authorized(request:Request){
  const secret=process.env.MONITOR_SECRET;
  if(!secret) return false;
  const auth=request.headers.get("authorization")||"";
  return auth===`Bearer ${secret}`;
}

async function run(request:Request){
  if(!authorized(request)) return NextResponse.json({error:"Niet toegestaan."},{status:401});
  await ensureDatabase();

  // Atomically claim due monitors for 30 minutes. This prevents overlapping
  // scheduler invocations from checking the same website twice. If this
  // process crashes, the short lease expires and the monitor becomes due again.
  const due=await getDb().query(
    `WITH due AS (
       SELECT id
       FROM website_monitors
       WHERE enabled=TRUE AND (next_check_at IS NULL OR next_check_at<=NOW())
       ORDER BY next_check_at NULLS FIRST
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE website_monitors AS m
     SET next_check_at=NOW()+INTERVAL '30 minutes',updated_at=NOW()
     FROM due
     WHERE m.id=due.id
     RETURNING m.id,m.user_id,m.website_host,m.website_url,m.interval_hours`,
    [BATCH_SIZE]
  );

  const results:any[]=[];
  for(const monitor of due.rows){
    let status="ERROR"; let httpStatus:number|null=null; let detail="";
    try{
      const fetched=await safePublicFetch(String(monitor.website_url),{timeoutMs:TIMEOUT_MS,maxRedirects:4});
      const response=fetched.response;
      httpStatus=response.status;
      status=response.ok?"OK":"HTTP_ERROR";
      detail=`HTTP ${response.status}`;
    }catch(error){
      // Store a bounded generic detail instead of arbitrary internal exception data.
      const code=error instanceof Error?error.message:"CHECK_FAILED";
      detail=String(code).slice(0,120);
    }

    // Successful checks return to the customer's configured interval.
    // Failed checks retry after 24 hours, never aggressively.
    await getDb().query(
      `UPDATE website_monitors
       SET last_checked_at=NOW(),
           next_check_at=CASE WHEN $2='OK'
             THEN NOW()+(interval_hours||' hours')::interval
             ELSE NOW()+INTERVAL '24 hours' END,
           last_status=$2,
           consecutive_failures=CASE WHEN $2='OK' THEN 0 ELSE consecutive_failures+1 END,
           updated_at=NOW()
       WHERE id=$1`,
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

export async function GET(request:Request){ return run(request); }
export async function POST(request:Request){ return run(request); }
