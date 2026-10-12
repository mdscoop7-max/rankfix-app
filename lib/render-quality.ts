// Guards for browser-rendered evidence. A headless render can itself be blocked
// (bot challenge, empty shell) while still returning HTTP 200 and a <title>.
// Such a document is not evidence of the website and must never replace better
// evidence or count as a successful recovery.

export function visibleWordCount(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

// Minimum visible content for a recovered page to count as the website itself.
export const MIN_RECOVERED_WORDS = 40;

export function isSubstantiveRender(html: string | null | undefined): boolean {
  return Boolean(html) && visibleWordCount(html as string) >= MIN_RECOVERED_WORDS;
}

// Structural evidence a render must keep. A degraded render (consent wall,
// bot variant, broken hydration) can keep plenty of words while losing the
// site's navigation and structured data; such a render is not the website.
export function linkCount(html: string): number {
  return (html.match(/<a\b[^>]*\bhref\s*=\s*["'][^"'#][^"']*["']/gi) || []).length;
}
export function jsonLdCount(html: string): number {
  return (html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/gi) || []).length;
}
// Raw pages with at least this many links must keep a quarter of them.
export const MIN_RAW_LINKS_FOR_STRUCTURE = 20;

export function renderLosesStructure(rawHtml: string, renderedHtml: string): boolean {
  if (!rawHtml) return false;
  const rawLinks = linkCount(rawHtml);
  if (rawLinks >= MIN_RAW_LINKS_FOR_STRUCTURE && linkCount(renderedHtml) < rawLinks * 0.25) return true;
  const rawJsonLd = jsonLdCount(rawHtml);
  if (rawJsonLd > 0 && jsonLdCount(renderedHtml) === 0) return true;
  return false;
}

// A render replaces the raw HTML only when the raw HTML was a thin client shell or
// the render keeps at least half of the raw visible content and its structure.
export function renderImprovesEvidence(rawWords: number, rawThinShell: boolean, renderedHtml: string, rawHtml = ""): boolean {
  const renderedWords = visibleWordCount(renderedHtml);
  if (rawThinShell) return renderedWords >= Math.min(MIN_RECOVERED_WORDS, rawWords + 1);
  if (renderLosesStructure(rawHtml, renderedHtml)) return false;
  return renderedWords >= rawWords * 0.5;
}

// A browser render can end in a client-side error state (the JavaScript app
// throws, a blocked request breaks hydration) while the server already sent a
// complete, indexable page. Such a render must never replace that evidence.
const ERROR_TITLE = /^\s*(?:error|fout|404|500|503|page not found|pagina niet gevonden|not found|niet gevonden|something went wrong|er ging iets mis)\b/i;
const NOINDEX = /<meta\b[^>]*name\s*=\s*["'](?:robots|googlebot)["'][^>]*content\s*=\s*["'][^"']*\bnoindex\b/i;

const titleOf = (html: string) => (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();

export function renderIsErrorState(rawHtml: string, renderedHtml: string): boolean {
  if (!rawHtml) return false;
  const rawTitle = titleOf(rawHtml);
  const renderedTitle = titleOf(renderedHtml);
  if (ERROR_TITLE.test(renderedTitle) && !ERROR_TITLE.test(rawTitle)) return true;
  // The server said "index", the rendered app says "noindex": the app changed state.
  if (NOINDEX.test(renderedHtml) && !NOINDEX.test(rawHtml)) return true;
  return false;
}

// For server-rendered pages the server's <head> (title, description, canonical,
// robots, JSON-LD) is what search engines receive first and is authoritative.
// The browser render only contributes the body (footer links, forms, client
// content). A client router that rewrites the title (e.g. "Nl | Brand") must not
// replace a correct server title. Thin client shells keep the rendered head.
export function withServerHead(rawHtml: string, renderedHtml: string, rawIsThinShell: boolean): string {
  if (rawIsThinShell || !rawHtml) return renderedHtml;
  const rawHead = rawHtml.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)?.[0];
  if (!rawHead || !/<title[^>]*>[\s\S]*?\S[\s\S]*?<\/title>/i.test(rawHead)) return renderedHtml;
  const renderedHead = /<head\b[^>]*>[\s\S]*?<\/head>/i;
  return renderedHead.test(renderedHtml) ? renderedHtml.replace(renderedHead, () => rawHead) : renderedHtml;
}
