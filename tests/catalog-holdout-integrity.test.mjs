import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SECTOR_CATALOG } from '../lib/sector-catalog.ts';
test('catalog evaluation set remains frozen, covers all sectors and excludes development hosts', () => {
 const dir=new URL('./fixtures/quality-20261101/',import.meta.url);
 const raw=readFileSync(new URL('catalog-holdout.json',dir)),data=JSON.parse(raw),plan=JSON.parse(readFileSync(new URL('plan.json',dir)));
 assert.equal(createHash('sha256').update(raw).digest('hex'),plan.fixtureSha256);
 assert.equal(Object.keys(data.sites).length,plan.caseCount);
 assert.deepEqual([...new Set(Object.values(data.sites).map(s=>s.evaluation.catalogKey))].sort(),SECTOR_CATALOG.map(s=>s.key).sort());
 assert.equal(plan.qualityScore,null);
 assert.ok(plan.tuningForbiddenAfterFreeze);
 const peers=new URL('./fixtures/sector-peers/',import.meta.url);
 const seen=new Set(readdirSync(peers).filter(p=>p.endsWith('.json')).flatMap(p=>Object.keys(JSON.parse(readFileSync(new URL(p,peers))).sites)));
 for(const host of Object.keys(data.sites))assert.ok(!seen.has(host),host);
});
