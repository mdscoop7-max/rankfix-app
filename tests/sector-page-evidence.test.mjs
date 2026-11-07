import test from 'node:test';
import assert from 'node:assert/strict';
import {sectorPageEvidence,scanCoverageDimensions} from '../lib/sector-page-evidence.ts';
const home='https://example.test/';
const page=(path,title,description,extra={})=>({url:home+path,type:'service',status:'audited',title,description,...extra});
const bank=path=>page(path,'Bank accounts and mortgages','Current accounts, credit cards and personal loans');
test('two different first-party pages recover multilingual financial identity',()=>{
 const r=sectorPageEvidence(home,[bank('accounts'),page('hypotheken','Hypotheken en bankieren','Betaalrekening, spaarrekening en persoonlijke lening')]);
 assert.equal(r.decision?.sector,'financial_services');assert.equal(r.decision?.confidence,'medium');assert.equal(r.supportingPages,2);
 assert.equal(r.decision.evidence.length,2);assert.match(r.decision.evidence[0],/https:\/\/example.test/);
});
test('duplicates, redirect aliases, article topics, failed fetches and third parties cannot corroborate',()=>{
 for(const other of [bank('accounts?source=nav'),bank('duplicate'),{...bank('b'),type:'article'}, {...bank('b'),status:'unable_to_confirm'}, {...bank('b'),url:'https://other.test/'},{...bank('b'),partialHead:true}]){
  assert.equal(sectorPageEvidence(home,[bank('accounts'),other]).decision,null);
 }
});
test('incompatible sectors abstain with inspectable counterevidence',()=>{
 const r=sectorPageEvidence(home,[bank('a'),page('b','Bankieren en sparen','Spaarrekening, betaalrekening en hypotheken'),page('care','Hospital and medical clinic','Patients, doctors and medical treatments',{schemaTypes:['Hospital']})]);
 assert.equal(r.decision,null);assert.equal(r.reason,'conflicting_page_identities');assert.equal(r.candidates.length,2);
});
test('banking client audiences and empty pages never become financial institutions',()=>{
 const r=sectorPageEvidence(home,[page('a','Software for banks','IT services for banks and insurers'),page('b','Cloud software for banks','Digital services for banks and insurance companies'),page('c','','')]);
 assert.notEqual(r.decision?.sector,'financial_services');
});
test('high check coverage remains separate from sparse page coverage',()=>{
 const r=scanCoverageDimensions(93,16,1,1);assert.equal(r.checks.coveragePercent,93);assert.equal(r.pages.fetchedPercent,6);assert.equal(r.pages.scoredPercent,6);assert.equal(r.pages.scope,'selected_sample_only');
});

test('hospital and patient identity corroborates in the tested European languages',async()=>{
 const {detectEuPrimaryIdentity}=await import('../lib/eu-identity.ts');
 for(const title of ['Ziekenhuis voor patiënten','Krankenhaus für Patienten','Hôpital pour les patients','Ospedale per pazienti','Hospital para pacientes','Hospital for patients','Szpital dla pacjentów']) {
  assert.equal(detectEuPrimaryIdentity({title,description:title})?.sector,'health_wellness',title);
 }
 for(const title of ['Patient stories','Patients and visitors','Patient reviews'])assert.notEqual(detectEuPrimaryIdentity({title,description:title})?.sector,'health_wellness',title);
});
