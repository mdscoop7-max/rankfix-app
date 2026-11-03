// 3 Nov 2026: in the TestLab a matching MAIN sector is not proof of the BRANCH.
// "Equivalent" requires a subtype that shows the expected branch; a generic main
// sector is "partial" (never counted as correct), another branch is a mismatch.
import test from "node:test";
import assert from "node:assert/strict";
import { branchComparison, sectorVerdict } from "../scripts/testlab/labels.mjs";

test("same main sector with another specific branch is a mismatch, not equivalent", () => {
  assert.equal(sectorVerdict("payments", { sector: "financial_services", key: "financial_insurance" }).verdict, "mismatch");
  assert.equal(sectorVerdict("banking", { sector: "financial_services", key: "financial_payments" }).verdict, "mismatch");
  assert.equal(sectorVerdict("legal_services", { sector: "professional_services", key: "accounting" }).verdict, "mismatch");
  assert.equal(sectorVerdict("engineering", { sector: "professional_services", key: "legal" }).verdict, "mismatch");
  assert.equal(sectorVerdict("manufacturing", { sector: "manufacturing_industrial", key: "construction_infrastructure" }).verdict, "mismatch");
  assert.equal(sectorVerdict("veterinary_animal_care", { sector: "health_wellness", key: "pharmacy" }).verdict, "mismatch");
  assert.equal(sectorVerdict("logistics", { sector: "transport_travel", key: "passenger_transport" }).verdict, "mismatch");
  assert.match(sectorVerdict("payments", { sector: "financial_services", key: "financial_insurance" }).reason, /branche wijkt af/);
});

test("main sector right but no branch subtype is partial, never a correct branch", () => {
  for (const [label, profile] of [
    ["engineering", { sector: "professional_services", key: "professional_services" }],
    ["research", { sector: "education", key: "education" }],
    ["construction", { sector: "manufacturing_industrial", key: "manufacturing_industrial" }],
    ["payments", { sector: "financial_services", key: "financial_services" }],
    ["legal_services", { sector: "professional_services" }],
  ]) {
    const v = sectorVerdict(label, profile);
    assert.equal(v.verdict, "partial", `${label} ${JSON.stringify(profile)}`);
    assert.equal(v.branch, "generic");
  }
});

test("real parent/child and family relations stay equivalent", () => {
  assert.equal(sectorVerdict("banking", { sector: "financial_services", key: "financial_banking" }).verdict, "equivalent");
  assert.equal(sectorVerdict("legal_services", { sector: "professional_services", key: "legal" }).verdict, "equivalent");
  assert.equal(sectorVerdict("museums_culture", { sector: "events_culture", key: "museum_culture" }).verdict, "equivalent");
  assert.equal(sectorVerdict("veterinary_animal_care", { sector: "health_wellness", key: "veterinary" }).verdict, "equivalent");
  assert.equal(sectorVerdict("construction", { sector: "manufacturing_industrial", key: "construction_infrastructure" }).verdict, "equivalent");
  // Broad labels without a branch requirement: any subtype of the main sector.
  assert.equal(sectorVerdict("finance", { sector: "financial_services", key: "financial_insurance" }).verdict, "equivalent");
  assert.equal(sectorVerdict("healthcare", { sector: "health_wellness", key: "healthcare_academic" }).verdict, "equivalent");
  assert.equal(sectorVerdict("manufacturing", { sector: "manufacturing_industrial", key: "semiconductors_electronics" }).verdict, "equivalent");
  assert.equal(sectorVerdict("manufacturing", { sector: "manufacturing_industrial", key: "manufacturing_industrial" }).verdict, "equivalent");
  assert.equal(sectorVerdict("culture", { sector: "events_culture", key: "events_culture" }).verdict, "equivalent");
  assert.equal(sectorVerdict("logistics", { sector: "transport_travel", key: "postal_logistics" }).verdict, "equivalent");
  assert.equal(sectorVerdict("logistics", { sector: "maritime_ports", key: "maritime_ports" }).verdict, "equivalent");
  assert.equal(sectorVerdict("insurance", { sector: "financial_services", key: "financial_insurance" }).verdict, "equivalent");
  assert.equal(sectorVerdict("healthcare", { sector: "health_wellness", key: "veterinary" }).verdict, "equivalent");
  assert.equal(sectorVerdict("transport", { sector: "transport_travel", key: "passenger_transport" }).verdict, "equivalent");
  // Local retail family stays as before.
  assert.equal(sectorVerdict("retail", { sector: "health_wellness", key: "optician" }).verdict, "equivalent");
});

test("exact, unconfirmed and other-sector verdicts are unchanged", () => {
  assert.equal(sectorVerdict("ecommerce", { sector: "ecommerce", key: "ecommerce" }).verdict, "exact");
  assert.equal(sectorVerdict("engineering", { sector: "unknown", key: "unknown" }).verdict, "unconfirmed");
  assert.equal(sectorVerdict("engineering", { sector: "manufacturing_industrial", key: "brand_manufacturer" }).verdict, "mismatch");
  assert.equal(branchComparison("telecom", { sector: "telecom_technology", key: "telecom_technology" }), "match");
});
