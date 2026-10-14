import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPilotResult} from '../scripts/qa/quality-gate.mjs';

const site = (expectedSector='news_media',url='https://www.cnn.com/') => ({expectedSector,url});
const valid = () => ({
  success:true,
  classification:{sector:{key:'news_media'}},
  sectorProfile:{key:'news_media',label:'Nieuws & Media',applicableModules:['core_seo','geo','technical','news_media']},
  overallScore:90,
  seo:{score:90,checks:[{key:'h1',status:'pass',message:'Eén inhoudelijke H1: News'},{key:'headings',status:'pass',message:'Een H1 aanwezig en 12 H2-koppen.'}]},
  geo:{score:90,checks:[]},
  coverage:{coveragePercent:96},
  scoreModel:{formula:'0.6 × SEO + 0.4 × GEO',weights:{seo:0.6,geo:0.4},provisional:false,headline:{score:90,pageScore:90,sampleWeight:0,sampleScore:null,sampledPages:0}},
  metrics:{h1Count:1,h1s:['Breaking News']}
});
const check=(body=valid(),s=site(),httpStatus=200)=>assessPilotResult({site:s,body,httpStatus});

test('clean international news scan passes strict release gate',()=>{
  const r=check();
  assert.equal(r.state,'pass');
  assert.deepEqual(r.blockers,[]);
});
test('a successful HTTP status never hides a sector mismatch',()=>{
  const body=valid();body.classification.sector.key='ecommerce';
  const r=check(body);assert.equal(r.state,'review');
  assert.ok(r.blockers.some(b=>b.code==='SECTOR_MISMATCH'));
});
test('a broad sector requires a verified subtype',()=>{
  const body=valid();body.classification.sector.key='beauty';body.sectorProfile={key:'beauty',label:'Beauty',applicableModules:['core_seo']};
  const r=check(body,site('beauty_salon','https://www.treatwell.nl/'));
  assert.ok(r.blockers.some(b=>b.code==='SECTOR_MISMATCH'));
});
test('HTTP 422 is never passed or misreported as an SEO defect',()=>{
  const r=check(null,site(),422);assert.equal(r.state,'unavailable');
  assert.deepEqual(r.blockers,[]);
  assert.ok(r.notices.some(n=>n.code==='SITE_UNAVAILABLE'));
});
test('broken JavaScript heading in CNN page metrics blocks release even if H1 check warns',()=>{
  const body=valid();body.metrics.h1s=['\u0027+(null!=(t=p(e,"if").call(r,"componentVariation")))'];
  body.seo.checks[0].status='warning';
  const r=check(body);
  assert.ok(r.blockers.some(b=>b.code==='TEMPLATE_LEAK_IN_METRICS'));
});
test('BBC contradictory heading reports block release',()=>{
  const body=valid();body.seo.checks[1].message='Er is geen H1 gevonden; 22 H2-koppen.';
  body.metrics.h1Count=0;body.metrics.h1s=[];
  const r=check(body);
  assert.ok(r.blockers.some(b=>b.code==='HEADING_CONTRADICTION'));
  assert.ok(r.blockers.some(b=>b.code==='H1_METRICS_CONTRADICTION'));
});
test('news booking module without proof is a release blocker',()=>{
  const body=valid();body.sectorProfile.applicableModules.push('booking');
  const r=check(body,site('news_media','https://www.spiegel.de/'));
  assert.ok(r.blockers.some(b=>b.code==='NEWS_BOOKING_REVIEW'));
});
test('sitewide sample and score caps must be explained',()=>{
  const body=valid();body.overallScore=84;
  body.scoreModel.headline.score=84;body.scoreModel.headline.pageScore=84;
  const r=check(body);
  assert.ok(r.blockers.some(b=>b.code==='PAGE_SCORE_CAP_UNEXPLAINED'));
  body.scoreModel.headline.pageCapReason='Bewezen hoge fout: score maximaal 88.';
  assert.equal(check(body).state,'pass');
});
test('missing score metadata, provisional and low coverage are blockers',()=>{
  const body=valid();body.scoreModel.headline=null;body.scoreModel.provisional=true;body.coverage.coveragePercent=52;
  const r=check(body);
  for(const code of ['SCORE_EXPLANATION_MISSING','PROVISIONAL_SCORE','LOW_COVERAGE']){
    assert.ok(r.blockers.some(b=>b.code===code),code);
  }
});
test('a weighted sample requires recorded pages',()=>{
  const body=valid();body.scoreModel.headline.sampleWeight=0.2;body.scoreModel.headline.sampleScore=80;body.scoreModel.headline.sampledPages=0;
  const r=check(body);assert.ok(r.blockers.some(b=>b.code==='SCORE_SAMPLE_COUNT'));
});
