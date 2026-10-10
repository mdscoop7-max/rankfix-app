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

test("Sector Motor 3.0: independently evidenced competing sector stays uncertain", () => {
  const result = assessSectorConflict([
    { key: "real_estate", score: 10, evidence: ["Schema: RealEstateAgent", "Evidence: inventory.properties"] },
    { key: "ecommerce", score: 8, evidence: ["Schema: OnlineStore", "Evidence: commerce.cart"] },
  ]);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.sector, null);
});

test("Sector Motor 3.0: generic unsupported runner-up does not erase strong evidence", () => {
  const result = assessSectorConflict([
    { key: "real_estate", score: 10, evidence: ["Schema: RealEstateAgent", "Evidence: inventory.properties"] },
    { key: "ecommerce", score: 8, evidence: ["Sectorspecifieke content gevonden"] },
  ]);
  assert.equal(result.status, "supported");
  assert.equal(result.sector, "real_estate");
});

test("Sector Motor 3.0: scan retains the conflict assessment as internal evidence", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /sectorMotor3Assessment:assessSectorConflict\(evidenceSectorCandidates\)/);
  assert.match(source, /secondarySectorCandidates:evidenceSectorCandidates/);
});

test("Sector Motor 3.0: vacancies alone cannot turn a shop into recruitment", () => {
  const ranked = rankSectorCandidates(evidence(["OnlineStore"], { products: true, jobs: true }), "webshop vacatures");
  assert.equal(ranked[0].key, "ecommerce");
  assert.equal(ranked.some(x => x.key === "recruitment" && x.score >= ranked[0].score), false);
});

test("Sector Motor 3.0: unknown evidence does not manufacture a sector", () => {
  assert.deepEqual(rankSectorCandidates(evidence(), ""), []);
  const result = assessSectorConflict([]);
  assert.equal(result.status, "unknown");
  assert.equal(result.confidence, 0);
});

test("Sector Motor 3.0: specific healthcare schema outranks stray retail keyword", () => {
  const ranked = rankSectorCandidates(evidence(["MedicalClinic"], { appointment: true }), "webshop afspraak");
  assert.equal(ranked[0].key, "medical_clinic");
});
