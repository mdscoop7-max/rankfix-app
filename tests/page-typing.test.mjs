import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeCategoryPath, looksLikeStorePage, looksLikeProductDetailPath } from "../lib/product-links.ts";
import { refineSamplePageType } from "../lib/sample-quality.ts";

test("category archives on WooCommerce, Shopify and in EU languages are never product pages", () => {
  for (const p of ["/product-categorie/maskers/", "/product-category/masks/", "/produkt-kategorie/masken/", "/categorie-produit/masques/", "/categoria-prodotto/maschere/", "/collections/sale", "/collections/heren-schoenen/", "/category/nieuws/", "/c/hardloopschoenen/"]) {
    assert.equal(looksLikeCategoryPath(p), true, p);
    assert.equal(looksLikeProductDetailPath(p), false, p);
  }
  for (const p of ["/producten/kleimasker-250-gram/", "/products/air-max-90", "/collections/sale/products/air-max-90", "/produkte/maske-250g/", "/produits/masque/"]) {
    assert.equal(looksLikeCategoryPath(p), false, p);
    assert.equal(looksLikeProductDetailPath(p), true, p);
  }
});

test("store finders and franchise pages are not product categories", () => {
  for (const p of ["/winkels/", "/winkelzoeker/", "/stores/amsterdam", "/store-locator", "/franchise/", "/ondernemer-worden/", "/filialen/", "/magasins/"]) {
    assert.equal(looksLikeStorePage(p), true, p);
    assert.equal(looksLikeProductDetailPath(p), false, p);
  }
  assert.equal(looksLikeStorePage("/producten/winkelwagen-tas/"), false);
});

const base = { proposed: "product", productSchema: true, itemListSchema: false, repeatedProductLinks: false, productOffer: true, purchaseAction: true, visiblePrices: 3, uniqueH1: true, detailIdentity: true };
test("refined page type: a grid of Products is a category; one Product is a product", () => {
  assert.equal(refineSamplePageType({ ...base, path: "/product-categorie/maskers/", productSchemaCount: 3 }), "category");
  assert.equal(refineSamplePageType({ ...base, path: "/winkel/maskers/", productSchemaCount: 6 }), "category");
  assert.equal(refineSamplePageType({ ...base, path: "/producten/kleimasker/", productSchemaCount: 1 }), "product");
  assert.equal(refineSamplePageType({ ...base, path: "/winkels/", productSchemaCount: 0, productSchema: false }), "other");
});

test("press releases, news and events are never products or categories", () => {
  const press = ["/service/pressemitteilung/artikel/detail/vier_pflegekraefte_vier_stationen_ein_neuer_start/", "/nieuws/2026/10/nieuwe-afdeling", "/press-releases/q3-results", "/communiques-de-presse/2026-nouvel-hopital", "/notizie/nuovo-reparto", "/sala-de-prensa/nota", "/pressmeddelanden/ny-klinik", "/aktuality/nove-oddeleni"];
  for (const p of press) {
    assert.equal(looksLikeProductDetailPath(p), false, p);
    assert.equal(refineSamplePageType({ ...base, proposed: "product", productSchema: false, purchaseAction: false, path: p }), "article", p);
  }
  assert.equal(refineSamplePageType({ ...base, proposed: "service", productSchema: false, purchaseAction: false, path: "/service/veranstaltung/veranstaltung/details/vortrag/" }), "event");
  // German/Dutch product bases still work when the page proves a product.
  assert.equal(refineSamplePageType({ ...base, path: "/artikel/12345-bohrmaschine", productSchemaCount: 1 }), "product");
});

test("corporate pages are not categories even with a global Products menu", () => {
  for (const p of ["/en/careers/working-at-acme/united-states", "/en/company", "/en/company/governance", "/en/careers/find-your-job", "/over-ons/", "/unternehmen/vorstand"]) {
    assert.equal(refineSamplePageType({ ...base, proposed: "other", productSchema: false, purchaseAction: false, visiblePrices: 0, repeatedProductLinks: true, path: p }), "corporate", p);
  }
  assert.equal(refineSamplePageType({ ...base, proposed: "other", productSchema: false, purchaseAction: false, visiblePrices: 0, repeatedProductLinks: true, itemListSchema: false, uniqueH1: true, detailIdentity: false, path: "/en/technology/overview" }), "other");
});

test("a bare product base (/producten/, /products) is the shop archive, not a product", () => {
  for (const p of ["/producten/", "/products", "/nl/producten/", "/shop/"]) {
    assert.equal(looksLikeCategoryPath(p), true, p);
    assert.equal(looksLikeProductDetailPath(p), false, p);
  }
  assert.equal(looksLikeProductDetailPath("/producten/jojoba-olie/"), true);
});

test("an ItemList of articles or topics without prices is not a product category", () => {
  const info = { ...base, proposed: "other", productSchema: false, purchaseAction: false, visiblePrices: 0, itemListSchema: true, repeatedProductLinks: true, productSchemaCount: 0 };
  assert.equal(refineSamplePageType({ ...info, path: "/en/technology/all-about-microchips/microchip-basics" }), "other");
  // A real collection (ItemList + prices) stays a category.
  assert.equal(refineSamplePageType({ ...info, visiblePrices: 6, path: "/collections/hardloopschoenen" }), "category");
});
