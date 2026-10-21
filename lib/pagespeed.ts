/**
 * Optional, read-only PageSpeed measurement for the EXISTING /api/scan workflow.
 * Performance scores never become SEO/GEO points and never authorize a code fix.
 * Configure PAGESPEED_API_KEY server-side to enable measured results.
 */
export type SpeedDevice = {
  status: "measured" | "unavailable";
  score: number | null;
  lab: { fcpMs: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null };
  field: { inpMs: number | null };
  reason: string | null;
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
const emptyDevice = (reason: string): SpeedDevice => ({
  status: "unavailable", score: null,
  lab: { fcpMs: null, lcpMs: null, cls: null, tbtMs: null },
  field: { inpMs: null }, reason,
});
export function parsePageSpeed(input: unknown): SpeedDevice {
  if (!input || typeof input !== "object") return emptyDevice("Ongeldig meetresultaat");
  const record = input as Record<string, unknown>;
  const lighthouse = record.lighthouseResult as Record<string, unknown> | undefined;
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
    },
    field: { inpMs: finite(inp?.percentile) },
    reason: null,
  };
}
export async function measureWebsiteSpeed(
  url: string,
  options: { apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<WebsiteSpeed> {
  const report: WebsiteSpeed = {
    source: "Google PageSpeed Insights",
    status: "unavailable",
    measuredAt: new Date().toISOString(),
    url,
    mobile: emptyDevice("Nog niet gemeten"),
    desktop: emptyDevice("Nog niet gemeten"),
    note: "Losse snelheidsmeting; niet meegewogen in SEO- of GEO-score. Geen automatische snelheidsfix.",
  };
  const key = options.apiKey ?? process.env.PAGESPEED_API_KEY;
  if (!key) {
    report.mobile = emptyDevice("PageSpeed API nog niet geconfigureerd");
    report.desktop = emptyDevice("PageSpeed API nog niet geconfigureerd");
    return report;
  }
  // The scan route already validates the final public HTTP(S) URL. Do not
  // submit credentials, URL fragments or unsupported protocols to the provider.
  let safeUrl: URL;
  try {
    safeUrl = new URL(url);
    if (!["https:", "http:"].includes(safeUrl.protocol) || safeUrl.username || safeUrl.password)
      throw new Error("unsupported_url");
    safeUrl.hash = "";
  } catch {
    report.mobile = emptyDevice("Ongeldige publieke URL");
    report.desktop = emptyDevice("Ongeldige publieke URL");
    return report;
  }
  const fetcher = options.fetcher ?? fetch;
  const deadline = Math.max(1000, Math.min(options.timeoutMs ?? 20000, 25000));
  const getDevice = async (strategy: "mobile" | "desktop"): Promise<SpeedDevice> => {
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", safeUrl.toString());
    api.searchParams.set("strategy", strategy);
    api.searchParams.set("category", "PERFORMANCE");
    api.searchParams.set("key", key);
    try {
      const response = await fetcher(api.toString(), { signal: AbortSignal.timeout(deadline) });
      if (!response.ok) return emptyDevice(response.status === 429 ? "Meetdienst tijdelijk beperkt" : "Meetdienst niet beschikbaar");
      const json = await response.json();
      return parsePageSpeed(json);
    } catch {
      return emptyDevice("Snelheidsmeting niet te bevestigen (timeout of meetfout)");
    }
  };
  [report.mobile, report.desktop] = await Promise.all([getDevice("mobile"), getDevice("desktop")]);
  const n = Number(report.mobile.status === "measured") + Number(report.desktop.status === "measured");
  report.status = n === 2 ? "measured" : n === 1 ? "partial" : "unavailable";
  return report;
}
