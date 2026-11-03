// Webshop evidence chain (4 Nov 2026). Product checks of a confirmed webshop are
// judged on the representative PRODUCT pages RankFix already audited, with the
// SAME criteria as on a scanned product page (app/api/scan/route.ts):
// - product_schema / merchant_product_readiness: name, image, price, currency
//   and availability in Product/Offer data;
// - product_price_consistency: explicitly marked visible price = Offer price;
// - price_currency_consistency: explicitly marked visible currency = Offer currency;
// - product_availability: one unambiguous visible stock state = Offer availability.
// Every verdict names the page(s) and the evidence. Missing evidence stays
// "unable_to_confirm"; a proven defect on a product page is a warning. Absence on
// raw (not rendered) HTML is never a defect: JavaScript may add the data.

export type SampleVisibleOffer = {
  priceCandidates: number[];
  priceStrength: "explicit_product_markup" | "broad_page_text" | "none";
  currencies: string[];
  availabilityState: "out_of_stock" | "preorder" | "backorder" | "in_stock" | null;
  availabilityAmbiguous: boolean;
};

export type SampleProductPage = {
  url: string;
  evidenceSource?: "raw_html" | "rendered_html";
  productSchema: boolean;
  product: { name: string | null; image: string | null; sku?: string | null; price: string | null; currency: string | null; availability: string | null; offerKind?: "offer" | "aggregate" | "list" | "none" } | null;
  visibleOffer?: SampleVisibleOffer | null;
};

export type SampleCheckStatus = "pass" | "warning" | "unable_to_confirm";
export type SampleCheckVerdict = {
  key: SampleProductCheckKey;
  status: SampleCheckStatus;
  /** Share of the check's maximum points (1 = full, 0 = none). */
  credit: number;
  message: string;
  url: string | null;
  pages: Array<{ url: string; status: SampleCheckStatus; detail: string }>;
};
export const SAMPLE_PRODUCT_CHECK_KEYS = ["product_schema", "merchant_product_readiness", "product_price_consistency", "price_currency_consistency", "product_availability"] as const;
export type SampleProductCheckKey = (typeof SAMPLE_PRODUCT_CHECK_KEYS)[number];

const AVAILABILITY = /(?:InStock|OutOfStock|PreOrder|BackOrder|LimitedAvailability|SoldOut|OnlineOnly|InStoreOnly|Discontinued)/i;
const priceNumber = (value: string | null | undefined): number | null => {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const availabilityState = (value: string | null | undefined) => !value ? null
  : /OutOfStock|SoldOut|Discontinued/i.test(value) ? "out_of_stock"
  : /PreOrder/i.test(value) ? "preorder"
  : /BackOrder/i.test(value) ? "backorder"
  : /InStock|LimitedAvailability|OnlineOnly|InStoreOnly/i.test(value) ? "in_stock" : null;

/** Fields of a complete Product/Offer, exactly as the scanned-page rule requires. */
export function missingOfferFields(product: SampleProductPage["product"]): string[] {
  if (!product) return ["productnaam", "afbeelding", "prijs", "valuta", "beschikbaarheid"];
  const missing: string[] = [];
  if (!product.name) missing.push("productnaam");
  if (!product.image) missing.push("afbeelding");
  if (priceNumber(product.price) === null) missing.push("prijs");
  if (!/^[A-Z]{3}$/.test(String(product.currency || ""))) missing.push("valuta");
  if (!product.availability || !AVAILABILITY.test(product.availability)) missing.push("beschikbaarheid");
  return missing;
}

type PageVerdict = { status: SampleCheckStatus; credit: number; detail: string };

function judgePage(key: SampleProductCheckKey, page: SampleProductPage): PageVerdict {
  const rendered = page.evidenceSource === "rendered_html";
  const p = page.product;
  const v = page.visibleOffer || null;
  if (key === "product_schema" || key === "merchant_product_readiness") {
    const missing = missingOfferFields(p);
    if (page.productSchema && !missing.length) return { status: "pass", credit: 1, detail: "Product/Offer-data bevat productnaam, afbeelding, prijs, valuta en beschikbaarheid." };
    // A missing field is a proven defect only when one plain Offer was read
    // completely; an AggregateOffer or a list of offers may hold it deeper.
    if (page.productSchema && p?.offerKind === "offer") return { status: "warning", credit: 0.5, detail: `Product structured data is aanwezig, maar mist: ${missing.join(", ")}.` };
    if (page.productSchema) return { status: "unable_to_confirm", credit: 0, detail: `Product structured data is aanwezig; ${missing.join(", ")} niet gevonden in de uitgelezen aanbieding (${p?.offerKind || "vorm onbekend"}), dus niet bewezen dat het ontbreekt.` };
    return rendered
      ? { status: "warning", credit: key === "product_schema" ? 3 / 8 : 0.5, detail: "Productpagina na browserweergave zonder Product structured data." }
      : { status: "unable_to_confirm", credit: 0, detail: "Geen Product structured data in de ruwe HTML; zonder browserweergave is niet bewezen dat die ontbreekt." };
  }
  if (key === "product_price_consistency") {
    const schemaPrice = priceNumber(p?.price);
    if (!v || !v.priceCandidates.length || schemaPrice === null) return { status: "unable_to_confirm", credit: 0, detail: "Geen betrouwbare zichtbare productprijs én structured-data prijs om te vergelijken." };
    const match = v.priceCandidates.some((visible) => Math.abs(visible - schemaPrice) < 0.005);
    if (v.priceStrength === "explicit_product_markup") {
      return match
        ? { status: "pass", credit: 1, detail: `Gemarkeerde productprijs komt overeen met de Offer-prijs (${schemaPrice}).` }
        : { status: "warning", credit: 2 / 6, detail: `Gemarkeerde productprijs (${v.priceCandidates.slice(0, 4).join(", ")}) wijkt af van de Offer-prijs (${schemaPrice}).` };
    }
    return { status: "unable_to_confirm", credit: 0, detail: "Bedragen in de paginatekst zijn niet als productprijs gemarkeerd; geen betrouwbare vergelijking." };
  }
  if (key === "price_currency_consistency") {
    const structured = /^[A-Z]{3}$/.test(String(p?.currency || "")) ? String(p!.currency) : null;
    if (!v || !structured) return { status: "unable_to_confirm", credit: 0, detail: "Geen zichtbare valuta én Offer-valuta om te vergelijken." };
    if (v.currencies.length > 1) return { status: "unable_to_confirm", credit: 0, detail: `Meerdere zichtbare valuta (${v.currencies.join(", ")}); dat kan een valutakeuze zijn.` };
    if (v.priceStrength !== "explicit_product_markup" || v.currencies.length !== 1) return { status: "unable_to_confirm", credit: 0, detail: "Geen expliciet gemarkeerde productprijs met één valuta." };
    return v.currencies[0] === structured
      ? { status: "pass", credit: 1, detail: `Gemarkeerde productprijs en Offer-data gebruiken dezelfde valuta: ${structured}.` }
      : { status: "warning", credit: 2 / 6, detail: `Zichtbare valuta (${v.currencies[0]}) wijkt af van de Offer-valuta (${structured}).` };
  }
  // product_availability
  const structured = availabilityState(p?.availability);
  if (!v) return { status: "unable_to_confirm", credit: 0, detail: "Zichtbare voorraadstatus is voor deze pagina niet vastgelegd." };
  if (v.availabilityAmbiguous) return { status: "unable_to_confirm", credit: 0, detail: "Meerdere zichtbare voorraadstatussen op de pagina; geen eenduidige vergelijking." };
  if (structured && v.availabilityState) {
    return structured === v.availabilityState
      ? { status: "pass", credit: 1, detail: `Zichtbare voorraadstatus (${v.availabilityState}) en Offer availability zijn consistent.` }
      : { status: "warning", credit: 2 / 5, detail: `Zichtbare voorraadstatus (${v.availabilityState}) spreekt de Offer availability (${p?.availability}) tegen.` };
  }
  if (!structured && v.availabilityState && page.productSchema) return { status: "warning", credit: 2 / 5, detail: `Zichtbare voorraadstatus (${v.availabilityState}) zonder Offer availability in de Product-data.` };
  return { status: "unable_to_confirm", credit: 0, detail: structured ? "Offer availability gevonden, maar geen eenduidige zichtbare voorraadstatus." : "Geen voorraadstatus in Product-data of zichtbare tekst." };
}

const TITLES: Record<SampleProductCheckKey, string> = {
  product_schema: "Product structured data",
  merchant_product_readiness: "Merchant Center productbasis",
  product_price_consistency: "Productprijs consistentie",
  price_currency_consistency: "Prijs & valuta consistentie",
  product_availability: "Productvoorraad",
};

/**
 * Site verdict over all audited product pages: a proven defect on any page is a
 * warning (that page is named); otherwise a pass on at least one page; otherwise
 * unable to confirm. Never a pass without a page that proves it.
 */
export function settleSampleProductCheck(key: SampleProductCheckKey, pages: SampleProductPage[]): SampleCheckVerdict {
  const judged = pages.map((page) => ({ page, verdict: judgePage(key, page) }));
  const rows = judged.map(({ page, verdict }) => ({ url: page.url, status: verdict.status, detail: verdict.detail }));
  const warn = judged.find((j) => j.verdict.status === "warning");
  const pass = judged.find((j) => j.verdict.status === "pass");
  const n = pages.length;
  if (warn) return { key, status: "warning", credit: warn.verdict.credit, url: warn.page.url, pages: rows,
    message: `${TITLES[key]}: op ${judged.filter((j) => j.verdict.status === "warning").length} van ${n} geauditeerde productpagina('s) aantoonbaar onjuist of onvolledig. ${warn.verdict.detail} Pagina: ${warn.page.url}` };
  if (pass) return { key, status: "pass", credit: 1, url: pass.page.url, pages: rows,
    message: `${TITLES[key]}: bevestigd op ${judged.filter((j) => j.verdict.status === "pass").length} van ${n} geauditeerde productpagina('s). ${pass.verdict.detail} Pagina: ${pass.page.url}` };
  const reason = judged[0]?.verdict.detail || "Geen geauditeerde productpagina in de steekproef.";
  return { key, status: "unable_to_confirm", credit: 0, url: judged[0]?.page.url || null, pages: rows,
    message: n ? `${TITLES[key]}: op ${n} geauditeerde productpagina('s) niet te bevestigen. ${reason}` : `${TITLES[key]}: geen geauditeerde productpagina in de steekproef; niet te bevestigen.` };
}

// Financial services published as Product/Offer data (insurance modules, loans,
// accounts) are not merchandise. The page's own URL, title or H1 names the
// financial service and the page has no purchase action or checkout.
const FINANCIAL_SERVICE = /(?<![\p{L}])(?:\p{L}*verzekering(?:en)?|insurance|versicherung(?:en)?|assurances?|seguros?|assicurazion[ei]|forsikring(?:er)?|försäkring(?:ar)?|ubezpieczeni[ea]|hypothe(?:ek|ken|k)|mortgages?|lening(?:en)?|loans?|kredite?|krediet|cr[eé]dits?|pr[eé]stamos?|prestiti|bankrekening|spaarrekening|betaalrekening|bank ?account|savings account|girokonto|sparkonto|compte (?:courant|d'[eé]pargne))(?![\p{L}])/iu;
export function financialServiceOfferPage(input: { url: string; title?: string | null; h1s?: string[]; purchaseAction: boolean; checkout: boolean }): boolean {
  if (input.purchaseAction || input.checkout) return false;
  let path = "";
  try { path = decodeURIComponent(new URL(input.url).pathname); } catch { path = input.url; }
  const own = [path.replace(/[-_/]+/g, " "), input.title || "", ...(input.h1s || [])].join(" · ");
  return FINANCIAL_SERVICE.test(own);
}
