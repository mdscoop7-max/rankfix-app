import { neutralizeTemplateBindings, isTemplateHref, isCartActionUrl } from "./template-links.ts";
// Candidate selection for product-detail pages. URL shape only nominates a page;
// a candidate counts as product evidence only after the fetched page itself proves
// it (Product schema, or a commerce action with a price). No platform or brand rules.

const PRODUCT_SEGMENT = /\/(?:product|products|product-page|p|artikel|item|producten|produkte?|produits?|prodotti|prodotto|productos?|produtos?|produkty|tuotteet|termekek|produse)\/[^/]+/i;
// Category/collection archives on every major platform and language:
// WooCommerce product-category bases (product-categorie, produkt-kategorie,
// categorie-produit, categoria-prodotto, …), Shopify /collections/x, plain
// /category/ archives. A Shopify product inside a collection (/collections/x/products/y)
// is a product, not a category.
const CATEGORY_SEGMENT = /\/(?:(?:product|produkt|produit|prodotto|producto|produto|produkty?)[-_]?(?:categor\p{L}*|kategor\p{L}*|cat|tag|merk|brand)|(?:categor\p{L}*|kategor\p{L}*)[-_](?:produits?|prodott[io]|productos?|produtos?|products?|produkte?)|categor\p{L}*|kategor\p{L}*|categoria|collections?|collectie|kollektion|assortiment|catalog\p{L}*|katalog|c)(?:\/|$)/iu;
// Store finders, branch and franchise pages describe the organisation, not a product range.
const STORE_PAGE = /\/(?:winkels|winkelzoeker|winkel-zoeken|winkels-zoeken|filialen|filiale|vestigingen|stores?|store-?locator|storefinder|shops?-?finder|magasins?|negozi|tiendas|lojas|sklepy|prodejny|liikkeet|butiker|franchise\p{L}*|franchisenemer\p{L}*|ondernemer-worden|word-ondernemer|partner-worden|become-a-partner)(?:\/|$)/iu;

// A bare product base without a product slug (/producten/, /products, /shop/) is the shop archive.
const PRODUCT_BASE_ONLY = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:product|products|producten|produkte?|produits?|prodotti|productos?|produtos?|produkty|tuotteet|shop|winkel|webshop|store|assortiment)\/?$/i;

export function looksLikeCategoryPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (PRODUCT_BASE_ONLY.test(path)) return true;
  if (/\/products?\/[^/]+/.test(path) && /\/collections?\//.test(path)) return false;
  return CATEGORY_SEGMENT.test(path);
}

export function looksLikeStorePage(pathname: string): boolean {
  return STORE_PAGE.test(pathname.toLowerCase());
}
// Last path segment: a descriptive slug (3+ words) ending in a product identifier,
// e.g. "...-zwart-372526317", "...-10627553/" or "...-c1182o0bj-q12.html".
const SLUG_WITH_ID = /(?:^|\/)[a-z0-9]+(?:-[a-z0-9]+){2,}-(?:\d{6,}|(?=[a-z0-9]*\d)[a-z0-9]{6,}-[a-z0-9]{2,4})(?:\.html?)?\/?$/i;
// Editorial and date-based URLs often carry numeric IDs too. Press releases and
// news in EU languages (German "artikel" is an article, not a product).
const EDITORIAL = /\/(?:news|nieuws|blog|blogs|magazine|stories|inspiratie|inspiration|ideas|ideeen|reviews?|pers|press|persberichten?|press-?releases?|pressemitteilung(?:en)?|presse|pressroom|newsroom|media-?centre|mediacenter|aktuelles|aktuell|neuigkeiten|nachrichten|actualites?|communiques?(?:-de-presse)?|comunicat[io](?:-stampa)?|notizie|noticias|sala-de-prensa|notas?-de-prensa|uutiset|tiedotteet|nyheter|pressmeddelanden|nyheder|wiadomosci|aktualnosci|aktuality|novinky|hirek|stiri|naujienos|jaunumi|uudised|vesti|novice|vijesti)(?:\/|$)|\/(?:artikel|article|articolo|articulo)\/(?:detail|details|view)\/|\/(?:19|20)\d{2}\/\d{1,2}\//i;
// Events and lectures.
const EVENT = /\/(?:events?|evenementen|evenement|veranstaltung(?:en)?|termine|agenda|eventi|eventos|tapahtumat|evenemang|begivenheder|wydarzenia|akce|rendezvenyek|evenimente|lezingen|kalender|calendar)(?:\/|$)/i;
// Corporate information: about, governance, investors, careers, sustainability.
const CORPORATE = /\/(?:about(?:-us)?|over-ons|over|wie-zijn-wij|company|unternehmen|ueber-uns|uber-uns|entreprise|qui-sommes-nous|azienda|chi-siamo|empresa|quienes-somos|sobre-nosotros|om-oss|om-os|yritys|o-nas|o-firmie|governance|corporate-governance|investors?|investor-relations|ir|board|leadership|management|sustainability|duurzaamheid|nachhaltigkeit|careers?|jobs|vacatures|werken-bij|karriere|carrieres?|lavora-con-noi|trabaja-con-nosotros|working-at-[\w-]+|find-your-job)(?:\/|$)/i;

export function looksLikeEditorialPath(pathname: string): boolean { return EDITORIAL.test(pathname.toLowerCase()); }
export function looksLikeEventPath(pathname: string): boolean { return EVENT.test(pathname.toLowerCase()); }
export function looksLikeCorporatePath(pathname: string): boolean { return CORPORATE.test(pathname.toLowerCase()); }

export function looksLikeProductDetailPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (EDITORIAL.test(path) || STORE_PAGE.test(path) || CORPORATE.test(path)) return false;
  if (looksLikeCategoryPath(path)) return false;
  return PRODUCT_SEGMENT.test(path) || SLUG_WITH_ID.test(path);
}

export function extractProductDetailLinks(html: string, pageUrl: string, siteHost: string, limit = 8): string[] {
  const host = siteHost.toLowerCase().replace(/^www\./, "");
  const found = new Set<string>();
  for (const match of neutralizeTemplateBindings(html).matchAll(/\shref\s*=\s*["']([^"'#]+)["']/gi)) {
    if (isTemplateHref(match[1]) || isCartActionUrl(match[1])) continue;
    let url: URL;
    try { url = new URL(match[1], pageUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.hostname.toLowerCase().replace(/^www\./, "") !== host) continue;
    if (!looksLikeProductDetailPath(url.pathname)) continue;
    url.search = "";
    url.hash = "";
    found.add(url.toString());
    if (found.size >= limit) break;
  }
  return [...found];
}

// Product-detail candidates from a (partial) sitemap document.
export function productUrlsFromSitemap(xml: string, siteHost: string, limit = 8): string[] {
  const host = siteHost.toLowerCase().replace(/^www\./, "");
  const found: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    let url: URL;
    try { url = new URL(match[1].replace(/&amp;/g, "&")); } catch { continue; }
    if (url.hostname.toLowerCase().replace(/^www\./, "") !== host || !looksLikeProductDetailPath(url.pathname)) continue;
    found.push(url.toString());
    if (found.length >= limit) break;
  }
  return found;
}

// For a sitemap index: the child sitemaps, product-named ones first.
export function childSitemapsFromIndex(xml: string): string[] {
  if (!/<sitemapindex\b/i.test(xml)) return [];
  const children = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => !/\.gz(?:$|\?)/i.test(u));
  // Match whole words in the file name; "sitemap" itself contains "item".
  const isProductSitemap = (u: string) => /(?:^|[^a-z])(?:products?|artikel(?:en)?|items?|catalog(?:ue)?)(?:[^a-z]|$)/i.test(u.split("/").pop() || "");
  return [...children.filter(isProductSitemap), ...children.filter((u) => !isProductSitemap(u))];
}
