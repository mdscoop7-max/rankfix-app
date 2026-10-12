import test from "node:test";
import assert from "node:assert/strict";
import { presentScore, scorePresentationCopy } from "../lib/score-presentation.ts";

test("bot-reduced page with 52 % coverage is a provisional, low-reliability score with its range", () => {
  // Real scan (Zalando DE, 2026-10-12): score 100, coverage 52 %, range 52–100.
  const p = presentScore({ coveragePercent: 52, highConfidencePercent: 100, unableToConfirm: 9, range: { low: 52, high: 100 }, botReduced: true });
  assert.equal(p.status, "provisional");
  assert.equal(p.reliability, "low");
  assert.deepEqual(p.range, { low: 52, high: 100 });
  assert.equal(p.unconfirmedChecks, 9);
  assert.deepEqual(p.reasons, ["bot_reduced", "low_coverage"]);
});

test("full coverage with high confidence is a confirmed score without range", () => {
  const p = presentScore({ coveragePercent: 100, highConfidencePercent: 95, unableToConfirm: 0, range: { low: 100, high: 100 } });
  assert.deepEqual([p.status, p.reliability, p.range], ["confirmed", "high", null]);
});

test("partial coverage is provisional with medium reliability", () => {
  const p = presentScore({ coveragePercent: 84, highConfidencePercent: 90, unableToConfirm: 10, range: { low: 84, high: 100 } });
  assert.deepEqual([p.status, p.reliability], ["provisional", "medium"]);
  assert.deepEqual(p.range, { low: 84, high: 100 });
});

test("thresholds match the existing scoreModel.provisional rule (< 90 %)", () => {
  assert.equal(presentScore({ coveragePercent: 89, unableToConfirm: 1 }).status, "provisional");
  assert.equal(presentScore({ coveragePercent: 90, unableToConfirm: 0 }).status, "confirmed");
  assert.equal(presentScore({ coveragePercent: 69, unableToConfirm: 1 }).reliability, "low");
  assert.equal(presentScore({ coveragePercent: 70, unableToConfirm: 1 }).reliability, "medium");
});

test("presentation never changes the score itself and has copy in six languages", () => {
  for (const lang of ["nl", "en", "de", "fr", "it", "es"]) {
    const c = scorePresentationCopy(lang);
    assert.ok(c.provisional && c.coverage && c.reliability && c.range && c.levels.low);
  }
  assert.equal(scorePresentationCopy("xx").provisional, "Voorlopige score");
  assert.ok(!("score" in presentScore({ coveragePercent: 50, unableToConfirm: 3 })));
});

test("scanner: score calculation untouched, presentation added to response and history", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /selectedOverallScore = mode === "seo" \? selectedSeoScore : mode === "geo" \? selectedGeoScore : Math\.round\(selectedSeoScore \* 0\.6 \+ selectedGeoScore \* 0\.4\);/);
  assert.match(source, /scoreModel, scorePresentation, summary: scanSummary,/);
  assert.match(source, /      scorePresentation,\n      summary: scanSummary,/);
});
