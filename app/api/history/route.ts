import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { cookies } from "next/headers";

type Row={id:string;scanned_url:string;final_url?:string;overall_score:number;seo_score:number;geo_score:number;created_at:string;result:any};
function host(scan:Row){try{return new URL(scan.final_url||scan.scanned_url).hostname.toLowerCase().replace(/^www\./,"")}catch{return scan.scanned_url}}
function summary(scan:Row){
 const checks=[...(scan.result?.seo?.checks||[]),...(scan.result?.geo?.checks||[])];
 const issues=checks.filter((c:any)=>c.status==="fail"||c.status==="warning");
 return {id:scan.id,scanned_url:scan.scanned_url,final_url:scan.final_url,overall_score:scan.overall_score,seo_score:scan.seo_score,geo_score:scan.geo_score,created_at:scan.created_at,open_issues:issues.length,critical_issues:issues.filter((c:any)=>c.severity==="CRITICAL").length};
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
 const scans=allScans.filter((scan:any)=>{const key=host(scan as Row);if(seen.has(key))return false;seen.add(key);return true});
 const pending=await getDb().query("SELECT status,count(*)::int AS count FROM pending_fixes WHERE user_id=$1 AND (status='DONE' OR (status='PREPARED' AND expires_at>NOW())) GROUP BY status",[user.id]);
 const planResult=await getDb().query("SELECT plan_code FROM users WHERE id=$1 LIMIT 1",[user.id]);
 const plan=String(planResult.rows[0]?.plan_code||"free").toLowerCase();
 let usage={plan,used:0,limit:plan==="free"?2:null as number|null,websiteHost:null as string|null};
 if(plan==="free"&&scans[0]){
  const websiteHost=host(scans[0] as Row);
  const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
  const usageResult=await getDb().query("SELECT COUNT(*)::int AS count FROM usage_events WHERE website_host=$1 AND event_type='SCAN' AND created_at >= $2",[websiteHost,monthStart.toISOString()]);
  usage={plan,used:Number(usageResult.rows[0]?.count||0),limit:2,websiteHost};
 }
 return NextResponse.json({scans,history:allScans,fixes:Object.fromEntries(pending.rows.map(row=>[row.status,row.count])),usage});
}