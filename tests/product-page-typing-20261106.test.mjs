// Product-page recognition without Product schema (Fresh144, 6 Nov 2026).
// Evidence: tests/fixtures/fresh144-product-typing/pages.json holds the ORIGINAL
// page evidence of the live Fresh144 scan (engine 2a6c6c5). No invented URLs are
// used as proof that the live scanner works; synthetic HTML below only tests markup
// patterns and negatives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { refineSamplePageType, subscriptionPriced } from "../lib/sample-quality.ts";
import { isApiOrFeedPath, productCardLinks } from "../lib/commerce-markup.ts";
import { summarizeProductHunt, productHuntSentence } from "../lib/product-hunt-diagnostics.ts";

const { pages } = JSON.parse(readFileSync(new URL("./fixtures/fresh144-product-typing/pages.json", import.meta.url), "utf8"));
const byEnd = (end) => pages.find((p) => p.url.endsWith(end));

// Same derivation as app/api/scan/route.ts from the stored commerceEvidence.
function typeFromStored(p, overrides = {}) {
  const c = p.commerceEvidence, o = c.visibleOffer;
  const links = (p.productLinks || []).filter((u) => !isApiOrFeedPath(new URL(u).pathname));
  return refineSamplePageType({
    proposed: p.type === "product" ? "product" : p.type,
    path: new URL(p.url).pathname,
    productSchema: c.productSchema, productSchemaCount: c.productSchemaCount, financialOffer: c.financialOffer,
    itemListSchema: c.itemListSchema, repeatedProductLinks: new Set(links).size >= 3,
    productOffer: Boolean(c.product?.price && c.product?.currency), purchaseAction: c.strongCommerceAction,
    visiblePrices: c.priceSignals, uniqueH1: p.h1Count === 1, detailIdentity: false,
    singleMarkedOffer: o.priceStrength === "explicit_product_markup" && o.priceCandidates.length >= 1 && o.priceCandidates.length <= 2,
    subscriptionOffer: false,
    ...overrides,
  });
}

test("Fresh144 bax-shop: product pages without Product schema are product pages (were other/category)", () => {
  const katana = byEnd("boss-katana-25-1x8-inch-25w-gitaarversterker-combo-met-tuner");
  const ayra = byEnd("ayra-vision-250bsw-ip-movinghead-tweedelig-in-flightcase");
  assert.equal(katana.type, "other", "stored live type before the fix");
  assert.equal(ayra.type, "category", "stored live type before the fix");
  assert.equal(typeFromStored(katana), "product");
  assert.equal(typeFromStored(ayra), "product");
  // Same template, same type.
  assert.equal(katana.structureKey.split("|").slice(0, 3).join("|"), ayra.structureKey.split("|").slice(0, 3).join("|"));
});

test("Fresh144 bax-shop: manual PDFs below /downloads/products/ are not product links", () => {
  const ayra = byEnd("ayra-vision-250bsw-ip-movinghead-tweedelig-in-flightcase");
  const pdfs = ayra.productLinks.filter((u) => /\.pdf$/i.test(u));
  assert.ok(pdfs.length >= 2, "the stored evidence contains the PDF links");
  for (const u of pdfs) assert.equal(isApiOrFeedPath(new URL(u).pathname), true, u);
  assert.equal(isApiOrFeedPath("/b-stock-aanbiedingen/product/1607655/b-stock-ayra-vision"), false);
});

test("Fresh144 negatives: real category pages stay categories", () => {
  for (const end of ["/microfoons", "/gitaar", "/gordijnen-raamdecoratie/gordijnen", "/tuin"]) {
    assert.equal(typeFromStored(byEnd(end)), "category", end);
  }
});

test("a grid with many marked prices and cart buttons is a category, not a product", () => {
  assert.equal(refineSamplePageType({ proposed: "other", path: "/verlichting", productSchema: false, itemListSchema: false, repeatedProductLinks: true, productOffer: false, purchaseAction: true, visiblePrices: 12, uniqueH1: true, detailIdentity: false, singleMarkedOffer: false }), "category");
});

test("software plans and subscriptions are services, physical products with financing stay products", () => {
  assert.equal(subscriptionPriced("Falcon Go $59.99 per device / year"), true);
  assert.equal(subscriptionPriced("Boss Katana-25 € 189,00 Op voorraad"), false);
  const base = { proposed: "other", path: "/plans/pro", productSchema: false, itemListSchema: false, repeatedProductLinks: false, productOffer: false, purchaseAction: true, visiblePrices: 1, uniqueH1: true, detailIdentity: false, singleMarkedOffer: true };
  assert.equal(refineSamplePageType({ ...base, subscriptionOffer: true }), "service");
  // In stock (subscriptionOffer is only set without a stock state) with a Klarna line: product.
  assert.equal(refineSamplePageType({ ...base, path: "/gitaarversterker/boss-katana", subscriptionOffer: false }), "product");
});

test("a priced SaaS/security page without a cart action is never a product page (CrowdStrike-type)", () => {
  const t = refineSamplePageType({ proposed: "other", path: "/products/falcon-endpoint", productSchema: false, itemListSchema: false, repeatedProductLinks: false, productOffer: false, purchaseAction: false, visiblePrices: 2, uniqueH1: true, detailIdentity: false, singleMarkedOffer: true, serviceEvidence: true });
  assert.notEqual(t, "product");
});

test("JavaScript storefront cards: CSS-module classes, test hooks and microdata cards yield product links", () => {
  const html = `
    <div class="ProductCard_root__x3Fa"><a href="/gordijn-velvet-groen-140x250">Velvet</a></div>
    <article data-testid="product-tile"><a href="/vloerkleed-rond-120">Rond</a></article>
    <li itemscope itemtype="https://schema.org/Product"><a href="/tuinset-lounge-4-delig">Lounge</a></li>
    <div class="productTile-module__a1"><a href="/downloads/products/1/handleiding.pdf">PDF</a></div>`;
  const links = productCardLinks(html, "https://shop.example/categorie", "shop.example");
  assert.deepEqual(links.map((u) => new URL(u).pathname), ["/gordijn-velvet-groen-140x250", "/vloerkleed-rond-120", "/tuinset-lounge-4-delig"]);
});

test("navigation and teaser blocks are not product cards", () => {
  const html = `<nav class="main-menu"><a href="/tuin">Tuin</a></nav><div class="product-categories"><a href="/dier">Dier</a></div><div class="productivity-tips"><a href="/blog/x">x</a></div>`;
  assert.deepEqual(productCardLinks(html, "https://shop.example/", "shop.example"), []);
});

test("product hunt reports listings that rendered without product cards separately", () => {
  const s = summarizeProductHunt(0, [], [], { checked: 14, renderedWithoutCards: 9, renderFailed: 1 });
  const sentence = productHuntSentence(s);
  assert.match(sentence, /14 lijst- of categoriepagina's gelezen/);
  assert.match(sentence, /9 toonden na JavaScript-rendering geen herkenbare productkaarten/);
  assert.match(sentence, /1 konden niet worden gerenderd \(niet geladen\)/);
  assert.match(sentence, /geen bewijs dat de webshop geen productpagina's heeft/);
});
