import test from "node:test";
import assert from "node:assert/strict";
import { evidenceLevel, evidenceRange, requireCompleteEvidenceForPerfect, scoreRange } from "../lib/audit-score.ts";

const c = (issue_status, maxPoints = 10, points = issue_status === "PASS" ? maxPoints : 0) => ({ issue_status, maxPoints, points, confidence: "high", severity: "LOW" });

test("100/100 needs complete evidence; one unconfirmed check keeps it at 99", () => {
  assert.equal(requireCompleteEvidenceForPerfect(100, [c("PASS"), c("PASS")]), 100);
  assert.equal(requireCompleteEvidenceForPerfect(100, [c("PASS"), c("UNABLE_TO_CONFIRM")]), 99);
  assert.equal(requireCompleteEvidenceForPerfect(100, [c("PASS"), c("NOT_APPLICABLE")]), 100, "N.v.t. is not missing evidence");
  assert.equal(requireCompleteEvidenceForPerfect(87, [c("UNABLE_TO_CONFIRM")]), 87, "never lowers a non-perfect score");
});

test("issue #151 pattern: core all passed, many sector checks unconfirmed → no '100–100' range", () => {
  // Core (scored) checks all pass; 12 of 47 applicable checks unconfirmed (IKEA-like, 85% weight).
  const core = Array.from({ length: 20 }, () => c("PASS"));
  const all = [...core, ...Array.from({ length: 15 }, () => c("PASS")), ...Array.from({ length: 12 }, () => c("UNABLE_TO_CONFIRM", 5))];
  const coreRange = scoreRange(core);
  assert.deepEqual([coreRange.low, coreRange.high], [100, 100], "old behaviour: core-only range was 100–100");
  const score = requireCompleteEvidenceForPerfect(100, all);
  const r = evidenceRange(score, coreRange, all);
  assert.equal(score, 99);
  assert.ok(r.low < r.high, `${r.low}-${r.high}`);
  assert.ok(r.low <= score && score <= r.high);
  assert.equal(r.basis, "all_applicable_checks");
});

test("RTL/BILLA pattern: 53–55% coverage is 'insufficient', never presented as final", () => {
  const lvl = evidenceLevel({ coveragePercent: 53, javascriptRequiredButNotRendered: true, renderDegraded: true, unconfirmed: 20 });
  assert.equal(lvl.level, "insufficient");
  assert.ok(lvl.reasons.some((x) => /53%/.test(x)));
  assert.equal(evidenceLevel({ coveragePercent: 97, javascriptRequiredButNotRendered: false, unconfirmed: 1 }).level, "complete");
  assert.equal(evidenceLevel({ coveragePercent: 85, javascriptRequiredButNotRendered: false, unconfirmed: 12 }).level, "provisional");
  assert.equal(evidenceLevel({ coveragePercent: 92, javascriptRequiredButNotRendered: false, renderDegraded: true, unconfirmed: 2 }).level, "provisional");
});

test("property: range always contains the score and widens with unconfirmed weight", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < 2000; i++) {
    const n = 5 + Math.floor(rnd() * 40);
    const all = Array.from({ length: n }, () => { const x = rnd(); const max = 1 + Math.floor(rnd() * 15); return x < 0.6 ? c("PASS", max) : x < 0.75 ? c("WARNING", max, Math.floor(max / 2)) : x < 0.9 ? c("UNABLE_TO_CONFIRM", max) : c("NOT_APPLICABLE", max); });
    const core = all.slice(0, Math.ceil(n / 2));
    const score = Math.floor(rnd() * 101);
    const r = evidenceRange(score, scoreRange(core), all);
    assert.ok(r.low <= score && score <= r.high, `score ${score} outside ${r.low}-${r.high}`);
    assert.ok(r.low >= 0 && r.high <= 100);
    if (r.unverifiedWeight > 0 && score >= 20 && score <= 95) assert.ok(r.low < r.high, `unverified weight but flat range at ${score}`);
  }
});
