// Official social and review profiles linked from a page. Most sites link
// their profiles with icons only (no visible text), so the link target is the
// evidence, not the anchor text. Share/intent links are not profiles.
// Pure: unit-tested in tests/social-profiles.test.mjs.

const PLATFORMS: Array<[string, RegExp]> = [
  ["Facebook", /^(?:[\w-]+\.)?facebook\.com$|^fb\.me$/],
  ["Instagram", /^(?:www\.)?instagram\.com$/],
  ["LinkedIn", /^(?:[\w-]+\.)?linkedin\.com$/],
  ["X/Twitter", /^(?:www\.)?(?:twitter|x)\.com$/],
  ["YouTube", /^(?:www\.|m\.)?youtube\.com$/],
  ["TikTok", /^(?:www\.)?tiktok\.com$/],
  ["Pinterest", /^(?:[\w-]+\.)?pinterest\.[a-z.]+$/],
  ["Threads", /^(?:www\.)?threads\.net$/],
  ["Trustpilot", /^(?:[\w-]+\.)?trustpilot\.com$/],
  ["Tripadvisor", /^(?:www\.)?tripadvisor\.[a-z.]+$/],
  ["Google Bedrijfsprofiel", /^g\.page$|^maps\.app\.goo\.gl$|^(?:www\.)?google\.[a-z.]+$|^goo\.gl$/],
  ["Zorgkaart Nederland", /^(?:www\.)?zorgkaartnederland\.nl$/],
  ["Kiyoh", /^(?:www\.)?kiyoh\.(?:com|nl)$/],
  ["Klantenvertellen", /^(?:www\.)?klantenvertellen\.nl$/],
  ["The Feedback Company", /^(?:www\.)?feedbackcompany\.com$/],
  ["Trusted Shops", /^(?:www\.)?trustedshops\.[a-z.]+$/],
  ["Yelp", /^(?:www\.)?yelp\.[a-z.]+$/],
  ["Werkspot", /^(?:www\.)?werkspot\.nl$/],
];

// Sharing, login and app links on those hosts are not the organisation's profile.
const NOT_A_PROFILE = /\/(?:sharer|share|sharing|intent|dialog|plugins|login|signup|hashtag|search|embed|tr)\b|[?&](?:u|url|text)=|\/shareArticle/i;

function platformOf(href: string): string | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  const platform = PLATFORMS.find(([, pattern]) => pattern.test(host));
  if (!platform) return null;
  if (NOT_A_PROFILE.test(url.pathname + url.search)) return null;
  // Google: only map/business/review links, never the search engine itself.
  if (platform[0] === "Google Bedrijfsprofiel" && /google\./.test(host) && !/^\/maps\b|\/search\?.*(?:kgmid|ludocid)|\/business\b/i.test(url.pathname + url.search)) return null;
  // A bare platform homepage is not a profile.
  if (url.pathname.replace(/\/+$/, "") === "") return null;
  return platform[0];
}

export function detectSocialProfiles(html: string, sameAs: string[] = []): string[] {
  const found = new Set<string>();
  for (const match of html.slice(0, 5_000_000).matchAll(/<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    const platform = platformOf(match[1].replace(/&amp;/g, "&"));
    if (platform) found.add(platform);
  }
  for (const value of sameAs) {
    const platform = platformOf(value);
    if (platform) found.add(platform);
  }
  return [...found];
}
