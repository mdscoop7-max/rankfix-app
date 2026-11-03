// 4 Nov 2026 — QA10 punt 10 stap 3: visible stock recognition and evidence-based
// product checks. Generic fixture HTML, no domain rules.
import test from "node:test";
import assert from "node:assert/strict";
import { settleSampleProductCheck } from "../lib/sample-product-checks.ts";
import { visibleOfferEvidence, productZoneText, purchaseButtonState } from "../lib/visible-offer-evidence.ts";

const strip = (html) => html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ev = (html) => visibleOfferEvidence(html, strip(html));
const shell = (main, { header = "", related = "" } = {}) => `<html><body><header><div class="usp">Voor 23:00 besteld, morgen in huis</div>${header}</header>
<main><h1>Eikenhouten tafel 180 cm</h1>${main}</main>${related}<footer>Klantenservice</footer></body></html>`;

test("'niet op voorraad' is out of stock, not also in stock (was always ambiguous)", () => {
  const o = ev(shell(`<p class="price">€ 499,00</p><p class="stock">Niet op voorraad</p>`));
  assert.equal(o.visibleAvailabilityState, "out_of_stock");
  assert.equal(o.visibleAvailabilityAmbiguous, false);
  const it = ev(shell(`<p class="price">€ 49,00</p><p>Non disponibile</p>`));
  assert.equal(it.visibleAvailabilityState, "out_of_stock");
});

test("stock is read in the product zone; related products and USP bars do not count", () => {
  const html = shell(`<p class="price">€ 499,00</p><p class="stock">Op voorraad, morgen in huis</p>`,
    { related: `<section><h2>Anderen bekeken ook</h2><div>Stoel — Uitverkocht</div><div>Bank — Pre-order</div></section>` });
  const o = ev(html);
  assert.equal(o.visibleAvailabilityState, "in_stock");
  assert.equal(o.visibleAvailabilityScope, "product_zone");
  assert.ok(!/uitverkocht/i.test(productZoneText(html)));
});

test("a site-wide delivery promise alone is no stock evidence", () => {
  const o = ev(shell(`<p class="price">€ 499,00</p><p>Gratis retour</p>`));
  assert.equal(o.visibleAvailabilityState, null);
  assert.equal(o.visibleAvailabilityScope, "none");
});

test("Dutch stock phrases next to the product are recognised", () => {
  for (const phrase of ["Direct leverbaar", "Nog 3 op voorraad", "Voorradig", "Morgen in huis"]) {
    assert.equal(ev(shell(`<p class="price">€ 9,95</p><p>${phrase}</p>`)).visibleAvailabilityState, "in_stock", phrase);
  }
  assert.equal(ev(shell(`<p class="price">€ 9,95</p><p>Tijdelijk niet leverbaar</p>`)).visibleAvailabilityState, "out_of_stock");
});

test("purchase button state: enabled, disabled, none", () => {
  assert.equal(purchaseButtonState(`<button type="submit" name="add-to-cart" class="button">In winkelwagen</button>`), "enabled");
  assert.equal(purchaseButtonState(`<button disabled class="btn">In winkelwagen</button>`), "disabled");
  assert.equal(purchaseButtonState(`<button>Zoeken</button>`), null);
});

const complete = { name: "Tafel", image: "https://shop.test/t.jpg", sku: "1", price: "499", currency: "EUR", availability: "https://schema.org/InStock", offerKind: "offer" };
const visible = { priceCandidates: [499], priceStrength: "explicit_product_markup", currencies: ["EUR"], availabilityState: null, availabilityAmbiguous: false, availabilityScope: "none", availabilityPhrases: [], purchaseButton: null };
const rawPage = (over = {}) => ({ url: "https://shop.test/tafel-180", evidenceSource: "raw_html", productSchema: true, product: complete, visibleOffer: visible,
  serverRendered: true, purchaseAction: true, productMarkupAbsent: false, ...over });

test("Offer InStock + enabled buy button is weak but consistent stock evidence", () => {
  const v = settleSampleProductCheck("product_availability", [rawPage({ visibleOffer: { ...visible, purchaseButton: "enabled" } })]);
  assert.equal(v.status, "pass");
  assert.match(v.message, /zwak/);
  // A buy button never confirms OutOfStock or proves a contradiction.
  const out = settleSampleProductCheck("product_availability", [rawPage({ product: { ...complete, availability: "https://schema.org/OutOfStock" }, visibleOffer: { ...visible, purchaseButton: "enabled" } })]);
  assert.equal(out.status, "unable_to_confirm");
});

test("server-rendered product page without any Product markup is a proven defect", () => {
  const page = rawPage({ productSchema: false, product: null, productMarkupAbsent: true });
  for (const key of ["product_schema", "merchant_product_readiness"]) {
    const v = settleSampleProductCheck(key, [page]);
    assert.equal(v.status, "warning", key);
    assert.match(v.message, /zonder Product structured data/);
    assert.equal(v.url, "https://shop.test/tafel-180");
  }
});

test("absence is not proven on a JavaScript shell, without buy action, or when microdata may hold it", () => {
  for (const over of [{ serverRendered: false }, { purchaseAction: false }, { productMarkupAbsent: false }, { visibleOffer: { ...visible, priceCandidates: [] } }]) {
    const v = settleSampleProductCheck("product_schema", [rawPage({ productSchema: false, product: null, productMarkupAbsent: true, ...over })]);
    assert.equal(v.status, "unable_to_confirm", JSON.stringify(over));
  }
});

test("Product without any Offer on a server-rendered selling page is a proven defect", () => {
  const v = settleSampleProductCheck("product_schema", [rawPage({ product: { ...complete, price: null, currency: null, availability: null, offerKind: "none" } })]);
  assert.equal(v.status, "warning");
  assert.match(v.message, /zonder Offer/);
});

test("unconfirmed verdicts name every page with its own concrete reason", () => {
  const a = rawPage({ url: "https://shop.test/a", visibleOffer: { ...visible, priceStrength: "broad_page_text", priceCandidates: [12, 499] } });
  const b = rawPage({ url: "https://shop.test/b", visibleOffer: { ...visible, priceCandidates: [] } });
  const c = rawPage({ url: "https://shop.test/c", product: { ...complete, price: null } });
  const v = settleSampleProductCheck("product_price_consistency", [a, b, c]);
  assert.equal(v.status, "unable_to_confirm");
  assert.match(v.message, /shop\.test\/a: Zichtbare prijs gevonden .* niet als productprijs gemarkeerd/);
  assert.match(v.message, /shop\.test\/b: Geen zichtbare prijs in de ruwe HTML/);
  assert.match(v.message, /shop\.test\/c: .*Offer zonder prijs/);
  assert.equal(v.pages.length, 3);
});
