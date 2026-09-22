import { URL } from "node:url";
import { extractImageMetrics } from "@/lib/image-metrics";

export const CRAWLER_ENGINE_VERSION = "2.0.1";

export type CrawlMode = "QUICK" | "STANDARD" | "DEEP" | "ECOMMERCE" | "ENTERPRISE";
export type PageType =
  | "homepage" | "service" | "local_business" | "city_landing" | "national_landing"
  | "category" | "product_category" | "product" | "blog_article" | "news" | "faq"
  | "contact" | "about" | "search" | "filter" | "cart" | "checkout" | "account" | "generic";

export type CrawlPage = {
  url: string;
  status: number;
  contentType: string;
  responseTimeMs: number;
  title: string;
  description: string;
  h1: string[];
  canonical: string | null;
  lang: string | null;
  noindex: boolean;
  wordCount: number;
  internalLinks: string[];
  imageCount: number;
  imagesMissingAlt: number;
  jsonLdTypes: string[];
  pageType: PageType;
  depth: number;
  discoveredFrom: string | null;
};

export type CrawlResult = {
  startUrl: string;
  finalUrl: string;
  mode: CrawlMode;
  pages: CrawlPage[];
  discovered: number;
  blocked: number;
  errors: Array<{ url: string; code: string; message: string }>;
  startedAt: string;
  finishedAt: string;
  engineVersion: string;
};

const LIMITS: Record<CrawlMode, number> = {
  QUICK: 5,
  STANDARD: 25,
  DEEP: 100,
  ECOMMERCE: 150,
  ENTERPRISE: 500,
};

function decode(v: string) {
  return v.replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").trim();
}
function stripHtml(v: string) {
  return v.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}
function first(v:string,re:RegExp){const m=v.match(re);return m?.[1]?decode(m[1]):"";}
function attr(tag:string,name:string){return tag.match(new RegExp(name+"\\s*=\\s*[\"']([^\"']*)[\"']","i"))?.[1]||"";}
function privateHost(host:string){
  const h=host.toLowerCase().replace(/^\[|\]$/g,"");
  if(!h||h==="localhost"||h==="::1"||h==="0.0.0.0"||h==="169.254.169.254") return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)) return true;
  const m=h.match(/^172\.(\d+)\./); if(m&&+m[1]>=16&&+m[1]<=31)return true;
  if(/^(fc|fd)[0-9a-f]{2}:/i.test(h)||/^fe8[0-9a-f]:/i.test(h))return true;
  return false;
}
function validate(url:string){
  const u=new URL(url);
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password||privateHost(u.hostname)|| (u.port&&!["80","443"].includes(u.port))) throw new Error("URL_BLOCKED");
  return u;
}
async function fetchSafe(url:URL, timeoutMs=8000){
  let current=new URL(url.toString());
  for(let i=0;i<=4;i++){
    validate(current.toString());
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
    let r:Response;
    try{r=await fetch(current,{redirect:"manual",signal:c.signal,headers:{"User-Agent":"RankFixBot/2.0 (+https://rankfix.app)","Accept":"text/html,application/xhtml+xml,application/xml,text/xml"},cache:"no-store"});}
    finally{clearTimeout(t);}
    if(r.status>=300&&r.status<400&&r.headers.get("location")){current=new URL(r.headers.get("location")!,current);continue;}
    return {response:r,finalUrl:current};
  }
  throw new Error("REDIRECT_LIMIT");
}
function classify(url:string,html:string,jsonTypes:string[]):PageType{
  const p=new URL(url).pathname.toLowerCase();
  const text=stripHtml(html).toLowerCase();
  if(p==="/"||p==="")return "homepage";
  if(/\/(cart|winkelwagen)\b/.test(p))return "cart";
  if(/\/(checkout|afrekenen)\b/.test(p))return "checkout";
  if(/\/(account|mijn-account|login|inloggen)\b/.test(p))return "account";
  if(/\/(search|zoeken)\b/.test(p)||/[?&](q|query|search)=/.test(new URL(url).search))return "search";
  if(/\/(filter|filters)\b/.test(p))return "filter";
  const types=jsonTypes.map(x=>x.toLowerCase());
  const hasLocalBusinessType = types.some(t => ["localbusiness","restaurant","bakery","barorcafe","beautysalon","dayspa","dentist","electrician","generalcontractor","homeandconstructionbusiness","locksmith","medicalclinic","plumber","roofingcontractor","store","hairdresser","automotivebusiness"].includes(t));
  const localSignals = /\\b(openingstijden|opening hours|horaires|öffnungszeiten|orari|horario)\\b/i.test(text) && /(\\+?\\d[\\d\\s().-]{7,}|\\b(postcode|postcode|postal code|address|adres|straat|street|rue|straße|via)\\b)/i.test(text);
  if(hasLocalBusinessType || localSignals)return "local_business";
  if(types.includes("product"))return "product";
  if(types.includes("article")||types.includes("newsarticle")||/\/(blog|nieuws|news|artikel)\b/.test(p))return /news|nieuws/.test(p)?"news":"blog_article";
  if(types.includes("faqpage")||/\b(faq|veelgestelde vragen|frequently asked questions)\b/.test(text))return "faq";
  if(/\/(contact|contacteer-ons)\b/.test(p)||/\bcontact\b/.test(text))return "contact";
  if(/\/(about|over-ons|over-ons)\b/.test(p))return "about";
  if(types.includes("itemlist")||/\/(category|categorie|categories|collections|collection|shop|producten|products)\b/.test(p))return "product_category";
  if(/\/(diensten|services|service)\b/.test(p))return "service";
  if(/\/(stad|city|locatie|locations|regio)\b/.test(p))return "city_landing";
  if(/\/(nl|en|de|fr|es)\//.test(p))return "national_landing";
  return "generic";
}
function normalize(raw:string,base:URL){
  try{
    const u=new URL(raw,base);
    if(u.protocol!==base.protocol&&u.protocol!=="https:"&&u.protocol!=="http:")return null;
    if(u.hostname!==base.hostname)return null;
    u.hash="";
    u.username="";u.password="";
    if(u.pathname!=="/")u.pathname=u.pathname.replace(/\/+/g,"/").replace(/\/$/,"");
    const tracking=["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"];
    tracking.forEach(k=>u.searchParams.delete(k));
    return u.toString();
  }catch{return null}
}

export async function crawlSite(startUrl:string,requestedMode:CrawlMode="STANDARD"):Promise<CrawlResult>{
  const start=validate(/^https?:\/\//i.test(startUrl)?startUrl:`https://${startUrl}`);
  const startedAt=new Date().toISOString();
  const limit=LIMITS[requestedMode]??LIMITS.STANDARD;
  const queue:Array<{url:string,depth:number,from:string|null}>=[{url:start.toString(),depth:0,from:null}];
  const queued=new Set([start.toString()]);
  const pages:CrawlPage[]=[]; const errors:CrawlResult["errors"]=[]; let blocked=0;
  let finalUrl=start.toString();
  while(queue.length&&pages.length<limit){
    const item=queue.shift()!;
    try{
      const started=Date.now(); const {response,finalUrl:resolved}=await fetchSafe(new URL(item.url));
      finalUrl=pages.length===0?resolved.toString():finalUrl;
      const contentType=response.headers.get("content-type")||"";
      if(!contentType.includes("text/html")&&!contentType.includes("application/xhtml+xml"))continue;
      const html=await response.text();
      const title=first(html,/<title[^>]*>([\s\S]*?)<\/title>/i);
      const description=first(html,/<meta[^>]+(?:name|property)\s*=\s*["']description["'][^>]+content\s*=\s*["']([\s\S]*?)["'][^>]*>/i)||first(html,/<meta[^>]+content\s*=\s*["']([\s\S]*?)["'][^>]+(?:name|property)\s*=\s*["']description["'][^>]*>/i);
      const h1=[...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>stripHtml(m[1])).filter(Boolean);
      const canonical=first(html,/<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i)||first(html,/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']canonical["']/i)||null;
      const lang=first(html,/<html[^>]+lang\s*=\s*["']([^"']+)["']/i)||null;
      const robots=first(html,/<meta[^>]+name\s*=\s*["']robots["'][^>]+content\s*=\s*["']([^"']+)["']/i);
      const noindex=/\bnoindex\b/i.test(robots);
      const imageMetrics=extractImageMetrics(html);
      const links=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map(m=>normalize(m[1],resolved)).filter(Boolean) as string[];
      const uniqueLinks=[...new Set(links)];
      const blocks=[...html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      const types:string[]=[];
      for(const b of blocks){try{const parsed=JSON.parse(b[1]);const items=Array.isArray(parsed)?parsed:(parsed?.["@graph"]||[parsed]);for(const x of items){const t=x?.["@type"];if(t)types.push(...(Array.isArray(t)?t:[t]).map(String));}}catch{}}
      const text=stripHtml(html);
      pages.push({url:item.url,status:response.status,contentType,responseTimeMs:Date.now()-started,title,description,h1,canonical:canonical?new URL(canonical,resolved).toString():null,lang,noindex,wordCount:text.split(/\s+/).filter(Boolean).length,internalLinks:uniqueLinks,imageCount:imageMetrics.uniqueImageReferences,imagesMissingAlt:imageMetrics.missingAlt,jsonLdTypes:[...new Set(types)],pageType:classify(item.url,html,types),depth:item.depth,discoveredFrom:item.from});
      for(const next of uniqueLinks){if(!queued.has(next)&&queue.length+pages.length<limit){queued.add(next);queue.push({url:next,depth:item.depth+1,from:item.url});}}
    }catch(e){errors.push({url:item.url,code:e instanceof Error&&e.message==="URL_BLOCKED"?"URL_BLOCKED":"FETCH_FAILED",message:e instanceof Error?e.message:"Unknown crawl error"});}
  }
  return {startUrl:start.toString(),finalUrl,mode:requestedMode,pages,discovered:queued.size,blocked,errors,startedAt,finishedAt:new Date().toISOString(),engineVersion:CRAWLER_ENGINE_VERSION};
}
