import { decodeHtmlEntities } from "./html-entities.ts";
import { isNonContentUrl } from "./report-quality.ts";
import { isCartActionUrl, isTemplateHref, neutralizeTemplateBindings } from "./template-links.ts";
import { validatePublicHttpUrl } from "./safe-fetch.ts";

export const sameCrawlSite = (a: URL, b: URL) => a.hostname.toLowerCase().replace(/^www\./, "") === b.hostname.toLowerCase().replace(/^www\./, "");
export function crawlUrl(raw: string, base: URL): string | null {
  try {
    if (raw.length > 4096 || isTemplateHref(raw) || isCartActionUrl(raw)) return null;
    const u = validatePublicHttpUrl(new URL(decodeHtmlEntities(raw), base).href);
    if (u.href.length > 2048 || !sameCrawlSite(u, base)) return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) if (/^(?:utm_.+|gclid|fbclid|msclkid)$/i.test(key)) u.searchParams.delete(key);
    return u.href;
  } catch { return null; }
}
export function crawlExclusion(url: string): string | null {
  const u = new URL(url), contentUrl = new URL(url);
  // Pagination is excluded from representative sampling, but belongs in an inventory crawl.
  for (const [key,value] of contentUrl.searchParams) if (/^(?:page|p|paged|offset)$/i.test(key) && /^\d{1,6}$/.test(value)) contentUrl.searchParams.delete(key);
  if (isNonContentUrl(contentUrl.href)) return "non_content_or_personal_flow";
  if ([...u.searchParams.keys()].some(k => /^(?:q|query|search|session|sessionid|sid|sort|sort_by|filter)$/i.test(k))) return "search_filter_or_session";
  if (/\.(?:pdf|jpe?g|png|svg|gif|webp|mp4|zip|xml|json|css|js|woff2?)(?:$)/i.test(u.pathname)) return "non_html_resource";
  return null;
}
/** Anchors, head pagination and hreflang nominate URLs; canonical is never a reason to skip a page. */
export function crawlLinks(html: string, base: URL): string[] {
  const urls: string[] = [];
  const attr = (s: string, name: string) => s.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'))?.slice(1).find(v => v !== undefined) || "";
  for (const m of neutralizeTemplateBindings(html).matchAll(/<(?:[\w-]+:)?(a|link)\b([^>]*)>/gi)) {
    if (m[1].toLowerCase() === "link" && !/\b(?:alternate|next|prev|canonical)\b/i.test(attr(m[2], "rel"))) continue;
    const href = attr(m[2], "href");
    if (!href) continue;
    const url = crawlUrl(href, base);
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}
export function sitemapEntries(xml: string, base: URL): { index: boolean; urls: string[] } {
  if (!/<(?:[\w-]+:)?(?:sitemapindex|urlset)\b/i.test(xml)) throw new Error("SITEMAP_NOT_XML");
  const index = /<(?:[\w-]+:)?sitemapindex\b/i.test(xml);
  const urls = [...xml.matchAll(/<(?:[\w-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?loc>/gi)].flatMap(m => {
    const url = crawlUrl(m[1].trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1"), base); return url ? [url] : [];
  });
  if (!index) urls.push(...crawlLinks(xml, base));
  return { index, urls: [...new Set(urls)] };
}
/** RankFix-specific groups win over wildcard groups. Longest matching Allow/Disallow wins. */
export function robotsAllows(text: string, url: URL): boolean {
  const groups: { agents: string[]; rules: { path: string; allow: boolean }[] }[] = [];
  let seenRule = false;
  let current = { agents: [] as string[], rules: [] as { path: string; allow: boolean }[] };
  for (const line of text.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, "").match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/); if (!m) continue;
    const field = m[1].toLowerCase();
    if (field === "user-agent") {
      if (seenRule) { groups.push(current); current = { agents: [], rules: [] }; seenRule = false; }
      current.agents.push(m[2].toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current.agents.length) {
      seenRule = true;
      if (m[2]) current.rules.push({ path: m[2], allow: field === "allow" });
    }
  }
  groups.push(current);
  const specific = groups.filter(g => g.agents.some(a => a !== "*" && "rankfixbot".includes(a)));
  const selected = specific.length ? specific : groups.filter(g => g.agents.includes("*"));
  const rules = selected.flatMap(g => g.rules);
  // Site-controlled wildcard patterns must never become backtracking regexes.
  // An excessive policy stays conservatively disallowed instead of hanging a worker.
  if (rules.length > 1000 || rules.some(r => r.path.length > 4096)) return false;
  const matches = rules.filter(r => {
    const end = r.path.endsWith("$"), pattern = end ? r.path.slice(0, -1) : r.path;
    const chunks = pattern.split("*"), value = url.pathname + url.search;
    if (!value.startsWith(chunks[0])) return false;
    let cursor = chunks[0].length;
    for (let i=1; i<chunks.length; i++) {
      if (!chunks[i]) continue;
      const at = end && i===chunks.length-1 ? value.length-chunks[i].length : value.indexOf(chunks[i],cursor);
      if (at<cursor || !value.startsWith(chunks[i],at)) return false;
      cursor=at+chunks[i].length;
    }
    return !end || pattern.endsWith("*") || cursor===value.length;
  }).sort((a,b) => b.path.replace(/[*$]/g, "").length - a.path.replace(/[*$]/g, "").length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}
