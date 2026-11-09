// P0-1 (7 Nov 2026): seven operating roles with own confidence, source evidence and
// counter-evidence; a sector is only confirmed with two independent sources.
// Synthetic evidence, no domains in code.
import test from "node:test";
import assert from "node:assert/strict";
import { determineOperatingRole, groupWordingIn, OPERATING_ROLE_LABELS } from "../lib/operating-role.ts";

const base = (o = {}) => ({ sector: "fitness_sports", key: "fitness", sectorConfidence: 90, homepage: {}, sectorSupportPages: [], otherSectorPages: [], ownShopFunction: [], retailSector: false, groupWording: null, otherActivities: [], ...o });
const page = (n, text = "eigen pagina") => ({ source: `site.test/p${n}`, text });

test("all seven roles have a Dutch label", () => {
  assert.deepEqual(Object.keys(OPERATING_ROLE_LABELS).sort(), ["holding", "manufacturer", "own_service", "platform", "publisher", "unknown", "webshop"]);
});

test("two fields of one homepage are ONE source: no confirmed sector", () => {
  const r = determineOperatingRole(base({ homepage: { own_service: ["titel noemt sportschool", "omschrijving noemt sportschool"] } }));
  assert.equal(r.role, "own_service");
  assert.equal(r.independentSources, 1);
  assert.deepEqual(r.sectorCap, { max: 70, reason: r.sectorCap.reason });
  assert.equal(r.status, "probable");
});

test("homepage + a distinct own page = two independent sources: no cap", () => {
  const r = determineOperatingRole(base({ homepage: { own_service: ["eigen vestiging"] }, sectorSupportPages: [page(1)] }));
  assert.equal(r.independentSources, 2);
  assert.equal(r.sectorCap, null);
  assert.equal(r.status, "confirmed");
});

test("platform: never confirmed as the provider it lists; own-trade sector is a conflict", () => {
  const listed = determineOperatingRole(base({ homepage: { platform: ["3.029 sportscholen vergelijken"] }, sectorSupportPages: [page(1), page(2)] }));
  assert.equal(listed.role, "platform");
  assert.ok(listed.counterEvidence.length > 0);
  assert.equal(listed.sectorCap.max, 65);
  const platform = determineOperatingRole(base({ sector: "service_marketplace", key: "service_marketplace", homepage: { platform: ["boek bij 9.000 salons"] }, sectorSupportPages: [page(1)] }));
  assert.equal(platform.role, "platform");
  assert.equal(platform.counterEvidence.length, 0);
  assert.equal(platform.sectorCap, null);
});

test("holding with several proven activities: no single confirmed sector", () => {
  const r = determineOperatingRole(base({ sector: "construction", key: "construction", groupWording: "werkmaatschappijen", otherActivities: ["real_estate"], sectorSupportPages: [page(1), page(2), page(3)] }));
  assert.equal(r.role, "holding");
  assert.equal(r.sectorCap.max, 65);
  const single = determineOperatingRole(base({ sector: "construction", key: "construction", groupWording: "groep", otherActivities: [] }));
  assert.notEqual(single.role, "holding", "a group with one activity is not a holding");
});

test("contradicting own pages: sector stays unconfirmed", () => {
  const r = determineOperatingRole(base({ homepage: { own_service: ["Onze sportschool"] }, sectorSupportPages: [page(1)], otherSectorPages: [page(2, "energie"), page(3, "energie")] }));
  assert.equal(determineOperatingRole(base({ homepage: { own_service: ["Onze sportschool"] }, sectorSupportPages: [page(1), page(4)], otherSectorPages: [page(2), page(3)] })).sectorCap, null, "a tie is no contradiction");
  assert.equal(r.sectorCap.max, 65);
  assert.ok(r.counterEvidence.some((item) => /andere activiteit/.test(item.text)));
});

test("webshop: own cart/checkout pages are functional, independent evidence", () => {
  const r = determineOperatingRole(base({ sector: "ecommerce", key: "ecommerce", retailSector: true, ownShopFunction: [page(1, "winkelwagen"), page(2, "bestelknop")] }));
  assert.equal(r.role, "webshop");
  assert.ok(r.independentSources >= 2);
  assert.equal(r.sectorCap, null);
});

test("a shop function on a museum or insurer is a secondary capability, not the role", () => {
  const r = determineOperatingRole(base({ sector: "events_culture", key: "events_culture", homepage: { own_service: ["Ons museum organiseert tentoonstellingen"] }, ownShopFunction: [page(1, "tickets kopen"), page(2, "winkelwagen")] }));
  assert.equal(r.role, "own_service");
  assert.equal(r.independentSources, 1, "a ticket shop does not corroborate the cultural activity");
  assert.equal(r.secondaryCapabilities.length, 1);
});

test("manufacturer, publisher and unknown", () => {
  assert.equal(determineOperatingRole(base({ sector: "manufacturing_industrial", key: "manufacturing_industrial", homepage: { manufacturer: ["maakt lagers"] } })).role, "manufacturer");
  assert.equal(determineOperatingRole(base({ sector: "news_media", key: "news_media", homepage: { publisher: ["nieuwssite"] } })).role, "publisher");
  const cartOnly = determineOperatingRole(base({ sector: "unknown", key: "unknown", ownShopFunction: [page(1, "winkelwagen")] }));
  assert.equal(cartOnly.role, "unknown", "a cart alone without a retail identity is insufficient for a role");
  assert.equal(cartOnly.secondaryCapabilities.length, 1);
  const unknown = determineOperatingRole(base({ sector: "unknown", key: "unknown" }));
  assert.equal(unknown.role, "unknown");
  assert.equal(unknown.confidenceScore, 0);
  assert.equal(unknown.sectorCap, null);
});

test("group wording is read from own fields only", () => {
  assert.equal(groupWordingIn("Voorbeeld Groep | Bouw en vastgoed"), "Groep");
  assert.equal(groupWordingIn("Sportschool met groepslessen"), null);
});
