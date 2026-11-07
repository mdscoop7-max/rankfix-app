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

test("NS and Arriva (catalog label transport) are judged correctly; a carrier never counts as logistics", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = JSON.parse(readFileSync(new URL("./fixtures/testlab-144/catalog-fresh-144-20261029.json", import.meta.url), "utf8"));
  for (const host of ["nsinternational.com", "arriva.nl"]) {
    const site = catalog.sites.find((s) => s.hosts.includes(host));
    assert.equal(site?.expected, "transport", host);
    assert.equal(sectorVerdict(site.expected, { sector: "transport_travel", key: "passenger_transport" }).verdict, "equivalent", host);
    assert.equal(sectorVerdict("logistics", { sector: "transport_travel", key: "passenger_transport" }).verdict, "mismatch", host);
  }
  // Recorded engine outcome for NS (96-site replay): passenger transport.
  const identity = JSON.parse(readFileSync(new URL("./fixtures/testlab-96-replay/identity.json", import.meta.url), "utf8"));
  assert.ok(JSON.stringify(identity).includes("ns.nl"));
});

test("engineering vs architecture & design is decided by the engine's sector evidence", () => {
  const arch = (evidence, label = "Architectuur & ontwerp") => sectorVerdict("engineering", { sector: "professional_services", key: "architecture_design", label, evidence });
  assert.equal(arch(["Eigen identiteit: ingenieursbureau voor infrastructuur en waterbouw"]).verdict, "equivalent");
  assert.equal(arch(["Own identity: engineering and design consultancy"]).verdict, "equivalent");
  assert.equal(arch(["Eigen identiteit: architectenbureau voor woningbouw"]).verdict, "mismatch");
  assert.equal(arch(["Interior design studio"]).verdict, "mismatch");
  // Both or neither: not proven either way.
  const both = arch(["Architecten en ingenieurs: ontwerp en engineering"]);
  assert.equal(both.verdict, "partial");
  assert.equal(arch([], "Ontwerp & advies").verdict, "partial");
  // Without evidence nothing is approved automatically.
  assert.notEqual(sectorVerdict("engineering", { sector: "professional_services", key: "architecture_design" }).verdict, "equivalent");
  // The rule applies only to engineering; an architecture label keeps its own subtype.
  assert.equal(sectorVerdict("architecture_design", { sector: "professional_services", key: "architecture_design" }).verdict, "exact");
});
