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

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shopInfoSignals, sitewideShopInfo } from "../lib/shop-info-signals.ts";

test("shop information is read from any audited page, never from an order", () => {
  assert.deepEqual(shopInfoSignals("Gratis verzending vanaf €20. Betaal met iDEAL of Klarna. 30 dagen retourneren."), { shipping: true, payment: true, returns: true });
  assert.deepEqual(shopInfoSignals("Over ons en onze missie."), { shipping: false, payment: false, returns: false });
  const s = sitewideShopInfo([
    { url: "https://shop.example/", status: "audited", shopInfo: { shipping: true, payment: false, returns: false } },
    { url: "https://shop.example/klantenservice/betalen", status: "audited", shopInfo: { shipping: false, payment: true, returns: true } },
    { url: "https://shop.example/blocked", status: "unable_to_confirm", shopInfo: { shipping: true, payment: true, returns: true } },
  ]);
  assert.deepEqual(s, { shipping: "https://shop.example/", payment: "https://shop.example/klantenservice/betalen", returns: "https://shop.example/klantenservice/betalen" });
});

// Real stored TestLab responses (96-site run) replayed through /api/scan, before → after:
// allbirds/gymshark/bonsoy/homewizard had no webshop module; CrowdStrike (cybersecurity,
// "Falcon Go" plan with Product schema) had every webshop module and websitetype Webshop.
const root = fileURLToPath(new URL("..", import.meta.url));
test("webshop chain on real stored webshops and CrowdStrike as negative control", { timeout: 600000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "rf-shops-"));
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-route-replay.mjs", "--json"], {
    cwd: root, encoding: "utf8", timeout: 580000, env: { ...process.env, DUMP_DIR: dir, ROUTE_FIXTURE: `${root}/tests/fixtures/webshop-chain/route.json.gz` },
  });
  assert.equal(out.status, 0, (out.stderr || "").slice(-1500));
  const r = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), "utf8"))]));
  rmSync(dir, { recursive: true, force: true });
  const mods = (h) => (r[h].sectorProfile.applicableModules || []).filter((m) => ["ecommerce", "product", "pricing_currency", "checkout", "merchant", "eu_consumer"].includes(m));
  const check = (h, key) => r[h].seo.checks.find((c) => c.key === key);
  for (const h of ["allbirds.com", "gymshark.com", "bonsoy.com", "homewizard.com"]) assert.ok(mods(h).includes("ecommerce"), `${h}: ${mods(h)}`);
  // No proven product page (bonsoy: 2 candidates, both 404): no product module, and the reason is named.
  assert.ok(!mods("bonsoy.com").includes("product"));
  assert.equal(r["bonsoy.com"].multiPage.productHunt.outcomes.missing, 2);
  assert.match(check("bonsoy.com", "product_price_consistency").message, /2 productkandidaten gevonden, 2 gecontroleerd: 2 bestaan niet/);
  // Shopify product pages with a duplicate theme/app Product (allbirds) or a ProductGroup
  // with variants (gymshark) are product pages, not categories (6 Nov).
  for (const h of ["allbirds.com", "gymshark.com"]) {
    const types = r[h].multiPage.pageAudits.filter((p) => p.status === "audited" && /\/products\//.test(p.url)).map((p) => p.type);
    assert.ok(types.length && types.every((t) => t === "product"), `${h}: ${types}`);
    assert.ok(mods(h).includes("product"), h);
  }
  // Scores unchanged by module activation (stored before-values).
  assert.deepEqual(["allbirds.com", "bonsoy.com", "gymshark.com", "homewizard.com"].map((h) => r[h].overallScore), [80, 93, 94, 91]);
  assert.equal(r["crowdstrike.com"].overallScore, 94);
  // Negative control: a cybersecurity vendor selling plans is not a webshop.
  assert.equal(r["crowdstrike.com"].sectorProfile.key, "cybersecurity");
  assert.deepEqual(mods("crowdstrike.com"), []);
  assert.equal(r["crowdstrike.com"].websiteProfile.websiteType.value, "services");
  // Full product chain where product pages were proven stays intact.
  for (const h of ["colourpop.com", "landyachtz.com", "tentree.com"]) assert.deepEqual(mods(h), ["ecommerce", "product", "checkout", "eu_consumer"], h);
  // Checkout information from sampled pages, with the page that proves it.
  for (const h of ["homewizard.com", "tentree.com"]) {
    const c = check(h, "checkout_information_signal");
    assert.equal(c.status, "pass", h);
    assert.match(c.message, /Er is geen bestelling geplaatst/);
    assert.equal(check(h, "checkout_trust").status, "unable_to_confirm", "interactive checkout is never claimed");
  }
});

import { countIndependentProducts } from "../lib/sample-quality.ts";
import { productCandidateOutcome, productHuntSentence, summarizeProductHunt } from "../lib/product-hunt-diagnostics.ts";
test("one product page with duplicate or variant markup is one product; a grid stays a grid", () => {
  const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
  const P = (name, url) => ({ "@type": "Product", name, ...(url ? { url } : {}) });
  assert.equal(countIndependentProducts(ld(P("Runner NZ")) + ld(P("Runner NZ"))), 1);
  assert.equal(countIndependentProducts(ld(P("Product")) + ld(P("Runner NZ - Size 8", "https://s.test/products/runner"))), 1);
  assert.equal(countIndependentProducts(ld(P("Shorts")) + ld(P("Shorts - Red - XS"))), 1);
  assert.equal(countIndependentProducts(ld({ "@type": "ProductGroup", name: "Shorts" }) + ld(P("Shorts Red XS")) + ld(P("Shorts Blue M"))), 1);
  assert.equal(countIndependentProducts(ld([P("Jurk rood", "https://s.test/a"), P("Broek blauw", "https://s.test/b"), P("Jas", "https://s.test/c")])), 3);
  assert.equal(countIndependentProducts(ld([P("Jurk rood"), P("Broek blauw")])), 2);
});
test("product candidates: confirmed, blocked, not loaded, missing and rejected are distinct", () => {
  const o = (a) => productCandidateOutcome({ url: "https://s.test/p/x", ...a });
  assert.equal(o({ status: "audited", httpStatus: 200, commerceEvidence: { confirmedRetailPage: true } }), "confirmed");
  assert.equal(o({ status: "unable_to_confirm", httpStatus: 403 }), "blocked");
  assert.equal(o({ status: "unable_to_confirm", httpStatus: 200, nonContent: "challenge" }), "blocked");
  assert.equal(o({ status: "unable_to_confirm", httpStatus: null, fetchFailure: "FETCH_TIMEOUT" }), "not_loaded");
  assert.equal(o({ status: "unable_to_confirm", httpStatus: 404 }), "missing");
  assert.equal(o({ status: "audited", httpStatus: 200, commerceEvidence: { confirmedRetailPage: false } }), "rejected");
  assert.equal(o({ status: "audited", httpStatus: 200, commerceEvidence: { confirmedRetailPage: true, financialOffer: true } }), "rejected");
  assert.equal(productHuntSentence(summarizeProductHunt(0, [], [])), "Geen productkandidaten gevonden in links van de bemonsterde pagina's of in de sitemap.");
  assert.match(productHuntSentence(summarizeProductHunt(5, ["sitemap"], [{ url: "https://s.test/p/a", status: "unable_to_confirm", httpStatus: 403 }, { url: "https://s.test/p/b", status: "audited", httpStatus: 200 }])), /5 productkandidaten gevonden, 2 gecontroleerd: 1 geweigerd door de website, 1 afgekeurd/);
});
