import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
export async function GET(){
 const user=await getCurrentUser(); if(!user)return NextResponse.json({error:"Niet ingelogd."},{status:401});
 await ensureDatabase();
 const r=await getDb().query("SELECT overall_level,checks,created_at FROM rankfix_health_runs ORDER BY created_at DESC LIMIT 50");
 return NextResponse.json({runs:r.rows});
}