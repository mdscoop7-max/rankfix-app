import { classifyNonContentPage } from "./page-gate.ts";
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

/** Same-site navigation links in a document (relative or on the given host). */
export function internalLinkCount(html: string, hostname: string): number {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  let n = 0;
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    const href = m[1].trim();
    if (/^(?:mailto:|tel:|javascript:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) { try { if (new URL(href).hostname.toLowerCase().replace(/^www\./, "") === host) n++; } catch {} continue; }
    if (href.startsWith("//")) continue;
    n++;
  }
  return n;
}
/** After a refused request the browser page must also look like the website. */
export const MIN_REFUSAL_RECOVERY_WORDS = 150;
export const MIN_REFUSAL_RECOVERY_LINKS = 3;

/**
 * options.afterRefusal: the site refused RankFix (403/405/202/timeout). Then a
 * short page without own navigation is not proof the browser got the website:
 * an error template ("Sorry, er gaat iets niet goed…": 41 words, 0 internal
 * links, QA 144) must not be scored as the homepage.
 */
export function isSubstantiveRender(html: string | null | undefined, options: { afterRefusal?: boolean; hostname?: string } = {}): boolean {
  if (!html) return false;
  const words = visibleWordCount(html);
  if (words < MIN_RECOVERED_WORDS) return false;
  if (options.afterRefusal && words < MIN_REFUSAL_RECOVERY_WORDS && internalLinkCount(html, options.hostname || "") < MIN_REFUSAL_RECOVERY_LINKS) return false;
  // A recovered render that is itself a block, error or maintenance page is not
  // the website (QA #186: "AntiBot" and "connection was interrupted" were scored).
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 12000);
  return !classifyNonContentPage({ title, text, words, html });
}

// A render replaces the raw HTML only when the raw HTML was a thin client shell or
// the render keeps at least half of the raw visible content.
export function renderImprovesEvidence(rawWords: number, rawThinShell: boolean, renderedHtml: string): boolean {
  const renderedWords = visibleWordCount(renderedHtml);
  if (rawThinShell) return renderedWords >= Math.min(MIN_RECOVERED_WORDS, rawWords + 1);
  return renderedWords >= rawWords * 0.5;
}


// Rehydration must not erase positive evidence that the server already sent.
// Add a raw-head tag only when the hydrated head has no equivalent. Client-
// added title, description, canonical, OG or structured data remains intact.
export function preserveRawHeadEvidence(rawHtml:string, renderedHtml:string):string {
  const rawHead=rawHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  const renderedHead=renderedHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  if (!rawHead || renderedHead===undefined) return renderedHtml;
  const attribute=(tag:string,name:string)=>tag.match(new RegExp("\\b"+name+"\\s*=\\s*([\"'])(.*?)\\1","i"))?.[2]?.toLowerCase()||"";
  const evidenceTags=(head:string)=>[...head.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(x=>x[0]);
  const identity=(tag:string):string=>{
    const tagName=tag.match(/^<([a-z]+)/i)?.[1]?.toLowerCase()||"";
    if(tagName==="meta") {
      const name=attribute(tag,"name")||attribute(tag,"property");
      return /^(?:description|robots|googlebot|twitter:.+|og:.+)$/i.test(name)?"meta:"+name:"";
    }
    if(tagName==="link") return /\bcanonical\b/i.test(attribute(tag,"rel"))?"link:canonical":"";
    return "";
  };
  const existing=new Set(evidenceTags(renderedHead).map(identity).filter(Boolean));
  const append:string[]=[];
  if (!/<title\b[^>]*>[\s\S]*?\S[\s\S]*?<\/title>/i.test(renderedHead)) {
    const title=rawHead.match(/<title\b[^>]*>[\s\S]*?<\/title>/i)?.[0];
    if (title) append.push(title);
  }
  for (const tag of evidenceTags(rawHead)) {
    const key=identity(tag);
    if (key&&!existing.has(key)) {append.push(tag); existing.add(key);}
  }
  const rawSchemas=[...rawHead.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)].map(x=>x[0]);
  const renderedSchemas=new Set([...renderedHead.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)].map(x=>x[0].replace(/\s+/g,"")));
  for(const schema of rawSchemas) {
    if(!renderedSchemas.has(schema.replace(/\s+/g,""))) append.push(schema);
  }
  return append.length ? renderedHtml.replace(/<\/head>/i, append.join("\n")+"</head>") : renderedHtml;
}

export function renderIsErrorState(rawHtml:string,renderedHtml:string):boolean {
  const title=(html:string)=>html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()||"";
  const rawTitle=title(rawHtml), renderedTitle=title(renderedHtml);
  if (/^(?:error|fout|404|500|503|page not found|pagina niet gevonden|not found|niet gevonden|something went wrong)\b/i.test(renderedTitle)
      && !/^(?:error|fout|404|500|503|page not found|pagina niet gevonden|not found|niet gevonden|something went wrong)\b/i.test(rawTitle)) return true;
  const noindex=/<meta\b[^>]*(?:name\s*=\s*["'](?:robots|googlebot)["'][^>]*content\s*=\s*["'][^"']*noindex|content\s*=\s*["'][^"']*noindex[^>]*name\s*=\s*["'](?:robots|googlebot)["'])/i;
  return noindex.test(renderedHtml)&&!noindex.test(rawHtml);
}
