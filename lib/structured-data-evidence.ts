/**
 * When is "no JSON-LD found" a proven absence, and when is it only "not seen"?
 *
 * fresh144 (29 Oct 2026): many scored GEO values sit on the same few numbers
 * because a missing JSON-LD block is scored as a warning, while the schema may be
 * injected client-side (typically by a tag manager) and so be absent from the raw
 * server HTML. A missing check is not a proven defect. Generic, no site rules.
 */

// Containers that can inject arbitrary markup, including JSON-LD, at runtime.
// Measurement libraries (gtag.js, analytics.js) are deliberately not listed: they
// do not run a container's custom HTML tags.
const INJECTORS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Google Tag Manager", pattern: /googletagmanager\.com\/(?:gtm\.js|ns\.html)|["']GTM-[A-Z0-9]{4,}["']|[?&]id=GTM-[A-Z0-9]{4,}/i },
  { name: "Tealium", pattern: /tags\.tiqcdn\.com\/utag\/|\butag\.js\b/i },
  { name: "Adobe Launch", pattern: /assets\.adobedtm\.com\/|\blaunch-[a-z0-9]+(?:\.min)?\.js\b/i },
  { name: "Matomo Tag Manager", pattern: /\/container_[A-Za-z0-9]+\.js\b|matomo\.cloud\/[^"']*container_/i },
  { name: "Segment", pattern: /cdn\.segment\.com\/analytics\.js\/v1\//i },
];

export function jsonLdInjectorSignals(html: string): string[] {
  if (!html) return [];
  const found = INJECTORS.filter(({ pattern }) => pattern.test(html)).map(({ name }) => name);
  // 1 Nov (A/B P5): an EMPTY ld+json script is a placeholder the page fills in
  // the browser (nu.nl-like). Its presence means JSON-LD is client-side.
  if (emptyJsonLdPlaceholders(html) > 0) found.push("lege JSON-LD-placeholder");
  return found;
}

/** ld+json script tags without any content: filled by JavaScript at runtime. */
export function emptyJsonLdPlaceholders(html: string): number {
  let count = 0;
  for (const m of String(html || "").matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) if (!m[1].trim()) count++;
  return count;
}

export type StructuredDataBasis =
  | "present"
  | "rendered_dom"
  | "raw_html_no_injectors"
  | "tag_manager_unrendered"
  | "client_rendered_unrendered";

/** Three states, never mixed: seen, proven absent, or not observed (no claim). */
export type StructuredDataObservation = "present" | "proven_absent" | "not_observed";

export function structuredDataAbsence(input: { validJsonLd: number; rendered: boolean; clientRenderedRisk: boolean; injectors: string[] }): { proven: boolean; basis: StructuredDataBasis; observation: StructuredDataObservation } {
  if (input.validJsonLd > 0) return { proven: false, basis: "present", observation: "present" };
  // A completed browser render saw the final DOM: absence there is real evidence.
  if (input.rendered) return { proven: true, basis: "rendered_dom", observation: "proven_absent" };
  if (input.clientRenderedRisk) return { proven: false, basis: "client_rendered_unrendered", observation: "not_observed" };
  // 1 Nov (A/B on identical content): a tag manager or an empty JSON-LD placeholder
  // can add JSON-LD in the browser. Without a browser observation the absence is
  // NOT proven, also on a substantive server-rendered page (the 31 Oct rule that
  // treated it as proven gave 10 sites an unproven GEO deduction; reverted).
  if (input.injectors.length) return { proven: false, basis: "tag_manager_unrendered", observation: "not_observed" };
  return { proven: true, basis: "raw_html_no_injectors", observation: "proven_absent" };
}

export function structuredDataUnprovenMessage(basis: StructuredDataBasis, context: string, injectors: string[]): string {
  if (basis === "tag_manager_unrendered") {
    return `Structured data is in de ruwe HTML van deze ${context} niet gevonden, maar de pagina bevat ${injectors.join(", ")}. Daarmee kan JSON-LD pas in de browser worden toegevoegd, en er is geen browserwaarneming beschikbaar. Het ontbreken is daarom niet bewezen: status niet waargenomen, geen aftrek.`;
  }
  return `Structured data kon niet betrouwbaar worden bevestigd voor deze ${context}, omdat de JavaScript-pagina niet volledig kon worden gerenderd.`;
}

/** Raw text of every ld+json block that parses as JSON (empty placeholders excluded). */
export function validJsonLdBlockTexts(html: string): string[] {
  const out: string[] = [];
  for (const m of String(html || "").matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = m[1].trim();
    if (!text) continue;
    try { JSON.parse(text); out.push(text.replace(/<\/script/gi, "<\\/script")); } catch { /* invalid JSON is not structured data */ }
  }
  return out;
}
