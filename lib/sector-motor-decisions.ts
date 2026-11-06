// Sector Motor: keep business identity separate from observed capabilities.
// Never infer every retail check from a single purchase or booking signal.
export type MotorEvidence = {
  primarySector: string;
  primaryBusinessModel: "retail" | "service" | "unknown";
  retailProduct: boolean;
  productPrice: boolean;
  cart: boolean;
  checkout: boolean;
  merchantFeed: boolean;
  euMarket: boolean;
  // Site-wide product evidence, even if the primary identity remains a service.
  secondaryRetailDetail?: boolean;
  // Independent product + offer + purchase evidence, not a generic payment link.
  verifiedSecondaryStorefront?: boolean;
  /**
   * The site-level webshop decision is confirmed (cart/checkout/product grid on
   * the site) for a retail primary identity. bonprix (6 Nov): "Webshop bevestigd"
   * with zero product pages left every webshop module off, so shop-level checks
   * (terms, returns, consumer info, trust) were never active.
   */
  shopConfirmed?: boolean;
  /**
   * The decided identity sells priced services/plans (software, cybersecurity,
   * hosting, financial services). A plan card with Product schema and a buy button
   * (CrowdStrike "Falcon Go") is a subscription, never a retail webshop.
   */
  pricedServiceIdentity?: boolean;
};

export function decideCommerceModules(e: MotorEvidence): string[] {
  if (e.pricedServiceIdentity) return [];
  const retailContext = e.primaryBusinessModel === "retail" || Boolean(e.verifiedSecondaryStorefront && e.retailProduct && e.cart) || (e.primaryBusinessModel === "unknown" && e.retailProduct && e.cart);
  if (!retailContext) {
    // A provider may sell devices alongside services. Product and price checks
    // can apply to proven items without claiming a verified cart/checkout.
    if (e.secondaryRetailDetail && e.retailProduct) return [
      "product", ...(e.productPrice ? ["pricing_currency"] : []),
    ];
    return [];
  }
  const modules: string[] = [];
  // Shop-level modules follow the confirmed shop; product-level modules still need
  // a proven product (no unproven page is ever treated as a product).
  const shopLevel = Boolean(e.shopConfirmed && e.primaryBusinessModel === "retail");
  if ((e.retailProduct && (e.cart || e.checkout)) || shopLevel) modules.push("ecommerce");
  if (e.retailProduct) modules.push("product");
  if (e.retailProduct && e.productPrice) modules.push("pricing_currency");
  if (e.merchantFeed && e.retailProduct) modules.push("merchant");
  if (e.retailProduct && e.cart && e.checkout) modules.push("checkout");
  if (e.euMarket && ((e.retailProduct && (e.cart || e.checkout)) || shopLevel)) modules.push("eu_consumer");
  return modules;
}

export function reconcilePrimarySector(primary: {sector: string; confidence: number}, candidate: {sector: string; confidence: number; independentEvidence: boolean}) {
  if (primary.sector !== "unknown" && primary.confidence >= 75) return primary;
  if (!candidate.independentEvidence || candidate.confidence < 75) return primary;
  if (primary.sector !== "unknown" && candidate.confidence <= primary.confidence) return primary;
  return {sector: candidate.sector, confidence: candidate.confidence};
}

// A non-decision never carries a confirmed confidence, even after reconciliation.
export function sectorConfidenceGuard(profile: {sector:string; confidence:string; confidenceScore:number}) {
  if (profile.sector !== "unknown") return {confidence:profile.confidence, confidenceScore:profile.confidenceScore};
  return {confidence:"low", confidenceScore:Number.isFinite(profile.confidenceScore) ? Math.max(0, Math.min(35, profile.confidenceScore)) : 0};
}
