import test from "node:test";
import assert from "node:assert/strict";
import { resolvePrimaryWebsiteType } from "../lib/website-type-evidence.ts";

function type(primarySector, primaryKey = primarySector, commerceConfirmed = false, models = [], technologySiteType = "Webshop") {
  return resolvePrimaryWebsiteType({ primarySector, primaryKey, commerceConfirmed, businessModels: models, technologySiteType });
}

test("payment processing and financial service platforms are not retail shops, even with checkout widgets", () => {
  for (const key of ["financial_payments", "financial_banking", "financial_insurance"]) {
    assert.equal(type("financial_services", key, false), "Website");
    assert.equal(type("financial_services", key, true), "Website");
  }
});

test("primary ecommerce needs confirmed retail commerce to be called webshop", () => {
  assert.equal(type("ecommerce", "ecommerce", true), "Webshop");
  assert.equal(type("ecommerce", "ecommerce", false), "Website");
});

test("embedded Shopify or secondary sales do not redefine a school or service business", () => {
  for (const sector of ["education", "health_wellness", "professional_services", "manufacturing_industrial", "government", "news_media"]) {
    assert.equal(type(sector, sector, false), "Website");
    assert.equal(type(sector, sector, true), "Website");
  }
});

test("recruitment and service bookings are explicit primary website model features", () => {
  assert.equal(type("recruitment", "recruitment", false, ["recruitment"]), "Recruitmentwebsite");
  assert.equal(type("hospitality", "hotel", false, ["bookings"]), "Boekings-/afsprakenwebsite");
  assert.equal(type("health_wellness", "health_wellness", false, ["appointments"]), "Boekings-/afsprakenwebsite");
  assert.equal(type("ecommerce", "ecommerce", true, ["bookings"]), "Webshop");
});

test("technology-only webshop flag is never proof of primary shop industry", () => {
  assert.equal(type("unknown"), "Website");
  assert.equal(type("saas_b2b", "saas_b2b", true), "Website");
});
