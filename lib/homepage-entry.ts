import { visibleWordCount } from "./render-quality.ts";

/**
 * A domain root can be a tiny language gateway that returns HTTP 200.
 * Do not grade its blank shell as the website homepage.
 * Only try a bounded, first-party landing if the root lacks substantive evidence.
 * Never alter an explicitly requested non-root path or follow untrusted off-site URLs.
 */
export function rootLandingCandidates(url: URL, html: string, language: string): URL[] {
  if (url.pathname !== "/" || url.search || url.hash) return [];
  // A content-bearing homepage is the source of truth, even if it links to languages.
  const words = visibleWordCount(html);
  const hasHeading = /<h1\b[^>]*>[\s\S]*?\S[\s\S]*?<\/h1>/i.test(html);
  const hasDescription = /<meta\b[^>]*(?:name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']{15,}|content\s*=\s*["'][^"']{15,}["'][^>]*name\s*=\s*["']description["'])/i.test(html);
  const hasSchema = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/i.test(html);
  if (words >= 110 || hasHeading || hasDescription || hasSchema) return [];

  const refs: string[] = [];
  // HTTP-equivalent refresh and simple client-side location links are common
  // on language gateways; never evaluate arbitrary website JavaScript.
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bhttp-equiv\s*=\s*["']refresh["']/i.test(tag)) continue;
    const value = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || "";
    const destination = value.match(/\burl\s*=\s*["']?\s*([^\s;"'>]+)/i)?.[1];
    if (destination) refs.push(destination);
  }
  for (const re of [
    /\b(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi,
    /\b(?:window\.)?location\.(?:replace|assign)\(\s*["']([^"']+)["']/gi,
  ]) for (const match of html.matchAll(re)) refs.push(match[1]);
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    if (/^\/?(?:nl|en|de|fr|es|it)(?:-[a-z]{2})?\/?$/i.test(match[2])) refs.push(match[2]);
  }

  // On an otherwise empty gateway, probe one conventional locale index based
  // on the selected scan language; accept it only if it proves substantially
  // more page evidence. No hardcoded organization/domain exceptions.
  const locale = /^[a-z]{2}$/.test(language) ? language : "nl";
  refs.push("/" + locale);
  const out: URL[] = [];
  const seen = new Set<string>();
  for (const raw of refs) {
    try {
      const candidate = new URL(raw.replace(/\\\//g, "/"), url);
      if (candidate.origin !== url.origin || candidate.username || candidate.password) continue;
      if (candidate.search || candidate.hash || candidate.pathname === "/") continue;
      // Entry-page discovery must not wander into products, accounts, or admin paths.
      if (!/^\/(?:[a-z]{2}(?:-[a-z]{2})?|home|index(?:\.html?)?)\/?$/i.test(candidate.pathname)) continue;
      if (seen.has(candidate.href)) continue;
      seen.add(candidate.href); out.push(candidate);
      if (out.length >= 3) break;
    } catch { /* Malformed/untrusted redirect remains ignored. */ }
  }
  return out;
}

export function isRicherRootLanding(initialHtml: string, alternativeHtml: string): boolean {
  const initialWords = visibleWordCount(initialHtml);
  const alternativeWords = visibleWordCount(alternativeHtml);
  return alternativeWords >= 90
    && alternativeWords >= Math.max(initialWords * 2, initialWords + 60)
    && /<title\b[^>]*>[\s\S]*?\S[\s\S]*?<\/title>/i.test(alternativeHtml)
    && /<(?:h[1-6]|main|article|nav)\b/i.test(alternativeHtml);
}
