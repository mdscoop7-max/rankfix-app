// 31 Oct (five-site QA, P2): navigation corroboration and priced-service identities.
import test from "node:test";
import assert from "node:assert/strict";
import { hospitalityNavigationEvidence, isPricedServiceIdentity } from "../lib/sector-navigation.ts";

test("hospitality navigation needs BOTH a menu and a reservation entry (multilingual)", () => {
  assert.equal(hospitalityNavigationEvidence(["Chi siamo", "Menu", "Prenota", "Dove siamo"]), true);
  assert.equal(hospitalityNavigationEvidence(["Notre carte", "Réserver", "Contact"]), true);
  assert.equal(hospitalityNavigationEvidence(["Nuestra carta", "Reservas"]), true);
  assert.equal(hospitalityNavigationEvidence(["Menukaart", "Reserveren ."]), true);
  // A news site or a shop with a "Menu" button only, or booking without a menu.
  assert.equal(hospitalityNavigationEvidence(["Menu", "Nieuws", "Sport"]), false);
  assert.equal(hospitalityNavigationEvidence(["Reserveren", "Kamers", "Contact"]), false);
  assert.equal(hospitalityNavigationEvidence(["Menu van de dag kopen", "Reserveringssysteem voor restaurants"]), false);
});

test("priced-service identities: payments, banking, insurance and SaaS; never retail or telecom", () => {
  for (const key of ["financial_payments", "financial_services", "financial_banking", "financial_insurance", "saas_b2b"]) assert.equal(isPricedServiceIdentity(key), true, key);
  for (const key of ["ecommerce", "telecom", "telecom_technology", "restaurant", "unknown", ""]) assert.equal(isPricedServiceIdentity(key), false, key);
});
