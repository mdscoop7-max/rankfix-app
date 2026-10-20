// Distinguishes "the site's sitemap is broken" from "our crawler was not allowed
// to read it". Only the first is a site defect; the second is unconfirmed evidence.
// We never retry with a disguised user agent to get around a block.

export type SitemapResponseKind =
  | "valid"            // parsed elsewhere; never produced here
  | "missing"          // 404/410: the URL does not exist
  | "crawler_blocked"  // 401/403/429, or a bot-challenge/HTML interstitial
  | "server_error"     // 5xx or other transient failure
  | "invalid";         // readable, but not a sitemap

const CHALLENGE_MARKERS = /(?:cf-chl|cloudflare|attention required|just a moment|captcha|access denied|request blocked|akamai|incapsula|perimeterx|datadome|bot (?:detection|protection)|verify you are (?:a )?human|enable javascript and cookies)/i;

export function classifySitemapResponse(input: { status: number; contentType: string; body?: string }): Exclude<SitemapResponseKind, "valid"> {
  const { status } = input;
  if (status === 404 || status === 410) return "missing";
  if (status === 401 || status === 403 || status === 429 || status === 451) return "crawler_blocked";
  if (status >= 500 || status === 408 || status === 425) return "server_error";
  const isHtml = /html/i.test(input.contentType || "");
  if (status >= 200 && status < 300 && isHtml && input.body && CHALLENGE_MARKERS.test(input.body.slice(0, 20_000))) return "crawler_blocked";
  if (status >= 300) return "server_error"; // unresolved redirect loop and similar
  return "invalid";
}

export function describeSitemapBlock(url: string, input: { status: number; contentType: string; userAgent: string }): string {
  return `${url} gaf HTTP ${input.status} (content-type: ${input.contentType || "onbekend"}) aan user-agent ${input.userAgent}. Dit wijst op een crawlerblokkade of tijdelijke serverreactie, niet op een bewezen kapotte sitemap; de sitemap kan voor zoekmachines wel bereikbaar zijn.`;
}
