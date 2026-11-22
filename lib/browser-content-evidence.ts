// What a visitor sees in the browser versus what the server sends as raw HTML,
// for two things crawlers often miss: the language switch and customer reviews.
// Content that only appears after JavaScript may be invisible to search engines
// and AI crawlers that do not run scripts. Evidence only; adds no points.

export type LanguageOption = { label: string; lang: string | null; url: string };
export type ReviewEvidence = { ratingValue: number | null; reviewCount: number | null; widgets: string[]; visibleReviews: boolean };

const LANGUAGE_LABEL = /^(?:nl|en|de|fr|es|it|pt|pl|da|sv|nb|no|fi|cs|tr|nederlands|english|deutsch|français|francais|español|espanol|italiano|português|portugues|polski|dansk|svenska|norsk|suomi|čeština)$/i;
const LOCALE_PATH = /^\/([a-z]{2})(?:[-_][a-z]{2})?(?:\/|$)/i;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const textOf = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Language versions offered on the page: hreflang alternates, or a visible switcher. */
export function languageOptions(html: string, pageUrl: string): { source: "hreflang" | "switcher" | "none"; options: LanguageOption[] } {
  const page = new URL(pageUrl);
  const alternates: LanguageOption[] = [];
  for (const tag of html.match(/<link\b[^>]*\brel\s*=\s*["']alternate["'][^>]*>/gi) || []) {
    const lang = tag.match(/\bhreflang\s*=\s*["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!lang || !href || lang.toLowerCase() === "x-default") continue;
    try { alternates.push({ label: lang, lang: lang.toLowerCase(), url: new URL(decode(href), page).toString() }); } catch { /* skip */ }
  }
  if (alternates.length) return { source: "hreflang", options: dedupe(alternates) };
  const switcher: LanguageOption[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const label = textOf(m[2]);
    const hreflang = m[1].match(/\b(?:hreflang|lang)\s*=\s*["']([^"']+)["']/i)?.[1] || null;
    let url: URL;
    try { url = new URL(decode(href), page); } catch { continue; }
    if (url.hostname.replace(/^www\./, "") !== page.hostname.replace(/^www\./, "")) continue;
    const localeInPath = url.pathname.match(LOCALE_PATH)?.[1]?.toLowerCase() || null;
    if ((LANGUAGE_LABEL.test(label) || hreflang) && (localeInPath || hreflang || /[?&](?:lang|language|locale)=/i.test(url.search))) {
      switcher.push({ label: label || hreflang || localeInPath || "", lang: (hreflang || localeInPath)?.toLowerCase() || null, url: url.toString() });
    }
  }
  const options = dedupe(switcher);
  return options.length >= 2 ? { source: "switcher", options } : { source: "none", options: [] };
}

function dedupe(options: LanguageOption[]): LanguageOption[] {
  const seen = new Set<string>();
  return options.filter((o) => { const k = o.url.replace(/\/$/, ""); if (seen.has(k)) return false; seen.add(k); return true; });
}

const WIDGETS: Array<[string, RegExp]> = [
  ["Trustpilot", /trustpilot\.com|trustpilot-widget/i],
  ["Kiyoh", /kiyoh\.com|kiyoh-widget/i],
  ["Klantenvertellen", /klantenvertellen\.nl/i],
  ["Feedback Company", /feedbackcompany\.com/i],
  ["Trusted Shops", /trustedshops\.(?:com|de|nl)|etrusted\.com/i],
  ["WebwinkelKeur", /webwinkelkeur\.nl/i],
  ["Google Reviews", /google\.com\/maps\/[^"']*reviews|elfsight\.com[^"']*google-reviews/i],
  ["Yotpo", /yotpo\.com|yotpo-widget/i],
  ["Judge.me", /judge\.me|jdgm-/i],
  ["Reviews.io", /reviews\.io|reviews\.co\.uk/i],
];

/** Ratings in structured data, known review widgets and visible review text. */
export function reviewEvidence(html: string): ReviewEvidence {
  let ratingValue: number | null = null, reviewCount: number | null = null;
  const rating = html.match(/"aggregateRating"\s*:\s*\{([^}]*)\}/i)?.[1];
  if (rating) {
    const v = rating.match(/"ratingValue"\s*:\s*"?([\d.,]+)/i)?.[1];
    const c = rating.match(/"(?:reviewCount|ratingCount)"\s*:\s*"?(\d+)/i)?.[1];
    ratingValue = v ? Number(v.replace(",", ".")) : null;
    reviewCount = c ? Number(c) : null;
  }
  const widgets = WIDGETS.filter(([, re]) => re.test(html)).map(([name]) => name);
  const text = textOf(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " "));
  const visibleReviews = /\b\d+(?:[.,]\d+)?\s*(?:\/|uit|van|out of)\s*(?:5|10)\b[\s\S]{0,80}\b(?:reviews?|beoordelingen|recensies|sterren|ratings?|bewertungen)\b|\b\d[\d.]*\s+(?:reviews?|beoordelingen|recensies|klantbeoordelingen|bewertungen|avis)\b/i.test(text);
  return { ratingValue: Number.isFinite(ratingValue as number) ? ratingValue : null, reviewCount, widgets, visibleReviews };
}

/**
 * A language switch without links to translated URLs: a language <select>, an anchor
 * carrying hreflang, or the scan's own structural language-selector signal. The
 * switch is visible, but translated URLs are not proven.
 */
export function languageSwitchWithoutUrls(html: string): boolean {
  return /<select\b[^>]*(?:lang|language|taal|sprache|idioma|lingua)[^>]*>/i.test(html) || /<a\b[^>]*\shreflang\s*=/i.test(html);
}

export type BrowserContentEvidence = {
  javascriptExecuted: boolean;
  language: { source: "hreflang" | "switcher" | "switch_without_urls" | "none"; options: LanguageOption[]; onlyAfterJavascript: boolean };
  reviews: ReviewEvidence & { onlyAfterJavascript: boolean };
};

/** Compare raw server HTML with the browser-rendered HTML (when rendering ran). */
export function browserContentEvidence(input: { rawHtml: string; renderedHtml: string | null; pageUrl: string; /** The scan's language-selector signal (same as the hreflang check). */ languageSwitchVisible?: boolean }): BrowserContentEvidence {
  const rendered = input.renderedHtml && input.renderedHtml.length > 20 ? input.renderedHtml : null;
  const finalHtml = rendered || input.rawHtml;
  const found = languageOptions(finalHtml, input.pageUrl);
  // Same conclusion as the hreflang check: a visible switch whose translated URLs are not proven.
  const lang = found.options.length === 0 && (input.languageSwitchVisible || languageSwitchWithoutUrls(finalHtml))
    ? { source: "switch_without_urls" as const, options: [] }
    : found;
  const rawLang = languageOptions(input.rawHtml, input.pageUrl);
  const reviews = reviewEvidence(finalHtml);
  const rawReviews = reviewEvidence(input.rawHtml);
  const hasReviews = (r: ReviewEvidence) => r.ratingValue !== null || r.visibleReviews;
  // Without raw server HTML (page only reachable through the browser) there is nothing to compare.
  const comparable = Boolean(rendered) && input.rawHtml.length > 20;
  return {
    javascriptExecuted: Boolean(rendered),
    language: { ...lang, onlyAfterJavascript: comparable && lang.options.length > 0 && rawLang.options.length === 0 },
    reviews: { ...reviews, onlyAfterJavascript: comparable && hasReviews(reviews) && !hasReviews(rawReviews) },
  };
}

export function browserContentSentences(e: BrowserContentEvidence | null | undefined): string[] {
  if (!e) return [];
  const out: string[] = [];
  if (e.language.options.length) {
    const langs = [...new Set(e.language.options.map((o) => o.lang || o.label))].slice(0, 8).join(", ");
    out.push(`Taalkeuze: ${e.language.options.length} taalversie(s) (${langs})${e.language.source === "hreflang" ? " via hreflang" : " via een taalkiezer"}.${e.language.onlyAfterJavascript ? " Alleen zichtbaar na JavaScript: zoekmachines die geen scripts uitvoeren zien de andere talen mogelijk niet." : ""}`);
  } else if (e.language.source === "switch_without_urls") {
    out.push("Taalkeuze: een taal- of landkeuze is zichtbaar, maar vertaalde URL's zijn niet bevestigd (geen hreflang-links of links naar taalversies gevonden).");
  } else out.push("Taalkeuze: geen taalkeuze en geen andere taalversies gevonden.");
  const r = e.reviews;
  if (r.ratingValue !== null || r.visibleReviews || r.widgets.length) {
    const parts = [r.ratingValue !== null ? `beoordeling ${r.ratingValue}${r.reviewCount ? ` (${r.reviewCount} reviews)` : ""} in de productgegevens` : null, r.visibleReviews ? "zichtbare reviewtekst" : null, r.widgets.length ? `widget: ${r.widgets.join(", ")}` : null].filter(Boolean);
    out.push(`Reviews: ${parts.join("; ")}.${r.onlyAfterJavascript ? " Alleen zichtbaar na JavaScript: zoekmachines en AI-crawlers zien de reviews mogelijk niet." : ""}`);
  } else out.push("Reviews: geen reviews of reviewwidget gevonden.");
  if (!e.javascriptExecuted) out.push("Browserweergave niet uitgevoerd: alleen de server-HTML is beoordeeld.");
  return out;
}
