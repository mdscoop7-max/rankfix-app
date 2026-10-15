// Representative pages must be typed from their own DOM, not just their URL.
// In particular a telecom product detail can live below a category-like /winkel path.
export type SamplePageType = "homepage" | "category" | "product" | "form" | "legal" | "service" | "listing" | "support" | "other";

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
}): SamplePageType {
  const { proposed } = input;
  if (["homepage", "legal", "support", "form"].includes(proposed)) return proposed;
  // Product schema is direct on-page evidence; an ItemList indicates a collection
  // unless there is also confirmed product detail evidence.
  if (input.productSchema) return "product";
  if (!input.itemListSchema && input.purchaseAction && input.visiblePrices > 0 &&
      input.uniqueH1 && (input.productOffer || input.detailIdentity) &&
      !input.repeatedProductLinks) return "product";
  if ((proposed === "other" || proposed === "product") && (input.itemListSchema || input.repeatedProductLinks))
    return "category";
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
