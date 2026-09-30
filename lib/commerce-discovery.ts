export type CommercePageKind = "product" | "category" | "other";
export type CommercePageCandidate = { url:string; kind:CommercePageKind; score:number };

const PRODUCT_HINTS=/\/(?:products?|product|p|artikel|artikelen|produit|produits|produkt|produkte|prodotto|prodotti|producto|productos|item)\//i;
const CATEGORY_HINTS=/\/(?:collections?|categories?|category|categorie|categorieen|cat|shop|winkel|boutique|kategorie|categoria|categorias)\//i;
const IGNORE=/\/(?:cart|checkout|account|login|register|wishlist|search|privacy|cookies?|terms|contact)(?:\/|$)/i;

export function classifyCommerceUrl(value:string):CommercePageKind{
 try{
  const u=new URL(value);
  if(IGNORE.test(u.pathname)) return "other";
  if(PRODUCT_HINTS.test(u.pathname)) return "product";
  if(CATEGORY_HINTS.test(u.pathname)) return "category";
 }catch{}
 return "other";
}

export function discoverCommercePages(html:string,baseUrl:string,limit=24):CommercePageCandidate[]{
 let base:URL;try{base=new URL(baseUrl)}catch{return[]}
 const found=new Map<string,CommercePageCandidate>();
 for(const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>/gi)){
  try{
   const u=new URL(match[1],base);
   if(!/^https?:$/.test(u.protocol)||u.hostname!==base.hostname) continue;
   u.hash="";
   ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach(x=>u.searchParams.delete(x));
   const kind=classifyCommerceUrl(u.toString());
   if(kind==="other") continue;
   const score=(kind==="product"?20:10)+(u.pathname.split("/").filter(Boolean).length<=3?2:0);
   const key=u.toString();
   const old=found.get(key);
   if(!old||score>old.score) found.set(key,{url:key,kind,score});
  }catch{}
 }
 return [...found.values()].sort((a,b)=>b.score-a.score).slice(0,Math.max(1,limit));
}
