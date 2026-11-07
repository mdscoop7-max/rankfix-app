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

// Quote and appointment submissions are lead generation, even when a template
// calls the form "checkout". Inspect each form/control independently so a real
// shop next to a quote form remains observable.
const LEAD_ACTION = /\b(?:offerte|prijsopgave|afspraak|quote|quotation|appointment|devis|rendez-vous|angebot anfordern|termin|presupuesto|cita|preventivo|appuntamento)\b/i;
// Each form from its opening tag to the first following "</form>", like the
// lazy pattern <form\b[^>]*>[\s\S]*?<\/form\s*>, but in ONE forward pass: the
// lazy pattern re-scanned the rest of the page for every unclosed "<form"
// (quadratic; 10,000 unclosed forms took seconds, scan-matrix redos formOpen).
// Unclosed forms stay unchanged, exactly as the pattern left them.
function replaceForms(html: string, replacer: (form: string) => string): string {
  const open = /<form\b[^>]*>/gi, close = /<\/form\s*>/gi;
  let out = "", last = 0;
  for (let o = open.exec(html); o; o = open.exec(html)) {
    close.lastIndex = o.index + o[0].length;
    const c = close.exec(html);
    if (!c) break; // no "</form>" after this one: no later form can close either
    const end = c.index + c[0].length;
    out += html.slice(last, o.index) + replacer(html.slice(o.index, end));
    last = end; open.lastIndex = end;
  }
  return out + html.slice(last);
}
function purchaseMarkup(html: string): string {
  return replaceForms(String(html || "").slice(0, 3_000_000), form => {
    const controls = [...form.matchAll(/<button\b[^>]*>[\s\S]*?<\/button\s*>|<input\b[^>]*>/gi)]
      .map(m => m[0]).filter(control => !/type\s*=\s*["'](?:text|email|tel|hidden|password|search|number)["']/i.test(control));
    return controls.some(control => LEAD_ACTION.test(control.replace(/<[^>]*>/g, " ")) ||
      LEAD_ACTION.test(control.match(/\b(?:value|aria-label)\s*=\s*["']([^"']*)/i)?.[1] || "")) ? "" : form;
  });
}

/** A checkout destination is a signal, never proof of a working payment flow. */
export function checkoutActionInHtml(html: string): boolean {
  const source = purchaseMarkup(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  for (const match of source.matchAll(/<(a|form)\b[^>]*>/gi)) {
    const target = match[0].match(/\b(?:href|action)\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!target) continue;
    const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 4000);
    const label = match[1].toLowerCase() === "a" ? tail.split(/<\/a\s*>/i, 1)[0].replace(/<[^>]*>/g, " ") : "";
    if (LEAD_ACTION.test(label)) continue;
    try {
      const url = new URL(target.replace(/&amp;/g, "&"), "https://markup.invalid");
      if (!/^https?:$/.test(url.protocol) || /(?:quote|offerte|appointment|afspraak|devis|rendez-vous)/i.test(url.pathname)) continue;
      if (/\/(?:checkout|afrekenen|kassa|kasse|paiement|pagamento|pago)(?:\/|$)/i.test(url.pathname) &&
        !/\/checkout\/cart(?:\/|$)/i.test(url.pathname)) return true;
    } catch { /* malformed targets cannot prove checkout */ }
  }
  return false;
}

/** A purchase control in the markup (not only as visible text). */
export function purchaseActionInHtml(html: string): boolean {
  const source = purchaseMarkup(html);
  return CART_FORM.test(source) || CART_HOOK.test(source) || NAMED_CONTROL.test(source);
}

const CARD_CLASS = String.raw`(?:product[-_]?item|product[-_]?card|product[-_]?tile|plp[-_](?:item|tile|card)|product-list__item|product-miniature|product-thumb|product-grid-item|productitem|grid-product|product-box|productbox|product-list-item|product_item|type-product|card-product|product-teaser)`;
// Start of a product card: any element whose class list contains a card class.
// JavaScript storefronts (React/Vue/Next) often print CSS-module class names
// ("ProductCard_root__x3", "productTile-module__a") or a test hook
// (data-testid="product-card"): the card name is followed by "_" or "-module".
// Microdata product cards (itemtype=schema.org/Product) count as cards as well.
const CARD_START = new RegExp(String.raw`<(?:li|div|article|form|section|a)\b[^>]{0,400}?(?:\bclass\s*=\s*["'][^"']{0,200}?(?<![\w-])${CARD_CLASS}(?![a-z0-9])|\bdata-(?:testid|test-id|test|qa|cy|component)\s*=\s*["'][^"']{0,60}?${CARD_CLASS}(?![a-z0-9])|\bitemtype\s*=\s*["']https?:\/\/schema\.org\/Product["'])`, "gi");
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

/**
 * API, feed and machine endpoints, and downloadable files (a manual PDF below
 * /downloads/products/…, images, archives, documents): never an HTML page for the
 * sample (QA #207; Fresh144 6 Nov: manual PDFs counted as "product links" turned a
 * product page into a category).
 */
export function isApiOrFeedPath(path: string, search = ""): boolean {
  return /\.(?:pdf|zip|rar|7z|gz|tgz|docx?|xlsx?|pptx?|odt|csv|txt|xml|json|jpe?g|png|gif|webp|avif|svg|ico|mp[34]|mov|avi|webm|wav|dwg|dxf|stp|step|stl|exe|dmg|apk|epub)$/i.test(path)
    || /(?:^|\/)(?:wp-json|wp-admin|xmlrpc\.php|graphql|api|rest|feed|feeds|rss|atom|oembed|ajax|wc-api|wc-ajax|_next\/data|__data\.json)(?:\/|$|\.)/i.test(path)
    || /(?:^|[?&])(?:format=(?:json|xml|rss)|output=json|wc-ajax=|rest_route=|feed=)/i.test(search);
}
