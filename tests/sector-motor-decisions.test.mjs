import test from "node:test";
import assert from "node:assert/strict";
import { decideCommerceModules, reconcilePrimarySector } from "../lib/sector-motor-decisions.ts";

const base = {primarySector:"unknown",primaryBusinessModel:"service",retailProduct:false,productPrice:false,cart:false,checkout:false,merchantFeed:false,euMarket:true};

test("secondary commerce does not turn service providers into retail",()=>{
 for (const primarySector of ["telecom_technology","hospitality","healthcare","education","finance","transport_travel","real_estate","recruitment"]) {
   assert.deepEqual(decideCommerceModules({...base,primarySector,cart:true,checkout:true,retailProduct:true,productPrice:true}),[]);
 }
});
test("real retailers receive only evidenced modules",()=>{
 assert.deepEqual(decideCommerceModules({...base,primaryBusinessModel:"retail",retailProduct:true}),["product"]);
 assert.deepEqual(decideCommerceModules({...base,primaryBusinessModel:"retail",retailProduct:true,cart:true,checkout:true,productPrice:true}),["ecommerce","product","pricing_currency","checkout","eu_consumer"]);
});
test("merchant module requires explicit merchant evidence",()=>{
 assert.equal(decideCommerceModules({...base,primaryBusinessModel:"retail",retailProduct:true,cart:true}).includes("merchant"),false);
 assert.equal(decideCommerceModules({...base,primaryBusinessModel:"retail",retailProduct:true,merchantFeed:true}).includes("merchant"),true);
});
test("strong primary sector cannot be overwritten by unrelated secondary signals",()=>{
 assert.deepEqual(reconcilePrimarySector({sector:"telecom_technology",confidence:96},{sector:"hospitality",confidence:99,independentEvidence:true}),{sector:"telecom_technology",confidence:96});
 assert.deepEqual(reconcilePrimarySector({sector:"unknown",confidence:0},{sector:"hospitality",confidence:90,independentEvidence:true}),{sector:"hospitality",confidence:90});
 assert.deepEqual(reconcilePrimarySector({sector:"unknown",confidence:0},{sector:"hospitality",confidence:90,independentEvidence:false}),{sector:"unknown",confidence:0});
});
