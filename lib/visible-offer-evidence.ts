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
  // Global navigation, recommendations and hidden variant text can contain several
  // states, so the product zone (from the H1 up to related/recommended products) is
  // read first; the whole page is only a fallback, and then only for explicit stock
  // phrases (a site-wide "morgen in huis" USP bar says nothing about one product).
  const zone = productZoneText(html);
  const zoneMatches = availabilityMatches(zone, true);
  const zoneStates = statesOf(zoneMatches);
  const pageMatches = availabilityMatches(text, false);
  const useZone = zoneStates.length > 0;
  const visibleAvailabilityMatches = useZone ? zoneMatches : pageMatches;
  const visibleAvailabilityStates: AvailabilityState[] = statesOf(visibleAvailabilityMatches);
  const visibleAvailabilityState = visibleAvailabilityStates.length === 1 ? visibleAvailabilityStates[0] : null;
  const visibleAvailabilityAmbiguous = visibleAvailabilityStates.length > 1;
  const visibleAvailabilityScope: "product_zone" | "page" | "none" = !visibleAvailabilityStates.length ? "none" : useZone ? "product_zone" : "page";
  const visibleAvailabilityPhrases = visibleAvailabilityStates.map((state) => String(visibleAvailabilityMatches[state][0]).trim().toLowerCase());
  const purchaseButton = purchaseButtonState(html);
  return { parseVisiblePrice, explicitProductPriceCandidates, broadVisiblePriceCandidates, nestedPriceSnippets, nestedProductPriceCandidates, markedProductPriceCandidates, visiblePriceCandidates, visiblePriceEvidenceStrength, explicitPriceMarkupText, explicitVisibleCurrencyCodes, pageCurrencyCodes, priceAttachedCurrencyCodes, visibleCurrencyCodes, visibleAvailabilityMatches, visibleAvailabilityStates, visibleAvailabilityState, visibleAvailabilityAmbiguous, visibleAvailabilityScope, visibleAvailabilityPhrases, purchaseButton };
}

// Negated phrases come first and are removed before the positive ones are read:
// "niet op voorraad" also contains "op voorraad", "non disponibile" contains
// "disponibile" (every out-of-stock page used to be ambiguous).
const OUT_OF_STOCK = /\b(niet (?:meer )?op voorraad|tijdelijk niet (?:leverbaar|beschikbaar)|niet (?:meer )?leverbaar|momenteel niet beschikbaar|out of stock|currently unavailable|uitverkocht|sold out|nicht (?:mehr )?(?:auf lager|lieferbar|verfügbar|verfuegbar)|ausverkauft|rupture de stock|épuisé|epuise|indisponible|esaurito|non disponibile|agotado|sin stock|no disponible)\b/gi;
const PREORDER = /\b(pre-?order|vorbestellung|vorbestellen|précommande|precommande|preordine|preventa|reserveer nu)\b/gi;
const BACKORDER = /\b(backorder|nabestelling|wordt nabesteld|lieferrückstand|lieferrueckstand|commande en attente|ordine arretrato|pedido pendiente)\b/gi;
const IN_STOCK = /\b((?:nog \d+ |\d+\+? )?op voorraad|voorradig|direct leverbaar|uit voorraad leverbaar|in stock|auf lager|sofort lieferbar|en stock|disponible imm[ée]diatement|disponibile|disponibilità|disponibilita|en existencia)\b/gi;
// Delivery promises only count next to the product itself (never in a USP bar).
const DELIVERY_PROMISE = /\b(morgen (?:in huis|bezorgd|geleverd)|vandaag (?:nog )?verzonden|vandaag in huis|morgen geliefert|heute versandt|livr[ée] demain|ships today|arrives tomorrow)\b/gi;

function availabilityMatches(source: string, productZone: boolean): Record<AvailabilityState, string[]> {
  const out = source.match(OUT_OF_STOCK) || [];
  const rest = source.replace(OUT_OF_STOCK, " ");
  return {
    out_of_stock: out,
    preorder: rest.match(PREORDER) || [],
    backorder: rest.match(BACKORDER) || [],
    in_stock: [...(rest.match(IN_STOCK) || []), ...(productZone ? rest.match(DELIVERY_PROMISE) || [] : [])],
  };
}
function statesOf(matches: Record<AvailabilityState, string[]>): AvailabilityState[] {
  return (Object.keys(matches) as AvailabilityState[]).filter((state) => matches[state].length > 0);
}

const RELATED_HEADING = /\b(gerelateerde producten|vergelijkbare producten|anderen (?:bekeken|kochten) ook|klanten (?:bekeken|kochten) ook|vaak samen gekocht|combineer met|ook interessant|recent bekeken|related products|similar products|you may also like|customers also (?:bought|viewed)|frequently bought together|recently viewed|ähnliche produkte|das könnte ihnen auch gefallen|kunden kauften auch|produits similaires|vous aimerez aussi|prodotti correlati|potrebbe interessarti|productos relacionados|también te puede gustar)\b/i;
const ZONE_CHARS = 2500;

/** Visible text from the first H1 up to the related/recommended products (bounded). */
export function productZoneText(html: string): string {
  const start = html.search(/<h1\b/i);
  if (start < 0) return "";
  const body = html.slice(start, start + 120_000)
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const text = decodeHtmlEntities(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const cut = text.search(RELATED_HEADING);
  return (cut > 0 ? text.slice(0, cut) : text).slice(0, ZONE_CHARS);
}

const CART_LABEL = /\b(in (?:de )?winkel(?:wagen|mand)(?:je)?|toevoegen aan (?:winkel(?:wagen|mand)|mandje)|in mijn mandje|add to (?:cart|basket|bag)|buy now|koop nu|nu kopen|bestellen|in den warenkorb|warenkorb hinzufügen|jetzt kaufen|ajouter au panier|aggiungi al carrello|añadir al carrito|anadir al carrito|adicionar ao carrinho)\b/i;

/**
 * State of the add-to-cart control in the markup: "enabled" when at least one
 * purchase button is not disabled, "disabled" when every one is, null when none.
 * An enabled button is weak stock evidence: only together with Offer InStock.
 */
export function purchaseButtonState(html: string): "enabled" | "disabled" | null {
  const controls = [
    ...[...html.matchAll(/<button\b([^>]*)>([\s\S]{0,400}?)<\/button>/gi)].map((m) => ({ attrs: m[1], label: m[2] })),
    ...[...html.matchAll(/<input\b([^>]*\btype\s*=\s*["']submit["'][^>]*)>/gi)].map((m) => ({ attrs: m[1], label: "" })),
  ].filter(({ attrs, label }) => {
    const named = [attrs.match(/\b(?:aria-label|title|value)\s*=\s*["']([^"']*)["']/gi)?.join(" ") || "", decodeHtmlEntities(label.replace(/<[^>]+>/g, " "))].join(" ");
    return CART_LABEL.test(named) || /\bname\s*=\s*["']add-to-cart["']|single_add_to_cart_button|product-form__submit|btn-cart|add-to-cart/i.test(attrs);
  });
  if (!controls.length) return null;
  const disabled = (attrs: string) => /\sdisabled(?:\s|=|$)|aria-disabled\s*=\s*["']true["']/i.test(" " + attrs);
  return controls.some(({ attrs }) => !disabled(attrs)) ? "enabled" : "disabled";
}
