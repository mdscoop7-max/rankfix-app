/**
 * Optional, read-only PageSpeed measurement for the EXISTING /api/scan workflow.
 * Performance scores never become SEO/GEO points and never authorize a code fix.
 * Configure PAGESPEED_API_KEY server-side to enable measured results.
 */
export type SpeedFailureCode = "not_configured" | "quota_limited" | "key_rejected" | "api_disabled" | "timeout" | "provider_unavailable" | "invalid_response" | "invalid_url" | "measurement_failed" | "scan_budget_exhausted";
export type SpeedDevice = {
  status: "measured" | "unavailable";
  score: number | null;
  // speedIndexMs is optional: reports saved before it was parsed do not carry it.
  lab: { fcpMs: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null; speedIndexMs?: number | null };
  field: { inpMs: number | null };
  reason: string | null;
  reasonCode?: SpeedFailureCode | null;
  httpStatus?: number;
  attempts?: number;
  measuredAt?: string | null;
  lighthouseVersion?: string | null;
};
export type WebsiteSpeed = {
  source: "Google PageSpeed Insights";
  status: "measured" | "partial" | "unavailable";
  measuredAt: string;
  url: string;
  mobile: SpeedDevice;
  desktop: SpeedDevice;
  note: string;
};
const finite = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
const emptyDevice = (reason: string, reasonCode: SpeedFailureCode = "invalid_response"): SpeedDevice => ({
  status: "unavailable", score: null,
  lab: { fcpMs: null, lcpMs: null, cls: null, tbtMs: null, speedIndexMs: null },
  field: { inpMs: null }, reason, reasonCode,
});
export function parsePageSpeed(input: unknown): SpeedDevice {
  if (!input || typeof input !== "object") return emptyDevice("Ongeldig meetresultaat");
  const record = input as Record<string, unknown>;
  const lighthouse = record.lighthouseResult as Record<string, unknown> | undefined;
  if (lighthouse?.runtimeError) return emptyDevice("De meetdienst kon de pagina niet betrouwbaar meten.", "measurement_failed");
  const categories = lighthouse?.categories as Record<string, unknown> | undefined;
  const performance = categories?.performance as Record<string, unknown> | undefined;
  const fraction = finite(performance?.score);
  if (fraction == null || fraction > 1) return emptyDevice("Geen bevestigde PageSpeed-prestatiescore");
  const audits = lighthouse?.audits as Record<string, unknown> | undefined;
  const auditMetric = (key: string) =>
    finite((audits?.[key] as Record<string, unknown> | undefined)?.numericValue);
  const crux = record.loadingExperience as Record<string, unknown> | undefined;
  const metrics = crux?.metrics as Record<string, unknown> | undefined;
  const inp = metrics?.INTERACTION_TO_NEXT_PAINT as Record<string, unknown> | undefined;
  return {
    status: "measured",
    score: Math.round(fraction * 100),
    lab: {
      fcpMs: auditMetric("first-contentful-paint"),
      lcpMs: auditMetric("largest-contentful-paint"),
      cls: auditMetric("cumulative-layout-shift"),
      tbtMs: auditMetric("total-blocking-time"),
      speedIndexMs: auditMetric("speed-index"),
    },
    field: { inpMs: finite(inp?.percentile) },
    reason: null, reasonCode: null,
    measuredAt: typeof lighthouse?.fetchTime === "string" && Number.isFinite(Date.parse(lighthouse.fetchTime)) ? lighthouse.fetchTime : null,
    lighthouseVersion: typeof lighthouse?.lighthouseVersion === "string" ? lighthouse.lighthouseVersion : null,
  };
}
// The diagnostic codes are stored; provider error text and keys are never exposed.
function providerFailure(status: number, body: unknown, configured: boolean): SpeedDevice {
  const error = body && typeof body === "object" ? (body as {error?: {errors?: Array<{reason?: string}>;details?: Array<{reason?: string}>}}).error : undefined;
  const items = [...(Array.isArray(error?.errors) ? error.errors : []), ...(Array.isArray(error?.details) ? error.details : [])];
  const reasons = items.map(item => item && typeof item === "object" && typeof item.reason === "string" ? item.reason : "").join(" ");
  if (/accessNotConfigured|SERVICE_DISABLED|API_DISABLED/i.test(reasons)) return emptyDevice("De snelheidsmeetdienst is nog niet geactiveerd.", "api_disabled");
  if (/keyInvalid|API_KEY_INVALID|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED/i.test(reasons) || status === 401 || status === 403 && !/quota|limit|exceed/i.test(reasons)) return emptyDevice("De verbinding met de snelheidsmeetdienst moet worden gecontroleerd.", "key_rejected");
  if (status === 429 || /quota|rateLimit|dailyLimit|RESOURCE_EXHAUSTED/i.test(reasons)) return emptyDevice(configured ? "De snelheidsmeetdienst heeft tijdelijk haar limiet bereikt." : "De snelheidsmeting is nog niet beschikbaar.", "quota_limited");
  return emptyDevice("De snelheidsmeetdienst is tijdelijk niet beschikbaar.", "provider_unavailable");
}

export async function measureWebsiteSpeed(
  url: string,
  options: { apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number; allowAnonymous?: boolean; now?: () => number; wait?: (ms: number) => Promise<void> } = {},
): Promise<WebsiteSpeed> {
  const report: WebsiteSpeed = {
    source: "Google PageSpeed Insights", status: "unavailable", measuredAt: new Date().toISOString(), url,
    mobile: emptyDevice("Nog niet gemeten"), desktop: emptyDevice("Nog niet gemeten"),
    note: "Snelheidsmeting binnen deze audit; niet meegewogen in SEO- of GEO-score. Geen automatische snelheidsfix.",
  };
  const bothUnavailable = (reason: string, code: SpeedFailureCode) => {
    report.mobile = emptyDevice(reason, code); report.desktop = emptyDevice(reason, code); return report;
  };
  // A missing credential is an environment issue, not a target website defect.
  // Anonymous use is explicit so batch scans do not hammer a shared public quota.
  const key = (options.apiKey ?? process.env.PAGESPEED_API_KEY ?? "").trim();
  const anonymous = options.allowAnonymous ?? process.env.PAGESPEED_ALLOW_ANONYMOUS === "1";
  if (!key && !anonymous) return bothUnavailable("De snelheidsmeting is nog niet ingesteld voor deze omgeving.", "not_configured");
  let safeUrl: URL;
  try {
    safeUrl = new URL(url);
    if (!["https:", "http:"].includes(safeUrl.protocol) || safeUrl.username || safeUrl.password) throw new Error("unsupported_url");
    safeUrl.hash = "";
  } catch { return bothUnavailable("Ongeldige publieke URL", "invalid_url"); }
  const rawBudget = options.timeoutMs ?? 45000;
  if (!Number.isFinite(rawBudget) || rawBudget < 1000) return bothUnavailable("Binnen deze scan was onvoldoende tijd over voor een snelheidsmeting.", "scan_budget_exhausted");
  const budget = Math.min(rawBudget, 60000);
  const now = options.now ?? Date.now;
  const deadline = now() + budget;
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const getDevice = async (strategy: "mobile" | "desktop"): Promise<SpeedDevice> => {
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", safeUrl.toString()); api.searchParams.set("strategy", strategy);
    api.searchParams.set("category", "performance");
    if (key) api.searchParams.set("key", key);
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = Math.floor(deadline - now());
      if (remaining < 1) return {...emptyDevice("De snelheidsmeting duurde te lang.", "timeout"), attempts: attempt - 1};
      try {
        const response = await fetcher(api.toString(), { signal: AbortSignal.timeout(remaining), redirect: "error" });
        let json: unknown = null;
        try { json = await response.json(); } catch {
          if (response.ok) return {...emptyDevice("De meetdienst gaf geen bruikbaar resultaat terug.", "invalid_response"), attempts: attempt, httpStatus: response.status};
        }
        if (response.ok) return {...parsePageSpeed(json), attempts: attempt, httpStatus: response.status};
        const failure = providerFailure(response.status, json, Boolean(key));
        const retryAfter = response.headers.get("retry-after");
        const retryMs = retryAfter === null ? null : /^\d+$/.test(retryAfter) ? Number(retryAfter)*1000 : Date.parse(retryAfter)-now();
        // Retry a transient service error once. Quota responses require Google's
        // explicit short Retry-After and our own configured key. Never retry a
        // rejected/disabled key, daily quota, or anonymous quota restriction.
        const delay = response.status === 429 ? retryMs : 500;
        const retryable = failure.reasonCode === "provider_unavailable" && [500,502,503,504].includes(response.status)
          || response.status === 429 && Boolean(key) && retryMs !== null && retryMs >= 0 && retryMs <= 2000 && !/dailyLimit/i.test(JSON.stringify(json));
        if (attempt === 1 && retryable && delay !== null && delay >= 0 && deadline-now() > delay+1000) { await wait(delay); continue; }
        return {...failure, attempts: attempt, httpStatus: response.status};
      } catch (error) {
        const timedOut = now() >= deadline || error instanceof Error && /TimeoutError|AbortError/.test(error.name);
        return {...emptyDevice(timedOut ? "De snelheidsmeting duurde te lang." : "De snelheidsmeetdienst kon niet worden bereikt.", timedOut ? "timeout" : "provider_unavailable"), attempts: attempt};
      }
    }
    return emptyDevice("De snelheidsmeting kon niet worden bevestigd.", "provider_unavailable");
  };
  [report.mobile, report.desktop] = await Promise.all([getDevice("mobile"), getDevice("desktop")]);
  const n = Number(report.mobile.status === "measured") + Number(report.desktop.status === "measured");
  report.status = n === 2 ? "measured" : n === 1 ? "partial" : "unavailable";
  report.measuredAt = new Date().toISOString();
  return report;
}
