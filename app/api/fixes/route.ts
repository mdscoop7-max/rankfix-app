import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

function normalizeScanUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  await ensureDatabase();

  const { searchParams } = new URL(request.url);
  const scanId = searchParams.get("scan_id");
  if (!scanId) return NextResponse.json({ error: "scan_id is required." }, { status: 400 });

  const scanResult = await getDb().query(
    "SELECT id,scanned_url,final_url FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",
    [scanId, user.id]
  );
  const scan = scanResult.rows[0];
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });

  const urls = [...new Set(
    [scan.scanned_url, scan.final_url]
      .filter(Boolean)
      .flatMap((value: string) => [value, normalizeScanUrl(value)])
  )];
  const result = await getDb().query(
    `SELECT DISTINCT ON (issue_id)
       id, issue_id, status, repository, file_path, pr_number, created_at, updated_at, expires_at
     FROM pending_fixes
     WHERE user_id=$1 AND scanned_url = ANY($2::text[])
     ORDER BY issue_id, updated_at DESC`,
    [user.id, urls]
  );

  return NextResponse.json({
    fixes: result.rows,
    workflow: {
      confirmation: "LIVE_RESCAN_ONLY",
      note: "A Pull Request is only a proposal. RankFix marks a fix DONE only after a fresh evidence-backed live rescan passes the same issue."
    }
  });
}
