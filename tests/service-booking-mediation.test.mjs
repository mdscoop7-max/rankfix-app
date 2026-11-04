import test from 'node:test';
import assert from 'node:assert/strict';
import {detectDeclaredIndustry,serviceBookingMediation} from '../lib/site-sector-corroboration.mjs';
const page=(title,description)=>({title,description,identityHeadings:[title]});
test('own booking mediation needs explicit independent providers',()=>{
 for(const p of [
  page('Boekingsplatform voor beauty','Ons boekingsplatform verbindt klanten met onafhankelijke salons. Boek behandelingen bij aangesloten kappers.'),
  page('Booking platform','Our booking platform connects customers with independent salons and therapists. Book treatments online.'),
 ]){
  assert.equal(serviceBookingMediation(p),true);
  assert.equal(detectDeclaredIndustry(p)?.sector,'service_marketplace');
 }
});
test('own staff, software, editorial content and incidental booking terms do not prove mediation',()=>{
 for(const p of [
  page('Kapsalon en boekingsplatform','Boek bij onze eigen kappers in onze salon.'),
  page('Software voor salons | Boekingsplatform','Our booking platform connects independent salons with their own booking software.'),
  page('Guide to booking platforms','Our booking platform guide compares independent salons and providers.'),
  page('Beauty boeken','Kappers en schoonheidssalons, boek een afspraak.'),
  page('Onze kapsalons','Vind onze salons, lees reviews en boek een afspraak bij onze kappers.'),
  page('Booking software for salons','Find salons, compare reviews and book software demos.'),
 ]) assert.equal(serviceBookingMediation(p),false,p.title);
});
test('sector evidence retains the concrete metadata behind its activity claim',()=>{
 const result=detectDeclaredIndustry(page('Kapsalon De Eik','Onze kapsalon biedt knippen en kleuren door onze eigen kappers.'));
 assert.ok(result.evidence.some(line=>line.includes('Kapsalon De Eik')));
 assert.ok(result.evidence.some(line=>line.includes('knippen en kleuren')));
});
