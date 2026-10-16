import test from "node:test";
import assert from "node:assert/strict";
import { detectBusinessModel as m } from "../lib/business-model.ts";

test("business model is evidence first, sector default is labelled as such", () => {
  assert.deepEqual(m({ sector: "financial_services", navLabels: ["Particulier", "Zakelijk", "Private banking"] }).model, "B2C + B2B");
  assert.equal(m({ sector: "financial_services", navLabels: ["Privatkunden", "Firmenkunden"] }).basis, "evidence");
  assert.equal(m({ sector: "manufacturing_industrial" }).model, "B2B");
  assert.equal(m({ sector: "manufacturing_industrial" }).basis, "sector_default");
  assert.equal(m({ sector: "government" }).model, "public");
  assert.equal(m({ sector: "unknown" }).model, "unknown");
  assert.equal(m({ sector: "telecom_technology", navLabels: ["Mobiel", "Internet"] }).model, "unknown");
});
