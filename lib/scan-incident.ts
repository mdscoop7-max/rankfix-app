/**
 * Scan incident evidence (QA 144-site test, 24 Oct 2026).
 *
 * Every scan that ends without a report answers with a RankFix API status
 * (400/401/422/429/502/503…) while the website itself may have answered with
 * a different status (403, 429, 404, nothing at all). Customers and TestLab
 * could not tell the two apart: "HTTP 422" next to a text about "HTTP 403".
 *
 * This module keeps them separate and attributes the incident:
 *   - originHttpStatus  what the target website returned (null = no answer)
 *   - apiHttpStatus     what the RankFix API returned to the client
 *   - reasonCode        the stable internal code (HTTP_BLOCKED, SESSION_EXPIRED…)
 *   - attribution       who caused it: the website, the network, or RankFix
 *
 * Pure and deterministic; no secrets, cookies or header values are stored.
 */

export type ScanPhase =
  | "request"        // reading/validating the request
  | "session"        // account / session / plan checks
  | "fetch"          // primary HTTP request to the website
  | "browser_render" // bounded browser attempt (recovery / JS rendering)
  | "content_gate"   // challenge / interstitial / error-page / empty-document gate
  | "analysis"       // SEO/GEO evaluation
  | "sample"         // multi-page sample
  | "save"           // persisting the report
  | "done";

export type BrowserRenderOutcome = "not_attempted" | "recovered" | "not_substantive" | "failed";

export type ScanTrace = {
  traceId: string;
  startedAt: string;
  requestedUrl: string;
  normalizedUrl: string | null;
  finalUrl: string | null;
  redirects: Array<{ from: string; to: string; status: number }>;
  phase: ScanPhase;
  /** Status the target website returned to RankFix's own HTTP request; null when it never answered. */
  originHttpStatus: number | null;
  browserRender: { attempted: boolean; outcome: BrowserRenderOutcome; reason: string | null };
};

export type IncidentAttribution =
  | "target_site"        // the website refused, challenged, rate limited or is missing/erroring
  | "network"            // no answer / DNS / TLS / connection: website or network, not proven which
  | "rankfix_session"    // the RankFix login/session of the person scanning
  | "rankfix_quota"      // a RankFix plan or rate limit
  | "rankfix_input"      // the URL entered could not be scanned
  | "rankfix_infrastructure" // RankFix database / platform / time budget
  | "rankfix_engine";    // RankFix failed while analysing

export type ScanIncident = {
  traceId: string;
  at: string;
  requestedUrl: string;
  finalUrl: string | null;
  redirects: Array<{ from: string; to: string; status: number }>;
  originHttpStatus: number | null;
  apiHttpStatus: number;
  reasonCode: string;
  phase: ScanPhase;
  attribution: IncidentAttribution;
  /** True only when RankFix itself (session, quota, infrastructure, engine) caused the failure. */
  rankfixSide: boolean;
  /** A run (TestLab, retries) may process the same website again: the website was not judged. */
  retrySameSite: boolean;
  browserRender: ScanTrace["browserRender"];
  /** Dutch one-line explanation that keeps website and RankFix apart. */
  explanation: string;
};

export function newTraceId(now = Date.now(), random: () => number = Math.random): string {
  const rand = Array.from({ length: 10 }, () => Math.floor(random() * 36).toString(36)).join("");
  return `rf-${now.toString(36)}-${rand}`;
}

export function createScanTrace(requestedUrl: string, now = new Date(), traceId = newTraceId(now.getTime())): ScanTrace {
  return {
    traceId,
    startedAt: now.toISOString(),
    requestedUrl: String(requestedUrl || "").slice(0, 500),
    normalizedUrl: null,
    finalUrl: null,
    redirects: [],
    phase: "request",
    originHttpStatus: null,
    browserRender: { attempted: false, outcome: "not_attempted", reason: null },
  };
}

const SESSION = /^(SESSION_EXPIRED|AUTH_REQUIRED_RANKFIX)$/;
const QUOTA = /WEBSITE_LIMIT|SCAN_LIMIT|QUOTA_EXCEEDED|PLAN_LIMIT|SCAN_RATE_LIMIT$/;
const INFRA = /DATABASE|INFRASTRUCTURE|AUTH_LOOKUP_UNAVAILABLE|HISTORY_SAVE|^SCAN_TIMEOUT$/;
const INPUT = /^(INVALID_URL|UNSAFE_URL|SHARE_LINK_UNRESOLVED|SCAN_URL_DECODE_ERROR)$/;
const SITE = /^(HTTP_BLOCKED|HTTP_AUTH_REQUIRED|CHALLENGE_OR_INTERSTITIAL|SITE_RATE_LIMITED|HTTP_NOT_FOUND|HTTP_SERVER_ERROR|SITE_ERROR_PAGE|EMPTY_HTML|NOT_HTML|PARKED_DOMAIN)$/;
const NETWORK = /^(FETCH_[A-Z_]+|BODY_TIMEOUT|REDIRECT_LOOP|REDIRECT_LIMIT|RESPONSE_TOO_LARGE)$/;

/** Who caused an incident, from the API status and the stable reason code only. */
export function attributeIncident(apiHttpStatus: number, reasonCode: string): IncidentAttribution {
  const code = String(reasonCode || "");
  // The website's own 429 is a site limit, never a RankFix quota.
  if (code === "SITE_RATE_LIMITED") return "target_site";
  if (SESSION.test(code)) return "rankfix_session";
  if (INFRA.test(code)) return "rankfix_infrastructure";
  if (QUOTA.test(code)) return "rankfix_quota";
  if (INPUT.test(code)) return "rankfix_input";
  if (SITE.test(code)) return "target_site";
  if (NETWORK.test(code)) return "network";
  if (apiHttpStatus === 401) return "rankfix_session";
  if (apiHttpStatus === 402 || apiHttpStatus === 429) return "rankfix_quota";
  if (apiHttpStatus === 400) return "rankfix_input";
  if (apiHttpStatus === 503) return "rankfix_infrastructure";
  return "rankfix_engine";
}

const EXPLANATION: Record<IncidentAttribution, string> = {
  target_site: "De onderzochte website weigerde, beperkte of leverde geen bruikbare inhoud. Dit is vastgesteld aan de reactie van de website; RankFix omzeilt geen beveiliging.",
  network: "De website gaf geen (volledig) antwoord: time-out, DNS-, TLS- of verbindingsprobleem. Niet bewezen of de oorzaak bij de website of het netwerk ligt.",
  rankfix_session: "De RankFix-sessie van de gebruiker was niet geldig. Dit is geen probleem van de onderzochte website; de website is niet beoordeeld.",
  rankfix_quota: "Een RankFix-plan- of snelheidslimiet stopte de scan. Dit is geen probleem van de onderzochte website.",
  rankfix_input: "De ingevoerde URL kon niet veilig worden gescand.",
  rankfix_infrastructure: "Een technisch probleem bij RankFix (database, platform of tijdslimiet) stopte de scan. Dit is geen probleem van de onderzochte website.",
  rankfix_engine: "RankFix liep vast tijdens de analyse. Dit is een RankFix-fout, geen bevinding over de website.",
};

export function buildScanIncident(trace: ScanTrace, apiHttpStatus: number, body: { code?: unknown; httpStatus?: unknown } = {}, now = new Date()): ScanIncident {
  const reasonCode = typeof body.code === "string" && body.code ? body.code : apiHttpStatus >= 500 ? "SCAN_INTERNAL_ERROR" : "UNKNOWN";
  const attribution = attributeIncident(apiHttpStatus, reasonCode);
  // Prefer the status recorded while fetching; fall back to a status the
  // response already reported. A site that never answered stays null.
  const reported = typeof body.httpStatus === "number" ? body.httpStatus : null;
  const originHttpStatus = trace.originHttpStatus ?? reported;
  const rankfixSide = attribution.startsWith("rankfix_") && attribution !== "rankfix_input";
  return {
    traceId: trace.traceId,
    at: now.toISOString(),
    requestedUrl: trace.requestedUrl,
    finalUrl: trace.finalUrl,
    redirects: trace.redirects.slice(0, 10),
    // A placeholder 504 marks "no answer" internally; it is not a website status.
    originHttpStatus: attribution === "network" ? null : originHttpStatus,
    apiHttpStatus,
    reasonCode,
    phase: trace.phase,
    attribution,
    rankfixSide,
    retrySameSite: rankfixSide,
    browserRender: { ...trace.browserRender },
    explanation: EXPLANATION[attribution],
  };
}

/**
 * Adds `incident` and the trace header to every non-2xx JSON scan response.
 * Successful responses only get the trace id (in body and header).
 */
export async function attachScanIncident(response: Response, trace: ScanTrace): Promise<Response> {
  const type = response.headers.get("content-type") || "";
  if (!/json/i.test(type)) return response;
  let body: Record<string, unknown>;
  try { body = await response.clone().json(); } catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  const next: Record<string, unknown> = { ...body, traceId: trace.traceId };
  if (!response.ok) next.incident = buildScanIncident(trace, response.status, body as { code?: unknown; httpStatus?: unknown });
  const headers = new Headers(response.headers);
  headers.set("x-rankfix-trace-id", trace.traceId);
  headers.delete("content-length");
  return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
}
