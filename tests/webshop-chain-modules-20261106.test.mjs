import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideCommerceModules } from "../lib/sector-motor-decisions.ts";

// bonprix live scan (6 Nov): "Webshopfunctionaliteit: Bevestigd", sector webshop 88%,
// but active modules SEO · GEO · Techniek · Bedrijfsidentiteit · Lokaal and zero
// product pages. Every webshop module required a proven product page.
const shop = { primarySector: "ecommerce", primaryBusinessModel: "retail", retailProduct: false, productPrice: false, cart: false, checkout: false, merchantFeed: false, euMarket: true };

test("a confirmed retail webshop without a proven product page gets shop-level modules only", () => {
  assert.deepEqual(decideCommerceModules({ ...shop, shopConfirmed: false }), [], "before: nothing without shop confirmation");
  assert.deepEqual(decideCommerceModules({ ...shop, shopConfirmed: true }), ["ecommerce", "eu_consumer"]);
  // Product-level modules stay off until a product page is proven.
  const m = decideCommerceModules({ ...shop, shopConfirmed: true });
  for (const productModule of ["product", "pricing_currency", "checkout", "merchant"]) assert.ok(!m.includes(productModule), productModule);
});

test("with a proven product the full chain applies; non-retail identities are unchanged", () => {
  assert.deepEqual(decideCommerceModules({ ...shop, shopConfirmed: true, retailProduct: true, productPrice: true, cart: true, checkout: true }), ["ecommerce", "product", "pricing_currency", "checkout", "eu_consumer"]);
  // A service provider with a confirmed booking/payment widget never becomes a shop.
  assert.deepEqual(decideCommerceModules({ ...shop, primarySector: "home_services", primaryBusinessModel: "service", shopConfirmed: true }), []);
  assert.deepEqual(decideCommerceModules({ ...shop, primaryBusinessModel: "unknown", shopConfirmed: true }), []);
  // Outside the EU market no EU consumer module.
  assert.deepEqual(decideCommerceModules({ ...shop, shopConfirmed: true, euMarket: false }), ["ecommerce"]);
});

test("the report never claims a product page that was not sampled", () => {
  const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /productPageProof \? "Representatieve productpagina bevestigt webshopfunctionaliteit" : "Webshopfunctionaliteit bevestigd op site-niveau/);
  assert.match(route, /shopConfirmed: finalCommerceDecision\.confirmed/);
});
