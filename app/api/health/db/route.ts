import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, database: "missing DATABASE_URL" }, { status: 503 });
  }
  try {
    await ensureDatabase();
    const result = await getDb().query("SELECT NOW() AS now");
    return NextResponse.json({ ok: true, database: "connected", time: result.rows[0]?.now ?? null });
  } catch (error) {
    console.error("RankFix database health check failed:", error);
    return NextResponse.json({ ok: false, database: "connection or schema failed" }, { status: 503 });
  }
}
