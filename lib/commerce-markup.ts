/**
 * Shop markup that is not visible as text (QA commerce 72/72, 26 Oct 2026).
 *
 * Real storefronts print their buy buttons and product grids in ways a text
 * search misses:
 *   - an icon-only buy button whose name is only in aria-label/title
 *     ("In Winkelwagen Aluminium Koffer", Magento Hyvä), data-addto="cart",
 *     WooCommerce `name="add-to-cart"`, OpenCart `cart.add(...)`;
 *   - a product card that is itself an add-to-cart <form> posting to
 *     /checkout/cart/add/... (Magento), or a list item whose product link sits
 *     several kilobytes after the card start (filters, compare widgets);
 *   - product URLs without any /product/ segment ("/aluminium-koffer-alu-eco-1",
 *     "/smith-payroll-mips-fietshelm/").
 * Pure functions, linear regexes only; no site or platform name rules.
 */

const CART_PHRASES = String.raw`(?:add(?:\s|&#x20;|&nbsp;)+to(?:\s|&#x20;|&nbsp;)+(?:cart|bag|basket)|in(?:\s|&#x20;|&nbsp;)+(?:de\s+|het\s+|mijn\s+)?(?:winkelwagen|winkelmand|mandje|winkelmandje)|toevoegen(?:\s|&#x20;)+aan(?:\s|&#x20;)+(?:winkelwagen|winkelmand|mandje)|in(?:\s|&#x20;)+den(?:\s|&#x20;)+warenkorb|ajouter(?:\s|&#x20;)+au(?:\s|&#x20;)+panier|aggiungi(?:\s|&#x20;)+al(?:\s|&#x20;)+carrello|a[ñn]adir(?:\s|&#x20;)+al(?:\s|&#x20;)+carrito|adicionar(?:\s|&#x20;)+ao(?:\s|&#x20;)+carrinho|l[äa]gg(?:\s|&#x20;)+i(?:\s|&#x20;)+varukorgen|dodaj(?:\s|&#x20;)+do(?:\s|&#x20;)+koszyka)`;
// "Buy now" / "Jetzt kaufen" also label SaaS plans and tickets: not a cart by itself.
// The name of a control: aria-label, title or value on a button/input/a.
const NAMED_CONTROL = new RegExp(String.raw`<(?:button|input|a)\b[^>]{0,600}?\b(?:aria-label|title|value)\s*=\s*["'][^"']{0,40}?${CART_PHRASES}`, "i");
// Machine hooks that only exist on a real purchase control or form.
const CART_HOOK = /\bdata-addto\s*=\s*["']cart["']|\bname\s*=\s*["']add-to-cart["']|\bdata-(?:button-)?action\s*=\s*["']add-to-cart["']|\bclass\s*=\s*["'][^"']{0,200}?(?<![\w-])(?:single_add_to_cart_button|ajax_add_to_cart|add_to_cart_button|action\s+tocart|btn-cart|add-to-cart(?:-button)?|addtocart(?:-button)?|product-form__submit|button--add-to-cart)(?![\w-])|\bonclick\s*=\s*["']\s*cart\.add\(/i;
// A form that posts to a cart-add endpoint (Magento, Shopify, PrestaShop, generic).
const CART_FORM = /<form\b[^>]{0,400}?\baction\s*=\s*["'][^"']{0,300}?(?:\/checkout\/cart\/add\b|\/cart\/add\b|[?&]add-to-cart=|\/panier\b|\/winkelwagen\/(?:toevoegen|add)\b|\/basket\/add\b|route=checkout\/cart\/add)/i;

/** A purchase control in the markup (not only as visible text). */
export function purchaseActionInHtml(html: string): boolean {
  const source = String(html || "").slice(0, 3_000_000);
  return CART_FORM.test(source) || CART_HOOK.test(source) || NAMED_CONTROL.test(source);
}

const CARD_CLASS = String.raw`(?:product-item|product-card|product-tile|product-miniature|product-thumb|product-grid-item|productitem|grid-product|product-box|productbox|product-list-item|product_item|type-product|card-product|product-teaser)`;
// Start of a product card: any element whose class list contains a card class.
const CARD_START = new RegExp(String.raw`<(?:li|div|article|form|section)\b[^>]{0,400}?\bclass\s*=\s*["'][^"']{0,200}?(?<![\w-])${CARD_CLASS}(?![\w])`, "gi");
// A link that names itself a product link by class.
const PRODUCT_LINK_CLASS = /<a\b[^>]{0,400}?\bclass\s*=\s*["'][^"']{0,200}?(?<![\w-])(?:product-link|product-item-link|product-title-link|product-name|product__link|product-card__link|product-tile__link|card__link|full-unstyled-link|woocommerce-LoopProduct-link|product_img_link|product-thumbnail)(?![\w-])[^>]*>/gi;
const HREF = /\shref\s*=\s*["']([^"'#]+)["']/i;

function sameSiteUrl(href: string, pageUrl: string, host: string): string | null {
  try {
    const url = new URL(href.replace(/&amp;/g, "&"), pageUrl);
    if (!/^https?:$/.test(url.protocol) || url.hostname.toLowerCase().replace(/^www\./, "") !== host) return null;
    // Template expressions and cart actions are never product pages.
    if (isApiOrFeedPath(url.pathname, url.search)) return null;
    if (/\{\{|\$\{|%7B|(?:^|\/)item\.[a-z_]+$|\/(?:cart|checkout|winkelwagen|panier|basket)(?:\/|$)|[?&](?:add-to-cart|add_to_cart)=/i.test(url.pathname + url.search)) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

/**
 * Product-detail links taken from product cards and self-declared product links.
 * Structure decides, not the URL shape. Search is bounded per card.
 */
export function productCardLinks(html: string, pageUrl: string, siteHost: string, limit = 24): string[] {
  const source = String(html || "").slice(0, 4_000_000);
  const host = String(siteHost || "").toLowerCase().replace(/^www\./, "");
  const found = new Set<string>();
  const add = (href: string | undefined) => { if (!href) return; const u = sameSiteUrl(href, pageUrl, host); if (u && u.replace(/\/$/, "") !== pageUrl.replace(/\/$/, "")) found.add(u); };
  for (const m of source.matchAll(PRODUCT_LINK_CLASS)) { add(m[0].match(HREF)?.[1]); if (found.size >= limit) return [...found]; }
  for (const m of source.matchAll(CARD_START)) {
    const window = source.slice(m.index!, m.index! + 8000);
    const anchor = window.match(/<a\b[^>]*?\shref\s*=\s*["']([^"'#]+)["']/i);
    add(anchor?.[1]);
    if (found.size >= limit) break;
  }
  return [...found];
}

/** Count of visible amounts with a euro/pound/dollar sign in page TEXT (whole page, bounded). */
export function priceSignalCount(text: string): number {
  const source = String(text || "").slice(0, 400_000);
  return (source.match(/(?:€|EUR\b|£|GBP\b)\s*\d{1,5}(?:[.,]\d{3})*(?:[.,](?:\d{2}|-{1,2}))?|\d{1,5}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*(?:€|EUR\b)/gi) || []).length;
}

/** API, feed and machine endpoints: never an HTML page for the sample (QA #207). */
export function isApiOrFeedPath(path: string, search = ""): boolean {
  return /(?:^|\/)(?:wp-json|wp-admin|xmlrpc\.php|graphql|api|rest|feed|feeds|rss|atom|oembed|ajax|wc-api|wc-ajax|_next\/data|__data\.json)(?:\/|$|\.)/i.test(path)
    || /(?:^|[?&])(?:format=(?:json|xml|rss)|output=json|wc-ajax=|rest_route=|feed=)/i.test(search);
}
