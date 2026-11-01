import { crawlUrl, crawlExclusion, crawlLinks, sitemapEntries, robotsAllows, sameCrawlSite } from "./crawl-discovery.ts";
import { classifyNonContentPage } from "./page-gate.ts";
import { hasExecutableScripts } from "./structured-data-evidence.ts";
import { URL } from "node:url";
import { extractImageMetrics } from "@/lib/image-metrics";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { offerPrice } from "@/lib/price";
import { schemaTypesOf } from "@/lib/schema-type";
import { readResponseTextLimited, safePublicFetch, validatePublicHttpUrl } from "@/lib/safe-fetch";

export const CRAWLER_ENGINE_VERSION = "2.7.1";

export type CrawlMode = "QUICK" | "STANDARD" | "DEEP" | "ECOMMERCE" | "ENTERPRISE";
export type PageType =
  | "homepage" | "service" | "local_business" | "city_landing" | "national_landing"
  | "category" | "product_category" | "product" | "blog_article" | "news" | "faq"
  | "contact" | "about" | "search" | "filter" | "cart" | "checkout" | "account" | "generic";

export type CrawlPage = {
  url: string;
  status: number;
  requestedUrl: string;
  redirectChain: Array<{ from: string; to: string; status: number }>;
  contentType: string;
  responseTimeMs: number;
  title: string;
  description: string;
  h1: string[];
  canonical: string | null;
  lang: string | null;
  noindex: boolean;
  xRobotsTag: string | null;
  security: {
    https: boolean;
    strictTransportSecurity: boolean;
    contentSecurityPolicy: boolean;
    xContentTypeOptions: boolean;
    frameProtection: boolean;
    referrerPolicy: boolean;
    permissionsPolicy: boolean;
    insecureForms: number;
    mixedContentReferences: number;
    serverHeaderExposed: boolean;
    poweredByHeaderExposed: boolean;
  };
  jsonLdInvalid: number;
  product?: { name: boolean; image: boolean; offers: boolean; price: boolean; priceCurrency: boolean; availability: boolean; brandOrSku: boolean };
  wordCount: number;
  internalLinks: string[];
  imageCount: number;
  imagesMissingAlt: number;
  accessibility: {
    unlabeledControls: number;
    emptyButtons: number;
    emptyLinks: number;
    iframesMissingTitle: number;
    duplicateIds: number;
    hasMainLandmark: boolean;
    headingLevelSkips: number;
  };
  jsonLdTypes: string[];
  structuredDataAbsentProven?: boolean;
  evidenceSource?: "raw_html" | "rendered_html";
  localBusiness?: { types: string[]; name: boolean; address: boolean; telephone: boolean; url: boolean; openingHours: boolean; imageOrLogo: boolean; sameAs: boolean };
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
  queued: number;
  truncated: boolean;
  blocked: number;
  errors: Array<{ url: string; code: string; message: string }>;
  startedAt: string;
  finishedAt: string;
  engineVersion: string;
  coverage: CrawlCoverage;
  checkpoint: CrawlCheckpoint;
};
export type CrawlEntry = { url: string; depth: number; from: string | null; status: "pending" | "audited" | "excluded" | "unconfirmed" | "not_found" | "duplicate"; reason?: string; finalUrl?: string; httpStatus?: number };
export type CrawlCheckpoint = {
  version: 1; engineVersion: string; startUrl: string; mode: CrawlMode; startedAt: string; finalUrl: string;
  entries: CrawlEntry[]; queue: string[]; pages: CrawlPage[]; errors: CrawlResult["errors"];
  robots: { status: "pending" | "known" | "unconfirmed"; text: string };
  sitemaps: { pending: string[]; visited: string[] }; discoveryLimited: boolean;
  discoveryErrors: { url: string; reason: string }[]; attempts: number; requests: number; renders: number;
};
export type CrawlCoverage = {
  mode: "bounded_inventory"; scope: "discovered_inventory" | "partial_inventory";
  discovered: number; discoveredIsLowerBound: boolean; checked: number; excluded: number; notConfirmed: number; notFound: number; duplicates: number; pending: number;
  pageLimit: number; complete: boolean; fullWebsiteConfirmed: false; canResume: boolean;
  stopReason: "inventory_exhausted" | "page_limit" | "batch_limit" | "request_limit" | "time_limit" | "robots_unconfirmed";
  requestsThisBatch: number; requestsTotal: number; rendersTotal: number;
  discoveryErrors: { url: string; reason: string }[];
};
export type CrawlOptions = {
  checkpoint?: CrawlCheckpoint; maxPages?: number; batchPages?: number; maxRequests?: number; maxDurationMs?: number;
  discoverSitemaps?: boolean; renderJavaScript?: boolean;
};

const LIMITS: Record<CrawlMode, number> = {
  QUICK: 5,
  STANDARD: 25,
  DEEP: 100,
  ECOMMERCE: 150,
  ENTERPRISE: 500,
};

function decode(v: string) {
  return decodeHtmlEntities(v).trim();
}
function stripHtml(v: string) {
  return v.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}
function first(v:string,re:RegExp){const m=v.match(re);return m?.[1]?decode(m[1]):"";}
function attr(tag:string,name:string){return tag.match(new RegExp(name+"\\s*=\\s*[\"']([^\"']*)[\"']","i"))?.[1]||"";}
function validate(url:string){ return validatePublicHttpUrl(url); }

function classify(url:string,html:string,jsonTypes:string[]):PageType{
  const p=new URL(url).pathname.toLowerCase();
  const text=stripHtml(html).toLowerCase();
  if(p==="/"||p===""||/^\/(?:nl|en|de|fr|es|it)(?:[-_](?:nl|be|gb|us|de|fr|es|it))?\/?$/.test(p))return "homepage";
  if(/\/(cart|winkelwagen)\b/.test(p))return "cart";
  if(/\/(checkout|afrekenen)\b/.test(p))return "checkout";
  if(/\/(account|mijn-account|login|inloggen)\b/.test(p))return "account";
  if(/\/(search|zoeken)\b/.test(p)||/[?&](q|query|search)=/.test(new URL(url).search))return "search";
  if(/\/(filter|filters)\b/.test(p))return "filter";
  const types=jsonTypes.map(x=>x.toLowerCase());
  const hasLocalBusinessType = types.some(t => ["localbusiness","restaurant","bakery","barorcafe","beautysalon","dayspa","dentist","electrician","generalcontractor","homeandconstructionbusiness","locksmith","medicalclinic","plumber","roofingcontractor","store","hairdresser","automotivebusiness","realestateagent","legalservice","accountingservice","travelagency","hotel"].includes(t));
  // Opening hours and address are frequently repeated in sitewide footers.
  // Only explicit structured business identity classifies a page as local_business.
  if(hasLocalBusinessType)return "local_business";
  if(types.includes("product"))return "product";
  if(types.includes("article")||types.includes("newsarticle")||/\/(blog|nieuws|news|artikel)\b/.test(p))return /news|nieuws/.test(p)?"news":"blog_article";
  // Sitewide navigation often contains FAQ and Contact links. Do not let
  // these boilerplate words reclassify unrelated pages.
  if(types.includes("faqpage")||/\/(faq|veelgestelde-vragen|frequently-asked-questions)(?:\/|$)/.test(p))return "faq";
  if(/\/(contact|contacteer-ons)(?:\/|$)/.test(p))return "contact";
  if(/\/(about|over-ons|over-ons)\b/.test(p))return "about";
  // Industrial manufacturers may publish /products/ without selling online.
  // A product path alone is not evidence of an ecommerce category.
  const commerceSignals = /(?:add to cart|add to basket|in winkelwagen|toevoegen aan winkelwagen|ajouter au panier|in den warenkorb|añadir al carrito|aggiungi al carrello|checkout|afrekenen)/i.test(text) || /(?:itemprop=["']price["']|"@type"\s*:\s*"Offer"|["']priceCurrency["'])/i.test(html);
  // Generic ItemList and /category/ are also used by blogs and industrial catalogs.
  if(/\/(collections|collection|shop)\b/.test(p)||(commerceSignals&&(types.includes("itemlist")||/\/(category|categorie|categories|producten|products)\b/.test(p))))return "product_category";
  if(/\/(diensten|services|service)\b/.test(p))return "service";
  if(/\/(stad|city|locatie|locations|regio)\b/.test(p))return "city_landing";
  if(/\/(nl|en|de|fr|es)\//.test(p))return "national_landing";
  return "generic";
}
function normalize(raw:string,base:URL){ return crawlUrl(raw,base); }

export async function crawlSite(startUrl:string,requestedMode:CrawlMode="STANDARD", options: CrawlOptions = {}):Promise<CrawlResult>{
  const start=validate(/^https?:\/\//i.test(startUrl)?startUrl:`https://${startUrl}`);
  if (start.href.length>2048) throw new Error("CRAWL_URL_TOO_LONG");
  const mode = Object.hasOwn(LIMITS, requestedMode) ? requestedMode : "STANDARD";
  const bounded = (v: number | undefined, fallback: number, max: number) => Number.isFinite(v) ? Math.max(1,Math.min(max,Math.floor(v!))) : fallback;
  const limit=bounded(options.maxPages,LIMITS[mode],LIMITS[mode]);
  const discoverSitemaps=options.discoverSitemaps ?? mode!=="QUICK";
  const batchLimit=bounded(options.batchPages,Math.min(25,limit),30);
  const requestLimit=bounded(options.maxRequests,120,300);
  const duration=bounded(options.maxDurationMs,30_000,120_000), deadline=Date.now()+duration;
  if (options.checkpoint && (options.checkpoint.version !== 1 || options.checkpoint.engineVersion !== CRAWLER_ENGINE_VERSION || options.checkpoint.startUrl !== start.href || options.checkpoint.mode !== mode || options.checkpoint.entries.length > 5000 || options.checkpoint.pages.length > LIMITS[mode])) throw new Error("CRAWL_CHECKPOINT_MISMATCH");
  const state: CrawlCheckpoint = options.checkpoint ? structuredClone(options.checkpoint) : {
    version:1,engineVersion:CRAWLER_ENGINE_VERSION,startUrl:start.href,mode,startedAt:new Date().toISOString(),finalUrl:start.href,
    entries:[],queue:[],pages:[],errors:[],robots:{status:"pending",text:""},sitemaps:{pending:[],visited:[]},discoveryLimited:false,discoveryErrors:[],attempts:0,requests:0,renders:0,
  };
  const pages=state.pages, errors=state.errors;
  const entries=new Map(state.entries.map(e=>[e.url,e]));
  const remember = (raw:string,base:URL,depth:number,from:string|null) => {
    if(raw.length>4096) {state.discoveryLimited=true;return;}
    const url=normalize(raw,base); if(!url || entries.has(url)) return;
    if(entries.size>=5000) { state.discoveryLimited=true; return; }
    const reason=crawlExclusion(url);
    const item: CrawlEntry={url,depth,from,status:reason?"excluded":"pending",...(reason?{reason}:{})};
    entries.set(url,item); state.entries.push(item); if(!reason) state.queue.push(url);
  };
  if(!state.entries.length) remember(start.href,start,0,null);
  let batchRequests=0,batchAttempts=0,batchRenders=0;
  let stopReason: CrawlCoverage["stopReason"]="inventory_exhausted";
  const remaining=()=>Math.max(1,deadline-Date.now());
  const request = (url:URL) => {
    if(!sameCrawlSite(url,start)) throw new Error("CRAWL_EXTERNAL_REDIRECT");
    if(Date.now()>=deadline) throw new Error("CRAWL_TIME_LIMIT");
    if(batchRequests>=requestLimit) throw new Error("CRAWL_REQUEST_LIMIT");
    batchRequests++;state.requests++;
  };
  const fetchPage=(url:string)=>safePublicFetch(url,{timeoutMs:Math.min(8000,remaining()),maxRedirects:4,signal:AbortSignal.timeout(remaining()),onRequest:request,userAgent:"RankFixBot/2.1 (+https://rankfix-app.onrender.com)",accept:"text/html,application/xhtml+xml,application/xml,text/xml,text/plain"});
  const metaError=(url:string,error:unknown)=>{ const reason=error instanceof Error?error.message:"DISCOVERY_FAILED"; if(state.discoveryErrors.length<50)state.discoveryErrors.push({url,reason}); };
  if(state.robots.status!=="known") {
    const url=new URL("/robots.txt",state.finalUrl).href;
    try {
      const {response}=await fetchPage(url);
      if(response.status===404 || response.status===410) state.robots={status:"known",text:""};
      else if(response.ok) {
        const text=await readResponseTextLimited(response,256_000,remaining());
        if(/<html\b/i.test(text)) throw new Error("ROBOTS_NOT_TEXT");
        state.robots={status:"known",text};
      } else throw new Error("ROBOTS_HTTP_"+response.status);
      if(discoverSitemaps) state.sitemaps.pending=[...new Set([
        ...state.robots.text.split(/\r?\n/).flatMap(line=>{const m=line.match(/^\s*sitemap\s*:\s*(\S+)/i);const u=m?normalize(m[1],start):null;return u?[u]:[];}),new URL("/sitemap.xml",start).href,
      ])];
    } catch(error) { state.robots.status="unconfirmed";metaError(url,error);stopReason="robots_unconfirmed"; }
  }
  if(state.robots.status==="known" && discoverSitemaps) {
    while(state.sitemaps.pending.length && state.sitemaps.visited.length<20 && Date.now()<deadline && batchRequests<requestLimit) {
      const url=state.sitemaps.pending[0];
      if(!robotsAllows(state.robots.text,new URL(url))) {state.sitemaps.pending.shift();state.sitemaps.visited.push(url);metaError(url,new Error("SITEMAP_ROBOTS_EXCLUDED"));continue;}
      try {
        const {response,finalUrl:resolved}=await fetchPage(url);
        if(response.status===404||response.status===410) { state.sitemaps.pending.shift();state.sitemaps.visited.push(url);continue; }
        if(!response.ok) throw new Error("SITEMAP_HTTP_"+response.status);
        const compressed=/\.gz$/i.test(new URL(url).pathname) && !/gzip/i.test(response.headers.get("content-encoding")||"");
        const readable=compressed && response.body ? new Response(response.body.pipeThrough(new DecompressionStream("gzip"))) : response;
        const xml=await readResponseTextLimited(readable,2_000_000,remaining());
        const found=sitemapEntries(xml,resolved);
        state.sitemaps.pending.shift();state.sitemaps.visited.push(url);
        if(found.index) for(const child of found.urls) {if(!state.sitemaps.visited.includes(child)&&!state.sitemaps.pending.includes(child))state.sitemaps.pending.push(child);}
        else for(const page of found.urls) remember(page,start,1,url);
      } catch(error) {
        if(/CRAWL_(?:REQUEST|TIME)_LIMIT/.test(String((error as Error)?.message))) break;
        state.sitemaps.pending.shift();state.sitemaps.visited.push(url);metaError(url,error);
      }
    }
    if(state.sitemaps.visited.length>=20 && state.sitemaps.pending.length) {state.discoveryLimited=true;state.sitemaps.pending=[];}
  }
  while(state.robots.status==="known" && state.queue.length && state.attempts<limit && batchAttempts<batchLimit && batchRequests<requestLimit && Date.now()<deadline){
    const key=state.queue.shift()!, item=entries.get(key)!;
    if(!robotsAllows(state.robots.text,new URL(item.url))) {item.status="excluded";item.reason="robots_disallow";continue;}
    try{
      const started=Date.now();
      state.attempts++;batchAttempts++;
      const {response,finalUrl:resolved,redirectChain}=await fetchPage(item.url);
      item.httpStatus=response.status;item.finalUrl=resolved.href;
      if(state.attempts===1) state.finalUrl=resolved.href;
      const contentType=response.headers.get("content-type")||"";
      if(response.status===404||response.status===410) {item.status="not_found";item.reason="http_not_found";continue;}
      if(!response.ok) {item.status="unconfirmed";item.reason="http_"+response.status;continue;}
      if(!contentType.includes("text/html")&&!contentType.includes("application/xhtml+xml")) {item.status="excluded";item.reason="non_html_response";continue;}
      let evidenceSource: "raw_html" | "rendered_html" = "raw_html";
      let html=await readResponseTextLimited(response,2_000_000,remaining());
      const gate=classifyNonContentPage({title:first(html,/<title[^>]*>([\s\S]*?)<\/title>/i),text:stripHtml(html),html});
      if(gate) {item.status="unconfirmed";item.reason="non_content_"+gate.kind;continue;}
      if(pages.some(p=>p.url===resolved.href)) {item.status="duplicate";item.reason="redirect_duplicate";continue;}
      const sourceHasExecutableScripts=hasExecutableScripts(html);
      const needsNavigationRender=crawlLinks(html,resolved).length<3 && sourceHasExecutableScripts;
      if(needsNavigationRender) {
        if(options.renderJavaScript!==false && batchRenders<2 && requestLimit-batchRequests>=90 && remaining()>4000) {
          // Reserve the default renderer's entire 90-request budget before launch.
          batchRequests+=90;state.requests+=90;batchRenders++;state.renders++;
          try {
            const {renderPublicPage,createRenderBudget}=await import("./headless-render.ts");
            const rendered=await renderPublicPage(resolved.href,Math.min(12000,remaining()),createRenderBudget(1,remaining()));
            if(!sameCrawlSite(new URL(rendered.finalUrl),resolved) || rendered.finalUrl!==resolved.href || rendered.partialNavigation || classifyNonContentPage({html:rendered.html,text:stripHtml(rendered.html)})) throw new Error("NAVIGATION_RENDER_UNCONFIRMED");
            html=rendered.html;evidenceSource="rendered_html";
          } catch(error) {metaError(item.url,error);}
        } else metaError(item.url,new Error("JAVASCRIPT_NAVIGATION_UNOBSERVED"));
      }
      const title=first(html,/<title[^>]*>([\s\S]*?)<\/title>/i);
      const description=first(html,/<meta[^>]+(?:name|property)\s*=\s*["']description["'][^>]+content\s*=\s*["']([\s\S]*?)["'][^>]*>/i)||first(html,/<meta[^>]+content\s*=\s*["']([\s\S]*?)["'][^>]+(?:name|property)\s*=\s*["']description["'][^>]*>/i);
      const h1=[...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>stripHtml(m[1])).filter(Boolean);
      const canonical=first(html,/<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i)||first(html,/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']canonical["']/i)||null;
      const lang=first(html,/<html[^>]+lang\s*=\s*["']([^"']+)["']/i)||null;
      const robots=first(html,/<meta[^>]+name\s*=\s*["']robots["'][^>]+content\s*=\s*["']([^"']+)["']/i);
      const xRobotsTag=response.headers.get("x-robots-tag");
      const security={
        https:resolved.protocol==="https:",
        strictTransportSecurity:Boolean(response.headers.get("strict-transport-security")),
        contentSecurityPolicy:Boolean(response.headers.get("content-security-policy")),
        xContentTypeOptions:/nosniff/i.test(response.headers.get("x-content-type-options")||""),
        frameProtection:Boolean(response.headers.get("x-frame-options")) || /frame-ancestors/i.test(response.headers.get("content-security-policy")||""),
        referrerPolicy:Boolean(response.headers.get("referrer-policy")),
        permissionsPolicy:Boolean(response.headers.get("permissions-policy")),
        insecureForms:[...html.matchAll(/<form\b[^>]*action\s*=\s*["'](http:\/\/[^"']+)["'][^>]*>/gi)].length,
        mixedContentReferences:resolved.protocol==="https:" ? [...html.matchAll(/<(?:img|script|iframe|link|source|video|audio)\b[^>]*(?:src|href)\s*=\s*["']http:\/\/[^"']+["'][^>]*>/gi)].length : 0,
        serverHeaderExposed:Boolean(response.headers.get("server")),
        poweredByHeaderExposed:Boolean(response.headers.get("x-powered-by")),
      };
      const noindex=/\bnoindex\b/i.test([robots,xRobotsTag||""].join(","));
      const imageMetrics=extractImageMetrics(html);
      const ids=[...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]).filter(Boolean);
      const duplicateIds=ids.length-new Set(ids).size;
      const labels=new Set([...html.matchAll(/<label\b[^>]*for\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]));
      const controls=[...html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)].map(m=>m[0]).filter(tag=>!/\btype\s*=\s*["'](?:hidden|submit|button|reset|image)["']/i.test(tag));
      const unlabeledControls=controls.filter(tag=>{const id=attr(tag,"id");return !/\baria-label\s*=\s*["'][^"']+["']/i.test(tag)&&!/\baria-labelledby\s*=\s*["'][^"']+["']/i.test(tag)&&!/\btitle\s*=\s*["'][^"']+["']/i.test(tag)&&!(id&&labels.has(id));}).length;
      const emptyButtons=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].filter(m=>!stripHtml(m[2])&&!/\baria-label\s*=\s*["'][^"']+["']/i.test(m[1])&&!/\baria-labelledby\s*=\s*["'][^"']+["']/i.test(m[1])&&!/\btitle\s*=\s*["'][^"']+["']/i.test(m[1])).length;
      const emptyLinks=[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m=>!stripHtml(m[2])&&!/<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(m[2])&&!/\baria-label\s*=\s*["'][^"']+["']/i.test(m[1])&&!/\baria-labelledby\s*=\s*["'][^"']+["']/i.test(m[1])&&!/\btitle\s*=\s*["'][^"']+["']/i.test(m[1])).length;
      const iframesMissingTitle=[...html.matchAll(/<iframe\b[^>]*>/gi)].filter(m=>!/\btitle\s*=\s*["'][^"']+["']/i.test(m[0])&&!/\baria-label\s*=\s*["'][^"']+["']/i.test(m[0])&&!/\baria-labelledby\s*=\s*["'][^"']+["']/i.test(m[0])).length;
      const hasMainLandmark=/<main\b/i.test(html)||/<[^>]+\brole\s*=\s*["']main["']/i.test(html);
      const headingLevels=[...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map(m=>Number(m[1]));
      let headingLevelSkips=0; for(let i=1;i<headingLevels.length;i++) if(headingLevels[i]>headingLevels[i-1]+1) headingLevelSkips++;
      const accessibility={unlabeledControls,emptyButtons,emptyLinks,iframesMissingTitle,duplicateIds,hasMainLandmark,headingLevelSkips};
      const links=crawlLinks(html,resolved);
      if(links.length>200) state.discoveryLimited=true;
      const uniqueLinks=links.slice(0,200);
      const blocks=[...html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*(?:(["'])application\/ld\+json\1|application\/ld\+json(?:\s|>|\/)))[^>]*>([\s\S]*?)<\/script>/gi)];
      const types:string[]=[]; let jsonLdInvalid=0;
      const product={name:false,image:false,offers:false,price:false,priceCurrency:false,availability:false,brandOrSku:false};
      const localBusiness = {types:[] as string[],name:false,address:false,telephone:false,url:false,openingHours:false,imageOrLogo:false,sameAs:false};
      const localTypes = new Set(["localbusiness","restaurant","bakery","barorcafe","beautysalon","dayspa","dentist","electrician","generalcontractor","homeandconstructionbusiness","locksmith","medicalclinic","plumber","roofingcontractor","store","hairdresser","automotivebusiness","realestateagent","legalservice","accountingservice","travelagency","hotel"]);
      for(const b of blocks){try{const parsed=JSON.parse(b[2]);const rawItems=Array.isArray(parsed)?parsed:(parsed?.["@graph"]||[parsed]);const items=Array.isArray(rawItems)?rawItems:[rawItems];for(const x of items){const ts=schemaTypesOf(x);types.push(...ts);const isProduct=ts.some(v=>v.toLowerCase()==="product");if(isProduct){product.name ||= Boolean(x?.name);product.image ||= Boolean(x?.image);product.offers ||= Boolean(x?.offers);const offers=Array.isArray(x?.offers)?x.offers:[x?.offers].filter(Boolean);for(const o of offers){product.price ||= offerPrice(o).price !== null;product.priceCurrency ||= Boolean(offerPrice(o).currency);product.availability ||= Boolean(o?.availability);}product.brandOrSku ||= Boolean(x?.brand || x?.sku || x?.gtin || x?.gtin13 || x?.mpn);}const isLocal=ts.some(v=>localTypes.has(v.toLowerCase()));if(isLocal){localBusiness.types.push(...ts.filter(v=>localTypes.has(v.toLowerCase())));localBusiness.name ||= Boolean(x?.name);localBusiness.address ||= Boolean(x?.address);localBusiness.telephone ||= Boolean(x?.telephone);localBusiness.url ||= Boolean(x?.url);localBusiness.openingHours ||= Boolean(x?.openingHours || x?.openingHoursSpecification);localBusiness.imageOrLogo ||= Boolean(x?.image || x?.logo);localBusiness.sameAs ||= Array.isArray(x?.sameAs) ? x.sameAs.length>0 : Boolean(x?.sameAs);}}}catch{jsonLdInvalid++}}
      const text=stripHtml(html);
      let canonicalUrl:string|null=null;
      if(canonical){
        try{ canonicalUrl=new URL(canonical,resolved).toString(); }
        catch{ errors.push({url:resolved.toString(),code:"CANONICAL_INVALID",message:"Malformed canonical URL in HTML."}); }
      }
      pages.push({url:resolved.toString(),status:response.status,requestedUrl:item.url,redirectChain,contentType,responseTimeMs:Date.now()-started,title,description,h1,canonical:canonicalUrl,lang,noindex,xRobotsTag,security,jsonLdInvalid,product:types.some(t=>t.toLowerCase()==="product")?product:undefined,wordCount:text.split(/\s+/).filter(Boolean).length,internalLinks:uniqueLinks,imageCount:imageMetrics.uniqueImageReferences,imagesMissingAlt:imageMetrics.missingAlt,accessibility,jsonLdTypes:[...new Set(types)],structuredDataAbsentProven:!sourceHasExecutableScripts && !hasExecutableScripts(html),evidenceSource,localBusiness:localBusiness.types.length ? {...localBusiness,types:[...new Set(localBusiness.types)]} : undefined,pageType:classify(resolved.toString(),html,types),depth:item.depth,discoveredFrom:item.from});
      item.status="audited";
      for(const next of uniqueLinks) remember(next,resolved,item.depth+1,item.url);
    } catch(error) {
      const message=error instanceof Error?error.message:"Unknown crawl error";
      if(/^CRAWL_(?:REQUEST|TIME)_LIMIT$/.test(message)) {item.status="pending";state.queue.unshift(item.url);state.attempts--;batchAttempts--;break;}
      item.status="unconfirmed";item.reason=message.slice(0,100);errors.push({url:item.url,code:/^URL_/.test(message)?"URL_BLOCKED":"FETCH_FAILED",message});
    }
  }
  const count=(status:CrawlEntry["status"])=>state.entries.filter(e=>e.status===status).length;
  const pending=count("pending"), notConfirmed=count("unconfirmed");
  if(state.robots.status!=="known") stopReason="robots_unconfirmed";
  else if(pending && state.attempts>=limit) stopReason="page_limit";
  else if((pending||state.sitemaps.pending.length) && Date.now()>=deadline) stopReason="time_limit";
  else if((pending||state.sitemaps.pending.length) && batchRequests>=requestLimit) stopReason="request_limit";
  else if(pending) stopReason="batch_limit";
  const complete=!pending && !notConfirmed && !state.discoveryLimited && !state.discoveryErrors.length && !state.sitemaps.pending.length && state.robots.status==="known";
  const coverage:CrawlCoverage={mode:"bounded_inventory",scope:complete?"discovered_inventory":"partial_inventory",discovered:entries.size,discoveredIsLowerBound:state.discoveryLimited,checked:count("audited"),excluded:count("excluded"),notConfirmed,notFound:count("not_found"),duplicates:count("duplicate"),pending,pageLimit:limit,complete,fullWebsiteConfirmed:false,canResume:(pending>0||state.sitemaps.pending.length>0) && state.attempts<limit,stopReason,requestsThisBatch:batchRequests,requestsTotal:state.requests,rendersTotal:state.renders,discoveryErrors:state.discoveryErrors};
  return {startUrl:start.href,finalUrl:state.finalUrl,mode,pages,discovered:entries.size,queued:state.queue.length,truncated:!complete,blocked:state.entries.filter(e=>/blocked|disallow|http_(?:401|403|429)/.test(e.reason||"")).length,errors,startedAt:state.startedAt,finishedAt:new Date().toISOString(),engineVersion:CRAWLER_ENGINE_VERSION,coverage,checkpoint:state};
}
