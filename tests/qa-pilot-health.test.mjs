import test from "node:test";
import assert from "node:assert/strict";
import {evaluateQaPilot} from "../lib/qa-pilot-health.ts";
const NOW=Date.parse("2026-10-13T19:00:00Z");
const QA="RankFix Sector QA - three isolated shifts",CI="RankFix CI";
const run=(name,overrides={})=>({
 id:name===QA?123:124,name,status:"completed",conclusion:"success",
 created_at:"2026-10-13T18:00:00Z",updated_at:"2026-10-13T18:25:00Z",
 head_sha:"abc123",html_url:"https://github.com/mdscoop7-max/rankfix-app/actions/runs/123",...overrides
});
const shifts=()=>["night","day","evening"].map(s=>({name:"scan ("+s+")",status:"completed",conclusion:"success"}));
const verdict=(qa=run(QA),jobs=shifts(),ci=run(CI))=>evaluateQaPilot([qa,ci],jobs,NOW);
test("three successful shifts and same CI commit are green",()=>{
 const h=verdict();assert.equal(h.level,"green");assert.match(h.message,/Drie shifts/);
});
test("one failed night shift turns Health Center red even when workflow is still queued",()=>{
 const jobs=shifts();jobs[0].conclusion="failure";
 const h=verdict(run(QA,{status:"queued",conclusion:null}),jobs);
 assert.equal(h.level,"red");assert.match(h.message,/night/);
});
test("completed workflow failure is red",()=>{
 assert.equal(verdict(run(QA,{conclusion:"failure"})).level,"red");
});
test("running pilot is orange, after three hours it is red",()=>{
 assert.equal(verdict(run(QA,{status:"in_progress",conclusion:null})).level,"orange");
 const old=run(QA,{created_at:"2026-10-13T12:00:00Z",status:"in_progress",conclusion:null});
 assert.equal(verdict(old).level,"red");
});
test("a successful workflow with a missing shift must not pass",()=>{
 const h=verdict(run(QA),shifts().slice(0,2));
 assert.equal(h.level,"red");
});
test("missing QA run is a failure and CI SHA mismatch means not validated",()=>{
 assert.equal(evaluateQaPilot([run(CI)],[],NOW).level,"red");
 assert.equal(verdict(run(QA),shifts(),run(CI,{head_sha:"newcommit"})).level,"orange");
});
test("newest CI failure blocks approval",()=>{
 assert.equal(verdict(run(QA),shifts(),run(CI,{conclusion:"failure"})).level,"red");
});
test("stale pilot turns orange then red rather than silently staying green",()=>{
 assert.equal(verdict(run(QA,{created_at:"2026-10-12T06:00:00Z"})).level,"orange");
 assert.equal(verdict(run(QA,{created_at:"2026-10-09T06:00:00Z"})).level,"red");
});
test("missing CI run is red",()=>{
 assert.equal(evaluateQaPilot([run(QA)],shifts(),NOW).level,"red");
});
