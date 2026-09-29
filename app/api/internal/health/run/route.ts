import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { sendSystemHealthEmail } from "@/lib/email";
import { overallHealth,runRankFixHealthChecks } from "@/lib/rankfix-health";

const FAILURE_THRESHOLD=3;
function authorized(request:Request){const secret=process.env.MONITOR_SECRET;return Boolean(secret&&request.headers.get("authorization")===`Bearer ${secret}`)}
function alertRecipient(){return (process.env.HEALTH_ALERT_EMAIL||process.env.ADMIN_EMAIL||"").trim()}

export async function GET(request:Request){
 if(!authorized(request)) return NextResponse.json({error:"Niet toegestaan."},{status:401});
 await ensureDatabase();
 const db=getDb();
 const checks=await runRankFixHealthChecks();
 const level=overallHealth(checks);
 const red=checks.filter(c=>c.level==="red");
 const incidentKey="rankfix-production";
 await db.query("INSERT INTO rankfix_health_runs (overall_level,checks) VALUES ($1,$2)",[level,JSON.stringify(checks)]);

 let alertSent=false,recoverySent=false;
 const current=await db.query("SELECT * FROM rankfix_health_incidents WHERE incident_key=$1 LIMIT 1",[incidentKey]);
 const incident=current.rows[0];

 if(red.length){
   if(!incident){
     await db.query("INSERT INTO rankfix_health_incidents (incident_key,status,failure_count,details) VALUES ($1,'open',1,$2)",[incidentKey,JSON.stringify({checks:red})]);
   }else{
     const nextCount=incident.status==="open"?Number(incident.failure_count||0)+1:1;
     await db.query("UPDATE rankfix_health_incidents SET status='open',failure_count=$2,last_seen_at=NOW(),resolved_at=NULL,recovery_alerted_at=NULL,alerted_at=CASE WHEN status='open' THEN alerted_at ELSE NULL END,first_seen_at=CASE WHEN status='open' THEN first_seen_at ELSE NOW() END,details=$3 WHERE incident_key=$1",[incidentKey,nextCount,JSON.stringify({checks:red})]);
     if(nextCount>=FAILURE_THRESHOLD&&!incident.alerted_at){
       const to=alertRecipient();
       if(to){
         try{await sendSystemHealthEmail({to,checks:red});await db.query("UPDATE rankfix_health_incidents SET alerted_at=NOW() WHERE incident_key=$1",[incidentKey]);alertSent=true}
         catch(error){console.error("Health Guard critical email failed",error instanceof Error?error.message:"EMAIL_FAILED")}
       }
     }
   }
 }else if(incident?.status==="open"){
   await db.query("UPDATE rankfix_health_incidents SET status='resolved',failure_count=0,resolved_at=NOW(),last_seen_at=NOW() WHERE incident_key=$1",[incidentKey]);
   if(incident.alerted_at&&!incident.recovery_alerted_at){
     const to=alertRecipient();
     if(to){
       try{await sendSystemHealthEmail({to,recovered:true,checks});await db.query("UPDATE rankfix_health_incidents SET recovery_alerted_at=NOW() WHERE incident_key=$1",[incidentKey]);recoverySent=true}
       catch(error){console.error("Health Guard recovery email failed",error instanceof Error?error.message:"EMAIL_FAILED")}
     }
   }
 }
 return NextResponse.json({level,checks,critical:red.length>0,alertSent,recoverySent,checkedAt:new Date().toISOString()});
}
export async function POST(request:Request){return GET(request)}
