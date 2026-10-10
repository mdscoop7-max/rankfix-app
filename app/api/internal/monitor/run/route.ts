import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { safePublicFetch } from "@/lib/safe-fetch";
import { sendMonitoringAlertEmail } from "@/lib/email";
import { classifyFetchError, classifyHttpStatus } from "@/lib/scan-failure";
import { decideMonitorOutcome } from "@/lib/monitor-outcome";

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
     RETURNING m.id,m.user_id,m.website_host,m.website_url,m.interval_hours,m.last_status,m.consecutive_failures`,
    [BATCH_SIZE]
  );

  const results:Array<Record<string,unknown>>=[];
  for(const monitor of due.rows){
    let status="ERROR"; let httpStatus:number|null=null; let detail="";
    let category:string|null=null;
    try{
      const fetched=await safePublicFetch(String(monitor.website_url),{timeoutMs:TIMEOUT_MS,maxRedirects:4});
      const response=fetched.response;
      try{ await response.body?.cancel(); }catch{}
      httpStatus=response.status;
      const failure=classifyHttpStatus(response.status,response.headers);
      category=failure?.category||null;
      status=failure?(failure.category==="access_blocked"?"SCANNER_BLOCKED":failure.category==="temporary"?"TEMPORARY":"HTTP_ERROR"):"OK";
      detail=failure?`HTTP ${response.status} ${failure.code}`:`HTTP ${response.status}`;
    }catch(error){
      // Store a bounded classified code instead of arbitrary internal exception data.
      const failure=classifyFetchError(error);
      category=failure.category;
      status=failure.category==="temporary"?"TEMPORARY":failure.category==="site_error"?"ERROR":"SCANNER_BLOCKED";
      detail=failure.code.slice(0,120);
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
           consecutive_failures=CASE WHEN $2='OK' THEN 0 WHEN $2='SCANNER_BLOCKED' THEN consecutive_failures ELSE consecutive_failures+1 END,
           updated_at=NOW()
       WHERE id=$1`,
      [monitor.id,status]
    );
    await getDb().query(
      "INSERT INTO website_health_events (user_id,website_host,scanned_url,event_type,details) VALUES ($1,$2,$3,'RECHECK',$4)",
      [monitor.user_id,monitor.website_host,monitor.website_url,JSON.stringify({status,httpStatus,detail,category,source:"scheduled_read_only_monitor"})]
    );
    let alerted=false;
    // A block that only affects RankFix (403/401/WAF) is not website downtime, and a
    // single temporary hiccup (429/503/timeout) is not either: no outage e-mail for those.
    const {becameUnavailable}=decideMonitorOutcome({status,previousStatus:monitor.last_status||null,previousConsecutiveFailures:Number(monitor.consecutive_failures||0)});
    if(becameUnavailable){
      const recipient=await getDb().query(
        `SELECT u.email,u.name,COALESCE(p.language,'nl') AS language,
                COALESCE(a.email_enabled,TRUE) AS email_enabled
         FROM users u
         LEFT JOIN user_preferences p ON p.user_id=u.id
         LEFT JOIN monitor_alert_preferences a ON a.user_id=u.id AND a.website_host=$2
         WHERE u.id=$1 LIMIT 1`,
        [monitor.user_id,monitor.website_host]
      );
      const customer=recipient.rows[0];
      if(customer?.email && customer.email_enabled){
        try{
          await sendMonitoringAlertEmail({to:customer.email,name:customer.name,language:customer.language,website:monitor.website_url,status,httpStatus});
          await getDb().query("UPDATE monitor_alert_preferences SET last_alert_at=NOW(),updated_at=NOW() WHERE user_id=$1 AND website_host=$2",[monitor.user_id,monitor.website_host]);
          alerted=true;
        }catch(error){
          console.error("monitor alert delivery failed",{websiteHost:monitor.website_host,error:error instanceof Error?error.message:"EMAIL_FAILED"});
        }
      }
    }
    results.push({website_host:monitor.website_host,status,httpStatus,alerted});
  }
  return NextResponse.json({checked:results.length,results});
}

export async function GET(request:Request){ return run(request); }
export async function POST(request:Request){ return run(request); }
