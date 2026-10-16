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
