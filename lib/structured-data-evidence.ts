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
  return INJECTORS.filter(({ pattern }) => pattern.test(html)).map(({ name }) => name);
}

export type StructuredDataBasis =
  | "present"
  | "rendered_dom"
  | "raw_html_no_injectors"
  | "tag_manager_unrendered"
  | "client_rendered_unrendered" | "raw_html_server_rendered";

export function structuredDataAbsence(input: { validJsonLd: number; rendered: boolean; clientRenderedRisk: boolean; injectors: string[]; serverRendered?: boolean }): { proven: boolean; basis: StructuredDataBasis } {
  if (input.validJsonLd > 0) return { proven: false, basis: "present" };
  // A completed browser render saw the final DOM: absence there is real evidence.
  if (input.rendered) return { proven: true, basis: "rendered_dom" };
  if (input.clientRenderedRisk) return { proven: false, basis: "client_rendered_unrendered" };
  // 31 Oct (PDF P5): on a substantive server-rendered page the site publishes its
  // own markup in the HTML; a tag manager alone does not make absence unproven
  // ("pas na JavaScript zichtbaar" was wrong on Croatia, HousingNet, Kwik-Fit).
  if (input.injectors.length && input.serverRendered) return { proven: true, basis: "raw_html_server_rendered" };
  if (input.injectors.length) return { proven: false, basis: "tag_manager_unrendered" };
  return { proven: true, basis: "raw_html_no_injectors" };
}

export function structuredDataUnprovenMessage(basis: StructuredDataBasis, context: string, injectors: string[]): string {
  if (basis === "tag_manager_unrendered") {
    return `Structured data is in de ruwe HTML van deze ${context} niet gevonden, maar de pagina laadt ${injectors.join(", ")}. Zo'n tag manager kan JSON-LD pas in de browser toevoegen, en er is geen volledige render beschikbaar. Het ontbreken is daarom niet bewezen.`;
  }
  return `Structured data kon niet betrouwbaar worden bevestigd voor deze ${context}, omdat de JavaScript-pagina niet volledig kon worden gerenderd.`;
}
