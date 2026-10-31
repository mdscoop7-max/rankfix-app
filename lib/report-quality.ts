// Report-quality rules. Pure functions (no imports) so every decision that shapes
// a customer report is regression-tested in isolation. The scan route and report
// page only add wording around these results.

// ---------------------------------------------------------------------------
// Rendering: never leak a raw runtime/stack message into a customer report.
// ---------------------------------------------------------------------------

export type RenderFailureCode =
  | "BROWSER_UNAVAILABLE"
  | "RENDER_BUSY"
  | "RENDER_TIMEOUT"
  | "RENDER_BLOCKED"
  | "RENDER_DEGRADED"
  | "RENDER_NOT_SUBSTANTIVE"
  | "RENDER_LIMIT_REACHED"
  | "BROWSER_CRASHED"
  | "RENDER_NETWORK"
  | "RENDER_FAILED";

export function renderFailureCode(error: unknown): RenderFailureCode {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/BROWSER_UNAVAILABLE|RENDER_CHROME_NOT_INSTALLED|could not find (?:chrome|chromium|expected browser)|failed to launch|browser was not found|executable doesn'?t exist|no usable sandbox|ENOENT.*chrom/i.test(message)) return "BROWSER_UNAVAILABLE";
  if (/RENDER_BUSY/.test(message)) return "RENDER_BUSY";
  if (/timeout|timed out|navigation.*exceeded/i.test(message)) return "RENDER_TIMEOUT";
  if (/URL_HOST_BLOCKED|URL_PROTOCOL_BLOCKED|DNS|ERR_BLOCKED|net::ERR_ACCESS_DENIED|403/i.test(message)) return "RENDER_BLOCKED";
  if (/RENDER_BUDGET_EXHAUSTED|RENDER_DEADLINE_REACHED|RENDER_LIMIT_REACHED/.test(message)) return "RENDER_LIMIT_REACHED";
  if (/RENDER_DEGRADED/.test(message)) return "RENDER_DEGRADED";
  if (/NOT_SUBSTANTIVE/.test(message)) return "RENDER_NOT_SUBSTANTIVE";
  // QA-144: 18 of 93 renders ended as an unexplained RENDER_FAILED. Name the two
  // common classes so a TestLab run shows why the browser did not finish.
  if (/Target closed|Session closed|Protocol error|browser has disconnected|Navigating frame was detached|Execution context was destroyed|Connection closed|crash/i.test(message)) return "BROWSER_CRASHED";
  if (/net::ERR_|ERR_(?:CONNECTION|NAME_NOT_RESOLVED|CERT|SSL|HTTP2|ABORTED|EMPTY_RESPONSE|TOO_MANY_REDIRECTS)/i.test(message)) return "RENDER_NETWORK";
  return "RENDER_FAILED";
}

const RENDER_FAILURE_COPY: Record<RenderFailureCode, string> = {
  BROWSER_UNAVAILABLE: "Chromium kon in de scanomgeving niet worden gestart",
  RENDER_BUSY: "de browser-rendering had tijdelijk onvoldoende capaciteit",
  RENDER_TIMEOUT: "de pagina laadde niet binnen de tijdslimiet van de browser-rendering",
  RENDER_BLOCKED: "de website blokkeerde de browser-rendering",
  RENDER_DEGRADED: "de browserversie bevatte minder inhoud dan de HTML-versie",
  RENDER_NOT_SUBSTANTIVE: "de browserversie bevatte geen bruikbare pagina-inhoud",
  RENDER_LIMIT_REACHED: "het maximum aantal browserpogingen of de scandeadline is bereikt",
  BROWSER_CRASHED: "de browser in de scanomgeving stopte tijdens het laden van de pagina",
  RENDER_NETWORK: "de browser kreeg geen bruikbare netwerkverbinding met (een deel van) de website",
  RENDER_FAILED: "de browser-rendering kon niet worden voltooid",
};

/**
 * Short, non-secret class of a render error for diagnostics (no URLs, no paths,
 * no stack): what a TestLab run needs to see why rendering failed.
 */
export function renderFailureDetail(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const cleaned = message.replace(/https?:\/\/\S+/gi, "[url]").replace(/(?:\/[\w.-]+){2,}/g, "[path]").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 100) : null;
}

// Older reports stored the raw (truncated) runtime message; map it as well.
export function renderFailureText(stored: unknown): string {
  const value = String(stored ?? "");
  const code = (Object.keys(RENDER_FAILURE_COPY) as RenderFailureCode[]).find((key) => value === key) ?? renderFailureCode(new Error(value));
  return RENDER_FAILURE_COPY[code];
}

// ---------------------------------------------------------------------------
// Page sampling: which URLs may represent a website.
// ---------------------------------------------------------------------------

// Marketing and analytics parameters of the common EU/US tools (Google, Meta,
// Microsoft, AT Internet/Piano, Matomo, Webtrends, Adobe, HubSpot, Mailchimp,
// Marketo, affiliate networks). They never identify a different page.
const TRACKING_PARAM = /^(?:utm_[a-z_]+|xtor|at_[a-z_]+|srsltid|pk_[a-z_]+|mtm_[a-z_]+|matomo_[a-z_]+|piwik_[a-z_]+|wt_mc|wt\.mc_id|wt\.[a-z_]+|ito|ns_[a-z_]+|spm|scid|igshid|mkt_tok|hsctatracking|oly_[a-z_]+|vero_[a-z_]+|rb_clickid|epik|s_cid|sscid|irclickid|awc|zanpid|tduid|ranmid|ransiteid|ranEAID|gclid|gbraid|wbraid|fbclid|msclkid|dclid|yclid|twclid|ttclid|li_fat_id|mc_cid|mc_eid|_ga|_gl|_ke|_hsenc|_hsmi|gad_[a-z]+|camp|campaign|cmp|cid|icid|intcmp|int_cmp|ref|referrer|source|src|trk|tracking|sc_[a-z]+|s_kwcid|ef_id|from_srp|prevent-auto-open-privacy-settings)$/i;

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

// Personal utility screens (credential recovery, preferences, continue watching,
// watch lists) in EU languages: per-user pages, never representative content.
const PERSONAL_SEGMENT = /^(?:recupero-credenziali|recupero-password|recuperar-(?:contrasena|contraseña|clave)|mot-de-passe-oublie|passwort-vergessen|wachtwoord-vergeten|forgot-password|reset|preferences|preferencje(?:-tresci)?|preferenze|preferencias|preferenties|voorkeuren|einstellungen|settings|instellingen|kontynuuj-odtwarzanie|continue-watching|verder-kijken|weiterschauen|watchlist|mijn-lijst|moja-lista|my-list|historia-ogladania|watch-history)$/i;

// 31 Oct (PDF P7): carts/checkout and bot traps are never representative pages.
const UTILITY_SEGMENT = /^(?:shoppingcart|shopping-cart|cart|basket|checkout|afrekenen|kassa|warenkorb|panier|carrito|carrello|secret-?link|honeypot|bot-?trap|spider-?trap)$/i;
const LOCALE_SEGMENT = /^(?:[a-z]{2})(?:[-_][a-z]{2})?$/i;
const VARIANT_QUERY = /^(?:color|colour|kleur|farbe|couleur|size|maat|grootte|groesse|taille|variant|variation|sku|v|option|swatch)$/i;
/**
 * One identity per page for the sample (PDF P7: five language versions of one page,
 * three colour variants of one product). The locale prefix (/en/, /nl-be/) and
 * variant parameters (?color=, ?maat=) do not make a different page.
 */
export function sampleIdentityKey(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length && LOCALE_SEGMENT.test(parts[0])) parts.shift();
    for (const key of [...url.searchParams.keys()]) if (VARIANT_QUERY.test(key)) url.searchParams.delete(key);
    url.hash = "";
    const search = url.searchParams.toString();
    // Still a valid URL: callers treat the key as a URL.
    return `${url.protocol}//${url.hostname.replace(/^www\./, "").toLowerCase()}/${parts.join("/").toLowerCase().replace(/\/+$/, "")}${search ? `?${search}` : ""}`;
  } catch { return value; }
}

export function isNonContentUrl(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return true; }
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment).toLowerCase(); } catch { return segment.toLowerCase(); }
  });
  if (segments.some((segment) => ACCOUNT_SEGMENT.test(segment) || PERSONAL_SEGMENT.test(segment) || UTILITY_SEGMENT.test(segment))) return true;
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
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
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

// Framework/CMS defaults and one-word greetings describe no page topic.
const PLACEHOLDER_TITLES = new Set([
  "app", "react app", "vite + react", "vite + react + ts", "vite app", "vue app", "angular", "nuxt", "next.js", "create next app",
  "document", "untitled", "untitled document", "new page", "home", "homepage", "home page", "index", "default", "test",
  "welcome", "welkom", "willkommen", "bienvenue", "benvenuto", "bienvenido", "startpagina", "startseite", "accueil", "inicio",
  "my site", "my website", "mijn website", "website", "site", "loading", "loading...", "laden...",
]);
// "| Brand | topic" or "Topic | ": a template left one title part empty.
export function hasDanglingTitleSeparator(title: string): boolean {
  return /^\s*[|–—:·•]/.test(title) || /[|–—:·•-]\s*$/.test(title) || /[|–—]\s*[|–—]/.test(title);
}
export function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLES.has(title.trim().toLowerCase().replace(/\s+/g, " "));
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

export type MetaAssessment = { status: "PASS" | "WARNING"; credit: number; details: string; flag?: "missing" | "empty" | "placeholder" | "dangling_separator" | "brand_only" | "duplicate_segment" | "outdated_year" };

// "Tarieven en vergoedingen 2017": a year at least three years old in a title
// signals outdated content to searchers.
export function outdatedTitleYear(title: string, now: Date = new Date()): number | null {
  const years = [...title.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const current = now.getFullYear();
  const old = years.filter((year) => year <= current - 3 && year >= 2000);
  return old.length && !years.some((year) => year >= current - 1) ? Math.max(...old) : null;
}

/**
 * A CMS template that prints a field label into the title: "… | Careers Description",
 * "Product | ASML Title", "Page title", "undefined", "{{ title }}", "%title%". Only the
 * last segment is read, and a trailing label word ("Description", "Title") counts only
 * when the rest of that segment is the site's brand or a section of the page's own URL,
 * so real titles such as "Software engineer job description" are untouched.
 */
const FIELD_LABEL = /\b(?:description|beschrijving|omschrijving|beschreibung|descripción|descrizione|title|titel|titre|titolo|título|meta[- ]?title|seo[- ]?title)$/i;
export function templateFieldLeak(title: string, host = "", path = ""): string | null {
  const value = title.trim();
  if (/\{\{[^}]*\}\}|%[a-z_]+%|\$\{[^}]*\}|^(?:undefined|null|nan|page title|seo title|meta title)$|\b(?:undefined|null)\s*$/i.test(value)) return value;
  const segments = value.split(/\s+[|–—-]\s+|\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  const last = segments[segments.length - 1];
  const label = last.match(FIELD_LABEL)?.[0];
  if (!label) return null;
  const rest = last.slice(0, last.length - label.length).trim().toLowerCase();
  if (!rest || rest.split(/\s+/).length > 2) return null;
  const brand = host.toLowerCase().replace(/^www\./, "").split(".")[0] || "";
  const sections = path.toLowerCase().split("/").filter(Boolean);
  return rest === brand || sections.includes(rest) || sections.includes(rest.replace(/\s+/g, "-")) ? last : null;
}

export function assessPageTitle(title: string, host: string, now: Date = new Date(), pixelWidth: number | null = null, path = ""): MetaAssessment {
  const value = title.trim();
  if (!value) return { status: "WARNING", credit: 0.25, details: "Geen title gevonden in raw HTML.", flag: "missing" };
  const leak = templateFieldLeak(value, host, path);
  if (leak) return { status: "WARNING", credit: 0.7, details: `Title bevat een sjabloonveld ("${leak}"); het CMS print waarschijnlijk een veldnaam in plaats van een waarde.`, flag: "placeholder" };
  if (isPlaceholderTitle(value)) {
    return { status: "WARNING", credit: 0.3, details: `Title is een algemene standaardtitel ("${value}") zonder onderwerp.`, flag: "placeholder" };
  }
  if (isBrandOnlyTitle(value, host)) {
    return { status: "WARNING", credit: 0.25, details: `Title bevat alleen de merknaam ("${value}"); het onderwerp van de pagina ontbreekt.`, flag: "brand_only" };
  }
  if (hasDanglingTitleSeparator(value)) {
    return { status: "WARNING", credit: 0.7, details: `Title begint of eindigt met een scheidingsteken ("${value}"); een titeldeel ontbreekt waarschijnlijk.`, flag: "dangling_separator" };
  }
  const duplicate = duplicateTitleSegment(value);
  const length = value.length;
  // Google truncates by rendered pixel width, not by a fixed character count.
  // Treat length alone as advice, not a demonstrated ranking defect.
  const lengthText = `Title gevonden (${length} tekens). De weergave in zoekresultaten hangt af van de pixelbreedte, niet van een harde tekengrens.`;
  if (duplicate) {
    return { status: "WARNING", credit: 0.8, details: `${lengthText} "${duplicate}" staat dubbel in de title; waarschijnlijk voegt het template het merk een tweede keer toe.`, flag: "duplicate_segment" };
  }
  const oldYear = outdatedTitleYear(value, now);
  if (oldYear) {
    return { status: "WARNING", credit: 0.85, details: `${lengthText} De title noemt het jaar ${oldYear}; dat oogt verouderd in zoekresultaten.`, flag: "outdated_year" };
  }
  // Only a rendered-browser measurement can justify a length-related score deduction.
  // Approximate SERP font width is not a guarantee of Google's actual snippet.
  if (pixelWidth !== null && Number.isFinite(pixelWidth) && pixelWidth > 580) {
    // Like long descriptions: a truncated preview is advice, not a deduction.
    return { status:"PASS", credit:1, details:`${lengthText} Geschatte zichtbare titelbreedte ${Math.round(pixelWidth)}px boven circa 580px: previewadvies, geen aftrek.` };
  }
  return { status: "PASS", credit: 1, details: lengthText };
}

export function assessPageDescription(description: string, tagPresent: boolean, source: "raw" | "rendered" = "raw"): MetaAssessment {
  const value = description.trim();
  if (!value) return tagPresent
    ? { status: "WARNING", credit: 0.25, details: "Meta description-tag aanwezig maar content is leeg.", flag: "empty" }
    : { status: "WARNING", credit: 0.25, details: source === "rendered" ? "Geen meta description-tag gevonden, ook niet na JavaScript-rendering." : "Geen meta description-tag gevonden in raw HTML.", flag: "missing" };
  const length = value.length;
  if (length >= 70 && length <= 160) return { status: "PASS", credit: 1, details: `Meta description gevonden (${length} tekens); bruikbare lengte.` };
  // Like titles: Google truncates long descriptions in the snippet; length alone
  // is advice, not a demonstrated defect, so it costs no points.
  if (length > 160 && length <= 200) return { status: "PASS", credit: 1, details: `Meta description gevonden (${length} tekens); aan de lange kant, Google kort descriptions boven ongeveer 160 tekens vaak in (advies, geen aftrek).` };
  if (length > 200) return { status: "PASS", credit: 1, details: `Meta description gevonden (${length} tekens); uitzonderlijk lang, wordt in zoekresultaten ingekort (advies, geen aftrek).` };
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

// Bot managers also announce themselves in response headers without setting a
// cookie (DataDome, Cloudflare challenge, Imperva, Sucuri, PerimeterX, Kasada).
// Plain CDN headers (Akamai, Cloudflare) are not bot-manager evidence on their own.
const BOT_MANAGER_HEADER = /^(?:x-datadome(?:-cid)?|cf-mitigated|x-iinfo|x-sucuri-id|x-sucuri-block|x-px-[\w-]+|x-kpsdk-[\w-]+)$/i;
export function botManagerHeaders(headers: Headers | Array<[string, string]>): string[] {
  const names: string[] = [];
  const entries = Array.isArray(headers) ? headers : [...headers.entries()];
  for (const [name, value] of entries) {
    if (BOT_MANAGER_HEADER.test(name)) names.push(name.toLowerCase());
    if (/^server$/i.test(name) && /datadome|imperva|incapsula|sucuri/i.test(value)) names.push(`server: ${value}`);
  }
  return [...new Set(names)];
}

// A bot manager on its own is common and harmless (IKEA, Coolblue). Only when the
// response also lacks the head metadata a real page ships do we treat it as a
// reduced bot response whose absences prove nothing. The H1 rule is relaxed to
// "no H1 or a short page" so a stripped page with a stray heading still counts.
export function isReducedBotResponse(input: { botCookies: string[]; botHeaders?: string[]; jsonLdBlocks: number; ogTags: number; h1Count: number; visibleWords?: number; descriptionPresent?: boolean }): boolean {
  const botManager = input.botCookies.length > 0 || (input.botHeaders || []).length > 0;
  if (!botManager || input.jsonLdBlocks > 0 || input.ogTags > 0) return false;
  if (input.h1Count === 0) return true;
  return input.descriptionPresent === false && typeof input.visibleWords === "number" && input.visibleWords < 150;
}

// Checks whose negative result depends on the page body or head metadata that a
// reduced bot response strips.
export const BOT_SENSITIVE_CHECKS = new Set([
  "schema", "organization_website", "entity", "social", "twitter_card", "h1", "headings",
  "trust_legal_signals", "faq", "answer", "breadcrumbs", "alt", "content", "identity", "trust",
  "author", "business_placeholders",
]);
// Head elements that a stripped response may omit: only their ABSENCE is unproven
// (a present but too long description is still evidence about the real page).
export const BOT_SENSITIVE_WHEN_ABSENT = new Set(["description", "geo_description", "canonical", "lang", "hreflang"]);

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
    .filter(([suffix, pages]) => pages >= 3 && suffix.trim().length >= 12)
    .map(([suffix, pages]) => ({ suffix, pages, overLimit: valid.filter((title) => title.endsWith(suffix) && title.length > 60).length }))
    .filter((item) => item.overLimit >= 2);
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

// A registrar's placeholder for a reserved, parked or for-sale domain is not a website:
// there is no organisation, content or SEO to audit. Read from the title, or from the
// body of a short page only (hosting providers mention "domain names" on real sites).
const PARKED_PHRASES = /(?<![\p{L}])(?:domeinnaam (?:is )?gereserveerd|domein (?:is )?gereserveerd|deze domeinnaam is (?:geregistreerd|te koop|gereserveerd)|deze domeinnaam is geregistreerd door|this domain (?:is|has been|may be) (?:for sale|parked|registered|reserved)|this domain name is (?:for sale|parked|reserved)|domain (?:name )?(?:is )?(?:parked|reserved)|parked (?:domain|free)|buy this domain|the domain [\p{L}\p{N}.-]+ is for sale|diese domain (?:ist|wurde) (?:registriert|reserviert|geparkt|zu verkaufen)|domain (?:ist )?reserviert|ce (?:nom de )?domaine (?:est|a été) (?:à vendre|réservé|enregistré|parqué)|domaine réservé|questo dominio è (?:in vendita|stato registrato|riservato)|dominio (?:riservato|in vendita|parcheggiato)|este dominio (?:está a la venta|ha sido registrado|está reservado)|dominio reservado|ta domena (?:je naprodaj|je rezervirana)|ta domena jest na sprzedaż|domena (?:zarezerwowana|na sprzedaż)|doména je (?:na prodej|rezervována)|denne domæne er (?:til salg|reserveret)|denna domän är (?:till salu|reserverad)|sedoparking|parkingcrew|bodis\.com)(?![\p{L}])/iu;
export function isParkedDomainPage(input: { title: string; text: string; words: number }): boolean {
  if (PARKED_PHRASES.test(String(input.title || ""))) return true;
  return input.words < 300 && PARKED_PHRASES.test(String(input.text || "").slice(0, 4000));
}
