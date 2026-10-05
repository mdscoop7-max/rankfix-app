import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login vereist." }, { status: 401 });

  const { id } = await params;
  await ensureDatabase();

  const result = await getDb().query(
    "SELECT id,scanned_url,final_url,overall_score,seo_score,geo_score,created_at,result FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",
    [id, user.id]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Scan niet gevonden." }, { status: 404 });
  }

  return NextResponse.json({ scan: result.rows[0] });
}

export async function DELETE(_request: Request,{ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login vereist." }, { status: 401 });
  const { id } = await params;
  await ensureDatabase();
  const deleted = await getDb().query("DELETE FROM scans WHERE id=$1 AND user_id=$2 RETURNING id",[id, user.id]);
  if (!deleted.rows[0]) return NextResponse.json({ error: "Audit niet gevonden." }, { status: 404 });
  return NextResponse.json({ deleted: true, id: deleted.rows[0].id });
}
