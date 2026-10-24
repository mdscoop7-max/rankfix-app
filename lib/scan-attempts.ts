// Scan attempts: why a scan did or did not produce a stored report.
// Pure helpers (classification) plus the two database writes. A failed scan
// never reaches the scans table, so without this log "scan success" cannot be
// measured and the 28-of-81 gap in the EU pilot cannot be explained.

export type ScanAttemptCategory =
  | "success"          // report produced and stored
  | "quota"            // plan or rate limit of the RankFix account (not an engine failure)
  | "input"            // invalid/unsafe URL, expired session
  | "site_blocked"     // the website refused or challenged RankFix (401/403/405/WAF/interstitial)
  | "site_unavailable" // 404/410/5xx or a non-HTML / empty document from the website
  | "network"          // timeout, DNS, TLS, connection, redirect loop
  | "engine_error"     // RankFix failed while analysing
  | "save_failed"      // analysed, but storing the report failed
  | "time_limit"       // RankFix stopped the scan itself before the platform limit
  | "function_timeout"; // the attempt never finished (platform killed the function)

/** Network failure → stable code. Never contains raw runtime text. */
export function fetchFailureCode(error: unknown): string {
  const text = `${error instanceof Error ? `${error.name} ${error.message}` : String(error)} ${(error as { cause?: { code?: string; message?: string } })?.cause?.code || ""} ${(error as { cause?: { message?: string } })?.cause?.message || ""}`;
  if (/REDIRECT_LOOP/.test(text)) return "REDIRECT_LOOP";
  if (/REDIRECT_LIMIT/.test(text)) return "REDIRECT_LIMIT";
  if (/BODY_TIMEOUT/.test(text)) return "BODY_TIMEOUT";
  if (/RESPONSE_TOO_LARGE/.test(text)) return "RESPONSE_TOO_LARGE";
  if (/abort|timeout|ETIMEDOUT|UND_ERR_.*TIMEOUT/i.test(text)) return "FETCH_TIMEOUT";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS|PRIVATE_DNS|NON_PUBLIC/i.test(text)) return "FETCH_DNS";
  if (/CERT|SSL|TLS|certificate|self.signed/i.test(text)) return "FETCH_TLS";
  if (/ECONNRESET|ECONNREFUSED|EPIPE|socket|UND_ERR_SOCKET|other side closed/i.test(text)) return "FETCH_CONNECTION";
  return "FETCH_FAILED";
}

/** HTTP status + response code → category. */
export function classifyScanOutcome(httpStatus: number, code: string | null | undefined): ScanAttemptCategory {
  const c = String(code || "");
  if (httpStatus === 200) return "success";
  if (/SITE_RATE_LIMITED/.test(c)) return "site_blocked";
  if (/WEBSITE_LIMIT|SCAN_LIMIT|RATE_LIMIT/.test(c)) return "quota";
  if (/INVALID_URL|UNSAFE_URL|SESSION|SHARE_LINK/.test(c)) return "input";
  if (/HTTP_BLOCKED|HTTP_AUTH_REQUIRED|CHALLENGE|SITE_RATE_LIMITED/.test(c)) return "site_blocked";
  if (/HTTP_NOT_FOUND|HTTP_SERVER_ERROR|EMPTY_HTML|NOT_HTML|PARKED_DOMAIN|SITE_ERROR_PAGE/.test(c)) return "site_unavailable";
  if (/^FETCH_|REDIRECT_LIMIT|REDIRECT_LOOP|RESPONSE_TOO_LARGE|BODY_TIMEOUT/.test(c)) return "network";
  if (/HISTORY_SAVE/.test(c)) return "save_failed";
  if (/^SCAN_TIMEOUT$/.test(c)) return "time_limit";
  if (httpStatus === 401 || httpStatus === 400) return "input";
  if (httpStatus === 429) return "quota";
  return "engine_error";
}

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

/** Inserted BEFORE the scan runs: if the platform kills the function, the row stays "running". */
export async function startScanAttempt(db: Db, userId: string, requestedUrl: string): Promise<string | null> {
  const r = await db.query("INSERT INTO scan_attempts (user_id, requested_url, outcome, category) VALUES ($1,$2,'running','running') RETURNING id", [userId, requestedUrl.slice(0, 500)]);
  return (r.rows[0]?.id as string) || null;
}

export async function finishScanAttempt(db: Db, id: string, input: { httpStatus: number; code: string | null; error: string | null; durationMs: number; finalUrl?: string | null; scanId?: string | null }) {
  const category = classifyScanOutcome(input.httpStatus, input.code);
  await db.query(
    "UPDATE scan_attempts SET http_status=$2, outcome=$3, category=$4, error_code=$5, error=$6, duration_ms=$7, final_url=$8, scan_id=$9, finished_at=NOW() WHERE id=$1",
    [id, input.httpStatus, category === "success" ? "success" : "failed", category, input.code, input.error ? input.error.slice(0, 300) : null, input.durationMs, input.finalUrl || null, input.scanId || null],
  );
  return category;
}

/** Attempts still "running" long after the platform limit were killed (function timeout). */
export function effectiveCategory(row: { outcome?: string; category?: string | null; created_at?: string | Date }, maxDurationSeconds = 300, now = Date.now()): ScanAttemptCategory | "running" {
  if (row.outcome === "running" || row.category === "running") {
    const age = now - new Date(row.created_at || now).getTime();
    return age > (maxDurationSeconds + 60) * 1000 ? "function_timeout" : "running";
  }
  return (row.category as ScanAttemptCategory) || (row.outcome === "success" ? "success" : "engine_error");
}
