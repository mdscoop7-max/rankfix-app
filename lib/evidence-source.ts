/**
 * Evidence provenance per check (RankFix 3.5).
 *
 * Every scored check records WHERE its evidence came from, so a report can show
 * whether a finding rests on the raw HTML, the browser-rendered DOM, the HTTP
 * response itself, robots.txt, the sitemap, link probes or another sampled page.
 * This is bookkeeping only: it never changes a status or a score.
 */
export type EvidenceSource =
  | "raw_html"
  | "rendered_html"
  | "http_response"
  | "representative_sample"
  | "robots_txt"
  | "sitemap"
  | "link_check";

const HTTP_KEYS = new Set(["status", "response", "https", "indexability_header", "security_https", "security_headers", "security_cookie_flags"]);
const LINK_KEYS = new Set(["broken_links", "internal_redirects", "semantic_link_destination"]);

type SourcedCheck = { key: string; evidence?: { url: string; found: unknown; details: string; expected?: string; source?: EvidenceSource } };

function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a), y = new URL(b);
    const norm = (u: URL) => `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "") || "/"}`;
    return norm(x) === norm(y);
  } catch { return a === b; }
}

export function evidenceSourceFor(key: string, evidenceUrl: string | undefined, scannedUrl: string, pageSource: "raw_html" | "rendered_html"): EvidenceSource {
  if (key === "robots_txt") return "robots_txt";
  if (key === "sitemap") return "sitemap";
  if (LINK_KEYS.has(key)) return "link_check";
  if (HTTP_KEYS.has(key)) return "http_response";
  if (evidenceUrl && !sameUrl(evidenceUrl, scannedUrl)) return "representative_sample";
  return pageSource;
}

/** Sets evidence.source on every check (keeps a source a detector already recorded). */
export function annotateEvidenceSources<T extends SourcedCheck>(checks: T[], scannedUrl: string, pageSource: "raw_html" | "rendered_html"): T[] {
  for (const item of checks) {
    const evidence = item.evidence || { url: scannedUrl, found: null, details: "" };
    if (!evidence.source) evidence.source = evidenceSourceFor(item.key, evidence.url, scannedUrl, pageSource);
    item.evidence = evidence;
  }
  return checks;
}

/**
 * Wording guard for limited checks: a passive header scan or an automated
 * accessibility rule set can never prove that a site is secure or accessible.
 * Returns the claims found so the self-check can report and neutralise them.
 */
export const ABSOLUTE_CLAIM = /\b(?:volledig (?:veilig|toegankelijk|beveiligd)|website is (?:veilig|toegankelijk)|geen beveiligingsrisico'?s?|wcag[- ]?(?:conform|compliant)|voldoet aan (?:de )?wcag|fully (?:secure|accessible)|site is (?:secure|accessible)|no security risks?|vollständig (?:sicher|barrierefrei)|entièrement (?:sécurisé|accessible)|completamente (?:sicuro|accessibile|seguro|accesible))\b/i;

/**
 * QA #203: when JavaScript WAS rendered, a check must not say it only looked at
 * the raw HTML ("Checkout & funnel ... deze scan gebruikte raw HTML" next to
 * "Scanbewijs: Rendered"). Wording follows the evidence the check actually used;
 * checks whose evidence came from the raw HTML on purpose (a retained raw
 * snapshot, robots.txt, HTTP) keep their wording. Never changes a status or score.
 */
const RAW_WORDING: Array<[RegExp, string]> = [
  [/vanuit deze losse raw-HTML pagina/gi, "vanuit deze ene pagina zonder interactie"],
  [/\b(?:in|op) de raw HTML\b/gi, "in de gerenderde pagina"],
  [/\bin raw HTML\b/gi, "in de gerenderde pagina"],
  [/\b(?:vanuit|uit) raw HTML\b/gi, "vanuit de gerenderde pagina"],
  [/Raw HTML alleen is onvoldoende bewijs/g, "Eén pagina zonder klik- of betaalinteractie is onvoldoende bewijs"],
  [/De actie kan client-side via JavaScript worden gerenderd\./g, "De actie kan pas na een klik, in een apart venster of na een keuze (variant, regio) verschijnen."],
];
export function alignRenderedWording<T extends { message?: string; fix?: string; evidence?: { details?: string; source?: EvidenceSource } }>(checks: T[], rendered: boolean): number {
  if (!rendered) return 0;
  let changed = 0;
  for (const item of checks) {
    if (item.evidence?.source === "raw_html" || /dunne JavaScript-shell/i.test(item.message || "")) continue;
    for (const field of ["message", "fix"] as const) {
      const before = item[field];
      if (typeof before !== "string" || !/raw[- ]HTML|client-side via JavaScript/i.test(before)) continue;
      let after = before;
      for (const [re, to] of RAW_WORDING) after = after.replace(re, to);
      if (after !== before) { item[field] = after; changed++; if (field === "message" && item.evidence && item.evidence.details === before) item.evidence.details = after; }
    }
  }
  return changed;
}
