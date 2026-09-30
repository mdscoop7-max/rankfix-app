export type CommercePageAudit = {
 url:string; kind:"product"|"category"; status:number|null;
 title:boolean; description:boolean; h1:boolean; canonical:boolean;
 productSchema:boolean; offerSchema:boolean; breadcrumbSchema:boolean;
 priceSignal:boolean; availabilitySignal:boolean; imageSignal:boolean;
 error?:string;
};

const has=(html:string,re:RegExp)=>re.test(html);
export function auditCommerceHtml(url:string,kind:"product"|"category",status:number|null,html:string):CommercePageAudit{
 const jsonLd=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join("\n");
 return {
  url,kind,status,
  title:has(html,/<title[^>]*>\s*[^<\s][\s\S]*?<\/title>/i),
  description:has(html,/<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["'][^"']+["']/i)||has(html,/<meta[^>]+content\s*=\s*["'][^"']+["'][^>]+name\s*=\s*["']description["']/i),
  h1:has(html,/<h1\b[^>]*>\s*[\s\S]*?\S[\s\S]*?<\/h1>/i),
  canonical:has(html,/<link[^>]+rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]+href\s*=\s*["'][^"']+["']/i)||has(html,/<link[^>]+href\s*=\s*["'][^"']+["'][^>]+rel\s*=\s*["'][^"']*canonical[^"']*["']/i),
  productSchema:/["']@type["']\s*:\s*["']Product["']/i.test(jsonLd),
  offerSchema:/["']@type["']\s*:\s*["'](?:Offer|AggregateOffer)["']/i.test(jsonLd),
  breadcrumbSchema:/["']@type["']\s*:\s*["']BreadcrumbList["']/i.test(jsonLd),
  priceSignal:/(?:€|EUR|USD|GBP|MAD)\s*\d|\d[\d.,]*\s*(?:€|EUR|USD|GBP|MAD)|["']price["']\s*:/i.test(html),
  availabilitySignal:/in stock|out of stock|op voorraad|niet op voorraad|en stock|auf lager|disponibile|agotado|["']availability["']\s*:/i.test(html),
  imageSignal:has(html,/<img\b[^>]+(?:src|srcset)\s*=\s*["'][^"']+["']/i)
 };
}
