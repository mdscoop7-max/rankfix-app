import test from "node:test";
import assert from "node:assert/strict";
import { auditProductCatalog, catalogSentence, discoverProductUrls, evaluateProductPage } from "../lib/product-catalog-audit.ts";

const ld = (product) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...product })}</script>`;
const page = (body) => `<html><head><title>Product</title></head><body><header><a href="/winkelwagen">Winkelwagen</a></header><main>${body}</main></body></html>`;
const offer = (availability, price = "19.95") => ({ "@type": "Offer", price, priceCurrency: "EUR", availability: `https://schema.org/${availability}` });
const SHOP = "https://shop.example.nl";
const pages = {
  "/robots.txt": [200, `User-agent: *\nSitemap: ${SHOP}/sitemap_index.xml`],
  "/sitemap_index.xml": [200, `<sitemapindex><sitemap><loc>${SHOP}/page-sitemap.xml</loc></sitemap><sitemap><loc>${SHOP}/product-sitemap.xml</loc></sitemap></sitemapindex>`],
  "/page-sitemap.xml": [200, `<urlset><url><loc>${SHOP}/over-ons</loc></url><url><loc>${SHOP}/contact</loc></url></urlset>`],
  "/product-sitemap.xml": [200, `<urlset>${["ok", "uitverkocht", "tegenstrijdig", "zonder-prijs", "zonder-data", "weg", "geblokkeerd", "shell"].map((p) => `<url><loc>${SHOP}/product/${p}</loc></url>`).join("")}</urlset>`],
  "/product/ok": [200, page(`${ld({ "@type": "Product", name: "Mok", offers: offer("InStock") })}<h1>Mok</h1><p class="price">€ 19,95</p><p class="stock">Op voorraad</p><button name="add-to-cart">In winkelwagen</button>`)],
  "/product/uitverkocht": [200, page(`${ld({ "@type": "Product", name: "Bord", offers: offer("OutOfStock") })}<h1>Bord</h1><p class="price">€ 19,95</p><p class="stock">Uitverkocht</p>`)],
  "/product/tegenstrijdig": [200, page(`${ld({ "@type": "Product", name: "Kom", offers: offer("InStock") })}<h1>Kom</h1><p class="price">€ 19,95</p><p class="stock">Niet op voorraad</p><button name="add-to-cart" disabled>In winkelwagen</button>`)],
  "/product/zonder-prijs": [200, page(`${ld({ "@type": "Product", name: "Glas", offers: { "@type": "Offer" } })}<h1>Glas</h1><button name="add-to-cart">In winkelwagen</button>`)],
  "/product/zonder-data": [200, page(`<h1>Vaas</h1><p class="price">€ 24,95</p><button name="add-to-cart">In winkelwagen</button>`)],
  "/product/weg": [404, page("<h1>Niet gevonden</h1>")],
  "/product/geblokkeerd": [403, "Forbidden"],
  "/product/shell": [200, `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`],
  "/winkelwagen": [200, page("<h1>Winkelwagen</h1>")],
};
const requested = [];
const fetchText = async (url) => {
  requested.push(url);
  const entry = pages[new URL(url).pathname];
  if (!entry) return { status: 404, text: "" };
  return { status: entry[0], text: entry[1] };
};

test("catalogue: discovers product URLs through robots.txt and the sitemap index", async () => {
  const urls = await discoverProductUrls(SHOP + "/", fetchText);
  assert.equal(urls.length, 8);
  assert.ok(urls.every((u) => u.includes("/product/")));
  // Without robots.txt it falls back to /sitemap.xml.
  const fallback = await discoverProductUrls(SHOP + "/", async (url) => new URL(url).pathname === "/sitemap.xml" ? { status: 200, text: `<urlset><url><loc>${SHOP}/product/x</loc></url></urlset>` } : { status: 404, text: "" });
  assert.deepEqual(fallback, [`${SHOP}/product/x`]);
});

test("catalogue: every product is checked and each outcome is counted honestly", async () => {
  const summary = await auditProductCatalog({ siteUrl: SHOP + "/", fetchText, budgetMs: 60_000 });
  assert.equal(summary.status, "completed");
  assert.deepEqual([summary.discovered, summary.selected, summary.checked, summary.blocked, summary.shells], [8, 8, 5, 1, 1]);
  assert.deepEqual(summary.counts, { no_product_data: 1, no_price: 1, no_availability: 1, stock_mismatch: 1, unreachable: 1, out_of_stock: 1, in_stock: 2 });
  assert.deepEqual(summary.examples.stock_mismatch, [`${SHOP}/product/tegenstrijdig`]);
  assert.deepEqual(summary.examples.unreachable, [`${SHOP}/product/weg`]);
  // Blocked and shell pages are not defects.
  const byUrl = Object.fromEntries(summary.products.map((p) => [p.url.split("/").pop(), p]));
  assert.deepEqual(byUrl.geblokkeerd.issues, []);
  assert.deepEqual(byUrl.shell.issues, []);
  // Checkout: the cart link found on product pages is reachable (GET only).
  assert.deepEqual(summary.checkout, { url: `${SHOP}/winkelwagen`, httpStatus: 200, reachable: true, foundOnProducts: 5 });
  assert.match(catalogSentence(summary), /^5 van 8 producten uit de sitemap gecontroleerd; 1 geblokkeerd voor de scanner; 1 alleen met JavaScript leesbaar\.$/);
});

test("catalogue: the time budget is respected and unchecked products are reported, not guessed", async () => {
  let clock = 0;
  const slow = async (url) => { clock += new URL(url).pathname.startsWith("/product/") ? 4000 : 10; return fetchText(url); };
  const summary = await auditProductCatalog({ siteUrl: SHOP + "/", fetchText: slow, budgetMs: 12_000, concurrency: 1, now: () => clock });
  assert.equal(summary.status, "partial");
  assert.ok(summary.notCheckedBudget > 0 && summary.notCheckedBudget < 8);
  assert.match(summary.reason, /niet gecontroleerd binnen de tijdslimiet/);
  assert.equal(summary.products.length + summary.notCheckedBudget, summary.selected);
});

test("catalogue: the limit bounds the work and is stated in the summary", async () => {
  const summary = await auditProductCatalog({ siteUrl: SHOP + "/", fetchText, budgetMs: 60_000, limit: 3 });
  assert.deepEqual([summary.discovered, summary.selected, summary.status], [8, 3, "completed"]);
  assert.match(catalogSentence(summary), /van 8 producten uit de sitemap gecontroleerd; maximaal 3 per scan/);
});

test("catalogue: no products in the sitemap means not run, never zero problems", async () => {
  const summary = await auditProductCatalog({ siteUrl: SHOP + "/", fetchText: async () => ({ status: 404, text: "" }), budgetMs: 10_000 });
  assert.equal(summary.status, "not_run");
  assert.equal(catalogSentence(summary), "Geen productpagina's in de sitemap gevonden.");
});

test("catalogue: product evaluation reads JSON-LD @graph, microdata and visible stock", () => {
  const graph = page(`<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Product"],"name":"Lamp","offers":[{"@type":"Offer","price":"9,95","priceCurrency":"EUR","availability":"InStock"}]}]}</script><p>Op voorraad</p>`);
  const result = evaluateProductPage(`${SHOP}/product/lamp`, 200, graph);
  assert.deepEqual([result.outcome, result.name, result.price, result.currency, result.dataStock, result.issues], ["checked", "Lamp", 9.95, "EUR", "in_stock", []]);
  const micro = page(`<div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Stoel</h1><link itemprop="availability" href="https://schema.org/OutOfStock"><p>Uitverkocht</p><p>€ 49,00</p></div>`);
  const m = evaluateProductPage(`${SHOP}/product/stoel`, 200, micro);
  assert.deepEqual([m.outcome, m.dataStock, m.issues], ["checked", "out_of_stock", []]);
  assert.equal(evaluateProductPage(`${SHOP}/x`, 500, "").outcome, "unreachable");
  assert.equal(evaluateProductPage(`${SHOP}/x`, 429, "").outcome, "blocked");
});
