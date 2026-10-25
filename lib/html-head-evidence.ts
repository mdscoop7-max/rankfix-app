/**
 * Source-order independent metadata extraction from the HTML actually fetched.
 * Only tags in <head> count; a body template or example snippet is not proof.
 * Does not execute JS or infer metadata from a different URL.
 */
export type HeadMetadata = {
  description:string;
  descriptionState:"missing"|"empty"|"present";
  canonical:string;
  viewport:string;
  robots:string;
  lang:string;
  evidence:{description:boolean;canonical:boolean;viewport:boolean;robots:boolean;lang:boolean};
};

export function htmlAttribute(tag:string, name:string):string {
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+)))?/g;
  const wanted = name.toLowerCase();
  for (const match of tag.slice(tag.indexOf(" ")+1).matchAll(pattern)) {
    if (match[1].toLowerCase() === wanted) return (match[2] ?? match[3] ?? match[4] ?? "").trim();
  }
  return "";
}

export function extractHeadMetadata(html:string):HeadMetadata {
  const match = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
  // If the source has an unclosed head, limit evidence to the material before body.
  const head = match ? match[1] : html.match(/<head\b[^>]*>([\s\S]*?)(?:<body\b|$)/i)?.[1] || "";
  const metaTags = [...head.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]);
  const descTag = metaTags.find(tag=>["name","property"].some(key=>htmlAttribute(tag,key).toLowerCase()==="description"));
  const description = descTag ? htmlAttribute(descTag,"content") : "";
  const canonicalTag = links.find(tag=>htmlAttribute(tag,"rel").toLowerCase().split(/\s+/).includes("canonical"));
  const findMeta=(name:string)=>metaTags.find(tag=>htmlAttribute(tag,"name").toLowerCase()===name);
  const viewportTag=findMeta("viewport");
  const robotsTag=findMeta("robots");
  const htmlTag=html.match(/<html\b[^>]*>/i)?.[0]||"";
  const lang=htmlAttribute(htmlTag,"lang");
  return {
    description,
    descriptionState:!descTag?"missing":description?"present":"empty",
    canonical:canonicalTag?htmlAttribute(canonicalTag,"href"):"",
    viewport:viewportTag?htmlAttribute(viewportTag,"content"):"",
    robots:robotsTag?htmlAttribute(robotsTag,"content"):"",
    lang,
    evidence:{description:Boolean(descTag),canonical:Boolean(canonicalTag),viewport:Boolean(viewportTag),robots:Boolean(robotsTag),lang:Boolean(lang)},
  };
}
