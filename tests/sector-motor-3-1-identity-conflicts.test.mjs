import test from "node:test";
import assert from "node:assert/strict";
import { arbitratePrimarySector } from "../lib/sector-arbiter.ts";

function decide(currentSector, identities) {
  return arbitratePrimarySector({
    current: { sector: currentSector, key: currentSector, label: currentSector, confidenceScore: 95 },
    schemaTypes: [],
    commerce: { product: false, addToCart: false, cartOrCheckout: false, productLinks: 0, priceCount: 0, siteSampleProduct: false, previouslyConfirmed: false },
    inventory: { vehicles: false, properties: false, jobs: false, rooms: false, menu: false, booking: false, reservation: false },
    shortStayIdentity: false,
    identity: identities.map(sector => ({ sector, sources: ["title"] })),
    bodySectors: [],
    labels: { dentist: "Tandarts", health_wellness: "Zorg", transport_travel: "Transport", hospitality: "Hospitality", news_media: "Nieuws" },
  });
}

test("Motor 3.1: dental identity outranks generic transport identity", () => {
  const decision = decide("transport_travel", ["transport_travel", "health_wellness"]);
  assert.equal(decision.sector, "health_wellness");
  assert.equal(decision.status, "probable");
  assert.ok(decision.confidenceScore <= 75);
});

test("Motor 3.1: a unique specific identity replaces unsupported generic sector", () => {
  const decision = decide("hospitality", ["health_wellness"]);
  assert.equal(decision.sector, "health_wellness");
  assert.equal(decision.commerceConfirmed, false);
});

test("Motor 3.1: competing specific identities must not be silently selected", () => {
  const decision = decide("transport_travel", ["transport_travel", "health_wellness", "real_estate"]);
  assert.equal(decision.sector, "unknown");
  assert.equal(decision.status, "uncertain");
});

test("Motor 3.1: generic identity alone remains a provisional generic sector", () => {
  const decision = decide("transport_travel", ["transport_travel"]);
  assert.equal(decision.sector, "transport_travel");
  assert.equal(decision.status, "probable");
});


test("Motor 3.1: telecom identity wins over cart, prices and catalogue without retail purchase proof", () => {
  const input = {
    current: { sector: "ecommerce", key: "ecommerce", label: "Webshop", confidenceScore: 92 },
    schemaTypes: [],
    commerce: { product: false, addToCart: false, cartOrCheckout: true, productLinks: 8, priceCount: 6, siteSampleProduct: false, previouslyConfirmed: false },
    inventory: { vehicles: false, properties: false, jobs: false, rooms: false, menu: false, booking: false, reservation: false },
    shortStayIdentity: false,
    identity: [{ sector: "telecom_technology", sources: ["meta_description"] }],
    bodySectors: [], labels: { telecom_technology: "Telecom & Technologie" },
  };
  const telecom = arbitratePrimarySector(input);
  assert.equal(telecom.sector, "telecom_technology");
  assert.equal(telecom.commerceConfirmed, false);
  const retail = arbitratePrimarySector({ ...input, commerce: { ...input.commerce, addToCart: true } });
  assert.equal(retail.sector, "ecommerce");
});
