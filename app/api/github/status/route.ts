import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
export async function GET() {
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({connected:false},{status:401});
  const r=await getDb().query("SELECT github_login,scopes,connected_at FROM github_connections WHERE user_id=$1",[user.id]);
  return NextResponse.json({connected:Boolean(r.rowCount),connection:r.rows[0]||null});
}
