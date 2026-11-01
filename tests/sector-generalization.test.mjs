import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {register} from 'node:module';
import {compareSectorRuns} from '../lib/sector-regression.mjs';
import {detectPrimaryBusinessIdentity} from '../lib/primary-business-identity.ts';
import {detectEuPrimaryIdentity} from '../lib/eu-identity.ts';
register('./scan-matrix/loader.mjs',import.meta.url);
const {runSectorPeers}=await import('./scan-matrix/run-sector-peers.mjs');
const root=new URL('../',import.meta.url);
test('frozen validation source cannot silently be retuned',()=>{
 const m=JSON.parse(readFileSync(new URL('tests/fixtures/sector-quality/manifest.json',root)));
 const sha=createHash('sha256').update(readFileSync(new URL('tests/fixtures/sector-quality/heldout.json',root))).digest('hex');
 assert.equal(sha,m.heldoutSha256);
});
test('development sector matrix generalizes across declared activity, similar sectors and hybrid commerce',async()=>{
 const r=await runSectorPeers({fixtureDir:'tests/fixtures/sector-quality',group:'development',quiet:true});
 assert.equal(r.total,39);assert.equal(r.failed,0,r.problems.join('\n'));
});
test('synthetic validation never worsens previously correct cases; unresolved strict identification stays visible',async()=>{
 const before=JSON.parse(readFileSync(new URL('tests/fixtures/sector-quality-results/heldout-first-baseline.json',root)));
 const after=await runSectorPeers({fixtureDir:'tests/fixtures/sector-quality',group:'heldout',quiet:true});
 // This gate is NO REGRESSION, not a claim that all strict labels pass.
 const comparison=compareSectorRuns(before,after);
 assert.equal(comparison.accepted,true,JSON.stringify(comparison));
 for(const row of after.rows.filter(r=>r.result.sector==='unknown'))assert.equal(row.result.sectorConfidence,0,'honest abstention, not confident misclassification');
});
test('an empty fixture selection cannot masquerade as a successful QA audit',async()=>{
 await assert.rejects(runSectorPeers({fixtureDir:'tests/fixtures/sector-quality',group:'does-not-exist',quiet:true}),/SECTOR_FIXTURES_MISSING/);
});
test('Portuguese and Polish payment identity requires support; merchant payment methods are not a PSP',()=>{
 const cases=JSON.parse(readFileSync(new URL('tests/fixtures/sector-quality/development.json',root))).sites;
 for(const id of ['portuguese-pay.test','polish-pay.test']){const s=cases[id];assert.equal(detectPrimaryBusinessIdentity({title:s.title,description:s.desc,headings:[s.h1],navigation:s.nav}).financialKind,'payments');}
 for(const [title,description] of [['Loja online | Compre roupa','Compre online. Pagamentos online e processamento de pagamentos disponíveis.'],['Sklep internetowy | Kup buty online','Kup online. Przyjmuj płatności i darmowa dostawa.']])assert.equal(detectPrimaryBusinessIdentity({title,description,headings:[title]}).sector,'unknown');
});
test('explicit software ownership does not classify a provider as its customer sector',()=>{
 const s=JSON.parse(readFileSync(new URL('tests/fixtures/sector-quality/development.json',root))).sites['software-for-hotels.test'];
 const r=detectEuPrimaryIdentity({title:s.title,description:s.desc,h1s:[s.h1],navLabels:s.nav});assert.equal(r.sector,'saas_b2b');
 const hotel=detectPrimaryBusinessIdentity({title:'Harbour Hotel | Book your room',description:'Our hotel offers rooms and accommodation. Our booking software is available online.',schemaTypes:['Hotel']});assert.equal(hotel.sector,'hospitality');
});
