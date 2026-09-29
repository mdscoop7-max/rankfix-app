import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";

function isHealthAdmin(email:string){
 const configured=(process.env.HEALTH_ADMIN_EMAILS||process.env.ADMIN_EMAIL||"")
   .split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
 return configured.length>0&&configured.includes(email.trim().toLowerCase());
}

export async function GET(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Niet ingelogd."},{status:401});
 if(!isHealthAdmin(String(user.email||"")))return NextResponse.json({error:"Niet toegestaan."},{status:403});
 await ensureDatabase();
 const [runs,incidents,capacity]=await Promise.all([
   getDb().query("SELECT overall_level,checks,created_at FROM rankfix_health_runs ORDER BY created_at DESC LIMIT 50"),
   getDb().query("SELECT incident_key,status,failure_count,first_seen_at,last_seen_at,alerted_at,resolved_at,recovery_alerted_at,details FROM rankfix_health_incidents ORDER BY last_seen_at DESC LIMIT 20"),
   getDb().query("SELECT overall_level,signals,created_at FROM rankfix_capacity_runs ORDER BY created_at DESC LIMIT 50")
 ]);
 return NextResponse.json({runs:runs.rows,incidents:incidents.rows,capacity:capacity.rows});
}
