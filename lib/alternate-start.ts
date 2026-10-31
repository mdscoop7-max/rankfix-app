// Alternative public start page when a site's homepage refuses RankFix or does
// not answer (QA 30 Oct: Zara HTTP_BLOCKED, ABB FETCH_TIMEOUT). Only URLs the
// site itself publishes in robots.txt-declared or standard sitemaps are used,
// and each is fetched like any visitor request: no headers, cookies, proxies or
// other tricks to get past a protection. Pure helpers; the route does the I/O.

export const ALTERNATE_START_CODES = new Set(["HTTP_BLOCKED", "FETCH_TIMEOUT", "FETCH_CONNECTION", "CHALLENGE_OR_INTERSTITIAL", "BODY_TIMEOUT"]);

const SKIP_PATH = /(?:^|\/)(?:privacy|cookie|cookies|terms|voorwaarden|agb|impressum|imprint|disclaimer|login|signin|account|mijn-|my-|cart|basket|checkout|winkelwagen|winkelmand|warenkorb|search|zoeken|wp-json|api|feed|tag|author|page\/\d)(?:\/|$|-)/i;
const ASSET = /\.(?:jpe?g|png|gif|webp|svg|pdf|zip|xml|json|js|css|mp4)(?:$|\?)/i;
const PREFER = /(?:categor|collection|product|shop|winkel|dienst|service|solution|oplossing|over-ons|about|contact)/i;

export function sitemapUrlsFromRobots(robotsTxt: string, origin: string): string[] {
  const declared = [...robotsTxt.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  const sameSite = declared.filter((u) => { try { return new URL(u).origin === origin; } catch { return false; } });
  return [...new Set([...sameSite, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])].slice(0, 4);
}

export function locValues(xml: string): { kind: "urlset" | "sitemapindex" | null; locs: string[] } {
  const root = xml.match(/<(?:(?:[a-z0-9_-]+):)?(urlset|sitemapindex)\b/i);
  const locs = [...xml.matchAll(/<(?:(?:[a-z0-9_-]+):)?loc\b[^>]*>([\s\S]*?)<\/(?:(?:[a-z0-9_-]+):)?loc>/gi)].map((m) => String(m[1] || "").trim().replace(/&amp;/g, "&")).filter(Boolean);
  return { kind: root ? (root[1].toLowerCase() as "urlset" | "sitemapindex") : null, locs };
}

/** Up to `limit` shallow, same-host content pages; category/product/service/about first. */
export function pickAlternateStartUrls(pageUrls: string[], host: string, limit = 2): string[] {
  const bare = host.replace(/^www\./, "").toLowerCase();
  const scored = pageUrls.flatMap((raw) => {
    let u: URL; try { u = new URL(raw); } catch { return []; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, "").toLowerCase() !== bare) return [];
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (path === "/" || SKIP_PATH.test(path) || ASSET.test(path) || u.search) return [];
    const depth = path.split("/").filter(Boolean).length;
    if (depth > 3) return [];
    return [{ url: u.toString(), score: (PREFER.test(path) ? 10 : 0) - depth }];
  });
  return [...new Map(scored.sort((a, b) => b.score - a.score).map((x) => [x.url, x])).values()].slice(0, limit).map((x) => x.url);
}
