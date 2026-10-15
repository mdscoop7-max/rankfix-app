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
}): SamplePageType {
  const { proposed } = input;
  if (["homepage", "legal", "support", "form", "contact"].includes(proposed)) return proposed;
  const path = input.path || "";
  if (/\/(?:contact|contact-us|contacteer|kontakt)\/?$/i.test(path)) return "contact";
  if (input.articleSchema || (/\/(?:blog|news|nieuws|artikelen|articles)\//i.test(path) && !input.productSchema)) return "article";
  // Product schema is direct on-page evidence; an ItemList indicates a collection
  // unless there is also confirmed product detail evidence.
  if (input.productSchema) return "product";
  if (!input.itemListSchema && input.purchaseAction && input.visiblePrices > 0 &&
      input.uniqueH1 && (input.productOffer || input.detailIdentity) &&
      !input.repeatedProductLinks) return "product";
  if ((proposed === "other" || proposed === "product") && (input.itemListSchema || input.repeatedProductLinks || (input.breadcrumbDepth || 0) >= 3 && input.visiblePrices > 1))
    return "category";
  if (proposed === "other" && /\/(?:diensten?|services?|solutions?|oplossingen?|behandelingen?)\//i.test(path)) return "service";
  return proposed;
}

// Avoid calling an under-observed JS shell a 100/100 page. HTTP availability
// alone is not a title/description/H1/canonical assessment.
export function sampleEvidenceScore(checks: Array<{key:string;status:string}>, credit: (key:string)=>number): number | null {
  const comparable = checks.filter((item)=>item.key !== "http" && item.status !== "UNABLE_TO_CONFIRM");
  if (comparable.length < 2) return null;
  return Math.round(100 * comparable.reduce((sum,item)=>sum + (item.status === "PASS" ? 1 : credit(item.key)),0) / comparable.length);
}

export function missingJsHeadEvidenceUnverified(input: {
  frameworkSignal: boolean;
  rendered: boolean;
  clientShell: boolean;
}): boolean {
  return !input.rendered && (input.frameworkSignal || input.clientShell);
}
