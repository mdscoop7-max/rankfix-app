import test from "node:test";
import assert from "node:assert/strict";
import {industrialCorporateEvidence} from "../lib/industrial-corporate.ts";
const corp={url:"https://example.test/unternehmen/weltweit/",type:"corporate",
 identityText:"Die Gruppe ist ein international führendes Technologie- und Dienstleistungsunternehmen. Geschäftsbereiche: Industrial Technology, Mobility und Consumer Goods.",
 ownIdentityText:"Die Gruppe im Überblick | Unternehmen"};
const service={url:"https://example.test/produkte-und-services/industrie/",type:"service",
 identityText:"Industrietechnologie, Hardware, Automatisierung und Industrieanlagen.",
 ownIdentityText:"Industrie und Handwerk | Lösungen für Industrie"};
test("industrial group can be identified via its about page and industrial services",()=>{
 const x=industrialCorporateEvidence({homeHeadings:["Unsere Lösungen für Geschäftskunden","Industrie und Handwerk"],pages:[corp,service]});
 assert.equal(x?.sector,"manufacturing_industrial");
 assert.equal(x?.subtype,"industrial_technology_group");
 assert.ok(x?.confidenceScore>=85);
});
test("news mentioning industry must not establish manufacturing",()=>{
 const x=industrialCorporateEvidence({homeHeadings:["Industrie"],pages:[
   {url:"https://example.test/news/",type:"article",identityText:corp.identityText,ownIdentityText:"Industrial technology explained"},service]});
 assert.equal(x,null);
});
test("a generic corporate title without independent evidence abstains",()=>{
 const x=industrialCorporateEvidence({homeHeadings:["Careers"],pages:[corp]});
 assert.equal(x,null);
});
