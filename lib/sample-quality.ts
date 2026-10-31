import { schemaTypesOf } from "./schema-type.ts";
import { looksLikeCategoryPath, looksLikeCorporatePath, looksLikeEditorialPath, looksLikeEventPath, looksLikeStorePage } from "./product-links.ts";
// Representative pages must be typed from their own DOM, not just their URL.
// In particular a telecom product detail can live below a category-like /winkel path.
/**
 * schema.org types for a bank's, insurer's or card issuer's offer (accounts, loans,
 * cards, insurance). A Product next to one of these describes a financial service,
 * not merchandise: no retail product page, no product sample, no Merchant checks.
 */
export const FINANCIAL_OFFER_SCHEMA_TYPES: ReadonlySet<string> = new Set(["financialproduct", "loanorcredit", "bankaccount", "depositaccount", "paymentcard", "creditcard", "mortgageloan", "investmentordeposit", "insuranceagency", "bankorcreditunion", "paymentservice", "currencyconversionservice", "brokerageaccount", "investmentfund"]);
export function isFinancialOfferSchema(types: string[]): boolean {
  return types.some((type) => FINANCIAL_OFFER_SCHEMA_TYPES.has(String(type).toLowerCase()));
}
export type SamplePageType = "homepage" | "category" | "product" | "form" | "legal" | "service" | "listing" | "support" | "article" | "event" | "corporate" | "contact" | "other";

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
  eventSchema?: boolean;
  /** Number of Product objects in the page's structured data (category grids often carry many). */
  productSchemaCount?: number;
  /** The page describes a financial offer (account, loan, card, insurance) in its structured data. */
  financialOffer?: boolean;
  /**
   * The page's own identity (title, description, H1) or typed schema describes a
   * service the visitor can use (send, apply, open, book, rates...), in any EU language.
   */
  serviceEvidence?: boolean;
  /** The page carries its own publication date (datePublished, article:published_time, <time> in an <article>). */
  datedArticle?: boolean;
  /** Platform single-product markup (WooCommerce single-product / main add-to-cart, Magento product-info-main). */
  singleProductMarkup?: boolean;
}): SamplePageType {
  const { proposed } = input;
  if (["homepage", "legal", "support", "form", "contact"].includes(proposed)) return proposed;
  const path = input.path || "";
  if (/\/(?:contact|contact-us|contacteer|kontakt)\/?$/i.test(path)) return "contact";
  // Press releases, news and blog posts are articles, whatever links or a shop
  // elsewhere on the site suggest; a purchase action on the page itself is needed
  // before an editorial URL can be a product.
  const editorial = looksLikeEditorialPath(path) || /\/(?:blog|news|nieuws|artikelen|articles)\//i.test(path);
  if (input.articleSchema || input.datedArticle || (editorial && !(input.productSchema && input.purchaseAction))) return "article";
  if (input.eventSchema || (looksLikeEventPath(path) && !input.purchaseAction)) return "event";
  if (looksLikeCorporatePath(path) && !input.productSchema && !input.purchaseAction) return "corporate";
  // An account, loan, card or insurance page is a service page, even below /produkty/ or
  // with Product schema; only a real purchase action (add to cart) makes it retail.
  if (input.financialOffer && !input.purchaseAction) return "service";
  // Product schema is direct on-page evidence; an ItemList indicates a collection
  // unless there is also confirmed product detail evidence.
  // A category archive, store finder or a page listing several Products is a
  // collection even when it carries Product schema and add-to-cart buttons.
  if (looksLikeStorePage(path)) return proposed === "product" || proposed === "category" ? "other" : proposed;
  // An ItemList of articles or topics is not a product range: a collection also
  // shows prices, a purchase action or Product objects.
  const commerceOnPage = input.visiblePrices > 0 || input.purchaseAction || (input.productSchemaCount || 0) > 0;
  // A catalogue-like URL is only a weak hint: a hub that lists services or offers
  // without products, prices or purchase actions is not a product category
  // (field reports 16-10: postal service pages typed "category").
  const pathCollection = looksLikeCategoryPath(path) && (commerceOnPage || input.repeatedProductLinks || input.itemListSchema);
  // Several independent Product objects make a collection. Related or accessory
  // products nested inside the page's own Product are not counted (see
  // countIndependentProducts), so a product detail page stays a product page.
  const collection = pathCollection || (input.productSchemaCount || 0) >= 2 || (input.itemListSchema && input.repeatedProductLinks && commerceOnPage);
  if (collection) return "category";
  // A product detail page with a "related products" grid (QA #207).
  if (input.singleProductMarkup && (input.purchaseAction || input.productOffer || input.visiblePrices > 0)) return "product";
  // A grid of three or more linked products with prices, without the page's own
  // single Product and without a model/article number, lists products: it is a
  // collection, even below /producten/ or /products/ (QA #203).
  const ownSingleProduct = input.productSchema && (input.productSchemaCount || 1) === 1;
  if (input.repeatedProductLinks && input.visiblePrices >= 3 && !ownSingleProduct && !input.detailIdentity) return "category";
  if (input.productSchema) return "product";
  // The page's own content describes a service and it sells nothing itself.
  if (input.serviceEvidence && !input.purchaseAction && !input.productSchema && ["other", "category", "product"].includes(proposed)) return "service";
  // A deeply nested product/variant route with a concrete model number and
  // a single detail heading is stronger than its generic parent /shop category.
  // This is page typing only, never proof of checkout or an Offer.
  const productDetailPath = /\/(?:shop|store|winkel|products?|artikelen?)\//i.test(path)
    && /(?:^|[-/])(?:iphone|galaxy|pixel|ipad|macbook|playstation|samsung|motorola|oneplus)[-/]?[a-z]*[-/]?\d|(?:^|[-/])(?:\d{2,4}gb|\d{2,4}tb|sku[-/][\w-]+)/i.test(path);
  if (productDetailPath && input.uniqueH1 && !input.itemListSchema && !input.repeatedProductLinks && input.detailIdentity) return "product";
  if (!input.itemListSchema && input.purchaseAction && input.visiblePrices > 0 &&
      input.uniqueH1 && (input.productOffer || input.detailIdentity) &&
      !input.repeatedProductLinks) return "product";
  // Repeated product links alone are often global navigation (an industrial
  // "Products" menu); a collection also shows prices or purchase actions.
  if ((proposed === "other" || proposed === "product") && ((input.itemListSchema && commerceOnPage) || (input.repeatedProductLinks && (input.visiblePrices > 0 || input.purchaseAction)) || (input.breadcrumbDepth || 0) >= 3 && input.visiblePrices > 1))
    return "category";
  // Standalone topic/category hubs and commerce/shop indexes are collections,
  // not miscellaneous pages. Preserve "other" for genuinely unclassified pages.
  if ((proposed === "other" || proposed === "category") && /\/(?:[^/]+-)?(?:shop|store|catalogus|catalog|assortiment|collectie|collection|categorieen|categories|smarthome|smart-home|gaming)\/?$/i.test(path)) return "category";
  // A category proposed from URL shape alone, without any collection evidence on
  // the page, is not a proven product category, unless the path itself sits in an
  // explicit shop section (listings there are often rendered client-side).
  if (proposed === "category" && !commerceOnPage && !input.repeatedProductLinks && !input.itemListSchema && !/\/(?:shop|store|webshop|winkel|boutique|negozio|tienda|sklep|loja|kauppa|butik|e-?shop)(?:\/|$)/i.test(path)) return "other";
  if (proposed === "other" && /\/(?:tv|televisie|streaming|internet|bellen|mobiel-abonnement)\/?$/i.test(path)) return "service";
  if (proposed === "other" && (input.serviceOffer || /\/(?:diensten?|services?|solutions?|oplossingen?|behandelingen?)\//i.test(path))) return "service";
  return proposed;
}

/**
 * Service intent in a page's OWN identity (title, meta description, H1), in EU
 * languages: actions a visitor takes with a service provider (send a parcel, open
 * an account, apply, book, request) and rate/plan vocabulary. Used only together
 * with "no purchase action and no Product schema", so a shop page never becomes a
 * service page. No brand, domain or sector vocabulary.
 */
export const SERVICE_INTENT = /(?<![\p{L}])(?:diensten|dienstverlening|aanvragen|afsluiten|versturen|verzenden|aangetekend|tarieven|abonnement(?:en)?|service[s]?|solutions?|apply|request|open an account|send(?:ing)? a (?:parcel|letter|package)|ship(?:ping)? (?:a )?(?:parcel|package)|track(?:ing)? (?:a |your )?(?:parcel|shipment)|rates|plans|envoyer|exp[ée]dier|exp[ée]dition|envoi|souscrire|ouvrir un compte|demander|suivre (?:un|votre) (?:envoi|colis)|tarifs|offres?|solutions? d|versenden|verschicken|beantragen|abschlie(?:ß|ss)en|er[öo]ffnen|tarife|leistungen|l[öo]sungen|spedire|spedizion[ei]|richied[ei]re|richiedi|aprire (?:un|il) conto|attivare|tariffe|servizi[o]?|soluzioni|enviar|env[ií]o|solicitar|contratar|abrir una cuenta|tarifas|servicios?|soluciones|wy[śs]lij|wysy[łl]k[aią]|za[łl][óo][żz]|otw[óo]rz|wniosek|z[łl][óo][żz] wniosek|us[łl]ug[aiy]?|cennik|oferta|rozwi[ąa]zania|leasing|konto (?:osobiste|firmowe)|abrir conta|servi[çc]os|solicitar|customer support|support portal|supplier portal|customer portal|portal|klantenservice|kundenservice|kundendienst|service client|assistenza clienti|atenci[óo]n al cliente|obs[łl]uga klienta)(?![\p{L}])/iu;

/**
 * Number of schema.org Product objects in a page's JSON-LD that are not nested
 * inside another Product (isRelatedTo, isSimilarTo, isAccessoryOrSparePartFor,
 * hasVariant...). Products inside an ItemList still count: that is a grid.
 */
export function countIndependentProducts(html: string): number {
  let count = 0;
  const isProduct = (value: Record<string, unknown>) => {
    const types = schemaTypesOf(value);
    return types.some((type) => String(type || "").toLowerCase() === "product");
  };
  const walk = (value: unknown, insideProduct: boolean, depth: number) => {
    if (!value || typeof value !== "object" || depth > 12) return;
    if (Array.isArray(value)) { for (const item of value) walk(item, insideProduct, depth + 1); return; }
    const node = value as Record<string, unknown>;
    const product = isProduct(node);
    if (product && !insideProduct) count++;
    for (const nested of Object.values(node)) walk(nested, insideProduct || product, depth + 1);
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1]), false, 0); } catch { /* invalid JSON-LD is reported elsewhere */ }
  }
  return count;
}

/** schema.org types that describe a service offer rather than merchandise. */
export const SERVICE_SCHEMA_TYPES: ReadonlySet<string> = new Set(["service", "professionalservice", "governmentservice", "financialservice", "broadcastservice", "cableorsatelliteservice", "foodservice", "taxi", "taxiservice", "webapi"]);

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
