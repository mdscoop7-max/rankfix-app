import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
export async function GET(){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"Niet ingelogd."},{status:401});
 await ensureDatabase();
 const [runs,incidents]=await Promise.all([
   getDb().query("SELECT overall_level,checks,created_at FROM rankfix_health_runs ORDER BY created_at DESC LIMIT 50"),
   getDb().query("SELECT incident_key,status,failure_count,first_seen_at,last_seen_at,alerted_at,resolved_at,recovery_alerted_at,details FROM rankfix_health_incidents ORDER BY last_seen_at DESC LIMIT 20")
 ]);
 return NextResponse.json({runs:runs.rows,incidents:incidents.rows});
}