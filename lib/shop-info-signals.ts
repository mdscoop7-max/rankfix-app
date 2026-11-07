// Shop information a customer can read before ordering: shipping, payment methods
// and returns. Read from any audited same-site page (support, terms, footer),
// never by placing an order. Text evidence only; no flow is executed.
// NUVEMIXA/bonprix (6 Nov): these stayed "niet te bevestigen" because only the
// scanned page itself was read, while support and terms pages were sampled.

const SHIPPING = /(?<![\p{L}])(?:verzendkosten|verzending|verzendtijd|levertijd|bezorging|bezorgkosten|gratis verzending|shipping(?: costs?| information| times?)?|delivery (?:costs?|times?|information)|free delivery|versandkosten|versand|lieferzeit|frais de (?:port|livraison)|livraison|spese di spedizione|spedizione|gastos de envío|envío)(?![\p{L}])/iu;
const PAYMENT = /(?<![\p{L}])(?:ideal|visa|mastercard|maestro|american express|amex|bancontact|klarna|paypal|apple pay|google pay|achteraf betalen|betaalmethoden|betaalmogelijkheden|payment methods?|zahlungsarten|modes de paiement|metodi di pagamento|métodos de pago|sofort|giropay|riverty|in3)(?![\p{L}])/iu;
const RETURNS = /(?<![\p{L}])(?:retourneren|retouren|retourbeleid|retourzending|herroepingsrecht|bedenktijd|returns? policy|returns|refunds?|rücksendung|rückgabe|widerrufsrecht|droit de rétractation|retours?|resi|diritto di recesso|devoluciones|derecho de desistimiento)(?![\p{L}])/iu;

export type ShopInfoSignals = { shipping: boolean; payment: boolean; returns: boolean };

export function shopInfoSignals(text: string): ShopInfoSignals {
  const t = String(text || "");
  return { shipping: SHIPPING.test(t), payment: PAYMENT.test(t), returns: RETURNS.test(t) };
}

export type ShopInfoPage = { url: string; status: string; shopInfo?: ShopInfoSignals | null };

/** Which audited pages show shipping, payment and returns information (first URL each). */
export function sitewideShopInfo(pages: ShopInfoPage[]): { shipping: string | null; payment: string | null; returns: string | null } {
  const audited = pages.filter((p) => p.status === "audited" && p.shopInfo);
  const first = (key: keyof ShopInfoSignals) => audited.find((p) => p.shopInfo![key])?.url || null;
  return { shipping: first("shipping"), payment: first("payment"), returns: first("returns") };
}
