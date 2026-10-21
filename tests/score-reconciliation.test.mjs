import test from "node:test";
import assert from "node:assert/strict";
import {explainCoreScore} from "../lib/score-reconciliation.ts";

const c=(key,category,issue_status,points,maxPoints)=>({key,category,issue_status,points,maxPoints,severity:"LOW",confidence:"high",rootCause:undefined});
test("GEO score has an auditable fixed-core subset and visible normalization",()=>{
 const checks=[
  c("schema","geo","WARNING",4,12),
  c("organization_website","geo","WARNING",4,8),
  c("entity","geo","WARNING",6,10),
  c("trust","geo","UNABLE_TO_CONFIRM",0,8),
  c("identity","geo","WARNING",4,5),
  c("sector_example","geo","PASS",4,4),
 ];
 const x=explainCoreScore(checks,"geo",74);
 assert.ok(x.coreKeys.length>0);
 assert.ok(x.coreKeys.length<checks.length);
 assert.ok(x.excludedFromCore.includes("sector_example"));
 assert.equal(x.displayedScore,74);
 assert.equal(x.capOrConsistencyDifference,74-x.normalizedScore);
});
test("Unconfirmed rows do not affect raw numerator/denominator",()=>{
 const checks=[c("title","seo","PASS",10,10),c("description","seo","UNABLE_TO_CONFIRM",0,10)];
 const x=explainCoreScore(checks,"seo",99);
 assert.equal(x.pointsAvailable,10);
 assert.equal(x.pointsEarned,10);
 assert.equal(x.normalizedScore,100);
 assert.equal(x.capOrConsistencyDifference,-1);
});
