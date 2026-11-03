// Visible offer evidence of ONE page (price amounts, price currencies, stock state),
// shared by the scanned page and the representative product pages of the sample
// (4 Nov 2026, webshop evidence chain). Moved unchanged from app/api/scan/route.ts.
import { decodeHtmlEntities } from "./html-entities.ts";

export type AvailabilityState = "out_of_stock" | "preorder" | "backorder" | "in_stock";

/** html: the page HTML; text: its visible text (as the scan route builds it). */
export function visibleOfferEvidence(html: string, text: string) {
  const parseVisiblePrice = (value: string) => {
    const compact = value.replace(/\s/g, "").replace(/[^0-9.,-]/g, "");
    if (!compact) return null;
    const lastDot = compact.lastIndexOf(".");
    const lastComma = compact.lastIndexOf(",");
    const separator = lastDot > lastComma ? "." : lastComma > lastDot ? "," : "";
    let normalized = compact;
    if (separator) {
      const separatorIndex = Math.max(lastDot, lastComma);
      const decimals = compact.length - separatorIndex - 1;
      const other = separator === "." ? "," : ".";
      if (decimals === 3 && !compact.slice(separatorIndex + 1).includes(other)) {
        // 2.699 / 2,699 is a thousands-group price, not 2.69.
        normalized = compact.replace(/[.,]/g, "");
      } else {
        normalized = compact.replace(new RegExp("\\" + other, "g"), "");
        if (separator === ",") normalized = normalized.replace(",", ".");
      }
    }
    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  };
  const explicitProductPriceCandidates = [...new Set(
    [...html.matchAll(/<(?:meta|span|div|p)[^>]*(?:itemprop\s*=\s*["']price["']|property\s*=\s*["']product:price:amount["']|class\s*=\s*["'][^"']*(?:product[-_ ]?price|price)[^"']*["'])[^>]*?(?:content\s*=\s*["']([^"']+)["']|>([^<]{0,80}))/gi)]
      .flatMap((match) => {
        const tag = String(match[0] || "");
        const raw = String(match[1] || match[2] || "");
        const rawPrice = raw.match(/(\d{1,9}(?:[.,]\d{2})?)/)?.[1];
        if (!rawPrice) return [];
        // Schema-style/meta price attributes use a machine-readable decimal value.
        // Visible class text follows locale formatting. Treating "21850" from a
        // content attribute as 21.85 created false product-price mismatches.
        const machineReadable = /(?:itemprop\s*=\s*["']price["']|property\s*=\s*["']product:price:amount["'])/i.test(tag) && /content\s*=/i.test(tag);
        const parsed = machineReadable ? Number(rawPrice.replace(",", ".")) : parseVisiblePrice(rawPrice);
        return parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? [parsed] : [];
      })
  )].slice(0, 20);
  // Broad price evidence is intentionally currency-aware. It remains weaker
  // than explicit product markup, but should not silently exclude non-EUR shops.
  const broadVisiblePriceCandidates = [...new Set(
    [...text.matchAll(/(?:€\s*|£\s*|\$\s*|(?:EUR|GBP|USD)\s*)(\d{1,6}(?:[.,]\d{2})?)/gi)]
      .flatMap((match) => {
        const parsed = parseVisiblePrice(String(match[1]));
        return parsed === null ? [] : [parsed];
      })
  )].slice(0, 20);
  // Platform price markup nests the amount (WooCommerce: <p class="price"><span
  // class="woocommerce-Price-amount"><bdi><span>&euro;</span>&nbsp;13,95</bdi>;
  // Shopify: <span class="price-item price-item--regular">€13,95</span>). Read
  // the text right after a price-classed element, with a currency in it.
  const nestedPriceSnippets: string[] = [];
  const nestedProductPriceCandidates = explicitProductPriceCandidates.length ? [] : [...new Set(
    [...html.matchAll(/<(?:p|span|div|ins|bdi|strong)\b[^>]*class\s*=\s*["'][^"']*(?:woocommerce-Price-amount|price-item|price__regular|price__sale|product[-_ ]?price|\bprice\b)[^"']*["'][^>]*>([\s\S]{0,260})/gi)]
      .flatMap((match) => {
        const snippet = decodeHtmlEntities(String(match[1] || "").replace(/<(?:del|s)\b[\s\S]*?<\/(?:del|s)>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 60);
        const m = snippet.match(/^(?:(?:€|£|\$|EUR|GBP|USD)\s*(\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:€|£|\$|EUR|GBP|USD))/i);
        const parsed = m ? parseVisiblePrice(m[1] || m[2]) : null;
        if (parsed !== null && m) nestedPriceSnippets.push(m[0]);
        return parsed === null ? [] : [parsed];
      })
  )].slice(0, 20);
  const markedProductPriceCandidates = explicitProductPriceCandidates.length ? explicitProductPriceCandidates : nestedProductPriceCandidates;
  const visiblePriceCandidates = markedProductPriceCandidates.length ? markedProductPriceCandidates : broadVisiblePriceCandidates;
  const visiblePriceEvidenceStrength = markedProductPriceCandidates.length ? "explicit_product_markup" : broadVisiblePriceCandidates.length ? "broad_page_text" : "none";
  const explicitPriceMarkupText = explicitProductPriceCandidates.length
    ? [...html.matchAll(/<(?:meta|span|div|p)[^>]*(?:itemprop\s*=\s*["']price["']|property\s*=\s*["']product:price:(?:amount|currency)["']|class\s*=\s*["'][^"']*(?:product[-_ ]?price|price)[^"']*["'])[^>]*?(?:content\s*=\s*["']([^"']+)["']|>([^<]{0,80}))/gi)]
        .map((match) => String(match[0] || "")).join(" ")
    : nestedPriceSnippets.join(" ");
  const explicitVisibleCurrencyCodes = [...new Set([
    ...(explicitPriceMarkupText.match(/\b(?:EUR|GBP|USD)\b/gi) || []).map((value) => value.toUpperCase()),
    ...(explicitPriceMarkupText.includes("€") ? ["EUR"] : []),
    ...(explicitPriceMarkupText.includes("£") ? ["GBP"] : []),
    ...(explicitPriceMarkupText.includes("$") ? ["USD"] : []),
  ])];
  const pageCurrencyCodes = [...new Set([
    ...(text.match(/\b(?:EUR|GBP|USD)\b/gi) || []).map((value) => value.toUpperCase()),
    ...(text.includes("€") ? ["EUR"] : []),
    ...(text.includes("£") ? ["GBP"] : []),
    ...(text.includes("$") ? ["USD"] : []),
  ])];
  // QA #203: a currency counts as a visible PRICE currency only when it is
  // attached to an amount. "United Kingdom (£ GBP)" in a region selector is a
  // choice of market, reported separately, and never a mixed-currency price.
  const currencyCode = (symbol: string) => symbol === "€" ? "EUR" : symbol === "£" ? "GBP" : symbol === "$" ? "USD" : symbol.toUpperCase();
  const priceAttachedCurrencyCodes = [...new Set([...text.matchAll(/(€|£|\$|\b(?:EUR|GBP|USD)\b)\s?\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s?(€|£|\$|\b(?:EUR|GBP|USD)\b)/gi)]
    .map((m) => currencyCode(String(m[1] || m[2] || ""))))];
  const visibleCurrencyCodes = explicitVisibleCurrencyCodes.length ? explicitVisibleCurrencyCodes : priceAttachedCurrencyCodes;
  // Availability must be unambiguous before comparing it with Product/Offer schema.
  // Global navigation, recommendations and hidden variant text can contain several states.
  const visibleAvailabilityMatches = {
    out_of_stock: text.match(/\b(niet op voorraad|out of stock|uitverkocht|sold out|nicht auf lager|ausverkauft|rupture de stock|épuisé|epuise|esaurito|non disponibile|agotado|sin stock|no disponible)\b/gi) || [],
    preorder: text.match(/\b(pre-?order|vorbestellung|précommande|precommande|preordine|preventa)\b/gi) || [],
    backorder: text.match(/\b(backorder|lieferrückstand|lieferrueckstand|commande en attente|ordine arretrato|pedido pendiente)\b/gi) || [],
    in_stock: text.match(/\b(op voorraad|in stock|auf lager|en stock|disponibile|disponibilità|disponibilita)\b/gi) || [],
  };
    const visibleAvailabilityStates: AvailabilityState[] = (Object.keys(visibleAvailabilityMatches) as AvailabilityState[])
    .filter((state) => visibleAvailabilityMatches[state].length > 0);
  const visibleAvailabilityState = visibleAvailabilityStates.length === 1 ? visibleAvailabilityStates[0] : null;
  const visibleAvailabilityAmbiguous = visibleAvailabilityStates.length > 1;
  return { parseVisiblePrice, explicitProductPriceCandidates, broadVisiblePriceCandidates, nestedPriceSnippets, nestedProductPriceCandidates, markedProductPriceCandidates, visiblePriceCandidates, visiblePriceEvidenceStrength, explicitPriceMarkupText, explicitVisibleCurrencyCodes, pageCurrencyCodes, priceAttachedCurrencyCodes, visibleCurrencyCodes, visibleAvailabilityMatches, visibleAvailabilityStates, visibleAvailabilityState, visibleAvailabilityAmbiguous };
}
