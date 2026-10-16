// Machine-readable prices from Product/Offer structured data.
// A missing price (null, undefined, "", whitespace, non-numeric text) is NOT a
// price of 0: Number(null) and Number("") are 0 in JavaScript, which produced
// false "visible €13,95 vs structured €0" mismatches. A real 0 stays 0.

/** Parses one structured price value; null when no price is stated. */
export function parseStructuredPrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/\s+/g, "").replace(/^(?:EUR|USD|GBP|CHF|SEK|DKK|NOK|PLN|CZK|HUF|RON|BGN)|[€$£]/i, "").replace(/(?:EUR|USD|GBP|CHF|SEK|DKK|NOK|PLN|CZK|HUF|RON|BGN)$|[€$£]$/i, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // 1.299,95 or 1,299.95: the last separator is the decimal one.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = /,\d{3}$/.test(s) && (s.match(/,/g) || []).length >= 1 && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

type AnyOffer = Record<string, unknown> | null | undefined;
const asList = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : v ? [v] : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");

/** Price and currency of one Offer/AggregateOffer, including WooCommerce-style priceSpecification. */
export function offerPrice(offer: AnyOffer): { price: number | null; highPrice: number | null; currency: string } {
  const specs = asList(offer?.priceSpecification);
  const firstSpecPrice = specs.map((spec) => parseStructuredPrice(spec.price)).find((p) => p !== null) ?? null;
  const price = parseStructuredPrice(offer?.price) ?? parseStructuredPrice(offer?.lowPrice) ?? firstSpecPrice;
  const currencyRaw = offer?.priceCurrency ?? specs.find((spec) => typeof spec.priceCurrency === "string")?.priceCurrency;
  return { price, highPrice: parseStructuredPrice(offer?.highPrice), currency: typeof currencyRaw === "string" ? currencyRaw.trim().toUpperCase() : "" };
}
