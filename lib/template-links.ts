/**
 * Template bindings are not links.
 *
 * Front-end frameworks bind link targets at runtime: Alpine/Hyvä (`:href`,
 * `x-bind:href`), Vue (`v-bind:href`), Angular (`[href]`, `ng-href`) and
 * client templates (`{{ url }}`, `${url}`, `<%= url %>`). A plain `href=`
 * regex reads `:href="item.product_url"` as a link and RankFix then requested
 * "/item.product_url" and reported a 404 the visitor can never see (QA #203,
 * Magento/Hyvä shop). Real anchors keep their plain `href` untouched.
 */

/** Renames framework-bound href attributes so href regexes no longer see them. */
export function neutralizeTemplateBindings(html: string): string {
  return String(html || "")
    // :href= / x-bind:href= / v-bind:href= / ng-href= / [href]= / data-bind attr href
    .replace(/(\s)(?:x-bind:|v-bind:|:|ng-|\[)href\]?(\s*=)/gi, "$1data-rf-bound-href$2")
    .replace(/(<template\b[^>]*>)([\s\S]*?)(<\/template>)/gi, (_m, open: string, inner: string, close: string) => open + inner.replace(/(\s)href(\s*=)/gi, "$1data-rf-template-href$2") + close);
}

const FILE_EXTENSION = /\.(?:html?|php\d?|aspx?|jspx?|cfm|cgi|pl|pdf|xml|txt|json|rss|atom|jpe?g|png|gif|svg|webp|avif|ico|css|js|mjs|zip|docx?|xlsx?|pptx?|csv|mp[34]|webm|mov)$/i;
const TEMPLATE_SYNTAX = /\{\{|\}\}|\$\{|<%|%>|\[\[|\]\]|%7B%7B|%7D%7D|\{%|%\}/i;
// "item.product_url", "data.url", "product.link", "row.href": a JavaScript
// member path, not a relative URL. Only paths with an identifier-like object
// and property, no slash and no file extension.
const MEMBER_PATH = /^[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)+$/i;
const TEMPLATE_OBJECTS = /^(?:item|items|data|product|products|row|entry|record|model|vm|this|el|node|link|obj|result|hit|option|post|page|ctx|props|state|self)$/i;

/** True when an href value is an unresolved template expression, not a URL. */
export function isTemplateHref(href: string): boolean {
  const value = String(href || "").trim();
  if (!value) return false;
  if (TEMPLATE_SYNTAX.test(value)) return true;
  if (/^(?:https?:|\/|\.|#|\?|mailto:|tel:)/i.test(value)) return false;
  if (!MEMBER_PATH.test(value) || FILE_EXTENSION.test(value)) return false;
  const [object, ...rest] = value.split(".");
  return TEMPLATE_OBJECTS.test(object) || rest.some((part) => /_|[a-z][A-Z]/.test(part));
}

// Cart actions are links that change state ("?add-to-cart=12", "?add_to_cart=",
// "/cart/add?id="). They are not pages to sample or check.
const ACTION_QUERY = /(?:^|[?&])(?:add-to-cart|add_to_cart|remove_item|removed_item|undo_item|wc-ajax|action=add|addtocart|add-to-wishlist|add_to_wishlist|wishlist_add)(?:=|&|$)/i;
export function isCartActionUrl(url: string): boolean {
  try {
    const u = new URL(url, "https://example.invalid");
    return ACTION_QUERY.test(u.search) || /\/(?:cart|winkelwagen|checkout)\/(?:add|remove|delete)(?:\/|$)/i.test(u.pathname) || /\/checkout\/cart\/add\//i.test(u.pathname);
  } catch { return false; }
}
