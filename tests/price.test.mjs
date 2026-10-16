import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredPrice, offerPrice } from "../lib/price.ts";

test("missing or empty structured prices are not zero", () => {
  for (const v of [null, undefined, "", "   ", "n/a", "Prijs op aanvraag", {}, [], NaN, -1]) assert.equal(parseStructuredPrice(v), null, JSON.stringify(v));
});

test("a real zero price is still supported", () => {
  assert.equal(parseStructuredPrice(0), 0);
  assert.equal(parseStructuredPrice("0"), 0);
  assert.equal(parseStructuredPrice("0.00"), 0);
});

test("valid prices in machine and locale formats", () => {
  assert.equal(parseStructuredPrice("13.95"), 13.95);
  assert.equal(parseStructuredPrice("13,95"), 13.95);
  assert.equal(parseStructuredPrice(13.95), 13.95);
  assert.equal(parseStructuredPrice("1.299,95"), 1299.95);
  assert.equal(parseStructuredPrice("1,299.95"), 1299.95);
  assert.equal(parseStructuredPrice("€ 13,95"), 13.95);
  assert.equal(parseStructuredPrice("13.95 EUR"), 13.95);
});

test("WooCommerce offer with price only in priceSpecification", () => {
  const o = offerPrice({ "@type": "Offer", priceSpecification: [{ "@type": "UnitPriceSpecification", price: "13.95", priceCurrency: "EUR" }] });
  assert.deepEqual(o, { price: 13.95, highPrice: null, currency: "EUR" });
  assert.equal(offerPrice({ "@type": "Offer", price: null, priceCurrency: "EUR" }).price, null);
  assert.equal(offerPrice({ "@type": "AggregateOffer", lowPrice: "9.95", highPrice: "19.95", priceCurrency: "eur" }).highPrice, 19.95);
});
