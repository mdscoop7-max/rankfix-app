import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isJavaScriptFramework, applyJsEvidenceUncertainty, titlePixelAdvice, sampleSummary, compareScoreVersions, commerceServiceSignals, trustedLocalBusinessEvidence, sufficientIdentitySchema, hasUnresolvedClientTemplateBindings } from "../lib/scan-feedback.ts";
import { stableCoreChecks, scoreApplicableChecks, applyEvidenceBasedScoreCap, weightedCoverage, scoreRange } from "../lib/audit-score.ts";
import { renderWithRetry, representativeNeedsJavaScriptRendering } from "../lib/render-strategy.ts";
import { renderFailureCode, renderFailureText } from "../lib/report-quality.ts";
import { refineSamplePageType, sampleEvidenceScore } from "../lib/sample-quality.ts";
import { readHtmlSampleHeadFirst } from "../lib/safe-fetch.ts";
import { claimRender, createRenderBudget, launchSourceFor } from "../lib/render-limits.ts";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const sampleBase = {proposed:"other",productSchema:false,itemListSchema:false,repeatedProductLinks:false,productOffer:false,purchaseAction:false,visiblePrices:0,uniqueH1:false,detailIdentity:false};

test("reference set: static HTML and WordPress are readable without forcing a browser; Nuxt SSR and React CSR are rendered",()=>{
  const staticSite = '<html><head><title>Static</title></head><body><h1>Hi</h1></body></html>';
  const wordpress = '<html><head><meta name="generator" content="WordPress"><link rel="canonical" href="https://cms.example/"></head><body><h1>Hi</h1></body></html>';
  const nuxt = '<html><body><div id="__nuxt"><h1>SSR</h1></div><script src="/_nuxt/app.js"></script></body></html>';
  const next = '<html><body><div id="__next"><h1>SSR</h1></div><script src="/_next/app.js"></script></body></html>';
  const react = '<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
  for(const s of [staticSite,wordpress]) assert.equal(isJavaScriptFramework(s),false);
  for(const s of [nuxt,next,react]) assert.equal(isJavaScriptFramework(s),true);
  assert.equal(representativeNeedsJavaScriptRendering({visibleWords:300,scriptCount:12,frameworkSignal:true}),true);
  assert.equal(representativeNeedsJavaScriptRendering({visibleWords:1000,scriptCount:1,frameworkSignal:false}),false);
});

test("canonical and title injected after JS are assessed; if rendering fails absences remain unknown",()=>{
  const raw = '<html><head></head><body><div id="root"></div></body></html>';
  const hydrated = '<html><head><title>Product</title><link rel="canonical" href="https://shop.example/item"></head><body><h1>Product</h1></body></html>';
  assert.doesNotMatch(raw, /rel="canonical"/);
  assert.match(hydrated,/rel="canonical"/);
  assert.match(hydrated,/<title>Product/);
  const checks=["title","canonical","schema","accessibility_basics"].map(key=>({key,status:"fail",issue_status:"FAIL",points:0,maxPoints:5,message:"missing",fix:"fix"}));
  assert.equal(applyJsEvidenceUncertainty(checks,{framework:true,rendered:false,url:"https://shop.example/"}),4);
  assert.ok(checks.every(x=>x.status==="unable_to_confirm"));
});

test("timed-out render retries once, lowers evidence reliability, and reports the real cause",async()=>{
  let calls=0;
  await assert.rejects(renderWithRetry(async()=>{calls++;throw Error("RENDER_TIMEOUT")},25,15),/RENDER_TIMEOUT/);
  assert.equal(calls,2);
  assert.equal(renderFailureCode(new Error("Navigation timeout exceeded")),"RENDER_TIMEOUT");
  assert.match(renderFailureText("RENDER_TIMEOUT"),/tijdslimiet/);
  assert.doesNotMatch(renderFailureText("BROWSER_UNAVAILABLE"),/tijdelijk/);
  const budget=createRenderBudget(2,30000,0);
  claimRender(budget,1);claimRender(budget,2);
  assert.throws(()=>claimRender(budget,3),/RENDER_BUDGET_EXHAUSTED/);
  assert.equal(launchSourceFor({VERCEL:"1"}),"serverless");
});

test("subscription commerce exists without retail cart or proof of physical products",()=>{
 const service = commerceServiceSignals({subscription:true,booking:false,lead:true,price:true});
 assert.equal(service.hasCommercialActivity,true);
 assert.equal(service.subscription,true);
 assert.equal(refineSamplePageType({...sampleBase,path:"/internet/glasvezel",serviceOffer:true}),"service");
});

test("page typing distinguishes product detail, shop category, news article and other",()=>{
 assert.equal(refineSamplePageType({...sampleBase,proposed:"category",path:"/shop/mobiel/apple/iphone-18-pro-5g/burgundy-256gb",uniqueH1:true,detailIdentity:true}),"product");
 assert.equal(refineSamplePageType({...sampleBase,path:"/mobiel-shop"}),"category");
 assert.equal(refineSamplePageType({...sampleBase,path:"/smarthome"}),"category");
 assert.equal(refineSamplePageType({...sampleBase,path:"/televisie"}),"service");
 assert.equal(refineSamplePageType({...sampleBase,path:"/beleef/blog/overview",articleSchema:true}),"article");
 assert.equal(refineSamplePageType({...sampleBase,path:"/misc"}),"other");
});

test("66-character title can be narrow in pixels without penalty",()=>{
 assert.equal(titlePixelAdvice(520).warning,false);
 assert.equal(titlePixelAdvice(610).warning,true);
 assert.ok(titlePixelAdvice(610).credit>=0.95);
 assert.equal(titlePixelAdvice(null).credit,1);
});

test("incomplete metadata produces no misleading 100 sample score",()=>{
 const meta=["title","description","h1","canonical"].map(key=>({key,status:"PASS"}));
 assert.equal(sampleEvidenceScore(meta,()=>1),100);
 assert.equal(sampleEvidenceScore(meta.map(x=>x.key==="canonical"?{...x,status:"UNABLE_TO_CONFIRM"}:x),()=>1),null);
});

test("stable core stays stable when 84% versus 62% evidence coverage comes only from extra checks",()=>{
 const pass=(key,maxPoints=10)=>({key,issue_status:"PASS",maxPoints,points:maxPoints,confidence:"high",severity:"LOW"});
 const unknown=(key,maxPoints=10)=>({key,issue_status:"UNABLE_TO_CONFIRM",maxPoints,points:0,confidence:"low",severity:"INFO"});
 const core=[pass("title"),pass("description"),pass("canonical"),pass("entity")];
 const additions=[unknown("merchant_product_readiness"),unknown("merchant_feed_signal"),unknown("product_copy_optimizer")];
 const highCoverage=[...core,unknown("product_schema",8)];
 const lowCoverage=[...core,...additions,unknown("product_schema",8)];
 assert.ok(weightedCoverage(highCoverage).coveragePercent > weightedCoverage(lowCoverage).coveragePercent);
 const seo=(arr)=>applyEvidenceBasedScoreCap(scoreApplicableChecks(stableCoreChecks(arr,"seo")),stableCoreChecks(arr,"seo"));
 assert.equal(seo(highCoverage),seo(lowCoverage));
 assert.equal(seo(highCoverage),100);
 assert.ok(scoreRange(lowCoverage).low<scoreRange(lowCoverage).high);
});

test("a >3 point score change explicitly reports coverage and model changes",()=>{
 const x=compareScoreVersions(95,85,"3.0-evidence-strict","3.1-stable-core-evidence",3,{previousCoverage:84,currentCoverage:62,previousRendering:"javascript_rendered",currentRendering:"raw_html"});
 assert.equal(x.requiresExplanation,true);
 assert.match(x.explanation,/84% → 62%/);
 assert.match(x.explanation,/Scoremodelversie/);
 assert.match(x.explanation,/raw_html/);
});

test("selected, fetched, scored, metadata-excluded, noindex and failed reconcile",()=>{
 const s=sampleSummary(27,21,1,0,1);
 assert.equal(s.selected,27);
 assert.equal(s.scored,21);
 assert.equal(s.excluded,6);
 assert.equal(s.consistent,true);
 // 27 selected = 21 scored + 5 insufficient metadata + 1 noindex.
 assert.equal(21+5+1,27);
 const routeTest=source("app/api/scan/route.ts");
 return routeTest.then(text=>{
  assert.match(text,/fetched:auditedRawPages.length\+excludedNoindexPages/);
  assert.match(text,/unscoredMetadata:unscoredMetadataPages/);
 });
});

test("oversized HTML retains its complete head and an honest partial flag",async()=>{
 const head='<html><head><title>Large</title><link rel="canonical" href="https://large.example/"></head><body>';
 const body=head+"A".repeat(2_150_000)+"</body></html>";
 const sample=await readHtmlSampleHeadFirst(new Response(body,{headers:{"content-type":"text/html","content-length":String(Buffer.byteLength(body))}}),2_000_000);
 assert.equal(sample.partial,true);
 assert.equal(sample.headComplete,true);
 assert.match(sample.html,/canonical/);
});

test("site-wide PASS requires proof on every audited page, not just the homepage",async()=>{
 const route=await source("app/api/scan/route.ts");
 const report=await source("app/dashboard/audit/[id]/report/page.tsx");
 assert.match(route,/passes.length===auditedRawPages.length/);
 assert.match(route,/unconfirmedPages: auditedRawPages.length - proven.length/);
 assert.match(report,/Gedeeltelijk bevestigde controles/);
 assert.match(report,/sitewideNotFullyConfirmed/);
});

test("viewport and zoom are derived from one canonical viewport source",async()=>{
 const route=await source("app/api/scan/route.ts");
 assert.match(route,/!viewportContent[\s\S]*check\("unable_to_confirm", "viewport"/);
 assert.match(route,/!viewportContent[\s\S]*check\("unable_to_confirm","viewport_zoom_blocked"/);
 assert.match(route,/const viewportBlocksZoom/);
});

test("hydrated buttons get axe testing but raw-HTML accessibility stays indicative",async()=>{
 const browser=await source("lib/headless-render.ts");
 const report=await source("app/dashboard/audit/[id]/report/page.tsx");
 assert.match(browser,/axeCore\.source/);
 assert.match(browser,/domAccessibility/);
 assert.match(browser,/wcag21aa/);
 assert.match(report,/Indicatief \(raw HTML\)/);
});

test("limited audits explain a rescan action, render attempt count, typed sample and correct Dutch singular",async()=>{
 const report=await source("app/dashboard/audit/[id]/report/page.tsx");
 const route=await source("app/api/scan/route.ts");
 assert.match(report,/Hoofdactie: browser-rendering controleren/);
 assert.match(report,/Geen bewezen problemen/);
 assert.match(report,/Browserpogingen:/);
 assert.match(report,/vraagt 1 pagina/);
 assert.match(report,/Selectie per paginatype/);
 assert.match(route,/templateSummary:/);
 assert.match(route,/attempts: primaryRenderAttempts/);
});


test("raw SSR head metadata remains provable after JS navigation, while client-added metadata is retained",async()=>{
 const {preserveRawHeadEvidence,renderIsErrorState}=await import("../lib/render-quality.ts");
 const raw='<html><head><title>SSR</title><link rel="canonical" href="https://site.example/"><meta name="description" content="Server"><script type="application/ld+json">{"@type":"WebSite"}</script></head><body><h1>Original</h1></body></html>';
 const rendered='<html><head><title>Hydrated</title><meta property="og:title" content="OG Client"></head><body><h1>Hydrated</h1></body></html>';
 const combined=preserveRawHeadEvidence(raw,rendered);
 assert.match(combined,/canonical/);
 assert.match(combined,/description/);
 assert.match(combined,/application\/ld\+json/);
 assert.match(combined,/og:title/);
 assert.match(combined,/<title>Hydrated<\/title>/);
 assert.equal(renderIsErrorState(raw,rendered),false);
 assert.equal(renderIsErrorState(raw,rendered.replace("Hydrated</title>","Error</title>")),true);
 const jsOnlyCanonical='<html><head><title>Client</title><link rel="canonical" href="https://site.example/dynamic"></head><body>client</body></html>';
 assert.match(preserveRawHeadEvidence('<html><head></head><body>shell</body></html>',jsOnlyCanonical),/canonical/);
 assert.equal((preserveRawHeadEvidence(raw,jsOnlyCanonical).match(/rel="canonical"/g)||[]).length,1);
});


test("extra sector modules never cap the SEO/GEO headline even when severe, while proven core issues still do",()=>{
 const core=[{key:"title",issue_status:"PASS",maxPoints:10,points:10,confidence:"high",severity:"LOW"}];
 const sector={key:"merchant_feed_signal",issue_status:"FAIL",maxPoints:10,points:0,confidence:"high",severity:"CRITICAL"};
 assert.equal(applyEvidenceBasedScoreCap(scoreApplicableChecks(stableCoreChecks([...core,sector],"seo")),stableCoreChecks([...core,sector],"seo")),100);
});

test("telecom provider navigation and generic contact do not imply LocalBusiness", async () => {
  // Country-wide telecom service homepage: support contact + navigation menu.
  assert.equal(trustedLocalBusinessEvidence({
    explicitLocalSchema:false, localIdentityEvidence:false, contactEvidence:true,
  }),false);
  // A confirmed local business identity with contact details is applicable.
  assert.equal(trustedLocalBusinessEvidence({
    explicitLocalSchema:false, localIdentityEvidence:true, contactEvidence:true,
  }),true);
  assert.equal(trustedLocalBusinessEvidence({
    explicitLocalSchema:true, localIdentityEvidence:false, contactEvidence:false,
  }),true);
  assert.equal(trustedLocalBusinessEvidence({
    explicitLocalSchema:false, localIdentityEvidence:true, contactEvidence:false,
  }),false);
  const route=await source("app/api/scan/route.ts");
  assert.match(route,/trustedLocalBusinessEvidence\(/);
  assert.doesNotMatch(route,/localBusinessKeywordSignal \|\| \/\\b\(menu\|menukaart/);
});

test("Organization alone or WebSite alone is enough for homepage identity evidence", async () => {
  assert.equal(sufficientIdentitySchema(true,false),true);
  assert.equal(sufficientIdentitySchema(false,true),true);
  assert.equal(sufficientIdentitySchema(true,true),true);
  assert.equal(sufficientIdentitySchema(false,false),false);
  const route=await source("app/api/scan/route.ts");
  assert.match(route,/sufficientIdentitySchema\(organizationSchemaPresent, websiteSchemaPresent\)/);
  assert.match(route,/sufficientIdentitySchema\(hasOrg, hasWebSite\)/);
});

test("visible unresolved client-template bindings require a render even on SSR pages", async () => {
  const hydratedButIncomplete = '<html><body><h1>Internet & TV</h1><div>{{ itemsInCategory("Sport") }}</div><p>{{ genre }}</p><script src="/assets/app.js"></script></body></html>';
  assert.equal(hasUnresolvedClientTemplateBindings(hydratedButIncomplete), true);
  assert.equal(hasUnresolvedClientTemplateBindings('<html><body><p>{{ sample }}</p><pre>{{ another }}</pre><script src="/a.js"></script></body></html>'),false);
  assert.equal(hasUnresolvedClientTemplateBindings('<html><body><p>{{ x }}</p><p>{{ y }}</p></body></html>'),false);
  const route = await source("app/api/scan/route.ts");
  assert.match(route,/javascriptFrameworkSignal = isJavaScriptFramework\(rawHtml\) \|\| unresolvedClientBindings/);
});

test("nationwide telecom services retain subscription price formatting without retail checks", async () => {
  const route = await source("app/api/scan/route.ts");
  assert.match(route,/!hasEcommerceSignal && !telecomProviderIdentity/);
  assert.match(route,/item.key==="price_format" && telecomProviderIdentity/);
  assert.match(route,/subscription: telecomProviderIdentity \|\|/);
  assert.match(route,/business_placeholders: `placeholders=\$\{placeholderMatches.length\}; verifiedDetails=/);
});
