import test from "node:test";
import assert from "node:assert/strict";
import { MIN_DIMENSION_COVERAGE_PERCENT, dimensionEvidence, evidenceLevel, scoreApplicableChecks } from "../lib/audit-score.ts";

const c = (key, issue_status, maxPoints, points = issue_status === "PASS" ? maxPoints : 0) => ({
  key, issue_status, maxPoints, points,
  confidence: issue_status === "UNABLE_TO_CONFIRM" ? "low" : "high",
  severity: issue_status === "WARNING" ? "MEDIUM" : "INFO",
});

// Homepage GEO core as measured in the fresh144 run: breadcrumbs, FAQ and author are
// N.v.t., leaving 49 points of weight.
const geoCore = (overrides = {}) => [
  c("schema", "PASS", 12), c("organization_website", "PASS", 8), c("entity", "PASS", 10),
  c("breadcrumbs", "NOT_APPLICABLE", 6), c("faq", "NOT_APPLICABLE", 10), c("author", "NOT_APPLICABLE", 8),
  c("trust", "PASS", 8), c("answer", "PASS", 6), c("identity", "PASS", 5),
].map((item) => (overrides[item.key] ? c(item.key, overrides[item.key], item.maxPoints) : item));

test("a dimension resting on 5 of 49 weight points is insufficient, although its number is still 100", () => {
  const onlyIdentity = geoCore({ schema: "UNABLE_TO_CONFIRM", organization_website: "UNABLE_TO_CONFIRM", entity: "UNABLE_TO_CONFIRM", trust: "UNABLE_TO_CONFIRM", answer: "UNABLE_TO_CONFIRM" });
  const evidence = dimensionEvidence(onlyIdentity, "geo");
  assert.equal(evidence.level, "insufficient");
  assert.equal(evidence.determinable, false);
  assert.equal(evidence.confirmedWeight, 5);
  assert.equal(evidence.applicableWeight, 49);
  assert.equal(evidence.coveragePercent, 10);
  // The existing score formula is deliberately untouched: no artificial deduction.
  assert.equal(scoreApplicableChecks(onlyIdentity), 100);
});

test("full confirmation is complete; N.v.t. checks never count against coverage", () => {
  const evidence = dimensionEvidence(geoCore(), "geo");
  assert.equal(evidence.level, "complete");
  assert.equal(evidence.coveragePercent, 100);
  assert.equal(evidence.determinable, true);
  assert.equal(evidence.applicableWeight, 49);
});

test("the threshold equals the existing 'insufficient' boundary (60%)", () => {
  assert.equal(MIN_DIMENSION_COVERAGE_PERCENT, 60);
  const at = (confirmed) => [c("title", "PASS", confirmed), c("description", "UNABLE_TO_CONFIRM", 100 - confirmed)];
  assert.equal(dimensionEvidence(at(60), "seo").level, "provisional");
  assert.equal(dimensionEvidence(at(59), "seo").level, "insufficient");
  assert.equal(dimensionEvidence(at(100 - 1), "seo").level, "provisional");
});

test("only the stable core decides: unconfirmed sector modules do not make a dimension insufficient", () => {
  const items = [c("title", "PASS", 10), c("h1", "PASS", 10), c("restaurant_menu", "UNABLE_TO_CONFIRM", 50), c("table_reservation", "UNABLE_TO_CONFIRM", 50)];
  const evidence = dimensionEvidence(items, "seo");
  assert.equal(evidence.coveragePercent, 100);
  assert.equal(evidence.level, "complete");
});

test("nothing confirmed at all is insufficient with 0% coverage and no division by zero", () => {
  const none = dimensionEvidence([c("title", "UNABLE_TO_CONFIRM", 10), c("h1", "NOT_APPLICABLE", 10)], "seo");
  assert.equal(none.level, "insufficient");
  assert.equal(none.coveragePercent, 0);
  assert.equal(none.determinable, false);
  assert.equal(dimensionEvidence([], "geo").level, "insufficient");
});

const base = { coveragePercent: 100, javascriptRequiredButNotRendered: false, unconfirmed: 0 };

test("evidenceLevel(): one under-evidenced dimension makes the whole score an indication, with a named reason", () => {
  const result = evidenceLevel({ ...base, coveragePercent: 80, unconfirmed: 3, dimensions: [{ name: "SEO", coveragePercent: 95 }, { name: "GEO", coveragePercent: 10 }] });
  assert.equal(result.level, "insufficient");
  assert.ok(result.reasons.some((reason) => /GEO/.test(reason) && /10%/.test(reason)), result.reasons.join(" | "));
  assert.ok(!result.reasons.some((reason) => /^SEO-/.test(reason)), "a sufficient dimension is not blamed");
});

test("evidenceLevel(): without dimension input or with sufficient dimensions nothing changes", () => {
  assert.equal(evidenceLevel({ ...base }).level, "complete");
  assert.equal(evidenceLevel({ ...base, coveragePercent: 80, unconfirmed: 2 }).level, "provisional");
  assert.equal(evidenceLevel({ ...base, coveragePercent: 80, unconfirmed: 2, dimensions: [{ name: "SEO", coveragePercent: 80 }, { name: "GEO", coveragePercent: 75 }] }).level, "provisional");
});
