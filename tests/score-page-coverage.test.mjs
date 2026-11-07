import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionDisplayOf} from '../lib/dimension-score-display.mjs';

const scan=(audited=1)=>({
 seo:{score:94},geo:{score:100},multiPage:{counts:{selected:14,audited}},
 scoreModel:{evidenceLevel:'insufficient',seoRange:{low:94,high:94},geoRange:{low:100,high:100},
 dimensionEvidence:{seo:{level:'complete',coveragePercent:100},geo:{level:'complete',coveragePercent:100}}}
});
test('one assessed page of fourteen cannot display definitive SEO or GEO',()=>{
 const input=scan();
 for(const dim of ['seo','geo']){
  const display=dimensionDisplayOf(input,dim);
  assert.equal(display.indication,true);
  assert.match(display.text,/indicatie/);
 }
 assert.equal(input.scoreModel.dimensionEvidence.seo.level,'complete','display does not rewrite stored evidence');
});
test('complete sample keeps independently complete dimensions',()=>{
 assert.equal(dimensionDisplayOf(scan(14),'seo').text,'94');
 assert.equal(dimensionDisplayOf({geo:{score:null}},'geo').text,'—');
});
