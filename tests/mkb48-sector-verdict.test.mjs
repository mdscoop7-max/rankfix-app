import test from 'node:test';
import assert from 'node:assert/strict';
import {sectorVerdict} from '../scripts/testlab/labels.mjs';

for (const [expected,sector,key] of [
 ['garage','automotive','car_repair'],['realtor','real_estate','real_estate'],
 ['law','professional_services','legal'],['training','education','course_training'],
 ['gym','fitness_sports','fitness'],['hotel','hospitality','hotel'],
 ['plumber','home_services','plumber'],['gardener','home_services','gardener'],
]) test(`MKB alias ${expected} requires the observed branch`,()=>{
 assert.equal(sectorVerdict(expected,{sector,key}).verdict,key===expected?'exact':'equivalent');
});
for (const [expected,sector] of [['garage','automotive'],['hotel','hospitality'],['plumber','home_services'],['gardener','home_services'],['gym','fitness_sports'],['training','education'],['beauty','health_wellness']]) {
 test(`broad ${sector} does not prove ${expected}`,()=>{
  assert.equal(sectorVerdict(expected,{sector,key:sector}).verdict,'partial');
 });
}
test('broad trade family requires evidence and rejects conflicts',()=>{
 assert.equal(sectorVerdict('plumber',{sector:'home_services',key:'home_services',evidence:['Eigen activiteit: loodgieter voor sanitair en ontstoppingen']}).verdict,'equivalent');
 assert.equal(sectorVerdict('gardener',{sector:'home_services',key:'home_services',evidence:['Eigen activiteit: hovenier voor tuinaanleg en tuinonderhoud']}).verdict,'equivalent');
 assert.equal(sectorVerdict('gardener',{sector:'home_services',key:'home_services',evidence:['Loodgieter en hovenier']}).verdict,'partial');
});
test('specific neighbours cannot pass as the expected branch',()=>{
 for(const [expected,sector,key] of [['garage','automotive','car_rental'],['hotel','hospitality','restaurant'],['gym','fitness_sports','sports_club'],['plumber','home_services','gardener'],['law','professional_services','accounting'],['training','education','childcare']])
  assert.equal(sectorVerdict(expected,{sector,key}).verdict,'mismatch',expected);
});
test('beauty subject matter cannot approve a known booking platform as a salon',()=>{
 assert.equal(sectorVerdict('beauty',{sector:'beauty',key:'hair_salon',websiteType:'marketplace'}).verdict,'mismatch');
 assert.equal(sectorVerdict('beauty',{sector:'beauty',key:'hair_salon',websiteType:'services'}).verdict,'exact');
});
test('unknown activity stays unconfirmed',()=>{
 assert.equal(sectorVerdict('gardener',{sector:'unknown'}).verdict,'unconfirmed');
});
