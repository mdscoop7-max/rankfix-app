import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const json=(path)=>JSON.parse(readFileSync(new URL(path,root),"utf8"));
const international=json("tests/fixtures/testlab-international/round-g-professions.json");
const baseline=[
  ...["round-a.json","round-b.json","round-c-nieuw.json","round-d-nieuw.json"].map(f=>json("tests/fixtures/testlab-96/"+f)),
  ...["round-e-service-retail.json","round-f-service-retail.json"].map(f=>json("tests/fixtures/testlab-144/"+f))
].flatMap(p=>p.sites);
const normalized=(s)=>s.hosts[0].toLowerCase().replace(/^www\\./,"");
test("International TestLab has 28 unique sites from exactly 14 countries, outside the 144 baseline",()=>{
 assert.equal(baseline.length,144);
 assert.equal(international.sites.length,28);
 const known=new Set(baseline.map(normalized));
 const added=international.sites.map(normalized);
 assert.equal(new Set(added).size,28);
 assert.ok(added.every(host=>!known.has(host)),"international fixture must not repeat historical sites");
 assert.equal(new Set(international.sites.map(s=>s.country)).size,14);
 for(const s of international.sites) {
  assert.match(s.hosts[0],/^[a-z0-9-]+(?:\\.[a-z0-9-]+)+$/i);
  assert.ok(s.country && s.name && s.group && s.expected);
  assert.equal(s.reviewStatus,"proposed_not_independently_verified");
 }
});
test("International catalog must have internal tester gate, version and duplicate protection",()=>{
 const api=readFileSync(new URL("app/api/testlab/international/catalog/route.ts",root),"utf8");
 const page=readFileSync(new URL("app/dashboard/testlab/international/page.tsx",root),"utf8");
 const component=readFileSync(new URL("components/qa-testlab.tsx",root),"utf8");
 assert.match(api,/isInternalTester\(user\.id\)/);
 assert.match(api,/scanRuntime\(\)/);
 assert.match(api,/CATALOG_INTEGRITY_FAILED/);
 assert.match(page,/notFound\(\)/);
 assert.match(component,/rankfix-qa-testlab-.*variant/);
 assert.match(component,/expectedTotal=international\?28:144/);
 assert.match(component,/Stop na huidige scan/);
 assert.match(component,/QA_DEPLOYMENT_CHANGED/);
 assert.match(component,/version\.commitSha!==next\.runtime\.commitSha/);
 assert.match(component,/exportResult\("json"\)/);
});
