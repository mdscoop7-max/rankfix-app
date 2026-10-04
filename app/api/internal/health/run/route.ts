import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { sendSystemHealthEmail } from "@/lib/email";
import { overallHealth,runRankFixHealthChecks } from "@/lib/rankfix-health";
import { releaseStaleJobs } from "@/lib/job-queue";
import { getInternalCapacitySignals,overallCapacity } from "@/lib/internal-capacity";
import { getCapacityTrends,overallCapacityTrend } from "@/lib/capacity-trend";
import { getDatabaseAndQueueGuards } from "@/lib/operational-guards";
import { getSecurityUsageGrowthGuards } from "@/lib/security-usage-growth";
import { getBackupRecoveryGuards } from "@/lib/recovery-guard";

const FAILURE_THRESHOLD=3;
function authorized(request:Request){const secret=process.env.MONITOR_SECRET;return Boolean(secret&&request.headers.get("authorization")===`Bearer ${secret}`)}
function alertRecipient(){return (process.env.HEALTH_ALERT_EMAIL||process.env.ADMIN_EMAIL||"").trim()}

export async function runHealthGuard(){
 await ensureDatabase();
 const db=getDb();
 const checks=await runRankFixHealthChecks();
 const capacity=await getInternalCapacitySignals().catch(error=>[{key:"capacity_guard",label:"Capacity Guard",level:"red" as const,message:error instanceof Error?error.message:"CAPACITY_CHECK_FAILED",value:0,unit:"",orangeAt:0,redAt:0}]);
 const capacityLevel=overallCapacity(capacity);
 const capacityTrends=await getCapacityTrends(capacity).catch(()=>[]);
 const capacityTrendLevel=capacityTrends.length?overallCapacityTrend(capacityTrends):"green";
 const operationalGuards=await getDatabaseAndQueueGuards().catch(error=>[{key:"operations_guard",label:"Operational Guard",level:"red" as const,message:error instanceof Error?error.message:"OPERATIONAL_CHECK_FAILED",metrics:{}}]);
 const securityUsageGrowth=await getSecurityUsageGrowthGuards().catch(error=>[{key:"internal_guard",label:"Internal Guard",level:"red" as const,message:error instanceof Error?error.message:"INTERNAL_GUARD_FAILED",metrics:{}}]);
 const recoveryGuards=await getBackupRecoveryGuards().catch(error=>[{key:"recovery_guard",label:"Backup & Recovery Guard",level:"red" as const,message:error instanceof Error?error.message:"RECOVERY_CHECK_FAILED",details:{}}]);
 const level=overallHealth(checks);
 const red=checks.filter(c=>c.level==="red");
 await db.query("INSERT INTO rankfix_health_runs (overall_level,checks) VALUES ($1,$2)",[level,JSON.stringify(checks)]);
 await db.query("INSERT INTO rankfix_capacity_runs (overall_level,signals) VALUES ($1,$2)",[capacityLevel,JSON.stringify(capacity)]);

 let alertSent=false,recoverySent=false;
 const persistentCapacityRed=capacityTrends.filter(t=>t.effective==="red").map(t=>({key:`capacity:${t.key}`,label:t.label,level:"red" as const,message:t.message}));
 const operationalRed=operationalGuards.filter(g=>g.level==="red").map(g=>({key:`operations:${g.key}`,label:g.label,level:"red" as const,message:g.message}));
 const extendedRed=securityUsageGrowth.filter(g=>g.level==="red").map(g=>({key:g.key,label:g.label,level:"red" as const,message:g.message}));
 const recoveryRed=recoveryGuards.filter(g=>g.level==="red").map(g=>({key:g.key,label:g.label,level:"red" as const,message:g.message}));
 const criticalChecks=[...red,...persistentCapacityRed,...operationalRed,...extendedRed,...recoveryRed];
 const activeKeys=new Set(criticalChecks.map(check=>`rankfix-production:${check.key}`));

 // Every critical subsystem owns its own incident. A database outage can no
 // longer accidentally increment or resolve an unrelated app incident.
 for(const check of criticalChecks){
   const incidentKey=`rankfix-production:${check.key}`;
   const current=await db.query("SELECT * FROM rankfix_health_incidents WHERE incident_key=$1 LIMIT 1",[incidentKey]);
   const incident=current.rows[0];
   if(!incident){
     await db.query("INSERT INTO rankfix_health_incidents (incident_key,status,failure_count,details) VALUES ($1,'open',1,$2)",[incidentKey,JSON.stringify({check})]);
     continue;
   }
   const nextCount=incident.status==="open"?Number(incident.failure_count||0)+1:1;
   await db.query("UPDATE rankfix_health_incidents SET status='open',failure_count=$2,last_seen_at=NOW(),resolved_at=NULL,recovery_alerted_at=NULL,alerted_at=CASE WHEN status='open' THEN alerted_at ELSE NULL END,first_seen_at=CASE WHEN status='open' THEN first_seen_at ELSE NOW() END,details=$3 WHERE incident_key=$1",[incidentKey,nextCount,JSON.stringify({check})]);
   if(nextCount>=FAILURE_THRESHOLD&&!incident.alerted_at){
     const to=alertRecipient();
     if(to){
       try{await sendSystemHealthEmail({to,checks:[check]});await db.query("UPDATE rankfix_health_incidents SET alerted_at=NOW() WHERE incident_key=$1",[incidentKey]);alertSent=true}
       catch(error){console.error("Health Guard critical email failed",error instanceof Error?error.message:"EMAIL_FAILED")}
     }
   }
 }

 // Resolve only incidents whose subsystem recovered. This keeps simultaneous
 // failures independent and sends at most one recovery message per incident.
 const open=await db.query("SELECT * FROM rankfix_health_incidents WHERE status='open' AND incident_key LIKE 'rankfix-production:%'");
 for(const incident of open.rows){
   if(activeKeys.has(String(incident.incident_key))) continue;
   await db.query("UPDATE rankfix_health_incidents SET status='resolved',failure_count=0,resolved_at=NOW(),last_seen_at=NOW() WHERE incident_key=$1",[incident.incident_key]);
   if(incident.alerted_at&&!incident.recovery_alerted_at){
     const to=alertRecipient();
     if(to){
       try{await sendSystemHealthEmail({to,recovered:true,checks});await db.query("UPDATE rankfix_health_incidents SET recovery_alerted_at=NOW() WHERE incident_key=$1",[incident.incident_key]);recoverySent=true}
       catch(error){console.error("Health Guard recovery email failed",error instanceof Error?error.message:"EMAIL_FAILED")}
     }
   }
 }

 // Keep the rate-limit table bounded without needing a separate cleanup job.
 await db.query("DELETE FROM api_rate_limits WHERE window_start < NOW()-INTERVAL '48 hours'").catch(()=>undefined);
 // Health samples are operational telemetry, not customer records. Keep a bounded
 // window here instead of doing maintenance during normal request initialization.
 await db.query("DELETE FROM rankfix_health_runs WHERE overall_level='green' AND created_at < NOW()-INTERVAL '14 days'").catch(()=>undefined);
 await db.query("DELETE FROM rankfix_health_runs WHERE overall_level<>'green' AND created_at < NOW()-INTERVAL '90 days'").catch(()=>undefined);
 await db.query("DELETE FROM rankfix_capacity_runs WHERE created_at < NOW()-INTERVAL '90 days'").catch(()=>undefined);
 // Recover abandoned worker leases and bound completed queue history. Queue maintenance must never take Health Guard down.
 await releaseStaleJobs().catch(error=>console.error("Queue stale-job recovery failed",error instanceof Error?error.message:"QUEUE_RECOVERY_FAILED"));
 await db.query("DELETE FROM background_jobs WHERE status IN ('SUCCEEDED','FAILED') AND finished_at < NOW()-INTERVAL '30 days'").catch(()=>undefined);
 return NextResponse.json({level,checks,capacityLevel,capacity,capacityTrendLevel,capacityTrends,operationalGuards,securityUsageGrowth,recoveryGuards,critical:criticalChecks.length>0,alertSent,recoverySent,checkedAt:new Date().toISOString()});
}
export async function GET(request:Request){
 if(!authorized(request)) return NextResponse.json({error:"Niet toegestaan."},{status:401});
 return runHealthGuard();
}
export async function POST(request:Request){return GET(request)}
