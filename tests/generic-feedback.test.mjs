import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isJavaScriptFramework, applyJsEvidenceUncertainty, titlePixelAdvice, scoreBreakdown, sampleSummary, commerceServiceSignals, compareScoreVersions } from "../lib/scan-feedback.ts";
import { renderWithRetry, representativeNeedsJavaScriptRendering } from "../lib/render-strategy.ts";
import { readHtmlSampleHeadFirst } from "../lib/safe-fetch.ts";
import { assessPageTitle } from "../lib/report-quality.ts";
import { refineSamplePageType, sampleEvidenceScore } from "../lib/sample-quality.ts";

// Stable HTML reference fixtures, not live dependencies or claims that a
// third-party website was actually scanned in CI.
const referenceFixtures = {
  static: "<html><head><title>Statisch</title></head><body><h1>Hallo</h1></body></html>",
  wordpress: '<html><head><meta name="generator" content="WordPress"></head><body>Over ons</body></html>',
  woocommerce: '<html><head><meta name="generator" content="WooCommerce"></head><body>€ 25</body></html>',
  shopify: '<html><head><title>Shop</title></head><body><script>window.Shopify.theme={}</script></body></html>',
  nuxt: '<html><head><title>SSR title</title></head><body><div id="__nuxt">SSR content</div><script src="/_nuxt/entry.js"></script></body></html>',
  next: '<html><head><title>SSR title</title></head><body><div id="__next">SSR content</div><script src="/_next/static/chunks.js"></script></body></html>',
  react: '<html><head></head><body><div id="root"></div><script src="/main.js"></script></body></html>',
  vue: '<html><head></head><body><div data-v-ab123 class="app"></div></body></html>',
  angular: '<html><body><app-root ng-version="18.0.0"></app-root></body></html>',
};
test("reference fixtures: only JS apps require browser evidence; static and CMS HTML remain raw", () => {
  for(const key of ["nuxt","next","react","vue","angular"]) assert.equal(isJavaScriptFramework(referenceFixtures[key]),true,key);
  for(const key of ["static","wordpress","woocommerce"]) assert.equal(isJavaScriptFramework(referenceFixtures[key]),false,key);
  // Shopify is a commerce platform and can run JS, but not every Shopify page is an SPA.
  assert.equal(typeof isJavaScriptFramework(referenceFixtures.shopify),"boolean");
});

test("SSR content does not exempt JS frameworks from hydration", () => {
  assert.equal(representativeNeedsJavaScriptRendering({frameworkSignal:true,visibleWords:2600,scriptCount:20}),true);
  assert.equal(representativeNeedsJavaScriptRendering({frameworkSignal:false,visibleWords:800,scriptCount:2}),false);
  assert.equal(representativeNeedsJavaScriptRendering({frameworkSignal:false,visibleWords:30,scriptCount:6}),true);
});

test("transient timeouts receive exactly one bounded retry; security failures never retry", async () => {
  const calls=[];
  const result=await renderWithRetry(async(ms)=>{calls.push(ms); if(calls.length===1) throw Error("RENDER_TIMEOUT"); return "hydrated";},100,40);
  assert.equal(result,"hydrated");
  assert.deepEqual(calls,[100,40]);
  let unsafe=0;
  await assert.rejects(renderWithRetry(async()=>{unsafe++;throw Error("URL_IP_BLOCKED");}),/URL_IP_BLOCKED/);
  assert.equal(unsafe,1);
});

test("canonical, title, structured data and form absences are unknown when JS failed",()=>{
  const keys=["title","description","canonical","schema","h1","accessibility_basics"];
  const checks=[...keys.map(key=>({key,status:"fail",issue_status:"FAIL",points:0,maxPoints:10,message:"missing",fix:"fix"})),
    {key:"https",status:"fail",issue_status:"FAIL",points:0,maxPoints:10,message:"unsecure",fix:"https"},
    {key:"schema",status:"warning",issue_status:"WARNING",points:5,maxPoints:10,message:"present but imperfect",fix:"",evidence:{found:true}}
  ];
  assert.equal(applyJsEvidenceUncertainty(checks,{framework:true,rendered:false,url:"https://example.com/"}),6);
  assert.ok(checks.slice(0,6).every(item=>item.status==="unable_to_confirm"&&item.points===0));
  assert.equal(checks[6].status,"fail");
  assert.equal(checks[7].status,"warning");
  const ready=[{key:"canonical",status:"fail",issue_status:"FAIL",points:0,maxPoints:7,message:"bad",fix:""}];
  assert.equal(applyJsEvidenceUncertainty(ready,{framework:true,rendered:true,url:"https://example.com/"}),0);
});

test("title width in pixels, not length: small width passes and wide width is soft advice",()=>{
  assert.equal(titlePixelAdvice(540).warning,false);
  assert.equal(titlePixelAdvice(600).warning,true);
  assert.equal(titlePixelAdvice(600).credit,0.95);
  assert.equal(titlePixelAdvice(null).warning,false);
  const title="iPhone informatie voor alle klanten met een abonnement";
  assert.equal(assessPageTitle(title,"provider.example",new Date("2026-10-15"),480).status,"PASS");
  const wide=assessPageTitle(title,"provider.example",new Date("2026-10-15"),610);
  // Wide titles are preview advice without deduction (same policy as long descriptions).
  assert.equal(wide.status,"PASS");
  assert.equal(wide.credit,1);
  assert.match(wide.details,/geen aftrek/);
});

test("subscription, booking and lead commerce are not conflated with checkout",()=>{
 const subscription=commerceServiceSignals({subscription:true,booking:false,lead:false,price:true});
 assert.equal(subscription.hasCommercialActivity,true);
 assert.equal(subscription.subscription,true);
 const booking=commerceServiceSignals({subscription:false,booking:true,lead:true,price:false});
 assert.equal(booking.hasCommercialActivity,true);
 assert.equal(booking.subscription,false);
});

test("page type uses product schema, breadcrumbs, article schema and contact paths",()=>{
 const base={proposed:"other",productSchema:false,itemListSchema:false,repeatedProductLinks:false,productOffer:false,purchaseAction:false,visiblePrices:0,uniqueH1:false,detailIdentity:false};
 assert.equal(refineSamplePageType({...base,proposed:"category",productSchema:true,path:"/shop/phones/iphone"}),"product");
 assert.equal(refineSamplePageType({...base,proposed:"category",path:"/shop/mobiel/apple/iphone-18-pro-5g/burgundy-256gb",uniqueH1:true,detailIdentity:true}),"product");
 assert.equal(refineSamplePageType({...base,proposed:"category",path:"/shop/mobiel/telefoons",uniqueH1:true,detailIdentity:true}),"category");
 assert.equal(refineSamplePageType({...base,articleSchema:true,path:"/blog/how-to"}),"article");
 assert.equal(refineSamplePageType({...base,path:"/contact"}),"contact");
 // An ItemList is a product collection only with commerce on the page (prices or purchase action).
 assert.equal(refineSamplePageType({...base,itemListSchema:true,breadcrumbDepth:3,visiblePrices:4}),"category");
 assert.equal(refineSamplePageType({...base,itemListSchema:true,breadcrumbDepth:3}),"other");
 assert.equal(refineSamplePageType({...base,path:"/diensten/onderhoud/"}),"service");
 assert.equal(refineSamplePageType({...base,path:"/internet/glasvezel",serviceOffer:true}),"service");
});

test("score deductions are transparent and unverified checks have no deduction",()=>{
 const checks=[{key:"title",title:"Title",category:"seo",status:"warning",points:9,maxPoints:10},
 {key:"schema",title:"Schema",category:"geo",status:"unable_to_confirm",points:0,maxPoints:8},
 {key:"cart",title:"Cart",category:"seo",status:"not_applicable",points:0,maxPoints:6}];
 const rows=scoreBreakdown(checks);
 assert.deepEqual(rows.map(x=>x.rawDeduction),[1,null,null]);
 assert.deepEqual(rows.map(x=>x.earnedPoints),[9,null,null]);
});

test("score differences above three points explain changed evidence, not ranking",()=>{
 const same=compareScoreVersions(95,98,"3.0","3.0");
 assert.equal(same.requiresExplanation,false);
 const changed=compareScoreVersions(95,89,"3.0","3.1",3,{
  previousRendering:"raw_html",currentRendering:"javascript_rendered",
  previousCoverage:84,currentCoverage:96,
  changedChecks:["seo:title (PASS → WARNING)"],
 });
 assert.equal(changed.requiresExplanation,true);
 assert.equal(changed.delta,-6);
 assert.equal(changed.modelChanged,true);
 assert.match(changed.explanation,/12%|84% → 96%/);
 assert.match(changed.explanation,/raw_html/);
 assert.match(changed.explanation,/seo:title/);
 assert.equal(changed.factors.length,4);
});
test("a JS page missing canonical has no misleading perfect four-metadata score",()=>{
 const checks=[
  {key:"http",status:"PASS"}, {key:"title",status:"PASS"},
  {key:"description",status:"PASS"}, {key:"h1",status:"PASS"},
  {key:"canonical",status:"UNABLE_TO_CONFIRM"},
 ];
 assert.equal(sampleEvidenceScore(checks,()=>0.9),null);
 assert.equal(sampleEvidenceScore(checks.map(x=>x.key==="canonical"?{...x,status:"PASS"}:x),()=>0.9),100);
});
test("25 selected, 23 scored, one noindex and one fetch error stay accounted for",()=>{
 assert.deepEqual(sampleSummary(25,23,1,1,0),{selected:25,scored:23,noindex:1,fetchFailed:1,headOnly:0,excluded:2,consistent:true});
});

test("oversized HTML keeps a complete head without claiming full document coverage",async()=>{
 const head='<html><head><title>Grote pagina</title><link rel="canonical" href="https://example.com/"></head>';
 const huge=head+"<body>"+"x".repeat(2_150_000)+"</body></html>";
 const response=new Response(huge,{headers:{"content-type":"text/html; charset=utf-8","content-length":String(Buffer.byteLength(huge))}});
 const sample=await readHtmlSampleHeadFirst(response,2_000_000);
 assert.equal(sample.partial,true);
 assert.equal(sample.headComplete,true);
 assert.match(sample.html,/<title>Grote pagina<\/title>/);
 assert.match(sample.html,/canonical/);
 assert.match(sample.html,/<body>/);
 assert.ok(Buffer.byteLength(sample.html,"utf8")<=2_000_000);
 assert.ok(sample.html.endsWith("x"));
});

test("scanner integrates all feedback policies and the report explains limitations",async()=>{
 const route=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
 const report=await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx",import.meta.url),"utf8");
 const browser=await readFile(new URL("../lib/headless-render.ts",import.meta.url),"utf8");
 for(const token of ["isJavaScriptFramework(rawHtml)","isJavaScriptFramework(representativeRawHtml)","renderWithRetry(","readHtmlSampleHeadFirst(","applyJsEvidenceUncertainty(","scoreBreakdown(checks)","subscription_price_visibility","booking_transaction","lead_form_presence","partialHeadOnly"]) assert.ok(route.includes(token),token);
 assert.match(route,/!hydratedAccessibility/);
 assert.match(browser,/ctx\.measureText\(t\)/);
 assert.match(browser,/domAccessibility/);
 assert.match(browser,/axeCore\.source/);
 assert.match(browser,/wcag21aa/);
 assert.match(route,/axeViolations/);
 assert.match(route,/AND result->>\'mode\'=\$4/);
 assert.match(report,/Scoreweging en puntenaftrek/);
 assert.match(report,/Gedeeltelijke HTML/);
 assert.match(report,/INDICATIVE_RAW_HTML|Indicatief \(raw HTML\)/);
});
