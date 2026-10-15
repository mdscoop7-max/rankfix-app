import test from "node:test";
import assert from "node:assert/strict";
import { applyEvidenceBasedScoreCap, weightedCoverage } from "../lib/audit-score.ts";

const pass = (maxPoints=10)=>({issue_status:"PASS",severity:"LOW",confidence:"high",points:maxPoints,maxPoints});
const unknown = (maxPoints=10)=>({issue_status:"UNABLE_TO_CONFIRM",severity:"INFO",confidence:"low",points:0,maxPoints});

test("full coverage preserves a verified high score",()=>assert.equal(applyEvidenceBasedScoreCap(99,[pass(),pass()]),99));
test("incomplete evidence caps near-perfect grades without scoring unknown as failures",()=>{
 assert.equal(applyEvidenceBasedScoreCap(100,[pass(),unknown()]),79);
 assert.equal(applyEvidenceBasedScoreCap(100,[pass(60),unknown(40)]),89);
 assert.equal(applyEvidenceBasedScoreCap(100,[pass(80),unknown(20)]),95);
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
