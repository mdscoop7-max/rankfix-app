import test from "node:test";
import assert from "node:assert/strict";
import { buildScanEvidence } from "../lib/scan-evidence.ts";

function evidence(body) {
  return buildScanEvidence({url:"https://example.test/",html:`<html><body>${body}</body></html>`});
}

test("European currencies count as price evidence when paired with an amount", () => {
  for (const [price,currency] of [
    ["149,99 zł","PLN"],["999 PLN","PLN"],["1 299 Kč","CZK"],
    ["SEK 249","SEK"],["199 DKK","DKK"],["1 250 Ft","HUF"],
    ["149 lei","RON"],["20 лв","BGN"],["€ 13,95","EUR"],
  ]) {
    const actual=evidence(`<p>Price: ${price}</p>`).commerce.prices.value;
    assert.ok(actual.count >= 1, `No price extracted from ${price}`);
    assert.ok(actual.currencies.includes(currency), `Currency ${currency} missing for ${price}`);
  }
});

test("An unqualified kr amount does not guess a particular national currency", () => {
  const actual=evidence("<p>Price 399 kr</p>").commerce.prices.value;
  assert.ok(actual.count >= 1);
  assert.deepEqual(actual.currencies, []);
});

test("Currency labels and unrelated words alone are not proof of a price", () => {
  const actual=evidence("<p>Accepted: PLN, SEK, CZK, EUR. Kraken software.</p>").commerce.prices.value;
  assert.equal(actual.count,0);
});