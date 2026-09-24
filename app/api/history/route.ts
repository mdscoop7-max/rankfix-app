import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login vereist." }, { status: 401 });
  await ensureDatabase();
  const result = await getDb().query(
    "SELECT id,scanned_url,final_url,overall_score,seo_score,geo_score,created_at FROM scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
    [user.id]
  );
  return NextResponse.json({ scans: result.rows, credits: user.credits });
}
