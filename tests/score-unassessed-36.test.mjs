import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categoryAssessed, effectiveScoreMode, scoreApplicableChecks } from "../lib/audit-score.ts";

// RankFix 3.6 (G11, pilot case: 2 visible words, all GEO checks unconfirmed,
// stored GEO 0 and total 0.6 × SEO). A category without any assessed check has
// no score: it drops out of the total and is stored as null ("not assessed").

const check = (issue_status, points, maxPoints = 10) => ({ issue_status, points, maxPoints, confidence: "high" });

test("3.6 score: a category whose checks are all unconfirmed or not applicable is not assessed", () => {
  assert.equal(categoryAssessed([check("UNABLE_TO_CONFIRM", 0), check("NOT_APPLICABLE", 0)]), false);
  assert.equal(categoryAssessed([]), false);
  assert.equal(categoryAssessed([check("UNABLE_TO_CONFIRM", 0), check("FAIL", 0)]), true);
  assert.equal(categoryAssessed([check("PASS", 10)]), true);
  // A zero-weight info line is not an assessment.
  assert.equal(categoryAssessed([check("PASS", 0, 0)]), false);
});

test("3.6 score: the total uses only assessed categories, never a hidden 0", () => {
  assert.equal(effectiveScoreMode("both", true, true), "both");
  assert.equal(effectiveScoreMode("both", true, false), "seo");
  assert.equal(effectiveScoreMode("both", false, true), "geo");
  assert.equal(effectiveScoreMode("both", false, false), "both");
  assert.equal(effectiveScoreMode("seo", true, false), "seo");
  assert.equal(effectiveScoreMode("geo", false, true), "geo");
  // The old behaviour this replaces: an unassessed GEO scored 0.
  assert.equal(scoreApplicableChecks([check("UNABLE_TO_CONFIRM", 0)]), 0);
});

test("3.6 score: the scan route weights, stores and labels unassessed categories as such", () => {
  const src = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(src, /const scoringMode = \(\) => effectiveScoreMode\(mode,/);
  // Every total uses the effective weighting, none the raw request mode.
  assert.doesNotMatch(src, /selectedOverallScore = mode === "seo" \? selectedSeoScore/);
  assert.match(src, /scores: \{ seo: selectedSeoScore, geo: selectedGeoScore, overall: selectedOverallScore, mode: scoringMode\(\) \}/);
  // Stored columns and report fields carry null, not 0.
  assert.match(src, /selectedOverallScore, storedSeoScore, storedGeoScore, JSON\.stringify/);
  assert.match(src, /geo: \{ score: storedGeoScore,/);
  assert.match(src, /unassessedCategories: unassessedCategories\(\)/);
});
