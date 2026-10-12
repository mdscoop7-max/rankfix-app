// Report-quality rules. Pure functions (no imports) so every decision that shapes
// a customer report is regression-tested in isolation. The scan route and report
// page only add wording around these results.

// ---------------------------------------------------------------------------
// Rendering: never leak a raw runtime/stack message into a customer report.
// ---------------------------------------------------------------------------

export type RenderFailureCode =
  | "BROWSER_UNAVAILABLE"
  | "RENDER_TIMEOUT"
  | "RENDER_BLOCKED"
  | "RENDER_DEGRADED"
  | "RENDER_NOT_SUBSTANTIVE"
  | "RENDER_LIMIT_REACHED"
  | "RENDER_FAILED";

export function renderFailureCode(error: unknown): RenderFailureCode {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/BROWSER_UNAVAILABLE|could not find (?:chrome|chromium|expected browser)|failed to launch|browser was not found|executable doesn'?t exist|no usable sandbox|ENOENT.*chrom/i.test(message)) return "BROWSER_UNAVAILABLE";
  if (/timeout|timed out|navigation.*exceeded/i.test(message)) return "RENDER_TIMEOUT";
  if (/URL_HOST_BLOCKED|URL_PROTOCOL_BLOCKED|DNS|ERR_BLOCKED|net::ERR_ACCESS_DENIED|403/i.test(message)) return "RENDER_BLOCKED";
  if (/RENDER_BUDGET_EXHAUSTED|RENDER_DEADLINE_REACHED|RENDER_LIMIT_REACHED/.test(message)) return "RENDER_LIMIT_REACHED";
  if (/RENDER_DEGRADED/.test(message)) return "RENDER_DEGRADED";
  if (/NOT_SUBSTANTIVE/.test(message)) return "RENDER_NOT_SUBSTANTIVE";
  return "RENDER_FAILED";
}

const RENDER_FAILURE_COPY: Record<RenderFailureCode, string> = {
  BROWSER_UNAVAILABLE: "de browser-rendering was tijdens deze scan tijdelijk niet beschikbaar",
  RENDER_TIMEOUT: "de pagina laadde niet binnen de tijdslimiet van de browser-rendering",
  RENDER_BLOCKED: "de website blokkeerde de browser-rendering",
  RENDER_DEGRADED: "de browserversie bevatte minder inhoud dan de HTML-versie",
  RENDER_NOT_SUBSTANTIVE: "de browserversie bevatte geen bruikbare pagina-inhoud",
  RENDER_LIMIT_REACHED: "de browser-rendering is overgeslagen om de scan binnen de tijds- en geheugenlimiet te houden",
  RENDER_FAILED: "de browser-rendering kon niet worden voltooid",
};

// Older reports stored the raw (truncated) runtime message; map it as well.
export function renderFailureText(stored: unknown): string {
  const value = String(stored ?? "");
  const code = (Object.keys(RENDER_FAILURE_COPY) as RenderFailureCode[]).find((key) => value === key) ?? renderFailureCode(new Error(value));
  return RENDER_FAILURE_COPY[code];
}

// ---------------------------------------------------------------------------
// Page sampling: which URLs may represent a website.
// ---------------------------------------------------------------------------

const TRACKING_PARAM = /^(?:utm_[a-z]+|gclid|gbraid|wbraid|fbclid|msclkid|dclid|yclid|twclid|ttclid|li_fat_id|mc_cid|mc_eid|_ga|_gl|_ke|_hsenc|_hsmi|gad_[a-z]+|camp|campaign|cmp|cid|icid|intcmp|int_cmp|ref|referrer|source|src|trk|tracking|sc_[a-z]+|s_kwcid|ef_id|from_srp|prevent-auto-open-privacy-settings)$/i;

export function stripTrackingParams(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return value;
  }
}

// Account, login, order, withdrawal and filter/facet URLs are application screens,
// not content that represents the website in search. They never enter the sample.
const ACCOUNT_SEGMENT = /^(?:my-?account|mijn-?account|account|accounts|myprofile|my-profile|profile|profiel|mijn-profiel|mijn-gegevens|login|log-in|logout|log-out|uitloggen|inloggen|signin|sign-in|signout|sign-out|signup|sign-up|register|registreren|auth|oauth2?|sso|authorize|password|wachtwoord|reset-password|wishlist|verlanglijst|favorites?|favourites?|favorieten|cart|basket|winkelwagen|winkelmand|checkout|afrekenen|kassa|purchases?|orders?|order-history|bestellingen|mijn-bestellingen|withdrawal|herroeping|herroepen|returns-portal|search|zoeken)$/i;
const NON_CONTENT_QUERY = /^(?:q|query|search|zoek|sort|order|filter|filters|f|facet|page|session|sessionid|token|withdrawal|returnurl|return_url|redirect|redirect_uri|next|callback)$/i;

export function isNonContentUrl(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return true; }
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment).toLowerCase(); } catch { return segment.toLowerCase(); }
  });
  if (segments.some((segment) => ACCOUNT_SEGMENT.test(segment))) return true;
  // Facet/filter paths: "_product-awards-Alle-Awards", "/f/merk-x", "/filter/…".
  if (segments.some((segment) => segment.startsWith("_") || segment === "f" || segment === "filter" || segment === "filters" || segment === "facet")) return true;
  for (const key of url.searchParams.keys()) if (NON_CONTENT_QUERY.test(key)) return true;
  return false;
}

// First meaningful path segment (locale prefixes skipped). Used to stop one site
// section (e.g. 10 customer-service pages) from filling the whole sample.
export function sectionKey(value: string): string {
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
    const meaningful = segments.filter((segment) => !/^[a-z]{2}(?:-[a-z]{2})?$/.test(segment));
    return meaningful.length > 1 ? meaningful[0] : "/";
  } catch {
    return "/";
  }
}

// ---------------------------------------------------------------------------
// Meta title / description assessment (representative pages and main page).
// ---------------------------------------------------------------------------

const TITLE_SEPARATOR = /\s+[|\-–—·•:]\s+|\s*[|]\s*/;

function normalizeSegment(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim();
}

export function titleSegments(title: string): string[] {
  return title.split(TITLE_SEPARATOR).map((segment) => segment.trim());
}

// The same segment twice ("… | TransHeroes | TransHeroes") is a template bug.
export function duplicateTitleSegment(title: string): string | null {
  const seen = new Set<string>();
  for (const segment of titleSegments(title)) {
    const key = normalizeSegment(segment);
    if (key.length < 3) continue;
    if (seen.has(key)) return segment;
    seen.add(key);
  }
  return null;
}

function brandTokens(host: string): string[] {
  const clean = host.toLowerCase().replace(/^www\./, "");
  const label = clean.split(".")[0] || clean;
  return [clean, label, label.replace(/-/g, " ")];
}

// "| Expert.nl" or "Zalando": the title names only the brand, not the page.
export function isBrandOnlyTitle(title: string, host: string): boolean {
  const tokens = new Set(brandTokens(host).map(normalizeSegment));
  const content = titleSegments(title).map(normalizeSegment).filter(Boolean);
  if (!content.length) return true;
  return content.every((segment) => tokens.has(segment) || tokens.has(segment.replace(/\s+/g, "")));
}

export function titleLengthDistance(length: number): number {
  return length < 30 ? 30 - length : length > 60 ? length - 60 : 0;
}

// Credit falls in steps as the title moves further from the 30–60 band, so a
// 61-character title is not treated like a 110-character one.
export function titleLengthCredit(length: number): number {
  const distance = titleLengthDistance(length);
  if (distance === 0) return 1;
  if (distance <= 5) return 0.9;
  if (distance <= 15) return 0.75;
  if (distance <= 30) return 0.6;
  return 0.45;
}

export type MetaAssessment = { status: "PASS" | "WARNING"; credit: number; details: string; flag?: "missing" | "empty" | "brand_only" | "duplicate_segment" | "outdated_year" };

// "Tarieven en vergoedingen 2017": a year at least three years old in a title
// signals outdated content to searchers.
export function outdatedTitleYear(title: string, now: Date = new Date()): number | null {
  const years = [...title.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const current = now.getFullYear();
  const old = years.filter((year) => year <= current - 3 && year >= 2000);
  return old.length && !years.some((year) => year >= current - 1) ? Math.max(...old) : null;
}

export function assessPageTitle(title: string, host: string, now: Date = new Date()): MetaAssessment {
  const value = title.trim();
  if (!value) return { status: "WARNING", credit: 0.25, details: "Geen title gevonden in raw HTML.", flag: "missing" };
  if (isBrandOnlyTitle(value, host)) {
    return { status: "WARNING", credit: 0.25, details: `Title bevat alleen de merknaam ("${value}"); het onderwerp van de pagina ontbreekt.`, flag: "brand_only" };
  }
  const duplicate = duplicateTitleSegment(value);
  const length = value.length;
  const inRange = titleLengthDistance(length) === 0;
  const lengthText = inRange ? `Title gevonden (${length} tekens); binnen richtwaarde 30–60.` : `Title gevonden (${length} tekens); buiten richtwaarde 30–60.`;
  if (duplicate) {
    return { status: "WARNING", credit: Math.min(0.8, titleLengthCredit(length)), details: `${lengthText} "${duplicate}" staat dubbel in de title; waarschijnlijk voegt het template het merk een tweede keer toe.`, flag: "duplicate_segment" };
  }
  const oldYear = outdatedTitleYear(value, now);
  if (oldYear) {
    return { status: "WARNING", credit: Math.min(0.85, titleLengthCredit(length)), details: `${lengthText} De title noemt het jaar ${oldYear}; dat oogt verouderd in zoekresultaten.`, flag: "outdated_year" };
  }
  return inRange
    ? { status: "PASS", credit: 1, details: lengthText }
    : { status: "WARNING", credit: titleLengthCredit(length), details: lengthText };
}

export function assessPageDescription(description: string, tagPresent: boolean): MetaAssessment {
  const value = description.trim();
  if (!value) return tagPresent
    ? { status: "WARNING", credit: 0.25, details: "Meta description-tag aanwezig maar content is leeg.", flag: "empty" }
    : { status: "WARNING", credit: 0.25, details: "Geen meta description-tag gevonden in raw HTML.", flag: "missing" };
  const length = value.length;
  if (length >= 70 && length <= 160) return { status: "PASS", credit: 1, details: `Meta description gevonden (${length} tekens); bruikbare lengte.` };
  if (length > 160 && length <= 200) return { status: "WARNING", credit: 0.9, details: `Meta description gevonden (${length} tekens); aan de lange kant, Google kort descriptions boven ongeveer 160 tekens vaak in.` };
  if (length > 200) return { status: "WARNING", credit: 0.7, details: `Meta description gevonden (${length} tekens); uitzonderlijk lang.` };
  if (length >= 50) return { status: "WARNING", credit: 0.85, details: `Meta description gevonden (${length} tekens); kort.` };
  return { status: "WARNING", credit: 0.65, details: `Meta description gevonden (${length} tekens); uitzonderlijk kort.` };
}

// ---------------------------------------------------------------------------
// JavaScript application shells and bot protection.
// ---------------------------------------------------------------------------

// A representative page whose raw HTML is a client application shell cannot
// prove that a title, description or H1 is missing.
export function isClientShell(input: { visibleWords: number; scriptCount: number; jsFramework: boolean; h1Count: number; rendered: boolean }): boolean {
  if (input.rendered) return false;
  if (input.visibleWords < 80 && input.scriptCount >= 4) return true;
  return input.jsFramework && input.h1Count === 0 && input.visibleWords < 200;
}

const BOT_MANAGER_COOKIE = /^(?:bm_sz|bm_sv|bm_s|bm_so|bm_mi|_abck|ak_bmsc|__cf_bm|cf_clearance|datadome|_px\w*|incap_ses_\w*|visid_incap_\w*|reese84|x-kpsdk-\w+)$/i;

export function botManagerCookies(cookieNames: string[]): string[] {
  return [...new Set(cookieNames.filter((name) => BOT_MANAGER_COOKIE.test(name)))];
}

// A bot manager on its own is common and harmless (IKEA, Coolblue). Only when the
// response also lacks the head metadata a real storefront ships do we treat it as
// a reduced bot response whose absences prove nothing.
export function isReducedBotResponse(input: { botCookies: string[]; jsonLdBlocks: number; ogTags: number; h1Count: number }): boolean {
  return input.botCookies.length > 0 && input.jsonLdBlocks === 0 && input.ogTags === 0 && input.h1Count === 0;
}

// Checks whose negative result depends on the page body or head metadata that a
// reduced bot response strips.
export const BOT_SENSITIVE_CHECKS = new Set([
  "schema", "organization_website", "entity", "social", "twitter_card", "h1", "headings",
  "trust_legal_signals", "faq", "answer", "breadcrumbs", "alt", "content", "identity", "trust",
]);

// ---------------------------------------------------------------------------
// Sitewide aggregation: real counts and template patterns.
// ---------------------------------------------------------------------------

// Finds a shared title suffix (e.g. " | Coolblue - Alles voor een glimlach") that
// pushes several titles over 60 characters. Reported once instead of per URL.
export function titleTemplatePattern(titles: string[], host = ""): { suffix: string; pages: number; overLimit: number } | null {
  const valid = titles.map((title) => title.trim()).filter(Boolean);
  if (valid.length < 3) return null;
  const counts = new Map<string, number>();
  for (const title of valid) {
    // Every separator position is a candidate tail: "A - B | Brand - Slogan"
    // yields " - B | Brand - Slogan", " | Brand - Slogan" and " - Slogan".
    const parts = title.split(/(?=\s+[|\-–—·•]\s+)/);
    for (let i = 1; i < parts.length; i++) {
      const suffix = parts.slice(i).join("");
      counts.set(suffix, (counts.get(suffix) || 0) + 1);
    }
  }
  const brand = normalizeSegment((host.toLowerCase().replace(/^www\./, "").split(".")[0]) || "");
  const candidates = [...counts]
    // A plain brand suffix ("| TransHeroes") is normal practice and not a template
    // problem; only long slogans or claims (20+ characters) are reported.
    .filter(([suffix, pages]) => pages >= 3 && suffix.trim().length >= 20)
    .map(([suffix, pages]) => ({ suffix, pages, overLimit: valid.filter((title) => title.endsWith(suffix) && title.length > 60).length }))
    // Only a pattern shared by at least four titles and responsible for at least three
    // over-long ones is a real template issue, not a few hand-written titles.
    .filter((item) => item.pages >= 4 && item.overLimit >= 3);
  if (!candidates.length) return null;
  // Prefer the tail that carries the brand, then the one that explains the most
  // over-long titles, then the most pages, then the shortest (the template itself).
  const branded = brand ? candidates.filter((item) => normalizeSegment(item.suffix).includes(brand)) : [];
  const pool = branded.length ? branded : candidates;
  pool.sort((a, b) => b.overLimit - a.overLimit || b.pages - a.pages || a.suffix.length - b.suffix.length);
  return pool[0];
}

// ---------------------------------------------------------------------------
// Report text helpers.
// ---------------------------------------------------------------------------

export function shortUrl(value: string, max = 90): string {
  let display = value;
  try {
    const url = new URL(value);
    display = url.origin + url.pathname + (url.search ? "?…" : "");
  } catch {}
  return display.length > max ? display.slice(0, max - 1) + "…" : display;
}

// Schema types that describe a real-world entity. Actions, list items and media
// objects are structure, not entities, and are not reported as such.
const NON_ENTITY_TYPES = /^(?:\w*action|listitem|itemlist|breadcrumblist|imageobject|videoobject|mediaobject|webpage|webpagelement|wpheader|wpfooter|sitenavigationelement|country|place|postaladdress|geocoordinates|contactpoint|openinghoursspecification|aggregaterating|rating|review|offer|aggregateoffer|propertyvalue|quantitativevalue|monetaryamount|pricespecification|entrypoint|searchaction|readaction)$/i;

export function entityTypesForDisplay(types: string[]): string[] {
  return [...new Set(types.filter((type) => !NON_ENTITY_TYPES.test(type.trim())))];
}
