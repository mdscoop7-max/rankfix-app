import test from "node:test";
import assert from "node:assert/strict";
import { eligibleSampleCandidates, isUtilityPath, languageNeutralPath, pageIdentityKey } from "../lib/sample-eligibility.ts";
import { selectRepresentativePages } from "../lib/representative-pages.ts";

test("login, account, cart, checkout and search pages never enter the sample", () => {
  for (const p of ["/login", "/nl/inloggen", "/account/orders", "/wachtwoord-vergeten", "/winkelwagen", "/cart", "/checkout/step-1", "/search", "/wp-login.php", "/mijn-account"]) assert.equal(isUtilityPath(p), true, p);
  for (const p of ["/", "/diensten", "/producten/stoel", "/over-ons", "/contact", "/blog/hoe-werkt-een-account", "/vestigingen/amsterdam"]) assert.equal(isUtilityPath(p), false, p);
});

test("language variants of one page collapse to a single page, the preferred language wins", () => {
  assert.equal(languageNeutralPath("/en/about-us"), "/about-us");
  assert.equal(languageNeutralPath("/nl-nl/over-ons"), "/over-ons");
  assert.equal(languageNeutralPath("/tv/schedule"), "/tv/schedule");
  const ranked = ["https://a.test/en/klarna", "https://a.test/nl/klarna", "https://a.test/de/klarna", "https://a.test/bg/klarna", "https://a.test/pricing"].map((url) => ({ url }));
  const out = eligibleSampleCandidates(ranked, "nl");
  assert.equal(out.length, 2);
  assert.equal(out[0].url, "https://a.test/nl/klarna");
});

test("colour, size and sort parameters do not make a different page; functional ones do", () => {
  assert.equal(pageIdentityKey("https://a.test/p/chair?color=red"), pageIdentityKey("https://a.test/p/chair?color=blue&sort=asc"));
  assert.notEqual(pageIdentityKey("https://a.test/p?id=1"), pageIdentityKey("https://a.test/p?id=2"));
});

test("at most N pages per template fill the sample", () => {
  const products = Array.from({ length: 8 }, (_, i) => ({ url: `https://a.test/products/item-name-${i}-x`, type: "product" }));
  const others = [{ url: "https://a.test/contact", type: "contact" }, { url: "https://a.test/over-ons", type: "article" }];
  const key = (u) => new URL(u).pathname.replace(/\/[^/]*\d[^/]*$/, "/:detail");
  const out = selectRepresentativePages([{ url: "https://a.test/", type: "home" }], [...products, ...others], 8, (u) => u, key, undefined, undefined, undefined, 2);
  assert.equal(out.filter((item) => item.type === "product").length, 2);
  assert.ok(out.some((item) => item.type === "contact"));
});
