import { looksLikeCategoryPath, looksLikeStorePage } from "./product-links.ts";
// Representative pages must be typed from their own DOM, not just their URL.
// In particular a telecom product detail can live below a category-like /winkel path.
export type SamplePageType = "homepage" | "category" | "product" | "form" | "legal" | "service" | "listing" | "support" | "article" | "contact" | "other";

export function refineSamplePageType(input: {
  proposed: SamplePageType;
  productSchema: boolean;
  itemListSchema: boolean;
  repeatedProductLinks: boolean;
  productOffer: boolean;
  purchaseAction: boolean;
  visiblePrices: number;
  uniqueH1: boolean;
  detailIdentity: boolean;
  articleSchema?: boolean;
  breadcrumbDepth?: number;
  path?: string;
  serviceOffer?: boolean;
  /** Number of Product objects in the page's structured data (category grids often carry many). */
  productSchemaCount?: number;
}): SamplePageType {
  const { proposed } = input;
  if (["homepage", "legal", "support", "form", "contact"].includes(proposed)) return proposed;
  const path = input.path || "";
  if (/\/(?:contact|contact-us|contacteer|kontakt)\/?$/i.test(path)) return "contact";
  if (input.articleSchema || (/\/(?:blog|news|nieuws|artikelen|articles)\//i.test(path) && !input.productSchema)) return "article";
  // Product schema is direct on-page evidence; an ItemList indicates a collection
  // unless there is also confirmed product detail evidence.
  // A category archive, store finder or a page listing several Products is a
  // collection even when it carries Product schema and add-to-cart buttons.
  if (looksLikeStorePage(path)) return proposed === "product" || proposed === "category" ? "other" : proposed;
  const collection = looksLikeCategoryPath(path) || (input.productSchemaCount || 0) >= 2 || (input.itemListSchema && input.repeatedProductLinks);
  if (collection) return "category";
  if (input.productSchema) return "product";
  // A deeply nested product/variant route with a concrete model number and
  // a single detail heading is stronger than its generic parent /shop category.
  // This is page typing only, never proof of checkout or an Offer.
  const productDetailPath = /\/(?:shop|store|winkel|products?|artikelen?)\//i.test(path)
    && /(?:^|[-/])(?:iphone|galaxy|pixel|ipad|macbook|playstation|samsung|motorola|oneplus)[-/]?[a-z]*[-/]?\d|(?:^|[-/])(?:\d{2,4}gb|\d{2,4}tb|sku[-/][\w-]+)/i.test(path);
  if (productDetailPath && input.uniqueH1 && !input.itemListSchema && !input.repeatedProductLinks && input.detailIdentity) return "product";
  if (!input.itemListSchema && input.purchaseAction && input.visiblePrices > 0 &&
      input.uniqueH1 && (input.productOffer || input.detailIdentity) &&
      !input.repeatedProductLinks) return "product";
  if ((proposed === "other" || proposed === "product") && (input.itemListSchema || input.repeatedProductLinks || (input.breadcrumbDepth || 0) >= 3 && input.visiblePrices > 1))
    return "category";
  // Standalone topic/category hubs and commerce/shop indexes are collections,
  // not miscellaneous pages. Preserve "other" for genuinely unclassified pages.
  if (proposed === "other" && /\/(?:[^/]+-)?(?:shop|store|catalogus|catalog|assortiment|collectie|collection|categorieen|categories|smarthome|smart-home|gaming)\/?$/i.test(path)) return "category";
  if (proposed === "other" && /\/(?:tv|televisie|streaming|internet|bellen|mobiel-abonnement)\/?$/i.test(path)) return "service";
  if (proposed === "other" && (input.serviceOffer || /\/(?:diensten?|services?|solutions?|oplossingen?|behandelingen?)\//i.test(path))) return "service";
  return proposed;
}

// Avoid calling an under-observed JS shell a 100/100 page. HTTP availability
// alone is not a title/description/H1/canonical assessment.
export function sampleEvidenceScore(checks: Array<{key:string;status:string}>, credit: (key:string)=>number): number | null {
  const meta = checks.filter((item)=>["title","description","h1","canonical"].includes(item.key));
  // No perfect score from just the confirmed subset of a JS application.
  // Unknown is not a penalty; it makes the page's aggregate score provisional,
  // and therefore unsuitable for a numeric site-wide average.
  if (meta.length !== 4 || meta.some((item)=>item.status === "UNABLE_TO_CONFIRM")) return null;
  const comparable = meta;
  if (comparable.length < 4) return null;
  return Math.round(100 * comparable.reduce((sum,item)=>sum + (item.status === "PASS" ? 1 : credit(item.key)),0) / comparable.length);
}

export function missingJsHeadEvidenceUnverified(input: {
  frameworkSignal: boolean;
  rendered: boolean;
  clientShell: boolean;
}): boolean {
  return !input.rendered && (input.frameworkSignal || input.clientShell);
}
