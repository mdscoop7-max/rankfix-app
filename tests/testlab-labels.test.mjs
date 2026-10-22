import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSector,failureCategory} from '../scripts/testlab/labels.mjs';
import {readFileSync,readdirSync} from 'node:fs';
test('all 96 original test sites are retained without duplicates',()=>{
 const sites=readdirSync(new URL('./fixtures/testlab-96/',import.meta.url)).flatMap(f=>JSON.parse(readFileSync(new URL('./fixtures/testlab-96/'+f,import.meta.url))).sites);
 assert.equal(sites.length,96);assert.equal(new Set(sites.map(s=>s.hosts[0])).size,96);
 for(const s of sites)assert.notEqual(compareSector(s.expected).expectedSector,undefined);
});
test('broad finance agreement is distinct from unconfirmed or wrong subtype',()=>{
 assert.deepEqual(compareSector('payments',{sector:'financial_services',key:'financial_banking'}),{expected:'payments',expectedSector:'financial_services',observed:'financial_services',sectorMatch:true,expectedSubtype:'financial_payments',observedSubtype:'financial_banking',subtypeMatch:false,labelStatus:'proposed_not_independently_verified'});
 assert.equal(compareSector('healthcare',{sector:'health_wellness'}).sectorMatch,true);
 assert.equal(compareSector('telecom',{sector:'ecommerce'}).sectorMatch,false);
 assert.equal(compareSector('banking',{sector:'unknown'}).sectorMatch,false);
 assert.equal(compareSector('payments',{sector:'financial_services',key:'financial_payments'}).subtypeMatch,true);
});
test('website quota and denied target access are not conflated',()=>{
 assert.equal(failureCategory(403,'WEBSITE_LIMIT'),'quota');
 assert.equal(failureCategory(403,'WEBSITE_BLOCKED'),'site_blocked');
 assert.equal(failureCategory(503,'SCAN_DATABASE_UNCONFIGURED'),'infrastructure');
 assert.equal(failureCategory(401,'SESSION_EXPIRED'),'auth');
});
test('only a full verified SHA is reported as deployment identity',async()=>{
 const {scanRuntime}=await import('../lib/scan-runtime.ts');
 const old={VERCEL_GIT_COMMIT_SHA:process.env.VERCEL_GIT_COMMIT_SHA,RF_QA_COMMIT_SHA:process.env.RF_QA_COMMIT_SHA};
 try {
  delete process.env.VERCEL_GIT_COMMIT_SHA;delete process.env.RF_QA_COMMIT_SHA;
  assert.equal(scanRuntime().commitSha,null);
  process.env.RF_QA_COMMIT_SHA='a'.repeat(40);assert.equal(scanRuntime().commitSha,'a'.repeat(40));
  process.env.VERCEL_GIT_COMMIT_SHA='b'.repeat(40);assert.equal(scanRuntime().commitSha,'b'.repeat(40));
  process.env.VERCEL_GIT_COMMIT_SHA='niet-geverifieerd';assert.equal(scanRuntime().commitSha,null);
 }finally{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v}
});
