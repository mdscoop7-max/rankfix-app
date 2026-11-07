/**
 * When is "no JSON-LD found" a proven absence, and when is it only "not seen"?
 *
 * fresh144 (29 Oct 2026): many scored GEO values sit on the same few numbers
 * because a missing JSON-LD block is scored as a warning, while the schema may be
 * injected client-side (typically by a tag manager) and so be absent from the raw
 * server HTML. A missing check is not a proven defect. Generic, no site rules.
 */

import { detectGoogleTagManager } from "./tag-manager.ts";

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
  const found = INJECTORS.filter(({ name, pattern }) => name === "Google Tag Manager" ? (pattern.test(html) || detectGoogleTagManager(html).present) : pattern.test(html)).map(({ name }) => name);
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
  | "render_network_busy"
  | "rendered_dom"
  | "raw_html_no_injectors"
  | "static_html_no_scripts"
  | "render_not_complete"
  | "scripts_unrendered"
  | "tag_manager_unrendered"
  | "client_rendered_unrendered";

/** Three states, never mixed: seen, proven absent, or not observed (no claim). */
export type StructuredDataObservation = "present" | "proven_absent" | "not_observed";

export function structuredDataAbsence(input: { validJsonLd: number; rendered: boolean; clientRenderedRisk: boolean; injectors: string[]; scriptsPresent?: boolean; renderedIncomplete?: boolean; otherStructuredItems?: number; renderNetworkQuiet?: boolean | null }): { proven: boolean; basis: StructuredDataBasis; observation: StructuredDataObservation } {
  // Microdata or RDFa is structured data too (a separate form): never "absent".
  if (input.validJsonLd > 0 || (input.otherStructuredItems || 0) > 0) return { proven: false, basis: "present", observation: "present" };
  // P5 (NU.nl): a tag manager was still loading when the observation window
  // ended (no network quiet); it can still add JSON-LD, so absence is unproven.
  if (input.rendered && input.renderNetworkQuiet === false && input.injectors.length) return { proven: false, basis: "render_network_busy", observation: "not_observed" };
  // A COMPLETE browser observation (full load + settle window) saw the final DOM:
  // absence there is real evidence.
  if (input.rendered) return { proven: true, basis: "rendered_dom", observation: "proven_absent" };
  // 1 Nov: a browser view that did not reach full load (partial navigation) or a
  // short default render window never proves absence.
  if (input.renderedIncomplete) return { proven: false, basis: "render_not_complete", observation: "not_observed" };
  if (input.clientRenderedRisk) return { proven: false, basis: "client_rendered_unrendered", observation: "not_observed" };
  // 1 Nov (A/B on identical content): a tag manager or an empty JSON-LD placeholder
  // can add JSON-LD in the browser. Without a browser observation the absence is
  // NOT proven, also on a substantive server-rendered page (the 31 Oct rule that
  // treated it as proven gave 10 sites an unproven GEO deduction; reverted).
  if (input.injectors.length) return { proven: false, basis: "tag_manager_unrendered", observation: "not_observed" };
  // 1 Nov: without a tag manager, any own script can still add JSON-LD. Only a
  // page WITHOUT executable scripts proves the absence from its HTML alone.
  if (input.scriptsPresent === false) return { proven: true, basis: "static_html_no_scripts", observation: "proven_absent" };
  if (input.scriptsPresent === true) return { proven: false, basis: "scripts_unrendered", observation: "not_observed" };
  return { proven: true, basis: "raw_html_no_injectors", observation: "proven_absent" };
}

// Measurement and consent libraries never add page markup such as JSON-LD (the
// 29 Oct calibration: gtag.js alone keeps absence proven). Tag managers are NOT
// listed here: they run custom HTML and are handled as injectors.
const MEASUREMENT_ONLY_SRC = /(?:googletagmanager\.com\/gtag\/js|google-analytics\.com\/(?:analytics|ga)\.js|connect\.facebook\.net\/[^"']*fbevents|static\.hotjar\.com|clarity\.ms\/tag|plausible\.io\/js|cdn\.matomo\.cloud\/[^"']*matomo\.js|\/matomo\.js|consent\.cookiebot\.com|cdn\.cookielaw\.org|cookie-script\.com|snap\.licdn\.com\/li\.lms-analytics|bat\.bing\.com\/bat\.js|analytics\.tiktok\.com)/i;
// Inline measurement statements: dataLayer/gtag/fbq/_paq/clarity/hj calls.
const MEASUREMENT_STATEMENTS = /(?:window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\];?|function\s+gtag\s*\(\)\s*\{[^}]*\}|gtag\s*\([^;]*\);?|dataLayer\.push\s*\([^;]*\);?|fbq\s*\([^;]*\);?|_paq\.push\s*\([^;]*\);?|var\s+_paq\s*=\s*window\._paq[^;]*;?|clarity\s*\([^;]*\);?|hj\s*\([^;]*\);?)/g;

/** Scripts that could add JSON-LD in the browser (own or unknown code). JSON-LD,
 * JSON data, templates, measurement and consent libraries are excluded. */
export function hasExecutableScripts(html: string): boolean {
  for (const m of String(html || "").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || "";
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1] || "").toLowerCase();
    if (type && !/^(?:text\/javascript|application\/javascript|module|text\/ecmascript|application\/ecmascript)$/.test(type)) continue;
    const src = attrs.match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    if (src) { if (!MEASUREMENT_ONLY_SRC.test(src)) return true; continue; }
    const code = m[2].replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").replace(MEASUREMENT_STATEMENTS, "").replace(/[\s;]+/g, "");
    if (code.length >= 40) return true;
  }
  return false;
}

export function structuredDataUnprovenMessage(basis: StructuredDataBasis, context: string, injectors: string[]): string {
  if (basis === "render_not_complete") {
    return `Structured data is niet gevonden in de browserweergave van deze ${context}, maar die weergave was niet volledig (pagina niet volledig geladen of te kort waargenomen). Het ontbreken is daarom niet bewezen: status niet waargenomen, geen aftrek.`;
  }
  if (basis === "render_network_busy") {
    return `Structured data is niet gevonden in de browserweergave van deze ${context}, maar ${injectors.join(", ") || "een tagmanager"} was nog bezig met laden toen de waarneming eindigde (geen netwerkrust). Daarmee kan JSON-LD nog later worden toegevoegd. Het ontbreken is daarom niet bewezen: status niet waargenomen, geen aftrek.`;
  }
  if (basis === "scripts_unrendered") {
    return `Structured data is in de ruwe HTML van deze ${context} niet gevonden. De pagina laadt scripts die JSON-LD in de browser kunnen toevoegen, en er is geen browserwaarneming beschikbaar. Het ontbreken is daarom niet bewezen: status niet waargenomen, geen aftrek.`;
  }
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

/**
 * Schema.org types declared as Microdata (itemscope + itemtype). A separate
 * evidence form from JSON-LD: it is counted as structured data, never merged
 * into the JSON-LD block count.
 */
// One opening tag at a time (linear): the former single pattern
// <[a-z][^>]*\bitemtype… re-read every tag from each "<x" inside it, which was
// quadratic on pages with long runs of unclosed tags (scan-matrix redos formOpen).
function* openingTags(html: string, attribute: RegExp): Generator<string> {
  for (const match of String(html || "").matchAll(/<[a-z][^>]*>/gi)) {
    if (attribute.test(match[0])) yield match[0];
  }
}
export function microdataTypes(html: string): string[] {
  const types: string[] = [];
  for (const tag of openingTags(html, /\bitemtype\s*=/i)) {
    const match = /\bitemtype\s*=\s*(["'])([^"']+)\1/i.exec(tag);
    if (!match || !/\bitemscope\b/i.test(tag)) continue;
    for (const url of match[2].split(/\s+/)) {
      const type = /^https?:\/\/(?:www\.)?schema\.org\/([A-Za-z][A-Za-z0-9]*)\/?$/i.exec(url)?.[1];
      if (type) types.push(type);
    }
  }
  return types;
}

/** Schema.org types declared as RDFa (typeof with the schema.org vocabulary or prefix). */
export function rdfaTypes(html: string): string[] {
  const source = String(html || "");
  const types: string[] = [];
  const vocabSchema = /\bvocab\s*=\s*(["'])https?:\/\/(?:www\.)?schema\.org\/?\1/i.test(source);
  for (const tag of openingTags(source, /\btypeof\s*=/i)) {
    const match = /\btypeof\s*=\s*(["'])([^"']+)\1/i.exec(tag);
    if (!match) continue;
    for (const token of match[2].split(/\s+/)) {
      const prefixed = /^schema:([A-Za-z][A-Za-z0-9]*)$/i.exec(token)?.[1];
      const full = /^https?:\/\/(?:www\.)?schema\.org\/([A-Za-z][A-Za-z0-9]*)$/i.exec(token)?.[1];
      const bare = vocabSchema && /^[A-Z][A-Za-z0-9]*$/.test(token) ? token : null;
      const type = prefixed || full || bare;
      if (type) types.push(type);
    }
  }
  return types;
}
