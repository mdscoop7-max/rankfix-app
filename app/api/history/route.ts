import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

type Row={id:string;scanned_url:string;final_url?:string;overall_score:number;seo_score:number;geo_score:number;created_at:string;result:any};
function host(scan:Row){try{return new URL(scan.final_url||scan.scanned_url).hostname.toLowerCase().replace(/^www\./,"")}catch{return scan.scanned_url}}
function summary(scan:Row){
 const checks=[...(scan.result?.seo?.checks||[]),...(scan.result?.geo?.checks||[])];
 const issues=checks.filter((c:any)=>c.status==="fail"||c.status==="warning");
 return {id:scan.id,scanned_url:scan.scanned_url,final_url:scan.final_url,overall_score:scan.overall_score,seo_score:scan.seo_score,geo_score:scan.geo_score,created_at:scan.created_at,open_issues:issues.length,critical_issues:issues.filter((c:any)=>c.severity==="CRITICAL").length};
}
export async function GET(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Login vereist."},{status:401});
 await ensureDatabase();
 const result=await getDb().query("SELECT id,scanned_url,final_url,overall_score,seo_score,geo_score,created_at,result FROM scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",[user.id]);
 const allScans=(result.rows as Row[]).map(summary);
 const seen=new Set<string>();
 const scans=allScans.filter((scan:any)=>{const key=host(scan as Row);if(seen.has(key))return false;seen.add(key);return true});
 const pending=await getDb().query("SELECT status,count(*)::int AS count FROM pending_fixes WHERE user_id=$1 AND (status='DONE' OR (status='PREPARED' AND expires_at>NOW())) GROUP BY status",[user.id]);
 return NextResponse.json({scans,history:allScans,credits:user.credits,fixes:Object.fromEntries(pending.rows.map(row=>[row.status,row.count]))});
}