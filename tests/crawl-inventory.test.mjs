import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./scan-matrix/loader.mjs", import.meta.url);
const { crawlSite } = await import("../lib/crawler.ts");
const { crawlLinks, robotsAllows, sitemapEntries } = await import("../lib/crawl-discovery.ts");
const base = "https://inventory.test/";
const page = links => `<html lang="en"><head><title>Independent services</title></head><body><main><h1>Our services</h1>${links}</main></body></html>`;
const html = body => new Response(body, { headers: { "content-type": "text/html" } });
const xml = body => new Response(body, { headers: { "content-type": "application/xml" } });
const absent = () => new Response("not found", { status: 404 });
const checkCounts = c => assert.equal(c.discovered, c.checked+c.excluded+c.notConfirmed+c.notFound+c.duplicates+c.pending);

async function withFetch(routes, run) {
 const saved=globalThis.fetch, seen=[];
 globalThis.fetch=async (url) => {const u=new URL(url);seen.push(u.href); const route=routes[u.pathname+u.search];return typeof route==='function'?route(u):route===undefined?absent():route.clone();};
 try {return await run(seen);} finally {globalThis.fetch=saved;delete globalThis.__RF_RENDER;}
}

test("sitemap index, pagination, hreflang, canonical candidates and exclusions survive resume without duplicate counts", async () => {
 const routes={
  '/robots.txt':new Response('User-agent: *\nDisallow: /private\nSitemap: '+base+'index.xml'),
  '/index.xml':xml('<sitemapindex><sitemap><loc>'+base+'pages.xml</loc></sitemap></sitemapindex>'),
  '/pages.xml':xml('<urlset><url><loc>'+base+'services</loc><xhtml:link rel="alternate" hreflang="fr" href="'+base+'fr/services"/></url><url><loc>'+base+'account/login</loc></url></urlset>'),
  '/':html(page('<a href="/services">Services</a><a href="/services">Again</a><a href="/private">Private</a><a href="/missing">Missing</a><a href="/blocked">Blocked</a>')),
  '/services':html(page('<link rel="next" href="/services?page=2"><link rel="canonical" href="/services"><a href="/">Home</a>')),
  '/fr/services':html(page('<a href="/services">English</a>')),
  '/services?page=2':html(page('<a href="/services">Back</a>')),
  '/blocked':new Response('<title>Just a moment...</title>',{status:503,headers:{'content-type':'text/html'}}),
 };
 await withFetch(routes, async seen => {
  let result=await crawlSite(base,'DEEP',{batchPages:2,maxPages:30,renderJavaScript:false});
  assert.equal(result.coverage.canResume,true);checkCounts(result.coverage);
  const first=structuredClone(result.checkpoint);
  for(let i=0;i<5&&result.coverage.canResume;i++) result=await crawlSite(base,'DEEP',{checkpoint:result.checkpoint,batchPages:2,maxPages:30,renderJavaScript:false});
  assert.equal(result.coverage.checked,4);
  assert.equal(result.coverage.excluded,2);
  assert.equal(result.coverage.notFound,1);
  assert.equal(result.coverage.notConfirmed,1);
  assert.equal(result.coverage.pending,0);assert.equal(result.coverage.complete,false);
  assert.equal(result.coverage.fullWebsiteConfirmed,false);checkCounts(result.coverage);
  assert.equal(seen.filter(u=>u===base+'services').length,1);
  assert.ok(!seen.some(u=>u.endsWith('/private')||u.endsWith('/account/login')));
  assert.ok(result.checkpoint.entries.find(e=>e.url.endsWith('/missing')).from);
  assert.deepEqual(first.pages.length,2,'resume does not mutate caller checkpoint');
 });
});
test("a package page limit never becomes a full website claim", async () => {
 await withFetch({'/':html(page(Array.from({length:40},(_,i)=>`<a href="/p/${i}">Page</a>`).join(''))),...Object.fromEntries(Array.from({length:40},(_,i)=>['/p/'+i,html(page(''))]))},async()=>{
  const r=await crawlSite(base,'DEEP',{maxPages:30,batchPages:30,renderJavaScript:false});
  assert.equal(r.coverage.discovered,41);assert.equal(r.coverage.checked,30);assert.equal(r.coverage.pending,11);
  assert.equal(r.coverage.stopReason,'page_limit');assert.equal(r.coverage.complete,false);assert.equal(r.coverage.canResume,false);checkCounts(r.coverage);
 });
});
test("hard request budget includes sitemap reads and redirect hops and leaves a resumable pending page", async () => {
 await withFetch({'/':new Response(null,{status:302,headers:{location:'/home'}}),'/home':html(page(''))},async seen=>{
  const r=await crawlSite(base,'STANDARD',{maxRequests:3,renderJavaScript:false});
  assert.equal(seen.length,3);assert.equal(r.coverage.requestsThisBatch,3);
  assert.equal(r.coverage.checked,0);assert.equal(r.coverage.pending,1);assert.equal(r.coverage.stopReason,'request_limit');assert.equal(r.coverage.canResume,true);
 });
});
test("robots denial and unavailable robots never cause a bypass or a completed crawl", async () => {
 for(const robots of [new Response('User-agent: RankFixBot\nDisallow: /'),new Response('blocked',{status:403})]) {
  await withFetch({'/robots.txt':robots,'/':html(page(''))},async seen=>{
   const r=await crawlSite(base,'STANDARD',{renderJavaScript:false});
   assert.ok(!seen.includes(base));assert.equal(r.coverage.fullWebsiteConfirmed,false);
   if(robots.status===403) {assert.equal(r.coverage.complete,false);assert.equal(r.coverage.stopReason,'robots_unconfirmed');}
   else assert.equal(r.coverage.excluded,1);
  });
 }
});
test("a canonical link nominates a target but never erases the source; equivalent redirects become duplicates", async () => {
 await withFetch({'/':html(page('<a href="/old">Old</a><a href="/variant">Variant</a>')),'/old':new Response(null,{status:301,headers:{location:'/'}}),'/variant':html(page('<link rel="canonical" href="/">'))},async()=>{
  const r=await crawlSite(base,'STANDARD',{renderJavaScript:false});
  assert.equal(r.coverage.checked,2);assert.equal(r.coverage.duplicates,1);assert.equal(r.pages.find(p=>p.url.endsWith('/variant')).canonical,base);checkCounts(r.coverage);
 });
});
test("JavaScript navigation uses the existing renderer inside an explicitly reserved request budget", async()=>{
 await withFetch({'/':html('<html><title>App</title><script src="/app.js"></script><div id="app"></div></html>'),'/service':html(page(''))},async()=>{
  globalThis.__RF_RENDER=async url=>({html:page('<a href="/service">Service</a>'),finalUrl:url});
  const r=await crawlSite(base,'STANDARD',{maxRequests:120});
  assert.equal(r.coverage.rendersTotal,1);assert.ok(r.coverage.requestsThisBatch>=90);assert.equal(r.coverage.checked,2);
 });
});
test("checkpoint URL and mode are bound to one crawl",async()=>{
 await withFetch({'/':html(page(''))},async()=>{
  const r=await crawlSite(base,'STANDARD');
  await assert.rejects(crawlSite('https://other.test/','STANDARD',{checkpoint:r.checkpoint}),/CHECKPOINT_MISMATCH/);
  await assert.rejects(crawlSite(base,'QUICK',{checkpoint:r.checkpoint}),/CHECKPOINT_MISMATCH/);
 });
});
test("robots matching and XML discovery are multilingual and domain independent",()=>{
 assert.equal(robotsAllows('User-agent: *\nDisallow: /\nUser-agent: RankFixBot\nDisallow: /priv*\nAllow: /private/public',new URL(base+'private/public')),true);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /*?secret=*',new URL(base+'p?secret=1')),false);
 assert.equal(crawlLinks('<a :href="item.url">x</a><link rel="alternate" hreflang="pl" href="/pl/"><link rel="next" href="?page=2">',new URL(base)).length,2);
 assert.deepEqual(sitemapEntries('<urlset><url><loc>'+base+'a?x=1&amp;y=2</loc></url></urlset>',new URL(base)).urls,[base+'a?x=1&y=2']);
});

test("site audit passes have URL evidence and scripted missing JSON-LD remains unconfirmed",async()=>{
 const {auditCrawlResult}=await import('../lib/site-audit.ts');
 await withFetch({'/':html(page('<script src="/app.js"></script><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>'))},async()=>{
  const r=await crawlSite(base,'STANDARD',{renderJavaScript:false});const audit=auditCrawlResult(r);
  assert.equal(audit.issues.find(i=>i.rule_id==='SITE_STRUCTURED_DATA_MISSING').status,'UNABLE_TO_CONFIRM');
  assert.ok(audit.issues.filter(i=>i.status==='PASS').every(i=>i.evidence.examples.some(e=>e.url===base&&e.found!==undefined)));
  assert.equal(audit.crawl.inventory.discovered,r.coverage.discovered);
 });
});
test("representative reporting never labels selected-candidate coverage as whole-site coverage",async()=>{
 const {sampleInventory}=await import('../lib/sample-inventory.ts');
 const c=sampleInventory({candidateUrls:[base,base+'a',base+'b'],selectedUrls:[base,base+'a'],checked:1,scored:1,excluded:0,notConfirmed:1,missing:0,duplicates:0,pageLimit:30});
 assert.equal(c.discovered,3);assert.equal(c.knownNotSelected,1);assert.equal(c.fullWebsiteConfirmed,false);assert.equal(c.discoveredIsLowerBound,true);
});
test("a stalled response honours the batch deadline and never becomes audited",async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async (_url,init)=>new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});
 const keepAlive=setTimeout(()=>{},200);
 try {const r=await crawlSite(base,'STANDARD',{maxDurationMs:15});assert.equal(r.coverage.checked,0);assert.equal(r.coverage.complete,false);assert.equal(r.coverage.pending,1);}
 finally {clearTimeout(keepAlive);globalThis.fetch=saved;}
});
test("the resumable operator writes the same inventory to the report and checkpoint",async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'rankfix-inventory-'));
 try {
  const {runInventoryBatch}=await import('../scripts/site-inventory.mjs');
  await withFetch({'/':html(page('<a href="/a">A</a>')),'/a':html(page(''))},async()=>{
   const options={url:base,mode:'STANDARD',statePath:join(dir,'state.json'),outPath:join(dir,'report.json'),batchPages:1};
   const first=await runInventoryBatch(options);assert.equal(first.canResume,true);
   const second=await runInventoryBatch(options);assert.equal(second.checked,2);
   const report=JSON.parse(await readFile(options.outPath,'utf8')),state=JSON.parse(await readFile(options.statePath,'utf8'));
   assert.equal(report.coverage.checked,state.pages.length);assert.deepEqual(report.audit.crawl.inventory,report.coverage);
  });
 } finally {await rm(dir,{recursive:true,force:true});}
});

test("informational Product markup never requires a retail Offer or SKU, while an actual incomplete Offer is still a finding",async()=>{
 const {auditCrawlResult}=await import('../lib/site-audit.ts');
 for(const sale of [false,true]) await withFetch({'/':html(page('<a href="/products/pump">Pump</a>')),'/products/pump':html(page(`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Industrial pump',...(sale?{offers:{'@type':'Offer',price:'49'}}:{})})}</script>`))},async()=>{
  const r=await crawlSite(base,'STANDARD',{renderJavaScript:false}),audit=auditCrawlResult(r);
  for(const key of ['SITE_PRODUCT_SCHEMA_CORE','SITE_PRODUCT_AVAILABILITY','SITE_PRODUCT_IDENTITY']) assert.equal(audit.issues.find(i=>i.rule_id===key).status=== 'NOT_APPLICABLE',!sale,key);
  if(sale) assert.equal(audit.issues.find(i=>i.rule_id==='SITE_PRODUCT_SCHEMA_CORE').status,'FAIL');
 });
});

test("robots wildcard matching is literal, anchored and safe for adversarial repetition",()=>{
 for(const [pattern,path,allowed] of [['/a*b$','/axxb',false],['/a*b$','/axxbc',true],['/a?x=1$','/a?x=1',false],['/a[1]','/a1',true],['/a[1]','/a[1]',false]])assert.equal(robotsAllows('User-agent: *\nDisallow: '+pattern,new URL(base+path.slice(1))),allowed,pattern+' '+path);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /'+('*a'.repeat(500))+'z',new URL(base+'a'.repeat(1500))),true);
});
