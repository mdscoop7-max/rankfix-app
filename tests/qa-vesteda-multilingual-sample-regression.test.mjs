import test from "node:test";
import assert from "node:assert/strict";
import { sitemapHreflangForUrl } from "../lib/sitemap-hreflang-evidence.ts";
import { inspectHeadEvidence } from "../lib/html-document-evidence.ts";

test("XML sitemap proves hreflang only for exact matching page URL",()=>{
  const xml = [
    '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    '<url><loc>https://example.org/en</loc><xhtml:link rel="alternate" hreflang="en" href="https://example.org/en"/></url>',
    '<url><loc>https://example.org/nl</loc>',
    '<xhtml:link href="https://example.org/nl" HREFLANG=nl REL=alternate />',
    "<xhtml:link hreflang='en' rel='alternate' href='https://example.org/en' />",
    "<xhtml:link href='javascript:alert(1)' rel='alternate' hreflang=de />",
    '</url></urlset>'
  ].join("");
  const nl=sitemapHreflangForUrl(xml,"https://www.example.org/nl/");
  assert.equal(nl.currentUrlFound,true);
  assert.deepEqual(nl.confirmedLanguages,["nl","en"]);
  assert.equal(nl.alternates.length,2);
  const missing=sitemapHreflangForUrl(xml,"https://example.org/fr");
  assert.equal(missing.currentUrlFound,false);
  assert.deepEqual(missing.confirmedLanguages,[]);
});

test("sitemap index cannot establish page-specific hreflang",()=>{
  const xml="<sitemapindex><sitemap><loc>https://example.org/map.xml</loc></sitemap></sitemapindex>";
  const r=sitemapHreflangForUrl(xml,"https://example.org/nl");
  assert.equal(r.currentUrlFound,false);
  assert.equal(r.alternates.length,0);
});

test("page link and meta parser detects multi-language and canonical in arbitrary attribute order",()=>{
  const html="<html LANG='nl'><head><link HREF='/nl' REL=CANONICAL><meta CONTENT='Woningen voor verhuur' NAME='Description'>"+
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"+
    '<link href="/en" hreflang=en rel=alternate></head><body></body></html>';
  const head=inspectHeadEvidence(html);
  assert.equal(head.description,"Woningen voor verhuur");
  assert.equal(head.canonical,"/nl");
  assert.equal(head.lang,"nl");
  assert.match(head.viewport,/device-width/);
});

test("route exposes individual unscored page reasons, one denominator and weak-sector abstention",async()=>{
  const {readFile}=await import("node:fs/promises");
  const route=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.match(route,/unscoredPages: unscoredSamplePages/);
  assert.match(route,/selected: reportedMultiPageAudits\.length/);
  assert.match(route,/const sampleAccounting = sampleSummary\(reportedMultiPageAudits\.length/);
  assert.match(route,/sectorProfile\.confidenceScore < 75/);
  assert.match(route,/sitemapHreflangForUrl/);
  assert.match(route,/localeCompare\(normalizeScanUrl\(b\.url\)/);
});

test("online QA summary labels incomplete sample and offers user-confirmed sector input",async()=>{
  const {readFile}=await import("node:fs/promises");
  const dashboard=await readFile(new URL("../app/dashboard/database-free-qa.tsx",import.meta.url),"utf8");
  assert.match(dashboard,/result\.multiPage\?\.unscoredPages/);
  assert.match(dashboard,/Voorlopige site-steekproef/);
  assert.match(dashboard,/sectorCorrection/);
});
