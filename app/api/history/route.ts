import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login vereist." }, { status: 401 });
  await ensureDatabase();
  const result = await getDb().query(
    "SELECT id,scanned_url,final_url,overall_score,seo_score,geo_score,created_at,result FROM scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",
    [user.id]
  );
  const seen = new Set<string>();
  const scans = result.rows.filter((scan) => {
    let key = scan.scanned_url;
    try { key = new URL(scan.final_url || scan.scanned_url).hostname.toLowerCase().replace(/^www\./, ""); } catch {}
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((scan) => {
    const checks = [...(scan.result?.seo?.checks || []), ...(scan.result?.geo?.checks || [])];
    const issues = checks.filter((check: { status: string }) => check.status === "fail" || check.status === "warning");
    const summary = { id: scan.id, scanned_url: scan.scanned_url, final_url: scan.final_url, overall_score: scan.overall_score, seo_score: scan.seo_score, geo_score: scan.geo_score, created_at: scan.created_at };
    return { ...summary, open_issues: issues.length, critical_issues: issues.filter((check: { severity: string }) => check.severity === "CRITICAL").length };
  });
  const pending = await getDb().query("SELECT status, count(*)::int AS count FROM pending_fixes WHERE user_id=$1 AND (status='DONE' OR (status='PREPARED' AND expires_at>NOW())) GROUP BY status", [user.id]);
  return NextResponse.json({ scans, credits: user.credits, fixes: Object.fromEntries(pending.rows.map((row) => [row.status, row.count])) });
}
