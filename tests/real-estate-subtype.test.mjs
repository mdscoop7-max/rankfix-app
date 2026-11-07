import test from "node:test";
import assert from "node:assert/strict";
import {detectRealEstateSubtype} from "../lib/real-estate-subtype.ts";

test("housing landlord with own rent identity and tenant services is not broker",()=>{
 const x=detectRealEstateSubtype({title:"Woningaanbod | Huurwoningen in heel Nederland",description:"Huurwoningen in Nederland vindt u bij onze organisatie.",h1s:["Welkom"],navLabels:["Huren in 5 stappen","Huurders","Mijn huur"]});
 assert.equal(x.subtype,"property_rental_operator");
 assert.ok(x.confidenceScore>=75);
});
test("institutional investor needs explicit own-investor identity and rental support",()=>{
 const x=detectRealEstateSubtype({title:"Huurwoningen",description:"Wij zijn een woningbelegger met een uitgebreide portefeuille huurwoningen.",navLabels:["Huurders","Huurverhoging"]});
 assert.equal(x.subtype,"institutional_property_rental");
});
test("broker only with sales/agent identity and cannot be inferred from renting",()=>{
 const a=detectRealEstateSubtype({title:"Uw makelaar",description:"Hulp bij woning verkopen en kopen",navLabels:["Aanbod"]});
 assert.equal(a.subtype,"real_estate_agent");
 const b=detectRealEstateSubtype({title:"Huizen te koop en te huur",description:"Zoek in het actuele woningaanbod",navLabels:["Makelaars"]});
 assert.equal(b.subtype,"unknown");
});
test("property listing platform is not owner/operator of a rented home",()=>{
 const x=detectRealEstateSubtype({title:"Vastgoedportaal voor woningzoekers",description:"Een property portal voor vastgoedaanbod",navLabels:["Makelaars"]});
 assert.equal(x.subtype,"property_portal");
});
test("incidental rental investment news articles cannot determine organisation identity",()=>{
 const x=detectRealEstateSubtype({title:"Bedrijf",description:"Industrie en technologie",sampledOwnIdentity:["Nieuws over vastgoedbeleggers", "Huurwoningen in Europa"]});
 assert.equal(x.subtype,"unknown");
});
