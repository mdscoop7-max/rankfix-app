import { decodeHtmlEntities } from "./html-entities";
import { htmlAttributes } from "./html-document-evidence";

export type SitemapHreflangEvidence = {
  currentUrlFound: boolean;
  alternates: Array<{ language:string; href:string }>;
  confirmedLanguages: string[];
};

/**
 * Look for the exact currently audited URL in a sitemap <url> entry.
 * A sitemap index alone cannot prove per-page translations: child sitemaps
 * must be inspected. Never use unrelated page-language links as evidence.
 */
export function sitemapHreflangForUrl(xml: string, pageUrl: string): SitemapHreflangEvidence {
  const normalize = (url: string) => {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      parsed.hostname = parsed.hostname.replace(/^www\./i, "");
      if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
      return parsed.toString();
    } catch { return ""; }
  };
  const target = normalize(pageUrl);
  for (const m of (xml || "").matchAll(/<(?:[a-z0-9_-]+:)?url\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?url\s*>/gi)) {
    const entry = m[1];
    const loc = entry.match(/<(?:[a-z0-9_-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?loc\s*>/i)?.[1] || "";
    if (normalize(decodeHtmlEntities(loc.trim())) !== target) continue;
    const alternates = [...entry.matchAll(/<(?:[a-z0-9_-]+:)?link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
      .map(x => htmlAttributes(x[0]))
      .filter(a => /(?:^|\s)alternate(?:$|\s)/i.test(a.rel || "") && a.hreflang && a.href)
      .flatMap(a => {
        try {
          const url = new URL(decodeHtmlEntities(a.href),pageUrl);
          if (!/^https?:$/.test(url.protocol) || !/^(?:[a-z]{2,3}(?:-[a-z0-9]{2,8})*|x-default)$/i.test(a.hreflang)) return [];
          return [{ language:a.hreflang.toLowerCase(), href:url.toString() }];
        } catch { return []; }
      });
    const unique = [...new Map(alternates.map(a=>[a.language+" "+a.href,a])).values()];
    const confirmedLanguages = [...new Set(unique.map(a=>a.language).filter(a=>a!=="x-default"))];
    return {currentUrlFound:true,alternates:unique,confirmedLanguages};
  }
  return {currentUrlFound:false,alternates:[],confirmedLanguages:[]};
}
