/**
 * Repair 2 (7 Nov 2026, Codex point 4): resolve a page's relative links the way a
 * browser does. A `<base href>` in the document changes the base for every
 * relative href (`producten` on a page with `<base href="/nl/">` is /nl/producten);
 * resolving against the page URL instead produced 404s that do not exist.
 * HTML entities in the attribute (`&amp;`) are decoded first, like a browser.
 * Only http(s) bases are accepted; a base on another host is honoured as written
 * (the link then simply is not internal).
 */
import { decodeHtmlEntities } from "./html-entities.ts";

export function documentBaseUrl(html: string, pageUrl: URL | string): URL {
  const page = new URL(String(pageUrl));
  // Only the first <base href> counts (HTML spec), and only in the document head.
  const head = String(html || "").split(/<\/head\s*>/i)[0] || "";
  const tag = /<base\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/i.exec(head) || /<base\b[^>]*\bhref\s*=\s*([^\s>"']+)/i.exec(head);
  const raw = tag ? (tag[2] ?? tag[1]) : "";
  if (!raw) return page;
  try {
    const base = new URL(decodeHtmlEntities(raw.trim()), page);
    return /^https?:$/.test(base.protocol) ? base : page;
  } catch {
    return page;
  }
}

/** Resolve an href from the document against its base; null when unusable. */
export function resolveDocumentHref(href: string, base: URL): URL | null {
  try { return new URL(decodeHtmlEntities(String(href || "").trim()), base); } catch { return null; }
}
