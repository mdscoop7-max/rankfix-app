import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login vereist." }, { status: 401 });

  const scanId = new URL(request.url).searchParams.get("scanId")?.trim();
  if (!scanId) return NextResponse.json({ error: "scanId ontbreekt." }, { status: 400 });

  const result = await getDb().query(
    "SELECT id, scanned_url, final_url, result, created_at FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",
    [scanId, user.id]
  );
  if (!result.rowCount) return NextResponse.json({ error: "Scan niet gevonden." }, { status: 404 });

  let parsed: any = {};
  try { parsed = typeof result.rows[0].result === "string" ? JSON.parse(result.rows[0].result) : (result.rows[0].result || {}); } catch {}

  const checks = [...(parsed?.seo?.checks || []), ...(parsed?.geo?.checks || [])]
    .filter((x: any) => x?.status === "fail" || x?.status === "warning")
    .map((x: any) => ({
      category: x.category,
      title: x.title,
      status: x.status,
      message: x.message,
      fix: x.fix,
      issue_id: x.issue_id,
      severity: x.severity,
      confidence: x.confidence,
      evidence: x.evidence,
    }))
    .slice(0, 10);

  return NextResponse.json({
    scan: {
      id: result.rows[0].id,
      scanned_url: result.rows[0].scanned_url,
      final_url: result.rows[0].final_url,
      created_at: result.rows[0].created_at,
    },
    issues: checks,
  });
}
