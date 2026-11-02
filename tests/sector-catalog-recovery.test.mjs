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

test('catalog service declarations need their own activity, not a customer market or incidental word',()=>{
 const examples=[
  ['Online marketplace','Our marketplace connects independent sellers and buyers.','service_marketplace'],
  ['Reisebüro Am See','Unser Reisebüro organisiert Reisen und Urlaub für Familien.','transport_travel'],
  ['Logiciel de gestion','Notre logiciel cloud automatise les workflows et propose un abonnement.','saas_b2b'],
  ['Eventagentur Nord','Unsere Eventagentur organisiert Veranstaltungen und Konferenzen.','events_culture'],
  ['Grossiste des métiers','Notre grossiste distribue des matériaux aux professionnels.','general_business'],
  ['Maaltijdservice West','Onze maaltijdservice bezorgt maaltijden en een weekmenu aan huis.','hospitality'],
  ['Photographe du Port','Notre photographe réalise des portraits et reportages pour votre portfolio.','professional_services'],
  ['Guardería El Árbol','Nuestra guardería cuida niños en pequeños grupos.','education'],
  ['Maison de retraite des Pins','Notre maison de retraite propose des soins aux résidents.','health_wellness'],
  ['Parking operator','Our company manages parking facilities for visitors.','transport_travel'],
  ['Locations de vacances','Nos locations de vacances accueillent des familles pour un séjour.','hospitality'],
  ['Campeggio del Bosco','Il nostro campeggio offre piazzole per tende e caravan.','hospitality'],
  ['Coworking Centro','Nuestro coworking dispone de escritorios y salas de reuniones.','professional_services'],
  ['Mobile application','Our application synchronises files across devices; download the app.','saas_b2b'],
 ];
 for(const [title,description,sector] of examples)assert.equal(identify(title,description)?.sector,sector,title);
 for(const [title,,sector] of examples){
  assert.notEqual(identify(title,'Read our contact information.')?.sector,sector,`no activity: ${title}`);
  assert.notEqual(identify(`Guide to ${title}`,'Read our guide about companies in this industry.')?.sector,sector,`editorial: ${title}`);
 }
 const audiences=[['Software for nursing homes','Our software cloud automates workflows for nursing homes.','health_wellness'],['Marketing for travel agencies','Our marketing agency supports travel agencies with campaigns about holidays.','transport_travel'],['Equipment for campsites','Our equipment company supplies tents and caravans to campsites.','hospitality'],['Software consultancy','Our consultants automate workflows with cloud tools for clients.','saas_b2b']];
 for(const [title,description,sector] of audiences)assert.notEqual(identify(title,description)?.sector,sector,title);
});

test('an unknown sector cannot acquire confirmed certainty through later reconciliation',async()=>{
 const {sectorConfidenceGuard}=await import('../lib/sector-motor-decisions.ts');
 for(const confidenceScore of [0,35,76,95,NaN,Infinity,-1]){
  const r=sectorConfidenceGuard({sector:'unknown',confidence:'high',confidenceScore});
  assert.equal(r.confidence,'low');assert.ok(r.confidenceScore>=0&&r.confidenceScore<=35);
 }
 assert.deepEqual(sectorConfidenceGuard({sector:'home_services',confidence:'high',confidenceScore:95}),{confidence:'high',confidenceScore:95});
});
