import test from 'node:test';
import assert from 'node:assert/strict';
import {detectDeclaredIndustry} from '../lib/site-sector-corroboration.mjs';
const identify=(title,description)=>detectDeclaredIndustry({title,description,identityHeadings:[title]});
test('own installation and maintenance declarations identify a heating service',()=>{
 for(const [title,description] of [
  ['Thuis, daar draait het om.','De landelijke expert in installatie en onderhoud van verwarming, koeling en ventilatie.'],
  ['Service & onderhoud','Ons bedrijf biedt deskundig onderhoud aan voor uw cv-ketel, warmtepomp en ventilatiesysteem.'],
  ['Warmtepomp laten plaatsen','Wij verzorgen installatie en onderhoud van warmtepompen.'],
 ])assert.equal(identify(title,description)?.sector,'home_services');
});
test('supplies, software, training, guides and third-party installers do not prove an own installation business',()=>{
 for(const [title,description] of [
  ['Onderdelen voor cv-ketels','Wij bieden onderdelen voor onderhoud en installatie van verwarming.'],
  ['Software voor installateurs','Wij bieden software voor installatie en onderhoud van warmtepompen.'],
  ['Opleiding verwarmingsmonteur','Expert in installatie en onderhoud van verwarming worden? Volg onze cursus.'],
  ['Gids warmtepomp onderhoud','De expert in installatie en onderhoud van verwarming legt het uit in deze gids.'],
  ['Klimaatplatform','Ons platform biedt onderhoud voor uw warmtepomp door onafhankelijke installateurs.'],
  ['Vind een verwarmingsmonteur','Vergelijk onafhankelijke installateurs voor installatie en onderhoud van verwarming.'],
 ])assert.notEqual(identify(title,description)?.sector,'home_services',title);
});
