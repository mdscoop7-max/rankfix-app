import test from "node:test";
import assert from "node:assert/strict";
import { applyEvidenceBasedScoreCap, weightedCoverage } from "../lib/audit-score.ts";

const pass = (maxPoints=10)=>({issue_status:"PASS",severity:"LOW",confidence:"high",points:maxPoints,maxPoints});
const unknown = (maxPoints=10)=>({issue_status:"UNABLE_TO_CONFIRM",severity:"INFO",confidence:"low",points:0,maxPoints});

test("full coverage preserves a verified high score",()=>assert.equal(applyEvidenceBasedScoreCap(99,[pass(),pass()]),99));
test("unknown coverage changes the provisional range, not the fixed core score",()=>{
 assert.equal(applyEvidenceBasedScoreCap(100,[pass(),unknown()]),100);
 assert.equal(applyEvidenceBasedScoreCap(100,[pass(60),unknown(40)]),100);
 assert.equal(applyEvidenceBasedScoreCap(100,[pass(80),unknown(20)]),100);
 assert.equal(applyEvidenceBasedScoreCap(100,[pass(90),unknown(10)]),100);
});
test("N/A checks do not reduce evidence coverage",()=>{
 const items=[pass(),{...unknown(),issue_status:"NOT_APPLICABLE"}];
 assert.equal(weightedCoverage(items).coveragePercent,100);
 assert.equal(applyEvidenceBasedScoreCap(100,items),100);
});
test("proven critical failure remains stronger than coverage cap",()=>{
 const items=[pass(),{...pass(),issue_status:"FAIL",severity:"CRITICAL"}];
 assert.equal(applyEvidenceBasedScoreCap(99,items),70);
});

import { evidenceLevel as evidenceLevelForSample } from "../lib/audit-score.ts";
test("a site score built from a thin page sample is never definitive", () => {
  const base = { coveragePercent: 100, javascriptRequiredButNotRendered: false, unconfirmed: 0, sectorConfidence: 90 };
  assert.equal(evidenceLevelForSample({ ...base, samplePages: { selected: 15, fetched: 15 } }).level, "complete");
  assert.equal(evidenceLevelForSample({ ...base, samplePages: { selected: 15, fetched: 11 } }).level, "complete");
  const half = evidenceLevelForSample({ ...base, samplePages: { selected: 15, fetched: 6 } });
  assert.equal(half.level, "provisional");
  assert.match(half.reasons.join(" "), /6 van 15 geselecteerde pagina/);
  assert.equal(evidenceLevelForSample({ ...base, samplePages: { selected: 15, fetched: 1 } }).level, "insufficient");
  assert.equal(evidenceLevelForSample({ ...base, samplePages: { selected: 2, fetched: 1 } }).level, "complete");
});
