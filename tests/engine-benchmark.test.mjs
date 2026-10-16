import test from "node:test";
import assert from "node:assert/strict";
import { runOffline } from "../scripts/engine-benchmark/offline.mjs";
import { baselineRows } from "../scripts/engine-benchmark/eu81.mjs";
import { evaluate, scorecard } from "../scripts/engine-benchmark/metrics.mjs";

// Quality gate: future changes may not silently reduce measured engine quality.
// The hold-outs were written blind and measured before tuning (first results:
// 85.9% and 86.1% accuracy, see docs/ENGINE-QUALITY-REPORT.md); they now act as
// frozen regression sets. Real-world quality is measured on the EU-81 pilot.
const GATES = { minAccuracyPct: 95, maxHighConfidenceWrong: 0, maxHonestyIssues: 0, maxConsistency: 0 };

function assertGates(name, m) {
  assert.ok(m.sector.accuracyPct >= GATES.minAccuracyPct, `${name}: accuracy ${m.sector.accuracyPct}% < ${GATES.minAccuracyPct}% — ${JSON.stringify(m.sector.confusion)}`);
  assert.equal(m.sector.highConfidenceWrong, GATES.maxHighConfidenceWrong, `${name}: confident wrong sectors ${JSON.stringify(m.sector.confusion)}`);
  assert.equal(m.honesty.perfectWithIncompleteEvidence + m.honesty.score98PlusAtLowCoverage + m.honesty.lowCoverageNotQualified, GATES.maxHonestyIssues, `${name}: score honesty`);
  assert.equal(m.consistency.reportsWithViolations, GATES.maxConsistency, `${name}: report consistency`);
}

test("benchmark gate: synthetic matrix + real EU identities", () => assertGates("matrix", runOffline().all));
test("benchmark gate: hold-out 1 (64 sites, 20 languages)", () => assertGates("holdout1", runOffline(undefined, { HOLDOUT: "only", HOLDOUT_FILE: "holdout.json" }).all));
test("benchmark gate: hold-out 2 (36 sites, incl. bg/sk/sl/et/da/lv/lb)", () => assertGates("holdout2", runOffline(undefined, { HOLDOUT: "only", HOLDOUT_FILE: "holdout2.json" }).all));

test("EU-81 baseline from issue #151 is reproducible", () => {
  const m = evaluate(baselineRows());
  assert.equal(m.sector.planned, 81);
  assert.equal(m.sector.scanned, 53);
  assert.equal(m.sector.correct, 27);
  assert.equal(m.sector.wrong, 6);
  assert.equal(m.sector.abstained, 20);
  assert.equal(m.honesty.perfectWithIncompleteEvidence, 3);
});

test("scorecard never fills in unmeasured criteria", () => {
  const sc = scorecard({ sector: { accuracyPct: 100, wrongSectorPct: 0, scanned: 10, scanSuccessPct: 100 } });
  assert.equal(sc.complete, false);
  assert.ok(sc.score < sc.maxPossible);
});
