// 4 Nov 2026 — webshop evidence chain: product checks of a confirmed webshop are
// judged on the audited product pages of the sample, with product-page criteria.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { financialServiceOfferPage, missingOfferFields, settleSampleProductCheck } from "../lib/sample-product-checks.ts";
import { visibleOfferEvidence } from "../lib/visible-offer-evidence.ts";

const complete = { name: "Trui", image: "https://shop.test/t.jpg", sku: "1", price: "22.99", currency: "EUR", availability: "https://schema.org/InStock", offerKind: "offer" };
const page = (over = {}) => ({ url: "https://shop.test/p/trui-1", evidenceSource: "rendered_html", productSchema: true, product: complete,
  visibleOffer: { priceCandidates: [22.99], priceStrength: "explicit_product_markup", currencies: ["EUR"], availabilityState: "in_stock", availabilityAmbiguous: false }, ...over });

test("complete Product/Offer data on an audited product page passes, naming that page", () => {
  for (const key of ["product_schema", "merchant_product_readiness", "product_price_consistency", "price_currency_consistency", "product_availability"]) {
    const v = settleSampleProductCheck(key, [page()]);
    assert.equal(v.status, "pass", key);
    assert.equal(v.url, "https://shop.test/p/trui-1");
    assert.match(v.message, /trui-1/);
    assert.equal(v.pages.length, 1);
  }
});

test("proven defects on a product page are warnings; never a pass without page evidence", () => {
  const noAvail = page({ product: { ...complete, availability: null } });
  assert.deepEqual(missingOfferFields(noAvail.product), ["beschikbaarheid"]);
  assert.equal(settleSampleProductCheck("product_schema", [noAvail]).status, "warning");
  assert.match(settleSampleProductCheck("merchant_product_readiness", [noAvail]).message, /beschikbaarheid/);
  const wrongPrice = page({ visibleOffer: { ...page().visibleOffer, priceCandidates: [19.99] } });
  assert.equal(settleSampleProductCheck("product_price_consistency", [wrongPrice]).status, "warning");
  const wrongCurrency = page({ visibleOffer: { ...page().visibleOffer, currencies: ["GBP"] } });
  assert.equal(settleSampleProductCheck("price_currency_consistency", [wrongCurrency]).status, "warning");
  const soldOut = page({ visibleOffer: { ...page().visibleOffer, availabilityState: "out_of_stock" } });
  assert.equal(settleSampleProductCheck("product_availability", [soldOut]).status, "warning");
  // An AggregateOffer or a list may hold the field deeper: not a proven defect.
  assert.equal(settleSampleProductCheck("product_schema", [page({ product: { ...complete, availability: null, offerKind: "aggregate" } })]).status, "unable_to_confirm");
  assert.equal(settleSampleProductCheck("product_schema", [page({ product: { ...complete, availability: null } , url: "https://shop.test/p/x" })]).status, "warning");
  assert.equal(settleSampleProductCheck("merchant_product_readiness", [page({ product: { ...complete, availability: null, offerKind: undefined } })]).status, "unable_to_confirm", "older reports without offer shape are never a proven defect");
  // One proven defect is reported even when another product page is correct.
  const mixed = settleSampleProductCheck("product_schema", [page(), { ...noAvail, url: "https://shop.test/p/broek-2" }]);
  assert.equal(mixed.status, "warning");
  assert.equal(mixed.url, "https://shop.test/p/broek-2");
});

test("missing evidence stays unable to confirm (no artificial improvement)", () => {
  assert.equal(settleSampleProductCheck("product_schema", []).status, "unable_to_confirm");
  // Raw HTML without Product data: JavaScript may add it, not a proven defect.
  assert.equal(settleSampleProductCheck("product_schema", [page({ evidenceSource: "raw_html", productSchema: false, product: null })]).status, "unable_to_confirm");
  // Unmarked amounts in page text are no reliable price comparison.
  assert.equal(settleSampleProductCheck("product_price_consistency", [page({ visibleOffer: { ...page().visibleOffer, priceStrength: "broad_page_text" } })]).status, "unable_to_confirm");
  // Several visible currencies may be a currency selector.
  assert.equal(settleSampleProductCheck("price_currency_consistency", [page({ visibleOffer: { ...page().visibleOffer, currencies: ["EUR", "USD"] } })]).status, "unable_to_confirm");
  // Structured availability alone (old lenient rule) is no longer a pass.
  assert.equal(settleSampleProductCheck("product_availability", [page({ visibleOffer: { ...page().visibleOffer, availabilityState: null } })]).status, "unable_to_confirm");
  assert.equal(settleSampleProductCheck("product_availability", [page({ visibleOffer: { ...page().visibleOffer, availabilityAmbiguous: true } })]).status, "unable_to_confirm");
  // Pages without recorded visible evidence (older reports) are never upgraded on price.
  assert.equal(settleSampleProductCheck("product_price_consistency", [page({ visibleOffer: null })]).status, "unable_to_confirm");
});

test("insurance modules, loans and accounts are financial services, not webshop products", () => {
  const svc = (url, title = "", purchaseAction = false) => financialServiceOfferPage({ url, title, h1s: [], purchaseAction, checkout: false });
  assert.equal(svc("https://verzekeraar.test/consumenten/zorgverzekering/aanvullende-verzekering", "Aanvullende verzekering"), true);
  assert.equal(svc("https://bank.test/hypotheek/afsluiten", "Hypotheek afsluiten"), true);
  assert.equal(svc("https://versicherer.test/kfz-versicherung"), true);
  assert.equal(svc("https://bank.test/en/savings-account"), true);
  // Real shops are untouched, also when a product name mentions insurance in passing.
  assert.equal(svc("https://shop.test/p/trui-1", "Takkie trui met hondenzak"), false);
  assert.equal(svc("https://shop.test/telefoon/apple-iphone", "iPhone 16 met verzekering", true), false, "a purchase action keeps it a shop page");
  assert.equal(svc("https://shop.test/tuin/verzekeringsvrije-tuinslang"), false);
});

test("shared visible offer evidence reads marked price, currency and stock state", () => {
  const html = '<div class="product-price">€ 22,99</div><p>Op voorraad</p>';
  const v = visibleOfferEvidence(html, "€ 22,99 Op voorraad");
  assert.deepEqual(v.visiblePriceCandidates, [22.99]);
  assert.equal(v.visiblePriceEvidenceStrength, "explicit_product_markup");
  assert.deepEqual(v.visibleCurrencyCodes, ["EUR"]);
  assert.equal(v.visibleAvailabilityState, "in_stock");
});

test("the scan route uses one settlement for the five product checks and no lenient promotions remain", () => {
  const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /settleSampleProductCheck\(item\.key/);
  assert.match(route, /finalCommerceApplicability\.state === "confirmed" && !isProductPage/);
  assert.match(route, /confirmedRetailPage: !pageFinancial && \(/);
  assert.doesNotMatch(route, /Een representatieve productpagina bevat een expliciet structured availability-signaal/);
  assert.doesNotMatch(route, /find\(\(item\)=>item\.key==="product_availability_consistency"\)/);
  assert.match(route, /visibleOffer: \(\(\) => \{ const o = visibleOfferEvidence\(pageHtml/);
});

test("price mismatch is only a defect for one unambiguous visible product price", () => {
  const withPrices = (priceCandidates, price = "14.95") => page({ product: { ...complete, price }, visibleOffer: { ...page().visibleOffer, priceCandidates } });
  // excl./incl. VAT pair, split euro fragment and related-product prices (obramat-shape, generic)
  assert.equal(settleSampleProductCheck("product_price_consistency", [withPrices([14, 12.36, 18, 15.29])]).status, "unable_to_confirm");
  assert.equal(settleSampleProductCheck("product_price_consistency", [withPrices([12.36])]).status, "unable_to_confirm", "excl. VAT price is not a mismatch");
  assert.equal(settleSampleProductCheck("product_price_consistency", [withPrices([14])]).status, "unable_to_confirm", "euro fragment is not a mismatch");
  assert.equal(settleSampleProductCheck("product_price_consistency", [withPrices([19.99, 24.99])]).status, "unable_to_confirm", "several amounts are ambiguous");
  assert.equal(settleSampleProductCheck("product_price_consistency", [withPrices([19.99])]).status, "warning", "one clear different price stays a proven defect");
  assert.equal(settleSampleProductCheck("product_price_consistency", [withPrices([12.36, 14.95])]).status, "pass");
});
