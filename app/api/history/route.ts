import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { cookies } from "next/headers";
import { normalizePlan, planLimits } from "@/lib/plans";

type AuditCheck={status?:string;severity?:string};
type Row={id:string;scanned_url:string;final_url?:string;overall_score:number;seo_score:number;geo_score:number;created_at:string;result:{technologyProfile?:{siteType?:string;cms?:string;platform?:string;framework?:string;confidence?:number;evidence?:string[]};seo?:{checks?:AuditCheck[]};geo?:{checks?:AuditCheck[]}}};
type HostScan={scanned_url:string;final_url?:string};
function host(scan:HostScan){try{return new URL(scan.final_url||scan.scanned_url).hostname.toLowerCase().replace(/^www\./,"")}catch{return scan.scanned_url}}
function summary(scan:Row){
 const checks=[...(scan.result?.seo?.checks||[]),...(scan.result?.geo?.checks||[])];
 const statusRank:Record<string,number>={fail:5,warning:4,pass:3,unable_to_confirm:2,not_applicable:1};
 const uniqueChecks=Array.from(checks.reduce((map:Map<string,AuditCheck>,check:AuditCheck)=>{const category=String((check as AuditCheck & {category?:string}).category||"").trim().toLowerCase();const rule=String(check.rule_id||check.issue_id||check.key||check.title||"").trim().toLowerCase();const key=category+":"+rule;const current=map.get(key);if(!current||(statusRank[String(check.status).toLowerCase()]||0)>(statusRank[String(current.status).toLowerCase()]||0))map.set(key,check);return map;},new Map<string,AuditCheck>()).values());
 const issues=uniqueChecks.filter((c:AuditCheck)=>c.status==="fail"||c.status==="warning");
 return {id:scan.id,scanned_url:scan.scanned_url,final_url:scan.final_url,overall_score:scan.overall_score,seo_score:scan.seo_score,geo_score:scan.geo_score,created_at:scan.created_at,open_issues:issues.length,critical_issues:issues.filter((c:AuditCheck)=>c.severity==="CRITICAL").length,technology_profile:scan.result?.technologyProfile||null};
}
export async function GET(){
 const user=await getCurrentUser();
 if(!user){
  const cookieStore=await cookies();
  const lang=cookieStore.get("rankfix-language")?.value || "nl";
  const messages:Record<string,string>={nl:"Login vereist.",en:"Login required.",de:"Anmeldung erforderlich.",fr:"Connexion requise.",it:"Accesso richiesto.",es:"Inicio de sesión requerido."};
  return NextResponse.json({error:messages[lang]||messages.nl},{status:401});
 }
 await ensureDatabase();
 const result=await getDb().query("SELECT id,scanned_url,final_url,overall_score,seo_score,geo_score,created_at,result FROM scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",[user.id]);
 const allScans=(result.rows as Row[]).map(summary);
 const seen=new Set<string>();
 const scans=allScans.filter((scan)=>{const key=host(scan);if(seen.has(key))return false;seen.add(key);return true});
 const pending=await getDb().query("SELECT status,count(*)::int AS count FROM pending_fixes WHERE user_id=$1 AND (status='DONE' OR (status='PREPARED' AND expires_at>NOW())) GROUP BY status",[user.id]);
 const planResult=await getDb().query("SELECT plan_code FROM users WHERE id=$1 LIMIT 1",[user.id]);
 const plan=normalizePlan(planResult.rows[0]?.plan_code);
 const limits=planLimits(plan);
 const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
 let used=0;
 let websiteHost:string|null=null;
 if(plan==="free"&&scans[0]){
  websiteHost=host(scans[0]);
  const usageResult=await getDb().query("SELECT COUNT(*)::int AS count FROM usage_events WHERE website_host=$1 AND event_type='SCAN' AND created_at >= $2",[websiteHost,monthStart.toISOString()]);
  used=Number(usageResult.rows[0]?.count||0);
 }else if(plan!=="free"){
  const usageResult=await getDb().query("SELECT COUNT(*)::int AS count FROM usage_events WHERE user_id=$1 AND event_type='SCAN' AND created_at >= $2",[user.id,monthStart.toISOString()]);
  used=Number(usageResult.rows[0]?.count||0);
 }
 const gscResult=await getDb().query("SELECT site_url,last_sync_at FROM search_console_properties WHERE user_id=$1 AND selected=TRUE ORDER BY updated_at DESC LIMIT 1",[user.id]);
 const gscProperty=gscResult.rows[0]||null;
 const searchConsole={connected:Boolean(gscProperty),siteUrl:gscProperty?.site_url||null,lastSyncAt:gscProperty?.last_sync_at||null,synced:Boolean(gscProperty?.last_sync_at)};
 const actionUsageResult=await getDb().query("SELECT event_type,COUNT(*)::int AS count FROM usage_events WHERE user_id=$1 AND created_at >= $2 AND event_type IN ('AI_FIX','COMPETITOR_SCAN','LOCAL_SEO') GROUP BY event_type",[user.id,monthStart.toISOString()]);
 const actionCounts=Object.fromEntries(actionUsageResult.rows.map((row:{event_type:unknown;count:unknown})=>[String(row.event_type),Number(row.count||0)]));
 const usage={plan,used,limit:limits.scans,websiteHost,websites:limits.websites,actions:{aiFixes:{used:actionCounts.AI_FIX||0,limit:limits.aiFixes},competitorScans:{used:actionCounts.COMPETITOR_SCAN||0,limit:limits.competitorScans},localSeo:{used:actionCounts.LOCAL_SEO||0,limit:limits.localSeo}}};
 return NextResponse.json({scans,history:allScans,fixes:Object.fromEntries(pending.rows.map(row=>[row.status,row.count])),usage,searchConsole});
}