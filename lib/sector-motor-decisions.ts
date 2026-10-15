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
};

export function decideCommerceModules(e: MotorEvidence): string[] {
  const retailContext = e.primaryBusinessModel === "retail" || (e.primaryBusinessModel === "unknown" && e.retailProduct && e.cart);
  if (!retailContext) return [];
  const modules: string[] = [];
  if (e.retailProduct && (e.cart || e.checkout)) modules.push("ecommerce");
  if (e.retailProduct) modules.push("product");
  if (e.retailProduct && e.productPrice) modules.push("pricing_currency");
  if (e.merchantFeed && e.retailProduct) modules.push("merchant");
  if (e.retailProduct && e.cart && e.checkout) modules.push("checkout");
  if (e.euMarket && e.retailProduct && (e.cart || e.checkout)) modules.push("eu_consumer");
  return modules;
}

export function reconcilePrimarySector(primary: {sector: string; confidence: number}, candidate: {sector: string; confidence: number; independentEvidence: boolean}) {
  if (primary.sector !== "unknown" && primary.confidence >= 75) return primary;
  if (!candidate.independentEvidence || candidate.confidence < 75) return primary;
  if (primary.sector !== "unknown" && candidate.confidence <= primary.confidence) return primary;
  return {sector: candidate.sector, confidence: candidate.confidence};
}
