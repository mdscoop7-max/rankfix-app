// Product catalogue audit: every product the sitemap lists (bounded), not one sample.
// Product URLs come only from evidence: the sitemap, and product pages or product
// links the scan itself found on the site. No URL is guessed.
// Read-only GET requests; nothing is added to a cart. Per product: reachability,
// Product/Offer data (price, availability) and whether the visible stock state
// matches the data, with the same visible-offer rules as the scanned page.
// Honesty rules: blocked pages, JavaScript shells and products left unchecked by
// the time budget are counted separately and never reported as defects. The
// catalogue result adds no SEO/GEO points.

import { childSitemapsFromIndex, looksLikeCategoryPath, productUrlsFromSitemap } from "./product-links.ts";
import { offerPrice } from "./price.ts";
import { visibleOfferEvidence } from "./visible-offer-evidence.ts";
import { checkoutActionInHtml, purchaseActionInHtml } from "./commerce-markup.ts";

export const CATALOG_LIMIT = 150;
export type StockState = "in_stock" | "out_of_stock" | "preorder" | "backorder";
export type CatalogOutcome = "checked" | "unreachable" | "blocked" | "shell" | "not_product";
export type CatalogIssue = "no_product_data" | "no_price" | "no_availability" | "stock_mismatch" | "unreachable";

export type CatalogProduct = {
  url: string;
  httpStatus: number | null;
  outcome: CatalogOutcome;
  name: string | null;
  price: number | null;
  currency: string | null;
  dataStock: StockState | null;
  visibleStock: StockState | null;
  purchaseAction: boolean;
  issues: CatalogIssue[];
};

export type CatalogCheckout = { url: string | null; httpStatus: number | null; reachable: boolean | null; foundOnProducts: number };

export type CatalogSummary = {
  status: "completed" | "partial" | "not_run";
  reason: string | null;
  discovered: number;
  selected: number;
  checked: number;
  blocked: number;
  shells: number;
  notProducts: number;
  notCheckedBudget: number;
  counts: Record<CatalogIssue, number> & { out_of_stock: number; in_stock: number };
  examples: Partial<Record<CatalogIssue | "out_of_stock", string[]>>;
  checkout: CatalogCheckout | null;
  products: CatalogProduct[];
  /** Where the selected product URLs came from. */
  sources: { sitemap: number; site: number };
};

const stockOf = (value: unknown): StockState | null => {
  const v = typeof value === "string" ? value : "";
  if (/OutOfStock|SoldOut|Discontinued/i.test(v)) return "out_of_stock";
  if (/PreOrder/i.test(v)) return "preorder";
  if (/BackOrder/i.test(v)) return "backorder";
  if (/InStock|LimitedAvailability|OnlineOnly|InStoreOnly/i.test(v)) return "in_stock";
  return null;
};

const typesOf = (value: Record<string, unknown>): string[] => {
  const t = value["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase().replace(/^.*[/#:]/, ""));
};

/** First Product object in the page's JSON-LD (including @graph and nested arrays). */
export function productFromJsonLd(html: string): Record<string, unknown> | null {
  for (const block of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try { parsed = JSON.parse(block[1]); } catch { continue; }
    const queue: unknown[] = [parsed];
    while (queue.length) {
      const value = queue.shift();
      if (Array.isArray(value)) { queue.push(...value); continue; }
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      if (typesOf(record).some((t) => t === "product" || t === "productgroup" || t === "individualproduct")) return record;
      for (const nested of Object.values(record)) if (nested && typeof nested === "object") queue.push(nested);
    }
  }
  return null;
}

const stripText = (html: string) => html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function evaluateProductPage(url: string, httpStatus: number | null, html: string): CatalogProduct {
  const empty = { name: null, price: null, currency: null, dataStock: null, visibleStock: null, purchaseAction: false };
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return { url, httpStatus, outcome: "blocked", ...empty, issues: [] };
  if (httpStatus === null || httpStatus >= 400) return { url, httpStatus, outcome: "unreachable", ...empty, issues: ["unreachable"] };

  const product = productFromJsonLd(html);
  const microdataProduct = /itemtype\s*=\s*["'][^"']*schema\.org\/(?:Product|IndividualProduct|ProductGroup)\b/i.test(html);
  const offers = product ? (Array.isArray(product.offers) ? product.offers[0] : product.offers) as Record<string, unknown> | undefined : undefined;
  const { price, currency } = offerPrice(offers);
  const microAvailability = html.match(/itemprop\s*=\s*["']availability["'][^>]*?(?:href|content)\s*=\s*["']([^"']+)["']/i)?.[1]
    || html.match(/(?:href|content)\s*=\s*["']([^"']*schema\.org\/(?:InStock|OutOfStock|PreOrder|BackOrder|SoldOut)[^"']*)["'][^>]*itemprop\s*=\s*["']availability["']/i)?.[1];
  const dataStock = stockOf(offers?.availability) ?? stockOf(microAvailability);
  const text = stripText(html);
  const visible = visibleOfferEvidence(html, text);
  const visibleStock = !visible.visibleAvailabilityAmbiguous ? (visible.visibleAvailabilityState as StockState | null) ?? null : null;
  const purchaseAction = purchaseActionInHtml(html) || visible.purchaseButton === "enabled";
  const name = typeof product?.name === "string" ? product.name.trim() || null : null;
  const hasProductData = Boolean(product) || microdataProduct;
  const looksLikeProduct = hasProductData || purchaseAction || visible.visiblePriceCandidates.length > 0;

  if (!looksLikeProduct) {
    // Too little text and no data: a JavaScript application that raw HTML cannot judge.
    const words = text.split(" ").filter(Boolean).length;
    return { url, httpStatus, outcome: words < 80 ? "shell" : "not_product", ...empty, issues: [] };
  }
  const issues: CatalogIssue[] = [];
  if (!hasProductData) issues.push("no_product_data");
  if (product && price === null) issues.push("no_price");
  if (hasProductData && !dataStock) issues.push("no_availability");
  if (dataStock && visibleStock && dataStock !== visibleStock) issues.push("stock_mismatch");
  return { url, httpStatus, outcome: "checked", name, price, currency: currency || null, dataStock, visibleStock, purchaseAction, issues };
}

const CART_LINK = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]*(?:\/cart|\/winkelwagen|\/winkelmand|\/checkout|\/afrekenen|\/basket|\/warenkorb|\/panier|\/carrello|\/carrito)(?:[/?][^"']*)?)["']/i;

export function cartLinkFromHtml(html: string, pageUrl: string): string | null {
  const href = html.match(CART_LINK)?.[1];
  if (!href) return null;
  try {
    const url = new URL(href, pageUrl);
    return url.hostname.replace(/^www\./, "") === new URL(pageUrl).hostname.replace(/^www\./, "") ? url.toString() : null;
  } catch { return null; }
}

export function summarizeCatalog(input: { discovered: number; selected: string[]; products: CatalogProduct[]; checkout: CatalogCheckout | null; reason?: string | null; sources?: { sitemap: number; site: number } }): CatalogSummary {
  const counts = { no_product_data: 0, no_price: 0, no_availability: 0, stock_mismatch: 0, unreachable: 0, out_of_stock: 0, in_stock: 0 };
  const examples: CatalogSummary["examples"] = {};
  const add = (key: CatalogIssue | "out_of_stock", url: string) => { const list = (examples[key] ||= []); if (list.length < 5) list.push(url); };
  for (const product of input.products) {
    for (const issue of product.issues) { counts[issue]++; add(issue, product.url); }
    const stock = product.dataStock ?? product.visibleStock;
    if (product.outcome === "checked" && stock === "out_of_stock") { counts.out_of_stock++; add("out_of_stock", product.url); }
    if (product.outcome === "checked" && stock === "in_stock") counts.in_stock++;
  }
  const notCheckedBudget = Math.max(0, input.selected.length - input.products.length);
  const status: CatalogSummary["status"] = input.selected.length === 0 ? "not_run" : notCheckedBudget > 0 ? "partial" : "completed";
  return {
    status,
    reason: input.reason ?? (input.selected.length === 0 ? "Geen productpagina's gevonden in de sitemap of op de onderzochte pagina's." : notCheckedBudget > 0 ? `${notCheckedBudget} product(en) niet gecontroleerd binnen de tijdslimiet.` : null),
    discovered: input.discovered,
    selected: input.selected.length,
    checked: input.products.filter((p) => p.outcome === "checked").length,
    blocked: input.products.filter((p) => p.outcome === "blocked").length,
    shells: input.products.filter((p) => p.outcome === "shell").length,
    notProducts: input.products.filter((p) => p.outcome === "not_product").length,
    notCheckedBudget,
    counts,
    examples,
    checkout: input.checkout,
    products: input.products,
    sources: input.sources ?? { sitemap: input.discovered, site: 0 },
  };
}

export type CatalogFetch = (url: string, timeoutMs: number) => Promise<{ status: number; text: string; finalUrl?: string }>;

const parentDir = (pathname: string) => pathname.replace(/\/+$/, "").replace(/\/[^/]*$/, "/");

/**
 * Sitemap URLs in the same directory as a product page the scan proved (e.g.
 * /gadgets/ when /gadgets/oordopjes is a confirmed product). Many shops use plain
 * category slugs that the generic product-path rule cannot recognise. Each URL is
 * still fetched and judged on its own page; non-products are counted, not reported.
 */
export function sitemapUrlsBesideProducts(xml: string, siteHost: string, provenProductUrls: string[], limit = 5000): string[] {
  const host = siteHost.toLowerCase().replace(/^www\./, "");
  const dirs = new Set<string>();
  for (const u of provenProductUrls) {
    try { const d = parentDir(new URL(u).pathname); if (d !== "/") dirs.add(d); } catch { /* skip */ }
  }
  if (!dirs.size) return [];
  const found: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    let url: URL;
    try { url = new URL(match[1].replace(/&amp;/g, "&")); } catch { continue; }
    if (url.hostname.toLowerCase().replace(/^www\./, "") !== host) continue;
    const path = url.pathname.replace(/\/+$/, "");
    if (!dirs.has(parentDir(path)) || looksLikeCategoryPath(path)) continue;
    found.push(url.toString());
    if (found.length >= limit) break;
  }
  return found;
}

/** Discover product URLs from robots.txt sitemaps, /sitemap.xml and sitemap indexes. */
export async function discoverProductUrls(siteUrl: string, fetchText: CatalogFetch, options: { maxSitemaps?: number; timeoutMs?: number; provenProductUrls?: string[] } = {}): Promise<string[]> {
  const site = new URL(siteUrl);
  const host = site.hostname;
  const timeoutMs = options.timeoutMs ?? 6000;
  const maxSitemaps = options.maxSitemaps ?? 8;
  const queue: string[] = [];
  try {
    const robots = await fetchText(new URL("/robots.txt", site).toString(), timeoutMs);
    if (robots.status < 400) for (const m of robots.text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)) queue.push(m[1]);
  } catch { /* robots.txt is optional */ }
  if (!queue.length) queue.push(new URL("/sitemap.xml", site).toString());
  const seenSitemaps = new Set<string>();
  const found = new Set<string>();
  let read = 0;
  while (queue.length && read < maxSitemaps) {
    const next = queue.shift()!;
    if (seenSitemaps.has(next)) continue;
    seenSitemaps.add(next);
    let xml = "";
    try { const res = await fetchText(next, timeoutMs); if (res.status >= 400) continue; xml = res.text; } catch { continue; }
    read++;
    const children = childSitemapsFromIndex(xml);
    if (children.length) { queue.unshift(...children.filter((c) => !seenSitemaps.has(c))); continue; }
    for (const url of productUrlsFromSitemap(xml, host, 5000)) found.add(url);
    for (const url of sitemapUrlsBesideProducts(xml, host, options.provenProductUrls || [])) found.add(url);
  }
  return [...found];
}

export async function auditProductCatalog(input: {
  siteUrl: string;
  fetchText: CatalogFetch;
  limit?: number;
  concurrency?: number;
  budgetMs: number;
  now?: () => number;
  /** Product pages and product links the scan itself found on the site (evidence, never guessed). */
  provenProductUrls?: string[];
}): Promise<CatalogSummary> {
  const now = input.now ?? Date.now;
  const started = now();
  const deadline = started + Math.max(0, input.budgetMs);
  const limit = input.limit ?? CATALOG_LIMIT;
  const siteHost = new URL(input.siteUrl).hostname.replace(/^www\./, "");
  const normal = (u: string) => { try { const x = new URL(u); x.hash = ""; return x.toString().replace(/\/$/, ""); } catch { return null; } };
  const proven = [...new Set((input.provenProductUrls || []).filter((u) => { try { return new URL(u).hostname.replace(/^www\./, "") === siteHost; } catch { return false; } }))];
  let fromSitemap: string[] = [];
  try { fromSitemap = await discoverProductUrls(input.siteUrl, input.fetchText, { timeoutMs: Math.min(6000, Math.max(1000, deadline - now())), provenProductUrls: proven }); }
  catch { fromSitemap = []; }
  const seen = new Set(fromSitemap.map(normal));
  const siteOnly = proven.filter((u) => !seen.has(normal(u)));
  // Pages the scan found first, so they are always within the per-scan limit.
  const discovered = [...siteOnly, ...fromSitemap];
  const selected = discovered.slice(0, limit);
  const results: Array<CatalogProduct | undefined> = new Array(selected.length);
  const htmlByIndex: string[] = [];
  let next = 0;
  // A site that answers 429 asks for fewer requests: stop at once, never retry.
  let rateLimited = false;
  const worker = async () => {
    while (!rateLimited && next < selected.length && now() < deadline - 1500) {
      const index = next++;
      const url = selected[index];
      try {
        const res = await input.fetchText(url, Math.min(8000, Math.max(1000, deadline - now())));
        if (res.status === 429) rateLimited = true;
        results[index] = evaluateProductPage(url, res.status, res.text);
        htmlByIndex[index] = res.status < 400 ? res.text : "";
      } catch {
        results[index] = evaluateProductPage(url, null, "");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 6, Math.max(1, selected.length)) }, worker));
  const products = results.filter((p): p is CatalogProduct => Boolean(p));

  // Checkout: the cart/checkout link the product pages expose, fetched once (GET only).
  let checkout: CatalogCheckout | null = null;
  const checkedIndexes = results.map((p, i) => (p?.outcome === "checked" ? i : -1)).filter((i) => i >= 0);
  if (checkedIndexes.length) {
    const withCheckout = checkedIndexes.filter((i) => checkoutActionInHtml(htmlByIndex[i] || "") || Boolean(cartLinkFromHtml(htmlByIndex[i] || "", selected[i])));
    const cartUrl = checkedIndexes.map((i) => cartLinkFromHtml(htmlByIndex[i] || "", selected[i])).find(Boolean) || null;
    checkout = { url: cartUrl, httpStatus: null, reachable: null, foundOnProducts: withCheckout.length };
    if (cartUrl && !rateLimited && now() < deadline - 1000) {
      try {
        const res = await input.fetchText(cartUrl, Math.min(6000, Math.max(1000, deadline - now())));
        checkout.httpStatus = res.status;
        checkout.reachable = res.status === 401 || res.status === 403 || res.status === 429 ? null : res.status < 400;
      } catch { checkout.reachable = null; }
    }
  }
  return summarizeCatalog({ discovered: discovered.length, selected, products, checkout, sources: { sitemap: fromSitemap.length, site: siteOnly.length },
    reason: rateLimited ? "De website beperkte het aantal verzoeken (HTTP 429); RankFix heeft de productcontrole daarom gestopt. Geen bewijs van een fout." : undefined });
}

/** One-line Dutch summary for the report. */
export function catalogSentence(summary: CatalogSummary | null | undefined): string {
  if (!summary) return "Productcatalogus niet gecontroleerd.";
  if (summary.status === "not_run") return summary.reason || "Productcatalogus niet gecontroleerd.";
  const src = summary.sources ?? { sitemap: summary.discovered, site: 0 };
  const parts = [src.site && src.sitemap ? `${summary.checked} van ${summary.discovered} producten gecontroleerd (${src.sitemap} uit de sitemap, ${src.site} via links op de site)`
    : src.site ? `${summary.checked} van ${summary.discovered} producten gecontroleerd (gevonden via links op de site; de sitemap gaf geen productpagina's)`
    : `${summary.checked} van ${summary.discovered} producten uit de sitemap gecontroleerd`];
  if (summary.selected < summary.discovered) parts.push(`maximaal ${summary.selected} per scan`);
  if (summary.notCheckedBudget) parts.push(`${summary.notCheckedBudget} niet gecontroleerd binnen de tijdslimiet`);
  if (summary.blocked) parts.push(`${summary.blocked} geblokkeerd voor de scanner`);
  if (summary.shells) parts.push(`${summary.shells} alleen met JavaScript leesbaar`);
  return `${parts.join("; ")}.`;
}
