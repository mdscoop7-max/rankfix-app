// Commerce-only checks (Merchant Center, checkout, EU consumer information, product
// data) may only be "not applicable" when the evidence shows the site is not a
// shop. Missing evidence is "unable to confirm": a country picker, a JavaScript
// shell or a thin sample cannot prove that a shop does not exist.
export type CommerceApplicability =
  | { state: "confirmed" }
  | { state: "absent"; reason: "service_identity" | "no_commerce_evidence" }
  | { state: "unconfirmed"; reason: "market_selector" | "thin_shell" | "weak_commerce_signals" | "low_coverage" | "sample_refused" | "referral_platform" };

export function commerceApplicability(input: {
  confirmed: boolean;
  primaryNonCommerceIdentity: boolean;
  commerceHints: boolean;
  thinShell: boolean;
  marketSelector: boolean;
  auditedRepresentativePages: number;
  verifiedSecondaryCommerce?: boolean;
  /** Product/category pages that refused RankFix (401/403/405/429/202); QA commerce 72/72. */
  refusedRetailPages?: number;
  /** A comparison/quote platform without its own cart (QA #207/#209). */
  referralPlatform?: boolean;
  /** Keep "unable to confirm" for a thin sample even without any shop signal. */
  requireSampleForAbsence?: boolean;
}): CommerceApplicability {
  if (input.referralPlatform) return { state: "unconfirmed", reason: "referral_platform" };
  if (input.confirmed) return { state: "confirmed" };
  // The shop pages themselves refused RankFix: whether checkout works is unknowable,
  // never "absent" and never a weak-signal verdict about the shop.
  if ((input.refusedRetailPages || 0) >= 2 && (input.commerceHints || input.verifiedSecondaryCommerce)) return { state: "unconfirmed", reason: "sample_refused" };
  if (input.marketSelector) return { state: "unconfirmed", reason: "market_selector" };
  if (input.thinShell) return { state: "unconfirmed", reason: "thin_shell" };
  // A primary service identity may also sell real products (e.g. phones at a
  // telecom provider). Never label observed product commerce as absent solely
  // because checkout/cart evidence is still missing.
  if (input.verifiedSecondaryCommerce) return { state: "unconfirmed", reason: "weak_commerce_signals" };
  if (input.primaryNonCommerceIdentity) return { state: "absent", reason: "service_identity" };
  if (input.commerceHints) return { state: "unconfirmed", reason: "weak_commerce_signals" };
  // 31 Oct (PDF P2): a fully read page (no JS shell, no country picker) without
  // ANY product, price, cart or shop signal is evidence that this is not a shop;
  // webshop checks are then N.v.t., also when few other pages could be read.
  // An explicitly requested thin sample keeps the old, cautious verdict.
  if (input.auditedRepresentativePages < 2 && input.requireSampleForAbsence) return { state: "unconfirmed", reason: "low_coverage" };
  return { state: "absent", reason: "no_commerce_evidence" };
}

export const COMMERCE_APPLICABILITY_COPY: Record<string, string> = {
  service_identity: "Scanbewijs bevestigt een primaire identiteit die geen webshop is (zoals dienstverlener, uitgever of organisatie), zonder aangetoonde retailproduct-/winkelwagenketen. Deze specifieke webshopcontrole is niet van toepassing; commerciële abonnementen, boekingen en dienstprijzen kunnen wel relevant zijn.",
  no_commerce_evidence: "In de gescande pagina en de representatieve pagina's is geen product-, prijs-, winkelwagen- of checkoutbewijs gevonden; deze commercecontrole is niet van toepassing.",
  market_selector: "Dit is een internationale land-/taalkeuzepagina. Webshopfunctionaliteit staat op de landversies en kan vanaf deze pagina niet worden beoordeeld. Scan de landversie (bijvoorbeeld /nl/nl/) voor een webshopbeoordeling.",
  thin_shell: "De opgehaalde HTML is een dunne JavaScript-shell zonder uitgevoerde rendering. Of hier een webshop is, kan niet betrouwbaar worden vastgesteld.",
  weak_commerce_signals: "Er zijn product- of webshopsignalen gevonden, maar niet alle betaal-, winkelwagen- en retailfuncties zijn onafhankelijk bevestigd. Relevante productcontroles blijven mogelijk; onbevestigde shopfuncties zijn niet automatisch afwezig.",
  low_coverage: "Te weinig representatieve pagina's konden worden onderzocht om vast te stellen of er een webshop is.",
  referral_platform: "Dit is een vergelijkings- of offerteplatform: bestellen, betalen en leveren gebeuren bij aangesloten winkels of aanbieders. Een eigen winkelwagen of checkout is daarom geen vereiste; productgegevens, doorverwijzingen en partnerinformatie blijven relevant.",
  sample_refused: "De product- en categoriepagina's weigerden RankFix (bijvoorbeeld HTTP 403, 405 of 429). De webshop is daarom niet te bevestigen; dit is geen bewijs dat er geen webshop is. RankFix omzeilt deze beveiliging niet.",
};

// Existing report reason codes, so dashboard and PDF explain the status correctly.
export const UNCONFIRMED_COMMERCE_REASON_CODE = {
  market_selector: "type_uncertain",
  thin_shell: "needs_js",
  weak_commerce_signals: "weak_evidence",
  low_coverage: "insufficient_pages",
  sample_refused: "access_refused",
  referral_platform: "type_uncertain",
} as const;

// Shop wording ("webshophomepage", "productlinks", OnlineStore advice) is only
// correct when shop functionality is proven and no non-commerce identity (transport,
// garage, hotel, ...) is primary. Early page signals can be wrong; this is final.
export function shopWordingApplies(applicability: CommerceApplicability, primaryNonCommerceIdentity: boolean): boolean {
  return applicability.state === "confirmed" && !primaryNonCommerceIdentity;
}

const SHOP_LABELS: Array<[RegExp, string]> = [
  [/\bwebshophomepage\b/g, "homepage"],
  [/\bwebshopcategorie\b/g, "lijst-/categoriepagina"],
  [/\bwebshoppagina\b/g, "pagina"],
  [/\bOnlineStore \+ WebSite\b/g, "Organization + WebSite"],
];

export function neutralizeShopWording(text: string): string {
  return SHOP_LABELS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

export const GENERIC_LINK_DESTINATION_PASS = {
  message: "Geen sterke semantische mismatch gevonden tussen benoemde interne links en hun bestemming.",
  fix: "Houd linktekst en bestemming inhoudelijk consistent.",
};
export const PRODUCT_LINK_CHECK_UNCONFIRMED = {
  message: "De mogelijke afwijking is gevonden met de productkaartcontrole, maar voor deze website is geen webshop bevestigd. Of linktekst en bestemming niet bij elkaar passen, kan daarom niet betrouwbaar worden vastgesteld.",
  fix: "Controleer handmatig of belangrijke links naar de bestemming gaan die hun tekst belooft.",
};

/**
 * Storefront-wide diagnostics cannot be assumed for a service provider simply
 * because its site links to products or subscriptions. They belong in a
 * separate, evidence-backed retail flow audit. Product-detail evidence checks
 * remain assessable independently on hybrid service/retail websites.
 */
const SERVICE_STOREFRONT_ONLY_CHECKS = new Set([
  "commercial_terms_signal", "merchant_feed_signal", "webshop_claims", "webshop_trust",
  "checkout_funnel_static", "checkout_information_signal", "checkout_trust",
  "eu_discount_signal", "eu_discount_reference_signal", "eu_reference_price_signal",
  "eu_review_signal", "eu_review_transparency_signal", "eu_scarcity_signal",
  "eu_consumer_information_signal",
]);

export function isStorefrontOnlyForService(
  key: string,
  primaryServiceIdentity: boolean,
  verifiedRetailCheckout: boolean,
): boolean {
  return primaryServiceIdentity && !verifiedRetailCheckout && SERVICE_STOREFRONT_ONLY_CHECKS.has(key);
}

/**
 * Distinguish a service provider using cart/payment technology from operating
 * a separate consumer product shop. Website text, a generic checkout URL or a
 * subscription price alone is not proof of retail inventory and purchase.
 */
export function confirmedRetailEvidenceForService(input: {
  representativePurchase: boolean;
  productDetailSchema: boolean;
  addToCart: boolean;
  productAndPrice: boolean;
  /**
   * 31 Oct (Kwik-Fit: tyres with cart and payment logos typed as a garage): the
   * hard storefront chain on the site's own page: add-to-cart + visible prices with
   * a currency + its own cart, without subscription pricing. A service business with a real
   * shop (tyres, parts, phones) is then also a webshop.
   */
  storefrontChain?: boolean;
}): boolean {
  return input.representativePurchase ||
    (input.productDetailSchema && input.addToCart && input.productAndPrice) ||
    Boolean(input.storefrontChain && input.addToCart);
}

/**
 * Does a sampled product page carry an OFFER (something for sale), not just a
 * product description? Product schema with only a name is published by software
 * vendors and manufacturers too (live QA scan 2627bab0: 12 security-software pages,
 * none with price, stock or cart). An offer is price + currency, a stock status,
 * a visible price, or a buy/add-to-cart action.
 */
export function hasProductOffer(evidence: { product?: { price?: string | null; currency?: string | null; availability?: string | null } | null; priceSignals?: number; strongCommerceAction?: boolean } | null | undefined): boolean {
  if (!evidence) return false;
  const p = evidence.product;
  return Boolean((p?.price && p?.currency) || p?.availability || (evidence.priceSignals || 0) > 0 || evidence.strongCommerceAction);
}
