import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { refineSamplePageType, sampleEvidenceScore, missingJsHeadEvidenceUnverified } from "../lib/sample-quality.ts";
import { assessPageTitle } from "../lib/report-quality.ts";
import { commerceApplicability } from "../lib/commerce-applicability.ts";
import { decideCommerceModules } from "../lib/sector-motor-decisions.ts";

test("Nuxt head metadata is unknown without rendering, even when a page has server-side text", () => {
  assert.equal(missingJsHeadEvidenceUnverified({frameworkSignal:true,rendered:false,clientShell:false}),true);
  assert.equal(missingJsHeadEvidenceUnverified({frameworkSignal:true,rendered:true,clientShell:true}),false);
  assert.equal(missingJsHeadEvidenceUnverified({frameworkSignal:false,rendered:false,clientShell:false}),false);
});

test("an iPhone with Product schema is a product page, even under category URL paths", () => {
  const base = { proposed:"category", productSchema:true,itemListSchema:false,repeatedProductLinks:false,
    productOffer:true,purchaseAction:false,visiblePrices:1,uniqueH1:true,detailIdentity:true };
  assert.equal(refineSamplePageType(base),"product");
  assert.equal(refineSamplePageType({...base,productSchema:false,purchaseAction:true}),"product");
  assert.equal(refineSamplePageType({...base,proposed:"other",productSchema:false,itemListSchema:true,repeatedProductLinks:true,purchaseAction:false}),"category");
  assert.equal(refineSamplePageType({...base,proposed:"legal"}),"legal");
  assert.equal(refineSamplePageType({...base,productSchema:false,purchaseAction:false,detailIdentity:false}),"category");
});

test("no rendered JS canonical does not cost sample score points", () => {
  const unknown = [
    {key:"http",status:"PASS"}, {key:"title",status:"PASS"},
    {key:"description",status:"PASS"}, {key:"h1",status:"PASS"},
    {key:"canonical",status:"UNABLE_TO_CONFIRM"}
  ];
  assert.equal(sampleEvidenceScore(unknown,()=>0.9),100);
  assert.equal(sampleEvidenceScore(unknown.map(x=>x.key==="canonical"?{...x,status:"WARNING"}:x),()=>0.9),98);
  assert.equal(sampleEvidenceScore([{key:"http",status:"PASS"},{key:"canonical",status:"UNABLE_TO_CONFIRM"}],()=>0.9),null);
});

test("title length alone is advice and not an unproven search ranking failure", () => {
  for(const length of [66,90,109]) {
    const title="Betrouwbare telefoon, abonnement en service - ".padEnd(length,"X");
    const result=assessPageTitle(title,"provider.example");
    assert.equal(result.status,"PASS");
    assert.equal(result.credit,1);
    assert.match(result.details,/pixelbreedte/);
  }
  const extreme=assessPageTitle("Betrouwbare telefoon, abonnement en service voor alle klanten - "+"X".repeat(140),"provider.example");
  assert.equal(extreme.status,"WARNING");
  assert.ok(extreme.credit >= 0.9);
});

test("telecom secondary device catalog is unconfirmed commerce, not absent", () => {
  const base={confirmed:false, primaryNonCommerceIdentity:true,commerceHints:true,thinShell:false,marketSelector:false,auditedRepresentativePages:20};
  assert.deepEqual(commerceApplicability({...base,verifiedSecondaryCommerce:true}),{state:"unconfirmed",reason:"weak_commerce_signals"});
  assert.deepEqual(commerceApplicability({...base,verifiedSecondaryCommerce:false}),{state:"absent",reason:"service_identity"});
  const secondary = decideCommerceModules({primarySector:"telecom_technology",primaryBusinessModel:"service",retailProduct:true,
    productPrice:true,cart:false,checkout:false,merchantFeed:false,euMarket:true,secondaryRetailDetail:true});
  assert.deepEqual(secondary,["product","pricing_currency"]);
  assert.equal(secondary.includes("merchant"),false);
  assert.equal(secondary.includes("checkout"),false);
});

test("scanner applies the Nuxt evidence rules and reports actual sample coverage",async()=>{
  const route=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  const report=await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx",import.meta.url),"utf8");
  assert.match(route,/missingJsHeadEvidenceUnverified\(/);
  assert.match(route,/sampleEvidenceScore\(evidenceChecks/);
  assert.match(route,/refineSamplePageType\(/);
  assert.match(route,/verifiedSecondaryCommerce: Boolean\(sitewideCommerceEvidence\.confirmed/);
  assert.match(route,/secondaryRetailDetail: verifiedRepresentativeProductDetail/);
  assert.match(route,/metadataMayBeClientRendered\s*\? check\("unable_to_confirm","accessibility_basics"/);
  assert.match(route,/scoredSamplePages = auditedRawPages\.filter/);
  assert.match(report,/const selectedPages=Number\(/);
  assert.match(report,/excludedNoindex/);
});
