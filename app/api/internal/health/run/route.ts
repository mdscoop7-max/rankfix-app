import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { overallHealth,runRankFixHealthChecks } from "@/lib/rankfix-health";

function authorized(request:Request){const secret=process.env.MONITOR_SECRET;return Boolean(secret&&request.headers.get("authorization")===`Bearer ${secret}`)}

export async function GET(request:Request){
 if(!authorized(request)) return NextResponse.json({error:"Niet toegestaan."},{status:401});
 await ensureDatabase();
 const checks=await runRankFixHealthChecks();
 const level=overallHealth(checks);
 const previous=await getDb().query("SELECT overall_level FROM rankfix_health_runs ORDER BY created_at DESC LIMIT 1");
 await getDb().query("INSERT INTO rankfix_health_runs (overall_level,checks) VALUES ($1,$2)",[level,JSON.stringify(checks)]);
 return NextResponse.json({level,checks,changed:previous.rows[0]?.overall_level!==level,checkedAt:new Date().toISOString()});
}
