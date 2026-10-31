/**
 * Hard, language-independent evidence that a site operates its own store:
 * a cart link or cart API, an add-to-cart button, price + currency + order button,
 * and payment-method logos. Text mentions of "shop" or "checkout" do not count.
 * Applies to every sector; a payment provider's marketing copy contains none of
 * these store signals, a tyre/garage/hardware business with a cart does.
 */
export type HardCommerceSignals = {
  cartLink: boolean;
  cartApi: boolean;
  addToCartButton: boolean;
  priceWithOrderButton: boolean;
  paymentLogos: boolean;
  /** Number of distinct signal kinds present. */
  count: number;
  /** Cart link/API together with at least one purchase or payment signal. */
  storefrontProven: boolean;
};

const CART_PATH = /(?:^|\/)(?:winkelwagen|winkelwagentje|winkelmand|shoppingcart|shopping-cart|cart|basket|warenkorb|panier|carrello|carrito|cesta|koszyk|kosik)(?:\/|\?|#|$)/i;
const CART_API = /\/webshopapi\b|\/api\/(?:cart|basket|checkout)\b|\/cart\.js\b|\/cart\/(?:add|update|change)\b|wc-ajax=(?:add_to_cart|get_refreshed_fragments)|\/basket\/add\b|\/checkout\/cart\b|\/shoppingcart\/(?:add|items|count)/i;
const ADD_TO_CART_TEXT = /(?:in\s+(?:de\s+|mijn\s+|het\s+)?winkel(?:wagen|mand)|toevoegen\s+aan\s+(?:de\s+)?winkel(?:wagen|mand)|add\s+to\s+(?:cart|basket|bag)|in\s+den\s+warenkorb|in\s+(?:den\s+)?warenkorb\s+legen|ajouter\s+au\s+panier|aggiungi\s+al\s+carrello|a[ñn]adir\s+al\s+(?:carrito|cesta)|dodaj\s+do\s+koszyka)/i;
const ORDER_TEXT = /(?:bestel(?:\s+nu)?|kopen|koop\s+nu|in\s+winkelwagen|buy\s+now|order\s+now|add\s+to\s+cart|jetzt\s+kaufen|bestellen|acheter|commander|acquista|compra\s+ora|comprar|zamów)/i;
const PRICE = /(?:€|eur(?:o)?\s?|£|gbp\s?|\$|usd\s?|chf\s?|kr\.?\s?|zł\s?)\s?\d{1,6}(?:[.,]\d{1,2})?(?:[.,-]{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s?(?:€|eur|euro|£|kr|zł|chf)\b/i;
const PAYMENT_METHODS = ["ideal", "bancontact", "visa", "mastercard", "maestro", "paypal", "klarna", "afterpay", "riverty", "apple pay", "apple-pay", "google pay", "american express", "amex", "sofort", "giropay", "twint", "blik", "przelewy24", "eps", "sepa", "in3", "billink", "trustly", "mobilepay", "vipps", "swish"];

function visibleClickableText(html: string): string[] {
  const texts: string[] = [];
  for (const match of html.matchAll(/<(?:button|a)\b[^>]*>([\s\S]{0,300}?)<\/(?:button|a)>/gi)) texts.push(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  for (const match of html.matchAll(/<input\b[^>]*\bvalue\s*=\s*["']([^"']{2,60})["'][^>]*>/gi)) texts.push(match[1]);
  return texts.filter(Boolean);
}

export function detectHardCommerceSignals(html: string): HardCommerceSignals {
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const clickable = visibleClickableText(html);

  const cartLink = hrefs.some((href) => {
    try { return CART_PATH.test(new URL(href, "https://x.invalid").pathname); } catch { return false; }
  }) || clickable.some((text) => /^(?:winkelwagen|winkelmand|shopping\s*cart|cart|basket|warenkorb|panier|carrello|carrito)(?:\s*\(?\d+\)?)?$/i.test(text));
  const cartApi = CART_API.test(html);
  const addToCartButton = clickable.some((text) => text.length <= 60 && ADD_TO_CART_TEXT.test(text)) || /data-(?:add-to-cart|action="add-to-cart"|product-add)/i.test(html);
  const orderButtons = clickable.some((text) => text.length <= 40 && ORDER_TEXT.test(text));
  const priceWithOrderButton = orderButtons && PRICE.test(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "));

  const imageHints = [...html.matchAll(/<(?:img|source|svg|use)\b[^>]*>/gi)].map((match) => match[0].toLowerCase());
  const classHints = [...html.matchAll(/\bclass\s*=\s*["']([^"']*(?:payment|betaal|pay-?method|paymentmethods)[^"']*)["']/gi)].map((match) => match[1].toLowerCase());
  const logoBlob = imageHints.join(" ") + " " + classHints.join(" ");
  const paymentMethodsFound = PAYMENT_METHODS.filter((method) => new RegExp(`(?:alt|title|src|href|aria-label|class|id)\\s*=\\s*["'][^"']*${method.replace(/[-\s]/g, "[-\\s_]?")}`, "i").test(logoBlob) || logoBlob.includes(method));
  const paymentLogos = new Set(paymentMethodsFound).size >= 2;

  const flags = [cartLink, cartApi, addToCartButton, priceWithOrderButton, paymentLogos];
  const count = flags.filter(Boolean).length;
  const storefrontProven = (cartLink || cartApi) && (addToCartButton || priceWithOrderButton || paymentLogos);
  return { cartLink, cartApi, addToCartButton, priceWithOrderButton, paymentLogos, count, storefrontProven };
}
