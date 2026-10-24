import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const baseline=["round-a.json","round-b.json","round-c-nieuw.json","round-d-nieuw.json"]
  .map(f=>JSON.parse(readFileSync(join(root,"tests/fixtures/testlab-96",f),"utf8")));
const additions=["round-e-service-retail.json","round-f-service-retail.json"]
  .map(f=>JSON.parse(readFileSync(join(root,"tests/fixtures/testlab-144",f),"utf8")));
const sites=[...baseline,...additions].flatMap(round=>round.sites.map(site=>({...site,round:round.id})));
test("exactly 144 independent hostnames: 96 earlier + 48 new",()=>{
 assert.equal(baseline.reduce((sum,p)=>sum+p.sites.length,0),96);
 assert.equal(additions.reduce((sum,p)=>sum+p.sites.length,0),48);
 assert.equal(sites.length,144);
 const names=sites.map(site=>site.hosts[0].replace(/^www\./i,"").toLowerCase());
 assert.equal(new Set(names).size,144);
 for(const site of sites){
  assert.match(site.hosts[0],/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i);
  assert.match(site.country,/^[A-Z]{2}$/);
  assert.ok(site.name&&site.group&&site.expected&&site.round);
 }
});
test("48 new cases: 12 countries, opticians, hairdressers and broad services",()=>{
 const extra=additions.flatMap(x=>x.sites);
 assert.equal(new Set(extra.map(x=>x.country)).size,12);
 assert.equal(extra.filter(x=>x.group==="hair_salon").length,12);
 assert.equal(extra.filter(x=>x.group==="optician").length,12);
 assert.ok(new Set(extra.map(x=>x.group)).size>=12);
 assert.ok(extra.some(x=>x.hosts.includes("zoofy.nl")&&x.expected==="service_marketplace"));
 assert.ok(extra.every(x=>x.reviewStatus==="proposed_not_independently_verified"));
});
test("real QA lab requires tester authentication and exact deployed preview SHA",()=>{
 const source=readFileSync(join(root,"scripts/testlab/run.mjs"),"utf8");
 assert.match(source,/phase==='lab144'\?all/);
 assert.match(source,/process\.env\.RF_DEPLOYMENT_SHA/);
 assert.match(source,/A verified full QA commit is required/);
 assert.match(source,/\^\[a-f0-9\]\{40\}\$/);
 assert.match(source,/An authenticated RF_SESSION for the isolated QA tester is required/);
 assert.match(source,/Only the fixed QA preview is allowed/);
 assert.match(source,/Stopped on QA/);
});
