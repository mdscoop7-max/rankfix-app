import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDeclaredIndustry, declaredPortOperations } from '../lib/site-sector-corroboration.mjs';
const identify=(title,description)=>detectDeclaredIndustry({title,description,identityHeadings:[title]});
test('language variants identify own activities without manufacturing/local-trade confusion',()=>{
 const examples=[
  ['Salon de beauté du Parc','Notre salon de beauté propose soins du visage et manucure.','beauty'],
  ['Clinique médicale du Lac','Notre clinique médicale reçoit des patients pour consultation.','health_wellness'],
  ['Architekturbüro Baumgarten','Unser Architekturbüro übernimmt Entwurf und Planung von Gebäuden.','professional_services'],
  ['Tuinbouwbedrijf De Velden','Ons tuinbouwbedrijf verzorgt de teelt van groenten en gewassen.','agriculture_horticulture'],
  ['Equipment manufacturer','We manufacture pumps in our own factory for business customers.','manufacturing_industrial'],
 ];
 for(const [title,description,sector] of examples)assert.equal(identify(title,description)?.sector,sector,title);
 assert.equal(identify('Equipment manufacturer','Browse our catalogue of services.'),null,'unsupported producer label needs actual production context');
 assert.notEqual(identify('Software for manufacturers','Our cloud software automates workflows for manufacturers.')?.sector,'manufacturing_industrial');
 assert.notEqual(identify('Factory outlet shop','Our outlet sells discounted clothes for home delivery.')?.sector,'manufacturing_industrial');
});
test('public port operation needs operating evidence before refining government',()=>{
 assert.equal(declaredPortOperations({title:'Port Authority',description:'Our port authority manages harbour infrastructure and maritime operations.'}),true);
 assert.equal(declaredPortOperations({title:'Maritime regulator',description:'Our authority supervises ports and issues shipping licences.'}),false);
 assert.equal(declaredPortOperations({title:'Port authority rules',description:'Information about port infrastructure regulations.'}),false);
});
