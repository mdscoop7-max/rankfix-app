import test from 'node:test';
import assert from 'node:assert/strict';
import {determineOperatingRole,ownActivityFragment} from '../lib/operating-role.ts';
import {scoreApplicableChecks,weightedCoverage,scoreRange} from '../lib/audit-score.ts';
import {demoteLowConfidencePasses} from '../lib/scan-feedback.ts';
const base={sector:'fitness_sports',key:'fitness',sectorConfidence:95,homepage:{},sectorSupportPages:[],otherSectorPages:[],ownShopFunction:[],retailSector:false,groupWording:null,otherActivities:[]};
test('a sector label is not own-activity evidence or an independent homepage source',()=>{
 const r=determineOperatingRole({...base,sectorSupportPages:[{source:'https://site.test/about',text:'Onze sportschool'}]});
 assert.notEqual(r.status,'confirmed');
 assert.ok(r.independentSources<=1);
 assert.equal(r.role,'unknown');
});
test('repeated URLs in supporting evidence never multiply independent sources',()=>{
 const r=determineOperatingRole({...base,homepage:{own_service:['Onze sportschool']},sectorSupportPages:[{source:'https://site.test/about',text:'a'},{source:'https://site.test/about',text:'b'}]});
 assert.equal(r.independentSources,2);
});
test('all low-confidence scored outcomes are excluded consistently, never rewarded or penalised',()=>{
 const known={issue_status:'WARNING',points:5,maxPoints:10,confidence:'high'};
 for(const issue_status of ['PASS','WARNING','FAIL']){
  const items=[known,{issue_status,points:issue_status==='PASS'?100:0,maxPoints:100,confidence:'low'}];
  assert.equal(scoreApplicableChecks(items),50,issue_status);
  assert.equal(weightedCoverage(items).confirmed,1);
  assert.equal(scoreRange(items).unverifiedWeight,100);
  const checks=[{...items[1],status:issue_status.toLowerCase(),message:'Weak assertion',evidence:{url:'https://site.test/',found:true,details:'weak'}}];
  assert.equal(demoteLowConfidencePasses(checks,'https://site.test/'),1);
  assert.equal(checks[0].issue_status,'UNABLE_TO_CONFIRM');
 }
});

test('own-activity guard preserves source fragments and rejects audience and third-party clauses',()=>{
 const vocabulary=[/sportschool/i];
 assert.equal(ownActivityFragment(['Software voor sportscholen'],[/sportscholen/i]),null);
 assert.equal(ownActivityFragment(['Boek bij aangesloten sportscholen'],[/sportscholen/i]),null);
 assert.equal(ownActivityFragment(['Onze sportschool verzorgt trainingen'],vocabulary),'Onze sportschool verzorgt trainingen');
 assert.equal(ownActivityFragment(['Sportschool voor iedereen'],vocabulary),'Sportschool voor iedereen');
});
