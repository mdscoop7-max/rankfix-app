import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = () => readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");

test("internal links: 429/502/503/504 are unconfirmed, never a proven broken link", async () => {
  const source = await route();
  assert.match(source, /const TRANSIENT_LINK_STATUSES = new Set\(\[429, 502, 503, 504\]\);/);
  assert.match(source, /item\.error \|\| item\.status === null \|\| TRANSIENT_LINK_STATUSES\.has\(item\.status\)/);
  assert.match(source, /item\.status >= 500 && !TRANSIENT_LINK_STATUSES\.has\(item\.status\)/);
  // Same rule, executed: a real scan (allbirds.de) reported /collections/herren → HTTP 503 as broken.
  const TRANSIENT = new Set([429, 502, 503, 504]);
  const broken = (status) => status === 404 || status === 410 || (status !== null && status >= 500 && !TRANSIENT.has(status));
  assert.deepEqual([404, 410, 500, 501, 429, 502, 503, 504, 200].map(broken), [true, true, true, true, false, false, false, false, false]);
});

test("GTM served first-party (server-side tagging) is recognised", async () => {
  const source = await route();
  const pattern = new RegExp(source.match(/\|\| \/(\\\/\(\?:gtm\\\.js\|ns\\\.html\)\\\?id=GTM-\[A-Z0-9\]\{4,\})\/i\.test\(html\)/)[1], "i");
  assert.equal(pattern.test('<iframe src="https://t.shop.example/ns.html?id=GTM-NDSZXXKK"></iframe>'), true);
  assert.equal(pattern.test('<script src="https://t.shop.example/gtm.js?id=GTM-ABCD12"></script>'), true);
  assert.equal(pattern.test("GTM-ABCD12 mentioned in text"), false);
});

test("public export carries the score status, never a bare provisional 100/100", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const presentation = resolveScorePresentation\(result\);/);
  assert.match(page, /presentation\.status === "provisional" \? copy\.provisional : copy\.confirmed/);
});

test("Google tag IDs: upper-case IDs only, never CSS classes like g-recaptcha", async () => {
  const source = await route();
  const grab = (name) => new RegExp(source.match(new RegExp(`const ${name} = \\[\\.\\.\\.new Set\\(html\\.match\\(\\/(.+?)\\/g\\) \\|\\| \\[\\]\\)\\];`))[1], "g");
  const ga4 = grab("ga4MeasurementIds"), gtm = grab("gtmContainerIds"), ads = grab("googleAdsIds");
  // Real scan (allbirds.de): ga4Ids=g-recaptcha was reported as a GA4 measurement ID.
  assert.deepEqual('<div class="g-recaptcha" data-sitekey="x"></div>'.match(ga4), null);
  assert.deepEqual('<div class="gtm-banner"></div>'.match(gtm), null);
  assert.deepEqual("gtag('config','G-AB12CD34EF')".match(ga4), ["G-AB12CD34EF"]);
  assert.deepEqual("ns.html?id=GTM-NDSZXXKK".match(gtm), ["GTM-NDSZXXKK"]);
  assert.deepEqual("gtag('config','AW-123456789')".match(ads), ["AW-123456789"]);
  assert.deepEqual("my-G-ABCDEF12 token".match(ga4), null, "not inside another token");
});
