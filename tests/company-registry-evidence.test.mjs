import test from "node:test";
import assert from "node:assert/strict";
import {reconcileCompanyRegistry} from "../lib/company-registry-evidence.ts";

const record={source:"official-national-register",country:"NL",registrationNumber:"12345678",legalName:"Voorbeeld Installaties B.V.",activities:[{scheme:"SBI",code:"4321",primary:true}]};
const site={country:"NL",registrationNumbers:["1234 5678"],legalNames:["Voorbeeld Installaties B.V."]};
const mapping=[{scheme:"SBI",code:"4321",sector:"home_services",label:"Elektrotechniek"}];

test("matching official number and legal name yields an industry hint, not website fact",()=>{
 const r=reconcileCompanyRegistry(site,[record],mapping);
 assert.equal(r.status,"verified");
 assert.equal(r.companyName,record.legalName);
 assert.equal(r.industryHint?.sector,"home_services");
 assert.equal(r.websiteSectorConfirmed,false);
});
test("company name alone cannot establish registry identity",()=>{
 const r=reconcileCompanyRegistry({country:"NL",legalNames:[record.legalName]},[record],mapping);
 assert.equal(r.status,"unconfirmed");
 assert.equal(r.industryHint,undefined);
});
test("wrong company name is conflict even with matching registration number",()=>{
 const r=reconcileCompanyRegistry({...site,legalNames:["Other Company B.V."]},[record],mapping);
 assert.equal(r.status,"conflict");
});
test("land must be independently known and match",()=>{
 assert.equal(reconcileCompanyRegistry({...site,country:undefined},[record],mapping).status,"unconfirmed");
 assert.equal(reconcileCompanyRegistry({...site,country:"BE"},[record],mapping).status,"unconfirmed");
});
test("code systems and versions are never silently mixed",()=>{
 const r=reconcileCompanyRegistry(site,[record],[{scheme:"NACE_REV_2_1",code:"4321",sector:"home_services",label:"Elektrotechniek"}]);
 assert.equal(r.status,"verified"); assert.equal(r.industryHint,undefined);
});
test("matching VAT identifies a company without inventing an industry",()=>{
 const r=reconcileCompanyRegistry({country:"FR",vatNumbers:["FR 12 345678901"],legalNames:["Example SARL"]},[{source:"VIES",country:"FR",vatNumber:"FR12345678901",legalName:"Example SARL"}],mapping);
 assert.equal(r.status,"verified");assert.equal(r.matchedBy,"vat_number");
 assert.equal(r.industryHint,undefined);
});
test("multiple separate entities with matches require review",()=>{
 const r=reconcileCompanyRegistry({...site,vatNumbers:["NL999"]},[record,{...record,registrationNumber:"87654321",vatNumber:"NL999"}],mapping);
 assert.equal(r.status,"conflict");
});
test("absence of licensed registry source does not lower audit scores",()=>{
 const r=reconcileCompanyRegistry(site,[],mapping);
 assert.equal(r.status,"unavailable"); assert.equal(r.websiteSectorConfirmed,false);
});
