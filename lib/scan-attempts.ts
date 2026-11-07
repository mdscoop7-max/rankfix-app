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
  | "infrastructure"   // RankFix database/session lookup unavailable (never the website)
  | "time_limit"       // RankFix stopped the scan itself before the platform limit
  | "function_timeout"; // the attempt never finished (platform killed the function)

/** Network failure → stable code. Never contains raw runtime text. */
export function fetchFailureCode(error: unknown): string {
  if (error instanceof Error && error.message === "SCAN_INFRASTRUCTURE_EGRESS") return "SCAN_INFRASTRUCTURE_EGRESS";
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

/**
 * MKB-48 (6 Nov, akd.eu / cateringgroepnederland.nl FETCH_TLS): which part of
 * TLS failed. Certificate faults (expired, wrong host name, self-signed,
 * incomplete chain) are provable problems of the website itself; a handshake or
 * protocol failure may also be the network, so it stays a network outcome.
 */
export type TlsFailureReason = "certificate_expired" | "hostname_mismatch" | "self_signed" | "incomplete_chain" | "certificate_not_yet_valid" | "handshake";
export function tlsFailureReason(error: unknown): TlsFailureReason {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  const text = `${error instanceof Error ? error.message : String(error)} ${cause?.code || ""} ${cause?.message || ""}`;
  if (/CERT_HAS_EXPIRED|certificate has expired/i.test(text)) return "certificate_expired";
  if (/CERT_NOT_YET_VALID/i.test(text)) return "certificate_not_yet_valid";
  if (/ERR_TLS_CERT_ALTNAME_INVALID|Hostname\/IP does not match|altnames/i.test(text)) return "hostname_mismatch";
  if (/DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|self.signed/i.test(text)) return "self_signed";
  if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|unable to verify the first certificate/i.test(text)) return "incomplete_chain";
  return "handshake";
}
export const TLS_REASON_NL: Record<TlsFailureReason, string> = {
  certificate_expired: "het HTTPS-certificaat van de website is verlopen",
  certificate_not_yet_valid: "het HTTPS-certificaat van de website is nog niet geldig",
  hostname_mismatch: "het HTTPS-certificaat hoort niet bij deze domeinnaam",
  self_signed: "de website gebruikt een zelfondertekend HTTPS-certificaat",
  incomplete_chain: "de certificaatketen van de website is onvolledig (tussencertificaat ontbreekt); sommige browsers vullen dat aan, zoekmachines en andere clients vaak niet",
  handshake: "de beveiligde verbinding kon niet worden opgezet (TLS-handshake); niet bewezen of dit aan de website of aan het netwerk ligt",
};

/**
 * MKB-48 (6 Nov, 3× FETCH_DNS): ENOTFOUND means the resolver answered that the
 * name has no address (domain does not exist or has no website record): a fact
 * about the domain. EAI_AGAIN / SERVFAIL is a temporary resolver failure.
 */
export function dnsDomainMissing(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  const text = `${error instanceof Error ? error.message : String(error)} ${cause?.code || ""} ${cause?.message || ""}`;
  return /ENOTFOUND|ENODATA|NXDOMAIN/.test(text) && !/EAI_AGAIN|SERVFAIL|ETIMEOUT|PRIVATE_DNS|NON_PUBLIC/.test(text);
}

/** HTTP status + response code → category. */
export function classifyScanOutcome(httpStatus: number, code: string | null | undefined): ScanAttemptCategory {
  const c = String(code || "");
  if (httpStatus === 200) return "success";
  if (/SITE_RATE_LIMITED/.test(c)) return "site_blocked";
  if (/AUTH_LOOKUP_UNAVAILABLE|DATABASE_QUOTA|SCAN_DATABASE|SCAN_INFRASTRUCTURE_EGRESS/.test(c)) return "infrastructure";
  if (/WEBSITE_LIMIT|SCAN_LIMIT|RATE_LIMIT/.test(c)) return "quota";
  if (/INVALID_URL|UNSAFE_URL|SESSION|SHARE_LINK/.test(c)) return "input";
  if (/HTTP_BLOCKED|HTTP_AUTH_REQUIRED|CHALLENGE|SITE_RATE_LIMITED|UNVERIFIED_NOT_FOUND/.test(c)) return "site_blocked";
  if (/SITE_TLS_INVALID|SITE_DOMAIN_NOT_FOUND/.test(c)) return "site_unavailable";
  if (/HTTP_NOT_FOUND|HTTP_PAYMENT_REQUIRED|HTTP_SERVER_ERROR|EMPTY_HTML|NOT_HTML|PARKED_DOMAIN|SITE_ERROR_PAGE/.test(c)) return "site_unavailable";
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
