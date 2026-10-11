// Candidate selection for product-detail pages. URL shape only nominates a page;
// a candidate counts as product evidence only after the fetched page itself proves
// it (Product schema, or a commerce action with a price). No platform or brand rules.

const PRODUCT_SEGMENT = /\/(?:product|products|product-page|p|artikel|item)\/[^/]+/i;
// Last path segment: a descriptive slug (3+ words) ending in a product identifier,
// e.g. "...-zwart-372526317", "...-10627553/" or "...-c1182o0bj-q12.html".
const SLUG_WITH_ID = /(?:^|\/)[a-z0-9]+(?:-[a-z0-9]+){2,}-(?:\d{6,}|(?=[a-z0-9]*\d)[a-z0-9]{6,}-[a-z0-9]{2,4})(?:\.html?)?\/?$/i;
// Editorial and date-based URLs often carry numeric IDs too.
const EDITORIAL = /\/(?:news|nieuws|blog|blogs|magazine|stories|inspiratie|inspiration|ideas|ideeen|reviews?|pers|press|vacatures?|jobs|careers?)(?:\/|$)|\/(?:19|20)\d{2}\/\d{1,2}\//i;

export function looksLikeProductDetailPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (EDITORIAL.test(path)) return false;
  return PRODUCT_SEGMENT.test(path) || SLUG_WITH_ID.test(path);
}

export function extractProductDetailLinks(html: string, pageUrl: string, siteHost: string, limit = 8): string[] {
  const host = siteHost.toLowerCase().replace(/^www\./, "");
  const found = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    let url: URL;
    try { url = new URL(match[1], pageUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.hostname.toLowerCase().replace(/^www\./, "") !== host) continue;
    if (!looksLikeProductDetailPath(url.pathname)) continue;
    url.search = "";
    url.hash = "";
    found.add(url.toString());
    if (found.size >= limit) break;
  }
  return [...found];
}
