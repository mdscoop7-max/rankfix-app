import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { arbitratePrimarySector, hasStoreSchema, GENERIC_WORD_SECTORS } from "../lib/sector-arbiter.ts";

const LABELS = {
  hospitality: "Hotels & hospitality", transport_travel: "Transport & Logistiek", tourism_recreation: "Toerisme & Recreatie",
  real_estate: "Vastgoed & Makelaardij", automotive: "Automotive", health_wellness: "Zorg & Gezondheid",
  news_media: "Nieuws & Media", saas_b2b: "SaaS / B2B", food_local_retail: "Voeding & lokale retail",
};

function input(overrides = {}) {
  const base = {
    current: { sector: "unknown", key: "unknown", label: "Sector niet bevestigd", confidenceScore: 0 },
    schemaTypes: [],
    commerce: { product: false, addToCart: false, cartOrCheckout: false, productLinks: 0, priceCount: 0, siteSampleProduct: false, previouslyConfirmed: false },
    inventory: { vehicles: false, properties: false, jobs: false, rooms: false, menu: false, booking: false, reservation: false },
    shortStayIdentity: false,
    identitySectors: [],
    bodySectors: [],
    labels: LABELS,
  };
  return {
    ...base, ...overrides,
    current: { ...base.current, ...(overrides.current || {}) },
    commerce: { ...base.commerce, ...(overrides.commerce || {}) },
    inventory: { ...base.inventory, ...(overrides.inventory || {}) },
  };
}

test("Arbiter: verified storefront beats generic delivery/tours/stay wording (country-neutral)", () => {
  for (const wrong of ["transport_travel", "tourism_recreation", "hospitality"]) {
    const decision = arbitratePrimarySector(input({
      current: { sector: wrong, key: wrong, label: LABELS[wrong], confidenceScore: 95 },
      schemaTypes: ["OnlineStore", "FurnitureStore", "Product", "Organization"],
      commerce: { product: true, addToCart: true, cartOrCheckout: true, productLinks: 12, priceCount: 20 },
      bodySectors: ["transport_travel", "tourism_recreation", "hospitality"],
    }));
    assert.equal(decision.sector, "ecommerce", wrong);
    assert.equal(decision.role, "storefront");
    assert.equal(decision.status, "supported");
    assert.equal(decision.commerceConfirmed, true);
    assert.ok(decision.secondaryActivities.some(item => item.sector === wrong && item.basis === "body_text"));
  }
});

test("Arbiter: store schema plus cart structure is a storefront even without a product page", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "tourism_recreation", key: "tourism_recreation", label: LABELS.tourism_recreation, confidenceScore: 95 },
    schemaTypes: ["Store"], commerce: { cartOrCheckout: true },
  }));
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.storefrontGrade, "strong");
});

test("Arbiter: international corporate site with retail schema is not a webshop and not a hotel", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "hospitality", key: "hospitality", label: LABELS.hospitality, confidenceScore: 88 },
    schemaTypes: ["Organization", "FurnitureStore"],
    bodySectors: ["hospitality", "tourism_recreation"],
  }));
  assert.equal(decision.role, "corporate_website");
  assert.equal(decision.sector, "general_business");
  assert.equal(decision.commerceConfirmed, false);
  assert.notEqual(decision.sector, "hospitality");
  assert.ok(decision.secondaryActivities.some(item => item.sector === "retail"));
  assert.ok(decision.confidenceScore < 80);
});

test("Arbiter: generic words in body text alone never create a primary sector", () => {
  for (const sector of GENERIC_WORD_SECTORS) {
    if (sector === "general_business") continue;
    const decision = arbitratePrimarySector(input({
      current: { sector, key: sector, label: LABELS[sector] || sector, confidenceScore: 88 },
      bodySectors: [sector],
    }));
    assert.equal(decision.sector, "unknown", sector);
    assert.equal(decision.status, "uncertain");
    assert.ok(decision.confidenceScore < 60);
  }
});

test("Arbiter: a real hotel keeps its sector with structural evidence", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "hospitality", key: "hotel", label: "Hotel / accommodatie", confidenceScore: 90 },
    schemaTypes: ["Hotel"], inventory: { rooms: true, booking: true }, identitySectors: ["hospitality"],
  }));
  assert.equal(decision.sector, "hospitality");
  assert.equal(decision.status, "supported");
  assert.equal(decision.role, "specialist_business");
});

test("Arbiter: a real transport company needs structural or identity proof, not delivery wording", () => {
  const structural = arbitratePrimarySector(input({
    current: { sector: "transport_travel", key: "transport_travel", label: LABELS.transport_travel, confidenceScore: 80 },
    schemaTypes: ["Airline"], identitySectors: ["transport_travel"],
  }));
  assert.equal(structural.sector, "transport_travel");
  const identityOnly = arbitratePrimarySector(input({
    current: { sector: "transport_travel", key: "transport_travel", label: LABELS.transport_travel, confidenceScore: 90 },
    identitySectors: ["transport_travel"],
  }));
  assert.equal(identityOnly.sector, "transport_travel");
  assert.equal(identityOnly.status, "probable");
  assert.ok(identityOnly.confidenceScore <= 75);
});

test("Arbiter: strong specialist identity keeps commerce as secondary function", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "automotive", key: "automotive", label: LABELS.automotive, confidenceScore: 90 },
    schemaTypes: ["AutoDealer", "Store"], inventory: { vehicles: true },
    commerce: { addToCart: true, cartOrCheckout: true },
  }));
  assert.equal(decision.sector, "automotive");
  assert.equal(decision.role, "specialist_business");
  assert.equal(decision.commerceConfirmed, true);
});

test("Arbiter: weak product/price signals lose to structural real estate identity", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "ecommerce", key: "ecommerce", label: "Webshop", confidenceScore: 80 },
    schemaTypes: ["RealEstateAgent", "Product"], inventory: { properties: true },
    commerce: { product: true, priceCount: 8 },
  }));
  assert.equal(decision.sector, "real_estate");
  assert.equal(decision.commerceConfirmed, false);
});

test("Arbiter: weak product evidence without competitor stays a probable webshop, never supported", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "unknown", key: "unknown", label: "Sector niet bevestigd", confidenceScore: 0 },
    schemaTypes: ["Product"], commerce: { product: true, priceCount: 5 },
  }));
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.status, "probable");
});

test("Arbiter: contested structural sectors yield an explicit uncertain status", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "unknown", key: "unknown", label: "Sector niet bevestigd", confidenceScore: 0 },
    schemaTypes: ["Dentist", "AutoDealer"],
  }));
  assert.equal(decision.sector, "unknown");
  assert.equal(decision.status, "uncertain");
});

test("Arbiter: three competing identity terms are uncertain instead of a confident guess", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "hospitality", key: "hospitality", label: LABELS.hospitality, confidenceScore: 88 },
    identitySectors: ["hospitality", "transport_travel", "tourism_recreation"],
  }));
  assert.equal(decision.status, "uncertain");
  assert.equal(decision.sector, "unknown");
});

test("Arbiter: previously confirmed webshop keeps its decision and is never downgraded by generic sectors", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "ecommerce", key: "ecommerce", label: "Webshop / e-commerce", confidenceScore: 90 },
    schemaTypes: ["Product"], commerce: { product: true, previouslyConfirmed: true },
    bodySectors: ["transport_travel"],
  }));
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.commerceConfirmed, true);
});

test("Arbiter: decision is deterministic and exposes reasons for every outcome", () => {
  const cases = [input(), input({ schemaTypes: ["Store"] }), input({ schemaTypes: ["Hotel"] }), input({ commerce: { siteSampleProduct: true } })];
  for (const item of cases) {
    const a = arbitratePrimarySector(item);
    const b = arbitratePrimarySector(item);
    assert.deepEqual(a, b);
    assert.ok(a.reasons.length > 0);
    assert.ok(["supported", "probable", "uncertain"].includes(a.status));
  }
});

test("Arbiter: store schema detection is generic and not brand based", () => {
  assert.equal(hasStoreSchema(["FurnitureStore"]), true);
  assert.equal(hasStoreSchema(["ClothingStore"]), true);
  assert.equal(hasStoreSchema(["OnlineStore"]), true);
  assert.equal(hasStoreSchema(["Organization", "WebSite"]), false);
});

test("Arbiter: source contains no brand, hostname or country exceptions", async () => {
  const source = await readFile(new URL("../lib/sector-arbiter.ts", import.meta.url), "utf8");
  for (const forbidden of [/ikea/i, /discountoffice/i, /coolblue/i, /\.nl\b/i, /\.com\b/i, /hostname\s*===/i]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("Arbiter is wired as the final sector decision before the Master primary sector is published", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /import \{ arbitratePrimarySector, arbiterEvidenceFromScan, summarizeArbiterDecision \} from "@\/lib\/sector-arbiter"/);
  const arbiterAt = route.indexOf("arbitratePrimarySector({");
  const publishedAt = route.indexOf("masterEvidence.primarySector = {", arbiterAt);
  assert.ok(arbiterAt > 0 && publishedAt > arbiterAt, "arbiter must run before primarySector is published");
  assert.match(route, /sectorArbiter\?:unknown/);
  assert.doesNotMatch(route, /ikea/i);
});

// ---- Behavioural fixtures: real buildScanEvidence output through the arbiter ----
import { buildScanEvidence } from "../lib/scan-evidence.ts";
import { arbiterEvidenceFromScan } from "../lib/sector-arbiter.ts";

const page = (url, body, jsonLd = []) => `<html><head><title>Home</title>${jsonLd.map(item => `<script type="application/ld+json">${JSON.stringify(item)}</script>`).join("")}</head><body>${body}</body></html>`;
const GENERIC_NOISE = `<p>Home delivery and transport options. Discover guided tours and plan your stay. Hotel restaurant partners, travel news and logistics updates.</p>`;

function decide(html, url, extra = {}, overrides = {}) {
  const evidence = buildScanEvidence({ url, html });
  return arbitratePrimarySector(input({
    ...arbiterEvidenceFromScan(evidence, { siteSampleProduct: false, previouslyConfirmed: false, ...extra }),
    ...overrides,
  }));
}

test("Fixture: retail storefront with generic delivery/tours/stay copy is a webshop", () => {
  const html = page("https://shop.example/", `${GENERIC_NOISE}
    <a href="/cart" class="cart-link">Cart</a><a href="/checkout">Checkout</a>
    <a href="/products/sofa-1">Sofa</a><a href="/products/table-2">Table</a><a href="/products/lamp-3">Lamp</a>
    <button>Add to cart</button><span>€ 199</span><span>€ 249</span><span>€ 29</span>`,
    [{ "@type": "FurnitureStore", name: "Shop" }, { "@type": "Product", name: "Sofa", offers: { "@type": "Offer", price: "199" } }]);
  const decision = decide(html, "https://shop.example/", {}, {
    current: { sector: "transport_travel", key: "transport_travel", label: "Transport & Logistiek", confidenceScore: 90 },
    bodySectors: ["transport_travel", "tourism_recreation", "hospitality"],
  });
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.commerceConfirmed, true);
});

test("Fixture: corporate retail-brand site without purchase flow is neither webshop nor hotel", () => {
  const html = page("https://corporate.example/", `${GENERIC_NOISE}<h1>About the company</h1><a href="/careers">Careers</a>`,
    [{ "@type": "Organization", name: "Group" }, { "@type": "FurnitureStore", name: "Group retail" }]);
  const decision = decide(html, "https://corporate.example/", {}, {
    current: { sector: "hospitality", key: "hospitality", label: "Hotels & hospitality", confidenceScore: 88 },
    bodySectors: ["hospitality", "tourism_recreation"],
  });
  assert.equal(decision.role, "corporate_website");
  assert.equal(decision.commerceConfirmed, false);
  assert.ok(decision.confidenceScore < 80);
});

test("Fixture: plain informational page whose only sector clue is body text stays unconfirmed", () => {
  const html = page("https://info.example/", `${GENERIC_NOISE}<h1>Welcome</h1>`, [{ "@type": "Organization", name: "Org" }]);
  const decision = decide(html, "https://info.example/", {}, {
    current: { sector: "tourism_recreation", key: "tourism_recreation", label: "Toerisme & Recreatie", confidenceScore: 95 },
    bodySectors: ["tourism_recreation"],
  });
  assert.equal(decision.status, "uncertain");
  assert.equal(decision.sector, "unknown");
});

test("Fixture: structured hotel page keeps hospitality", () => {
  const html = page("https://stay.example/", `<h1>Rooms</h1><p>Book now. Rooms and suites.</p><a href="/booking">Book now</a>`,
    [{ "@type": "Hotel", name: "Stay" }]);
  const decision = decide(html, "https://stay.example/", {}, {
    current: { sector: "hospitality", key: "hotel", label: "Hotel / accommodatie", confidenceScore: 90 },
    identitySectors: ["hospitality"],
  });
  assert.equal(decision.sector, "hospitality");
  assert.notEqual(decision.status, "uncertain");
});
