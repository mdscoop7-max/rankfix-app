import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SECTOR_CATALOG} from '../lib/sector-catalog.ts';
test('round-two holdout is hash-bound and has no reused development identities',()=>{
 const root=new URL('./fixtures/',import.meta.url);
 const raw=readFileSync(new URL('quality-round2-20261101/catalog-holdout.json',root)),data=JSON.parse(raw),plan=JSON.parse(readFileSync(new URL('quality-round2-20261101/plan.json',root)));
 const dev=JSON.parse(readFileSync(new URL('quality-20261101/catalog-holdout.json',root))).sites;
 assert.equal(createHash('sha256').update(raw).digest('hex'),plan.fixtureSha256);
 assert.equal(Object.keys(data.sites).length,plan.caseCount);
 assert.deepEqual([...new Set(Object.values(data.sites).map(s=>s.evaluation.catalogKey))].sort(),SECTOR_CATALOG.map(s=>s.key).sort());
 const seen=new Set(Object.values(dev).flatMap(s=>[s.title,s.desc]));
 for(const [host,s] of Object.entries(data.sites)){assert.ok(!dev[host]);assert.ok(!seen.has(s.title));assert.ok(!seen.has(s.desc));}
 assert.equal(plan.qualityScore,null);assert.equal(plan.independentReviewer,null);assert.ok(plan.tuningForbiddenAfterFreeze);
});
