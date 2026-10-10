import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { arbitratePrimarySector, hasStoreSchema, GENERIC_WORD_SECTORS, collectIdentityEvidence, reconcileModulesAfterArbitration } from "../lib/sector-arbiter.ts";

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
    identity: [],
    bodySectors: [],
    labels: LABELS,
  };
  const { identitySectors, ...rest } = overrides;
  if (identitySectors) rest.identity = identitySectors.map(sector => ({ sector, sources: ["title"] }));
  return {
    ...base, ...rest,
    current: { ...base.current, ...(rest.current || {}) },
    commerce: { ...base.commerce, ...(rest.commerce || {}) },
    inventory: { ...base.inventory, ...(rest.inventory || {}) },
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
  assert.match(route, /import \{[^}]*\barbitratePrimarySector\b[^}]*\} from "@\/lib\/sector-arbiter"/);
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


// ---- Review round 1: the four hardening points ----

test("Point 1: weak webshop evidence is a hint, never a confirmed webshop", () => {
  const weakCases = [
    { product: true, priceCount: 5 },
    { product: true, productLinks: 6 },
    { technologyOnly: true },
  ];
  for (const commerce of weakCases) {
    const decision = arbitratePrimarySector(input({ schemaTypes: commerce.product ? ["Product"] : [], commerce }));
    assert.equal(decision.storefrontGrade, "weak", JSON.stringify(commerce));
    assert.equal(decision.commerceConfirmed, false, JSON.stringify(commerce));
    assert.notEqual(decision.sector, "ecommerce");
    assert.ok(decision.secondaryActivities.some(item => item.sector === "ecommerce" && /niet bevestigd/i.test(item.label)));
    assert.ok(decision.reasons.some(reason => /aanwijzing voor een webshop, geen bevestiging/.test(reason)));
  }
});

test("Point 1: a platform fingerprint alone never outweighs a proven specialist identity", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "health_wellness", key: "dentist", label: "Tandarts", confidenceScore: 92 },
    schemaTypes: ["Dentist"], commerce: { technologyOnly: true },
  }));
  assert.equal(decision.sector, "health_wellness");
  assert.equal(decision.commerceConfirmed, false);
});

test("Point 1: hard commerce evidence from earlier layers still confirms a webshop", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "ecommerce", key: "ecommerce", label: "Webshop", confidenceScore: 90 },
    commerce: { previouslyConfirmed: true },
  }));
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.commerceConfirmed, true);
});

test("Point 2: equal structural proof for two sectors is uncertain even when an earlier layer picked one", () => {
  for (const pick of ["health_wellness", "automotive"]) {
    const decision = arbitratePrimarySector(input({
      current: { sector: pick, key: pick, label: pick, confidenceScore: 92 },
      schemaTypes: ["Dentist", "AutoDealer"],
    }));
    assert.equal(decision.sector, "unknown", pick);
    assert.equal(decision.status, "uncertain");
    assert.ok(decision.secondaryActivities.some(item => item.sector === "health_wellness"));
    assert.ok(decision.secondaryActivities.some(item => item.sector === "automotive"));
  }
});

test("Point 2: a lead of only one proof group is not enough, two groups are", () => {
  const narrow = arbitratePrimarySector(input({
    current: { sector: "hospitality", key: "hotel", label: "Hotel", confidenceScore: 90 },
    schemaTypes: ["Hotel", "Dentist"], inventory: { rooms: true, booking: true },
  }));
  assert.equal(narrow.status, "uncertain");
  const clear = arbitratePrimarySector(input({
    current: { sector: "hospitality", key: "hotel", label: "Hotel", confidenceScore: 90 },
    schemaTypes: ["Hotel"], shortStayIdentity: true,
  }));
  assert.equal(clear.sector, "hospitality");
  assert.equal(clear.status, "supported");
});

test("Point 2: contradictory specialists never override a verified storefront with a sector guess", () => {
  const decision = arbitratePrimarySector(input({
    schemaTypes: ["Dentist", "AutoDealer", "Store"], commerce: { addToCart: true, cartOrCheckout: true },
  }));
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.commerceConfirmed, true);
});

test("Point 3: valid generic modules survive a sector change, sector-owned modules do not", () => {
  const owned = ["hospitality", "accommodation", "real_estate", "transport_travel", "tourism_recreation"];
  const base = {
    sectorOwned: owned, newSectorModules: [], capabilityModules: ["local", "quality_trust"],
    commerceModules: ["ecommerce", "product", "pricing_currency", "merchant", "checkout"], euConsumerModule: "eu_consumer",
    commerceConfirmed: false, euConsumerApplicable: true,
  };
  const after = reconcileModulesAfterArbitration({
    ...base,
    previous: ["core_seo", "geo", "technical", "local", "lead_conversion", "accessibility", "hospitality", "ecommerce", "eu_consumer"],
  });
  for (const keep of ["core_seo", "geo", "technical", "local", "lead_conversion", "accessibility", "quality_trust"]) assert.ok(after.includes(keep), keep);
  for (const drop of ["hospitality", "ecommerce", "eu_consumer"]) assert.equal(after.includes(drop), false, drop);
  assert.equal(new Set(after).size, after.length);
});

test("Point 3: core modules can never disappear and commerce modules follow the confirmed decision", () => {
  const confirmed = reconcileModulesAfterArbitration({
    previous: [], sectorOwned: ["hospitality"], newSectorModules: [], capabilityModules: [],
    commerceModules: ["ecommerce", "product"], euConsumerModule: "eu_consumer", commerceConfirmed: true, euConsumerApplicable: false,
  });
  assert.deepEqual([...confirmed].sort(), ["core_seo", "ecommerce", "geo", "product", "technical"]);
  const withEu = reconcileModulesAfterArbitration({
    previous: [], sectorOwned: [], newSectorModules: [], capabilityModules: [],
    commerceModules: ["ecommerce"], euConsumerModule: "eu_consumer", commerceConfirmed: true, euConsumerApplicable: true,
  });
  assert.ok(withEu.includes("eu_consumer"));
  const sectorSwap = reconcileModulesAfterArbitration({
    previous: ["core_seo", "geo", "technical", "hospitality", "local"], sectorOwned: ["hospitality", "real_estate"],
    newSectorModules: ["local", "lead_conversion", "real_estate"], capabilityModules: [],
    commerceModules: ["ecommerce"], commerceConfirmed: false, euConsumerApplicable: false,
  });
  assert.ok(sectorSwap.includes("real_estate") && sectorSwap.includes("local") && !sectorSwap.includes("hospitality"));
});

test("Point 3: the scan route reconciles modules instead of rebuilding them from a fixed base", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const block = route.slice(route.indexOf("// Sector Motor 3.1"), route.indexOf("const arbiterFinalSector"));
  assert.match(block, /reconcileModulesAfterArbitration\(/);
  assert.doesNotMatch(block, /baseModules/);
});

test("Point 4: identity is collected per reliable source and general text is not a source", () => {
  const sectors = [{ sector: "hospitality", pattern: /\b(hotel|resort)\b/i }, { sector: "real_estate", pattern: /\b(makelaar|real estate)\b/i }];
  const evidence = collectIdentityEvidence(sectors, {
    title: "Grand Hotel - Welcome", h1: "Plan your visit", meta_description: "", url: "makelaar-example/home",
  });
  assert.deepEqual(evidence.find(item => item.sector === "hospitality").sources, ["title"]);
  assert.deepEqual(evidence.find(item => item.sector === "real_estate").sources, ["url"]);
  assert.equal(collectIdentityEvidence(sectors, { title: "Home" }).length, 0);
});

test("Point 4: a URL-only identity term is not identity evidence", () => {
  const decision = arbitratePrimarySector(input({
    current: { sector: "hospitality", key: "hospitality", label: "Hotels & hospitality", confidenceScore: 88 },
    identity: [{ sector: "hospitality", sources: ["url"] }],
    bodySectors: ["hospitality"],
  }));
  assert.equal(decision.sector, "unknown");
  assert.equal(decision.status, "uncertain");
  const withTitle = arbitratePrimarySector(input({
    current: { sector: "hospitality", key: "hospitality", label: "Hotels & hospitality", confidenceScore: 88 },
    identity: [{ sector: "hospitality", sources: ["url", "title"] }],
  }));
  assert.equal(withTitle.sector, "hospitality");
  assert.equal(withTitle.status, "probable");
  assert.ok(withTitle.confidenceScore <= 75);
});

test("Point 4: audited site-sample titles and descriptions count; quality text does not", () => {
  const sectors = [{ sector: "transport_travel", pattern: /\b(logistiek|logistics)\b/i }];
  assert.equal(collectIdentityEvidence(sectors, { site_sample_title: "Logistics services" })[0].sources[0], "site_sample_title");
  assert.equal(collectIdentityEvidence(sectors, { title: "Home", site_sample_title: "Contact" }).length, 0);
});

test("Point 4: the scan route feeds identity from title/h1/meta/site-sample only", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const block = route.slice(route.indexOf("// Sector Motor 3.1"), route.indexOf("const arbiterFinalSector"));
  assert.match(block, /collectIdentityEvidence\(/);
  for (const forbidden of [/identityText/, /multiPageIdentityText/, /pageQualityText/, /reconciledIdentitySource/, /sectorSource/, /qualityText/]) {
    assert.doesNotMatch(block, forbidden);
  }
});

test("Arbiter decision is never overwritten after it is made (static + invariant)", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const start = route.indexOf("const arbiterFinalSector");
  const end = route.indexOf("const classification = {", start);
  assert.ok(start > 0 && end > start);
  const invariantStart = route.indexOf("// Arbiter invariant", start);
  assert.ok(invariantStart > start && invariantStart < end, "invariant check must exist before the classification is built");
  const between = route.slice(start, invariantStart);
  const assignment = /(?:sectorProfile\.(?:sector|key|label|confidence|confidenceScore|applicableModules)|finalCommerceDecision\.confirmed|masterEvidence\.activeModules)\s*=[^=]/;
  assert.match(between, /masterEvidence\.primarySector = \{\s*key: sectorProfile\.key,/, "published primary sector must derive from the arbiter-decided profile");
  assert.doesNotMatch(between, assignment, "no code between the arbiter and the invariant may overwrite the decision");
  const after = route.slice(end);
  assert.doesNotMatch(after, /sectorProfile\.(?:sector|key|label|confidenceScore)\s*=[^=]/, "nothing after the classification may overwrite the sector");
  assert.doesNotMatch(after, /finalCommerceDecision\.confirmed\s*=[^=]/);
});
