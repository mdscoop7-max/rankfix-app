import test from "node:test";
import assert from "node:assert/strict";
import { scorecardV2 } from "../scripts/engine-benchmark/scorecard-v2.mjs";

const cases = (n, confidence = 95) => Array.from({ length: n }, (_, i) => ({
  id: String(i), expected: "education", predicted: "education",
  confidence, scanned: true, country: "NL",
}));
const metric = (result, key) => result.criteria.find((c) => c.key === key).value;

test("calibration with fewer than five high-confidence predictions is unmeasured", () => {
  const s = scorecardV2(cases(4), { attemptedSites: 4, sitesWithSuccess: 4 });
  assert.equal(metric(s, "calibration"), null);
  assert.ok(s.unmeasured.includes("calibration"));
  assert.equal(s.accepted, false);
});

test("low-confidence predictions do not create high-confidence calibration evidence", () => {
  const s = scorecardV2(cases(12, 71), { attemptedSites: 12, sitesWithSuccess: 12 });
  assert.equal(metric(s, "calibration"), null);
  assert.equal(s.accepted, false);
});

test("stored scans are not proof of an attempted-site stability denominator", () => {
  const rows = cases(10);
  const missing = scorecardV2(rows);
  assert.equal(metric(missing, "stability"), null);
  assert.ok(missing.unmeasured.includes("stability"));
  assert.equal(missing.accepted, false);
  assert.equal(metric(scorecardV2(rows, { attemptedSites: 10, sitesWithSuccess: 9 }), "stability"), 90);
});
