// 1 Nov 2026: ONE Google Tag Manager detector for every check (structured data,
// Consent Mode, Ads readiness, cookie use). GTM is also served from a site's own
// (sub)domain ("server-side tagging": metrix.shop.test/gtm.js?id=GTM-…); a loader
// is recognised by the gtm.js path with a container id, on any host.
export type TagManagerDetection = { present: boolean; containers: string[]; loaders: string[]; firstParty: boolean };

const CONTAINER = /\bGTM-[A-Z0-9]{4,}\b/g;
// Google's host, or any host serving /gtm.js?id= (also built in an inline snippet:
// '.../gtm.js?id='+i ... 'GTM-XXXX').
const LOADER = /(?:https?:)?\/\/([a-z0-9.-]+)\/gtm\.js\?id=|googletagmanager\.com\/(?:gtm\.js|ns\.html)|\/gtm\.js\?id=['"]?\s*\+/gi;

export function detectGoogleTagManager(html: string): TagManagerDetection {
  const source = String(html || "");
  const containers = [...new Set(source.match(CONTAINER) || [])];
  const loaders: string[] = [];
  let firstParty = false;
  for (const m of source.matchAll(LOADER)) {
    const host = (m[1] || (/googletagmanager/i.test(m[0]) ? "www.googletagmanager.com" : "inline")).toLowerCase();
    if (!loaders.includes(host)) loaders.push(host);
    if (host !== "www.googletagmanager.com" && host !== "googletagmanager.com") firstParty = true;
  }
  return { present: containers.length > 0 && loaders.length > 0, containers, loaders, firstParty };
}
