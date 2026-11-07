// 4 Nov 2026 — QA10 step 4b: product pages recognised from content, not the URL.
// Regression cases (no domain rules): variant pages (ProductGroup + hasVariant)
// typed "category"; a product under a flat or category-like URL with a related
// products grid typed "category".
import test from "node:test";
import assert from "node:assert/strict";
import { countIndependentProducts, refineSamplePageType } from "../lib/sample-quality.ts";
import { visibleOfferEvidence } from "../lib/visible-offer-evidence.ts";

const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const variants = (n) => Array.from({ length: n }, (_, i) => ({ "@type": "Product", name: `Top maat ${i}`, sku: `A${i}`, offers: { "@type": "Offer", price: "12.99", priceCurrency: "EUR" } }));

test("a ProductGroup with variants is one product, not a grid", () => {
  assert.equal(countIndependentProducts(ld({ "@context": "https://schema.org", "@type": "ProductGroup", name: "Damestop", hasVariant: variants(14) })), 1);
  // A real grid (ItemList of Products) still counts every product.
  assert.equal(countIndependentProducts(ld({ "@type": "ItemList", itemListElement: variants(5).map((item) => ({ "@type": "ListItem", item })) })), 5);
});

const productHtml = (related = "") => `<html><body><nav><a href="/sale">Sale</a></nav><main>
<h1>Fauteuil Torino bruin</h1><div class="price">€ 299,00</div><p>Op voorraad</p>
<select name="kleur"><option>Bruin</option></select><button type="submit" class="add-to-cart">In winkelwagen</button></main>
${related}</body></html>`;
const relatedGrid = `<section><h2>Anderen bekeken ook</h2>${["Bank Lecce € 899,00", "Lamp Zaniah € 49,99", "Kleed Avon € 129,00", "Stoel Burano € 89,00"].map((t) => `<div class="product-card"><a href="/x-${t.length}">${t}</a><button>In winkelwagen</button></div>`).join("")}</section>`;
const zone = (html) => { const o = visibleOfferEvidence(html, ""); return o.purchaseButton === "enabled" && o.zonePriceCandidates.length >= 1 && o.zonePriceCandidates.length <= 2; };
const base = { proposed: "other", productSchema: false, itemListSchema: false, productOffer: false, uniqueH1: true, detailIdentity: false };

test("one product with price and buy button is a product page, whatever URL or related grid", () => {
  const html = productHtml(relatedGrid);
  assert.equal(zone(html), true);
  for (const path of ["/fauteuil-torino-bruin-4325187", "/wonen/stoelen/fauteuils/torino", "/collections/fauteuils/torino"]) {
    assert.equal(refineSamplePageType({ ...base, path, repeatedProductLinks: true, purchaseAction: true, visiblePrices: 5, productSchemaCount: 0, singleProductZone: zone(html) }), "product", path);
  }
});

test("a category grid is never a single-product zone", () => {
  const grid = `<html><body><h1>Fauteuils</h1>${relatedGrid.replace("<h2>Anderen bekeken ook</h2>", "")}</body></html>`;
  assert.equal(zone(grid), false);
  assert.equal(refineSamplePageType({ ...base, path: "/fauteuils", repeatedProductLinks: true, purchaseAction: true, visiblePrices: 4, singleProductZone: zone(grid) }), "category");
});

test("a variant product page stays a product page (ProductGroup counted once)", () => {
  const html = ld({ "@type": "ProductGroup", name: "Kinderjeans", hasVariant: variants(36) });
  assert.equal(refineSamplePageType({ ...base, proposed: "product", path: "/kind/broeken/kinderjeans-30883371.html", productSchema: true, purchaseAction: false, repeatedProductLinks: false, visiblePrices: 1, productSchemaCount: countIndependentProducts(html) }), "product");
});
