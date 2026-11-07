import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectorVerdict } from "../scripts/testlab/labels.mjs";

// sector80 export of 6 Nov (993161a8): 33 "mismatches", nearly all literal label
// differences. Every sector80 label must map to a main sector, and a generic
// main-sector answer must be "partial", never "exact"/"equivalent".
const catalog = JSON.parse(readFileSync(new URL("./fixtures/testlab-144/catalog-sector-80-20261106.json", import.meta.url), "utf8"));

test("main sector right is partial or better for every sector80 label", () => {
  const cases = {
    fashion_retail: ["ecommerce", "ecommerce"], supermarket: ["ecommerce", "ecommerce"], museum: ["events_culture", "museum_culture"],
    theatre: ["events_culture", "events_culture"], university: ["education", "education"], staffing: ["recruitment", "recruitment"],
    payment_services: ["financial_services", "financial_payments"], mortgage_advice: ["financial_services", "financial_mortgage"],
    parcel_delivery: ["transport_travel", "postal_logistics"], rail_transport: ["transport_travel", "passenger_transport"],
    port_operator: ["maritime_ports", "maritime_ports"], hospital: ["health_wellness", "healthcare_academic"], architecture: ["professional_services", "architecture_design"],
  };
  const v = (label, [sector, key]) => sectorVerdict(label, { sector, key }).verdict;
  for (const [label, p] of Object.entries(cases)) assert.notEqual(v(label, p), "mismatch", label);
  assert.equal(v("fashion_retail", ["ecommerce", "ecommerce"]), "partial");
  assert.equal(v("rail_transport", ["transport_travel", "passenger_transport"]), "partial");
  assert.equal(v("payment_services", ["financial_services", "financial_payments"]), "equivalent");
});

test("a wrong main sector stays a mismatch; unknown stays unconfirmed", () => {
  assert.equal(sectorVerdict("accounting", { sector: "health_wellness", key: "health_wellness" }).verdict, "mismatch");
  assert.equal(sectorVerdict("fashion_retail", { sector: "health_wellness", key: "health_wellness" }).verdict, "mismatch");
  assert.equal(sectorVerdict("museum", { sector: "unknown", key: "unknown" }).verdict, "unconfirmed");
  assert.equal(sectorVerdict("beauty_salon", { sector: "health_wellness", key: "health_wellness" }).verdict, "partial");
});

test("every sector80 label has a mapping (no literal-label mismatches)", () => {
  const unmapped = [...new Set(catalog.sites.map((s) => s.expected))].filter((label) => sectorVerdict(label, { sector: "unknown" }).expectedSector === label);
  assert.deepEqual(unmapped, []);
});
