import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assessPageDescription, assessPageTitle, botManagerCookies, duplicateTitleSegment, entityTypesForDisplay,
  isBrandOnlyTitle, isClientShell, isNonContentUrl, isReducedBotResponse, outdatedTitleYear, renderFailureCode,
  renderFailureText, sectionKey, shortUrl, stripTrackingParams, titleLengthCredit, titleTemplatePattern,
} from "../lib/report-quality.ts";
import { analyzeScriptIntegrity, assessPassiveSecurity, findMixedContent } from "../lib/security-signals.ts";
import { selectRepresentativePages } from "../lib/representative-pages.ts";

// Cases below come from the October 2026 test reports (TransHeroes, IKEA, Zalando,
// Expert.nl, Acupunctuur Dijkstra, Coolblue).

test("a missing Chrome binary never reaches the customer report as a stack message", () => {
  const chrome = new Error("Could not find Chrome (ver. 154.0.8037.57). This can occur if either 1. you did not perform an installation before running the script");
  assert.equal(renderFailureCode(chrome), "BROWSER_UNAVAILABLE");
  assert.equal(renderFailureCode(new Error("Navigation timeout of 12000 ms exceeded")), "RENDER_TIMEOUT");
  assert.equal(renderFailureCode("RENDER_DEGRADED"), "RENDER_DEGRADED");
  // Old reports stored the truncated raw message; it is translated, never echoed.
  const text = renderFailureText("Could not find Chrome (ver. 154.0.8037.57). This can occur if either 1. you did");
  assert.equal(/chrome|ver\./i.test(text), false);
  assert.match(text, /niet beschikbaar/);
  assert.match(renderFailureText("BROWSER_UNAVAILABLE"), /niet beschikbaar/);
});

test("legacy IE conditional comments are not mixed content or SRI findings", () => {
  const html = `<html><head>
    <!--[if lt IE 9]><script src="http://html5shim.googlecode.com/svn/trunk/html5.js"></script>
    <script src="http://css3-mediaqueries-js.googlecode.com/svn/trunk/css3-mediaqueries.js"></script>
    <script src="http://cdnjs.cloudflare.com/ajax/libs/respond.js/1.4.2/respond.js"></script><![endif]-->
    <!--[if lt IE 7 ]><script src="//ajax.googleapis.com/ajax/libs/chrome-frame/1.0.3/CFInstall.min.js"></script><![endif]-->
  </head><body><img src="https://cdn.example.nl/a.jpg"></body></html>`;
  assert.deepEqual(findMixedContent(html), []);
  assert.deepEqual(analyzeScriptIntegrity(html, "https://www.acupunctuurdijkstra.nl/").missingVersioned, []);
  const result = assessPassiveSecurity({ isHttps: true, html, pageUrl: "https://www.acupunctuurdijkstra.nl/", setCookies: [] });
  assert.equal(result.mixedContent.status, "pass");
  assert.equal(result.scriptIntegrity.status, "pass");
  // A real HTTP subresource outside a comment is still reported.
  assert.deepEqual(findMixedContent(html + '<script src="http://cdn.example.nl/live.js"></script>'), ["http://cdn.example.nl/live.js"]);
  // Downlevel-revealed content (<!--[if !IE]><!--> … <!--<![endif]-->) stays visible.
  assert.deepEqual(findMixedContent('<!--[if !IE]><!--><img src="http://x.example/a.png"><!--<![endif]-->'), ["http://x.example/a.png"]);
});

test("titles: graduated length credit instead of a flat penalty", () => {
  assert.equal(titleLengthCredit(45), 1);
  assert.equal(titleLengthCredit(61), 0.9);
  assert.equal(titleLengthCredit(74), 0.75);
  assert.equal(titleLengthCredit(88), 0.6);
  assert.equal(titleLengthCredit(110), 0.45);
  assert.equal(titleLengthCredit(14), 0.6);
  assert.ok(assessPageTitle("Transport Zuid-Amerika | Internationaal vervoer | TransHeroes", "www.transheroes.com").credit
    > assessPageTitle("Garantie, reparatie en verzekeringen - Klantenservice | Coolblue - Alles voor een glimlach", "www.coolblue.nl").credit);
});

test("titles: brand-only and duplicated brand are named, not hidden in a length warning", () => {
  assert.equal(isBrandOnlyTitle("| Expert.nl", "www.expert.nl"), true);
  assert.equal(isBrandOnlyTitle("Zalando", "www.zalando.nl"), true);
  assert.equal(isBrandOnlyTitle("IKEA - Returns", "www.ikea.com"), false);
  assert.equal(isBrandOnlyTitle("Klantenservice Expert", "www.expert.nl"), false);
  assert.equal(isBrandOnlyTitle("Coolblue - Alles voor een glimlach", "www.coolblue.nl"), false);
  const brandOnly = assessPageTitle("| Expert.nl", "www.expert.nl");
  assert.equal(brandOnly.flag, "brand_only");
  assert.equal(brandOnly.credit, 0.25);

  assert.equal(duplicateTitleSegment("Transport naar Polen | Pallet, LTL & FTL | TransHeroes | TransHeroes"), "TransHeroes");
  assert.equal(duplicateTitleSegment("Privacy statement | Expert.nl | Expert.nl"), "Expert.nl");
  assert.equal(duplicateTitleSegment("Cookies | Coolblue - Alles voor een glimlach"), null);
  assert.equal(duplicateTitleSegment("Sale bij Zalando - Zalando"), null);
  // A duplicate is a warning even when the length is fine.
  const duplicate = assessPageTitle("Privacy statement | Expert.nl | Expert.nl", "www.expert.nl");
  assert.equal(duplicate.status, "WARNING");
  assert.equal(duplicate.flag, "duplicate_segment");
  assert.match(duplicate.details, /staat dubbel/);
});

test("titles: an old year in a title is flagged as outdated", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  assert.equal(outdatedTitleYear("Tarieven en vergoedingen 2017 Acupunctuur Praktijk Gerda Dijkstra.", now), 2017);
  assert.equal(outdatedTitleYear("Black Friday 2025 deals", now), null);
  assert.equal(outdatedTitleYear("Sinds 2005 actief, prijzen 2026", now), null);
  assert.equal(assessPageTitle("Tarieven en vergoedingen 2017 Acupunctuur Praktijk Gerda Dijkstra.", "www.acupunctuurdijkstra.nl", now).flag, "outdated_year");
});

test("descriptions: 160–200 is a light warning, above 200 exceptionally long", () => {
  assert.equal(assessPageDescription("x".repeat(128), true).status, "PASS");
  const long = assessPageDescription("x".repeat(181), true);
  assert.equal(long.status, "WARNING");
  assert.equal(long.credit, 0.9);
  assert.match(long.details, /lange kant/);
  assert.match(assessPageDescription("x".repeat(274), true).details, /uitzonderlijk lang/);
  assert.match(assessPageDescription("x".repeat(51), true).details, /kort/);
  assert.match(assessPageDescription("x".repeat(15), true).details, /uitzonderlijk kort/);
  assert.match(assessPageDescription("", true).details, /content is leeg/);
  assert.match(assessPageDescription("", false).details, /Geen meta description-tag/);
});

test("sampling: account, withdrawal, login and facet URLs never enter the sample", () => {
  assert.equal(isNonContentUrl("https://www.ikea.com/nl/nl/purchases/withdrawal/"), true);
  assert.equal(isNonContentUrl("https://www.zalando.nl/returns/articles?withdrawal=true"), true);
  assert.equal(isNonContentUrl("https://www.zalando.nl/myprofile/"), true);
  assert.equal(isNonContentUrl("https://www.expert.nl/televisies/_product-awards-Alle-Awards"), true);
  assert.equal(isNonContentUrl("https://shop.example/schoenen?sort=price"), true);
  assert.equal(isNonContentUrl("https://www.ikea.com/nl/nl/returns/"), false);
  assert.equal(isNonContentUrl("https://www.coolblue.nl/klantenservice/retourneren-en-ruilen"), false);
  assert.equal(isNonContentUrl("https://blog.example/?p=123"), false);
});

test("sampling: campaign parameters do not create a second copy of a page", () => {
  assert.equal(stripTrackingParams("https://www.zalando.nl/outlet/?camp=nl_cw41_mss_countdown_2026"), "https://www.zalando.nl/outlet/");
  assert.equal(stripTrackingParams("https://shop.example/p?utm_source=x&color=red"), "https://shop.example/p?color=red");
});

test("sampling: one site section cannot fill the sample", () => {
  assert.equal(sectionKey("https://www.coolblue.nl/klantenservice/betalen"), "klantenservice");
  assert.equal(sectionKey("https://www.ikea.com/nl/nl/cat/koken-eten-kt001/"), "cat");
  assert.equal(sectionKey("https://www.expert.nl/keuzehulp"), "/");
  const support = Array.from({ length: 10 }, (_, i) => ({ url: `https://www.coolblue.nl/klantenservice/page-${i}`, type: "support" }));
  const products = Array.from({ length: 8 }, (_, i) => ({ url: `https://www.coolblue.nl/product/${i}/x.html`, type: "product" }));
  const categories = Array.from({ length: 3 }, (_, i) => ({ url: `https://www.coolblue.nl/categorie-${i}`, type: "category" }));
  const picked = selectRepresentativePages([], [...support, ...products, ...categories], 30, (u) => u, (u) => u, undefined, 12, { key: sectionKey, limit: 5, exemptTypes: ["product"] });
  assert.equal(picked.filter((p) => p.type === "support").length, 5);
  assert.equal(picked.filter((p) => p.type === "product").length, 8);
  assert.equal(picked.filter((p) => p.type === "category").length, 3);
});

test("client application shells cannot prove a missing title, description or H1", () => {
  assert.equal(isClientShell({ visibleWords: 30, scriptCount: 12, jsFramework: true, h1Count: 0, rendered: false }), true);
  assert.equal(isClientShell({ visibleWords: 120, scriptCount: 3, jsFramework: true, h1Count: 0, rendered: false }), true);
  // Server-rendered pages (Expert.nl, Laravel) keep their real findings.
  assert.equal(isClientShell({ visibleWords: 900, scriptCount: 8, jsFramework: false, h1Count: 0, rendered: false }), false);
  assert.equal(isClientShell({ visibleWords: 30, scriptCount: 12, jsFramework: true, h1Count: 0, rendered: true }), false);
});

test("a reduced bot-manager response is unconfirmed evidence, a normal one is not", () => {
  const zalando = botManagerCookies(["frsx", "zcid", "bm_s", "bm_so", "bm_sz", "mpulseinject"]);
  assert.deepEqual(zalando, ["bm_s", "bm_so", "bm_sz"]);
  assert.equal(isReducedBotResponse({ botCookies: zalando, jsonLdBlocks: 0, ogTags: 0, h1Count: 0 }), true);
  // IKEA serves __cf_bm together with full metadata: nothing is suppressed.
  assert.equal(isReducedBotResponse({ botCookies: botManagerCookies(["ikexp_id", "__cf_bm"]), jsonLdBlocks: 1, ogTags: 6, h1Count: 1 }), false);
  assert.equal(isReducedBotResponse({ botCookies: [], jsonLdBlocks: 0, ogTags: 0, h1Count: 0 }), false);
});

test("sitewide: a shared title suffix is reported as one template fix", () => {
  const titles = [
    "Bezorg- en ophaalopties - Klantenservice | Coolblue - Alles voor een glimlach",
    "Ruilen en retourneren - Klantenservice | Coolblue - Alles voor een glimlach",
    "Betalen - Klantenservice | Coolblue - Alles voor een glimlach",
    "Klantenservice | Coolblue - Alles voor een glimlach",
    "Cookies | Coolblue - Alles voor een glimlach",
    "Coolblue - Alles voor een glimlach",
    "Apple AirPods 4 | Coolblue | Oordopjes",
  ];
  const pattern = titleTemplatePattern(titles, "www.coolblue.nl");
  assert.equal(pattern?.suffix.trim(), "| Coolblue - Alles voor een glimlach");
  assert.equal(pattern?.overLimit, 3);
  const zalando = titleTemplatePattern([
    "Adidas Originals online kopen | Gratis verzending voor de meeste bestellingen* | Zalando",
    "Antony Morato online kopen | Gratis verzending voor de meeste bestellingen* | Zalando",
    "Björn Borg online kopen | Gratis verzending voor de meeste bestellingen* | Zalando",
    "Topshop online shop | Snelle verzending | Zalando",
  ], "www.zalando.nl");
  assert.equal(zalando?.suffix.trim(), "| Gratis verzending voor de meeste bestellingen* | Zalando");
  assert.equal(titleTemplatePattern(["Over ons | Bakkerij", "Contact | Bakkerij", "Home | Bakkerij"], "bakkerij.nl"), null);
});

test("report text helpers: short URLs and real entity types", () => {
  const long = "https://accounts.zalando.com/authorize?client_id=fashion-store-web&nonce=e48eb930&state=eyJvcmln";
  assert.equal(shortUrl(long), "https://accounts.zalando.com/authorize?…");
  assert.deepEqual(entityTypesForDisplay(["WebSite", "SearchAction", "Organization", "ImageObject", "AggregateRating"]), ["WebSite", "Organization"]);
  assert.deepEqual(entityTypesForDisplay(["WebPage", "ReadAction", "Service", "OpeningHoursSpecification"]), ["Service"]);
});

test("scan route wires the report-quality fixes", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  // Security score is recomputed after the representative form check changes.
  assert.match(route, /securityEngine\.score = finalSecurityMax/);
  // Accessibility score is computed after its checks exist.
  assert.match(route, /accessibilityEngine\.coverage = weightedCoverage\(accessibilityChecks\)/);
  // Render failures are stored as codes.
  assert.equal(route.includes("renderError.message.slice(0, 120)"), false);
  assert.match(route, /renderFallbackReason = renderFailureCode\(renderError\)/);
  // Representative product price feeds the pricing diagnostics.
  assert.match(route, /structuredPriceSource = representativeProductPage\.url/);
  // Real sitewide counts instead of a silent cap of four.
  assert.match(route, /affectedCount: warnings\.length/);
  assert.equal(route.includes("affectedUrls: warnings.map((item)=>item.url).slice(0,4)"), false);
  // Bot-manager responses and login redirects.
  assert.match(route, /isReducedBotResponse\(/);
  assert.match(route, /return destinationAuth \|\|/);
  // No English evidence strings in the customer report.
  assert.equal(route.includes("independent sector signals"), false);
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  assert.match(report, /renderFailureText\(rendering\.fallbackReason\)/);
  assert.equal(report.includes("String(rendering.fallbackReason).slice(0,80)"), false);
  assert.match(report, /const jsLimited=Boolean\(r\?\.rendering\?\.warning\)/);
  assert.match(report, /diagnosticRows\(data\)/);
  const puppeteerConfig = await readFile(new URL("../.puppeteerrc.cjs", import.meta.url), "utf8");
  assert.match(puppeteerConfig, /cacheDirectory: join\(__dirname, "\.cache", "puppeteer"\)/);
});
