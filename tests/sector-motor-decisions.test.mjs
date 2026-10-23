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

test("service sectors never inherit retail merchant or checkout from secondary features",()=>{
 for (const primarySector of ["telecom_technology","hospitality","healthcare","education","finance","transport_travel","real_estate","recruitment","government","tourism","automotive","professional_services","media","nonprofit","food_service","fitness","construction","software","local_services"]) {
   assert.deepEqual(decideCommerceModules({...base,primarySector,retailProduct:true,productPrice:true,cart:true,checkout:true,merchantFeed:true}),[]);
 }
});

test("unknown identity needs independent retail evidence",()=>{
 assert.deepEqual(decideCommerceModules({...base,primaryBusinessModel:"unknown",retailProduct:true}),[]);
 assert.deepEqual(decideCommerceModules({...base,primaryBusinessModel:"unknown",retailProduct:true,cart:true}),["ecommerce","product","eu_consumer"]);
});

test("checkout or cart alone does not activate webshop checks",()=>{
 assert.deepEqual(decideCommerceModules({...base,primaryBusinessModel:"retail",cart:true,checkout:true}),[]);
 assert.deepEqual(decideCommerceModules({...base,primaryBusinessModel:"retail",checkout:true}),[]);
});

test("scanner imports central motor and preserves service site identity",async()=>{
 const {readFile}=await import("node:fs/promises");
 const source=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
 assert.match(source,/import \{ decideCommerceModules \} from "@\/lib\/sector-motor-decisions"/);
 assert.match(source,/const motorCommerceModules = decideCommerceModules\(/);
  assert.match(source,/\(primaryNonCommerceIdentity \|\| verifiedNonCommerceIndustry\) && technologyProfile\.siteType === "Webshop"/);
  assert.match(source,/primaryBusinessModel: verifiedNonCommerceIndustry \? "service"/);
 assert.match(source,/allowedCommerceModules\.has\(module\)/);
});
