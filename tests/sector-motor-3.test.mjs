import test from "node:test";
import assert from "node:assert/strict";
import { rankSectorCandidates, assessSectorConflict } from "../lib/sector-catalog.ts";

function evidence(schemaTypes = [], flags = {}) {
  const signal = (name) => ({ value: Boolean(flags[name]), confidence: flags[name] ? "high" : "low" });
  return {
    schema: { types: schemaTypes },
    commerce: { products: signal("products"), cart: signal("cart"), checkout: signal("checkout") },
    inventory: { vehicles: signal("vehicles"), properties: signal("properties"), jobs: signal("jobs"), rooms: signal("rooms"), menu: signal("menu") },
    appointments: { appointment: signal("appointment"), reservation: signal("reservation"), booking: signal("booking") },
  };
}

test("Sector Motor 3.0: structured real estate identity outranks incidental shop wording", () => {
  const ranked = rankSectorCandidates(evidence(["RealEstateAgent"], { properties: true }), "shop online makelaar");
  assert.equal(ranked[0].key, "real_estate");
});

test("Sector Motor 3.0: a product schema does not imply a multi-seller marketplace", () => {
  const ranked = rankSectorCandidates(evidence(["Product"], { products: true, cart: true }), "webshop winkelwagen");
  assert.equal(ranked[0].key, "ecommerce");
  assert.equal(ranked.some(x => x.key === "marketplace"), false);
});

test("Sector Motor 3.0: a lone word remains weaker than independent verified evidence", () => {
  const ranked = rankSectorCandidates(evidence(["Dentist"]), "webshop");
  assert.equal(ranked[0].key, "dentist");
});

test("Sector Motor 3.0: a navigation menu alone cannot establish a restaurant", () => {
  const ranked = rankSectorCandidates(evidence([], { menu: true }), "services and contact");
  assert.equal(ranked.some(x => x.key === "restaurant"), false);
});

test("Sector Motor 3.0: close contenders remain ambiguous", () => {
  const result = assessSectorConflict([
    { key: "restaurant", score: 8, evidence: ["Schema: Restaurant", "Evidence: inventory.menu"] },
    { key: "cafe_bar", score: 7, evidence: ["Schema: CafeOrCoffeeShop"] },
  ]);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.sector, null);
  assert.ok(result.confidence < 60);
});

test("Sector Motor 3.0: single keyword never yields confirmed sector", () => {
  const result = assessSectorConflict(rankSectorCandidates(evidence(), "tandarts"));
  assert.equal(result.status, "uncertain");
  assert.equal(result.sector, null);
});

test("Sector Motor 3.0: specific schema and verified inventory support identity", () => {
  const result = assessSectorConflict(rankSectorCandidates(evidence(["RealEstateAgent"], { properties: true }), "makelaar"));
  assert.equal(result.status, "supported");
  assert.equal(result.sector, "real_estate");
});
