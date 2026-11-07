// 4 Nov 2026 — QA10 step 4c: product cards on the scanned page nominate product
// candidates for the first sample. Regression: a shop homepage whose product
// cards use flat URLs ("/fauteuil-torino-bruin-4325187") sampled 0 product pages.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nominateProductCards } from "../lib/product-nomination.ts";
import { productCardLinks } from "../lib/commerce-markup.ts";

const home = `<html><body><header><a href="/sale">Sale</a><a href="/klantenservice">Klantenservice</a></header>
${["fauteuil-torino-bruin-4325187", "hoekbank-regalo-links-bruin-4327433", "vloerkleed-winnipeg-multicolor-4318524"].map((slug, i) => `<div class="product-card"><a href="/${slug}"><img src="/i${i}.jpg">Product ${i}</a><span class="price">€ ${100 + i},00</span></div>`).join("")}
<footer><a href="/informatie-en-service/toegankelijkheidsverklaring">Toegankelijkheid</a></footer></body></html>`;

const classify = (url) => ({ url, type: "other", evidence: [] });
const key = (url) => new URL(url, "https://shop.test/").pathname;

test("product cards on the homepage become product candidates, whatever the URL shape", () => {
  const links = productCardLinks(home, "https://shop.test/", "shop.test", 12);
  assert.equal(links.length, 3);
  const candidates = [{ url: "https://shop.test/sale", type: "category", evidence: [] }, { url: "https://shop.test/fauteuil-torino-bruin-4325187", type: "other", evidence: [] }];
  const n = nominateProductCards(candidates, links, key, classify, 6);
  assert.equal(n, 3);
  assert.equal(candidates.filter((c) => c.type === "product").length, 3);
  assert.equal(candidates.find((c) => c.url.endsWith("/sale")).type, "category");
  assert.match(candidates[1].evidence.join(" "), /nominatie, geen bewijs/);
});

test("navigation, legal and support links are never nominated; the limit is respected", () => {
  const candidates = [{ url: "https://shop.test/informatie-en-service/toegankelijkheidsverklaring", type: "legal", evidence: [] }];
  assert.equal(nominateProductCards(candidates, ["https://shop.test/informatie-en-service/toegankelijkheidsverklaring"], key, classify, 6), 0);
  assert.equal(candidates[0].type, "legal");
  const many = Array.from({ length: 20 }, (_, i) => `https://shop.test/p-${i}-123456`);
  const pool = [];
  assert.equal(nominateProductCards(pool, many, key, classify, 6), 6);
  assert.equal(nominateProductCards([], ["https://shop.test/x"], key, () => null, 6), 0);
});

test("the scan route nominates cards only for shops and stays inside the sample budget", () => {
  const source = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /if \(masterEvidence\.commerce\.confirmed \|\| technologyProfile\.isCommerce \|\| hasEcommerceSignal\) \{\s*const cardLinks/);
  // Product slots stay bounded by pickMultiPage("product", 4) and the 30-page limit.
  assert.match(source, /pickMultiPage\("product", 4\)/);
  assert.match(source, /const representativePageLimit = 30;/);
});
