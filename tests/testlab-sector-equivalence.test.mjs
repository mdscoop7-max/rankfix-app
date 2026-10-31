// 31 Oct: a confirmed webshop proves the sales channel, never the branch.
// TestLab must not approve a wrong branch as "equivalent".
import test from "node:test";
import assert from "node:assert/strict";
import { sectorVerdict, compareSector, isGoodsRetailSector } from "../scripts/testlab/labels.mjs";

test("webshop with a wrong branch is a mismatch, not equivalent (Leen Bakker)", () => {
  const v = sectorVerdict("ecommerce", { sector: "food_local_retail", key: "bakery", websiteType: "ecommerce_store" });
  assert.equal(v.verdict, "mismatch");
  assert.match(v.reason, /Webshop bevestigd, branche wijkt af/);
  for (const p of [
    { sector: "transport_travel", key: "passenger_transport" },
    { sector: "financial_services", key: "financial_banking" },
    { sector: "professional_services", key: "professional_services" },
    { sector: "beauty", key: "hair_salon" },
    { sector: "health_wellness", key: "dentist" },
  ]) {
    assert.equal(sectorVerdict("retail", { ...p, websiteType: "ecommerce_store" }).verdict, "mismatch", JSON.stringify(p));
    assert.equal(sectorVerdict("ecommerce", { ...p, websiteType: "ecommerce_store" }).verdict, "mismatch", JSON.stringify(p));
  }
});

test("webshop whose sector is the goods niche stays equivalent", () => {
  for (const p of [
    { sector: "beauty", key: "beauty" },
    { sector: "food_local_retail", key: "food_local_retail" },
    { sector: "health_wellness", key: "optician" },
  ]) {
    assert.ok(isGoodsRetailSector(p), JSON.stringify(p));
    assert.equal(sectorVerdict("ecommerce", { ...p, websiteType: "ecommerce_store" }).verdict, "equivalent", JSON.stringify(p));
  }
  assert.ok(isGoodsRetailSector({ sector: "ecommerce", key: "supermarket" }));
  assert.equal(sectorVerdict("ecommerce", { sector: "ecommerce", key: "ecommerce", websiteType: "ecommerce_store" }).verdict, "exact");
});

test("without a confirmed webshop a niche sector is not rescued by the channel rule", () => {
  assert.equal(sectorVerdict("ecommerce", { sector: "beauty", key: "beauty", websiteType: "services" }).verdict, "mismatch");
});

test("loose cross-family relations no longer approve a wrong branch", () => {
  assert.equal(compareSector("engineering", { sector: "manufacturing_industrial" }).sectorMatch, false);
  assert.equal(compareSector("construction", { sector: "home_services" }).sectorMatch, false);
  // A port authority is logistics infrastructure: a true family relation.
  assert.equal(compareSector("logistics", { sector: "maritime_ports" }).sectorMatch, true);
  // A local food retailer is retail (label "retail"), not a webshop label.
  assert.equal(compareSector("retail", { sector: "food_local_retail", key: "bakery" }).sectorMatch, true);
  assert.equal(compareSector("ecommerce", { sector: "food_local_retail", key: "bakery" }).sectorMatch, false);
});
