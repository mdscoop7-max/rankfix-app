import test from "node:test";
import assert from "node:assert/strict";
import { detectEuPrimaryIdentity, stripAudience } from "../lib/eu-identity.ts";
import { detectPrimaryBusinessIdentity } from "../lib/primary-business-identity.ts";
import { isAudiencePagePath, sectorPageEvidence } from "../lib/sector-page-evidence.ts";
import { diagnoseBlockedResponse, diagnoseChallenge, diagnoseFetchFailure, detectProtectionProvider, redirectChainLoops } from "../lib/access-diagnostics.ts";
import { fetchFailureCode, classifyScanOutcome } from "../lib/scan-attempts.ts";
import { safePublicFetch } from "../lib/safe-fetch.ts";
import { evidenceLevel } from "../lib/audit-score.ts";
import { enforceReportConsistency } from "../lib/report-consistency.ts";
import { measureWebsiteSpeed, parsePageSpeed } from "../lib/pagespeed.ts";
import { formatSpeedLab } from "../lib/speed-display.ts";
import { failureCategory } from "../scripts/testlab/labels.mjs";

// QA #186, 96-site report (22 Oct 2026). Synthetic identities reproduce the
// generic failure CLASSES behind the reported misclassifications; neutral hosts,
// no brand or domain rules. Labels in the TestLab plan stay "proposed".
const id = (v) => detectEuPrimaryIdentity({ homepage: true, hostname: "brand.test", ...v });

test("academic hospital stays healthcare, even when it also teaches (was: education)", () => {
  for (const v of [
    { title: "Home | Stad MC", description: "Stad MC: patiëntenzorg, onderzoek en onderwijs." },
    { title: "Stadumc", description: "Universitair medisch centrum met topklinische zorg." },
    { title: "Universiteit Noord", description: "Onderzoek, onderwijs en zorg voor patiënten in ons ziekenhuis." },
  ]) assert.equal(id(v)?.sector, "health_wellness", JSON.stringify(v));
  const uni = id({ title: "Universiteit Zuid", description: "Onderwijs en onderzoek. Faculteit Geneeskunde, medicine, clinical research." });
  assert.equal(uni?.sector, "education", "a medical faculty or clinical research is not a hospital");
});

test("'site officiel' is brand wording, not government; car makers are automotive (was: government)", () => {
  const maker = id({ title: "Marque France | Site officiel", description: "Découvrez sur le site officiel la gamme de voitures neuves, électriques et hybrides." });
  assert.equal(maker?.sector, "automotive");
  assert.equal(id({ title: "Marque - Site officiel", description: "Site officiel de Marque France." }), null, "brand-only wording abstains");
  assert.equal(id({ title: "Démarches en ligne | Site officiel", description: "Services et démarches", hostname: "service-public.gouv.fr" })?.sector, "government", "government host keeps government");
  assert.equal(id({ title: "Autoblad: autonieuws en autotests", description: "Alles over nieuwe auto's, elektrische modellen en occasions." }), null, "car news is not a car maker");
  assert.equal(id({ title: "Autoonderdelen online kopen | PartsShop", description: "Onderdelen voor alle auto's. Webshop." }), null, "parts shop is retail");
});

test("payment provider in German is payments; served industries are audience (was: transport_travel)", () => {
  const pay = detectPrimaryBusinessIdentity({ title: "Anbieter – Ihr Payment-Partner", description: "Zahlungsabwicklung für Online- und stationären Handel: Kartenzahlung und Bezahllösungen." });
  assert.equal(pay.sector, "financial_services");
  assert.equal(pay.financialKind, "payments");
  assert.doesNotMatch(stripAudience("Bezahllösungen für Transport und Mobilität"), /Transport|Mobilität/);
  assert.match(stripAudience("Wegtransport en logistiek"), /Wegtransport en logistiek/, "own activity is kept");
  assert.ok(isAudiencePagePath("https://pay.test/de/branchen/transport"));
  assert.ok(isAudiencePagePath("https://pay.test/en/industries/mobility/"));
  assert.ok(!isAudiencePagePath("https://carrier.test/diensten/wegtransport"));
  const pages = ["/de/branchen/transport", "/de/branchen/logistik"].map((path) => ({ url: "https://pay.test" + path, type: "service", status: "audited", title: "Payment für Transport & Logistik", description: "Logistik, Spedition und Frachttransport: Zahlungen", identityHeadings: ["Transport und Logistik"] }));
  assert.equal(sectorPageEvidence("https://pay.test/", pages).decision, null, "industry pages never vote for the provider's own sector");
});

test("telecom bundle operator is telecom, electronics shop is not (was: ecommerce)", () => {
  assert.equal(id({ title: "Operator | Internet, TV, mobiel en vaste lijn", description: "Ontdek onze packs met internet, tv en mobiel." })?.sector, "telecom_technology");
  assert.equal(id({ title: "Opérateur | Internet, TV et mobile", description: "Nos forfaits internet et mobile." })?.sector, "telecom_technology");
  assert.equal(id({ title: "ElektroMarkt | Laptops, TV's en smartphones", description: "Bestel online: tv, mobiele telefoons en meer." }), null);
  assert.notEqual(id({ title: "Omroep | Radio, TV en Internet", description: "Nieuws op radio, tv en internet" })?.sector, "telecom_technology");
});

test("French news wording and news-named publishers are news (was: ecommerce)", () => {
  assert.equal(id({ title: "Paysinfo", description: "Toute l'actualité en France et dans le monde.", ogSiteName: "Paysinfo" })?.sector, "news_media");
  assert.equal(id({ title: "Chaîne - L'info en continu", description: "Les dernières infos à la une." })?.sector, "news_media");
  assert.equal(id({ title: "Paysinfo", description: "Plus d'infos sur nos produits" }), null, "a brand ending in -info needs news wording");
});

test("product-making technology groups are industry; software companies are not", () => {
  assert.equal(id({ title: "Groupe", description: "A leading health technology company improving lives with devices and products." })?.sector, "manufacturing_industrial");
  assert.equal(id({ title: "Acme", description: "We are a technology company building software for teams." }), null);
});

test("more identities recovered from one own source with corroborating concepts", () => {
  assert.equal(id({ title: "Groep", description: "Verzekeringen en pensioenen voor Nederland." })?.sector, "financial_services");
  assert.equal(id({ title: "Werk", description: "Strom aus Wasserkraft – führendes Stromunternehmen." })?.sector, "energy_utilities");
  const medium = id({ title: "Groep", description: "Verzekeringen en pensioenen voor Nederland." });
  assert.ok(medium.confidenceScore < 80, "one-source identity stays below confirmed confidence");
});

test("access diagnostics: login, bot protection, generic refusal and challenges are named, never bypassed", () => {
  const h = (o) => new Headers(o);
  assert.equal(diagnoseBlockedResponse(401, h({ "www-authenticate": "Basic" })).kind, "authentication_required");
  const cf = diagnoseBlockedResponse(403, h({ "cf-ray": "x", server: "cloudflare" }));
  assert.equal(cf.kind, "bot_protection");
  assert.equal(cf.provider, "Cloudflare");
  assert.match(cf.advice, /omzeilt/);
  assert.equal(diagnoseBlockedResponse(403, h({}), "<h1>Forbidden</h1>").kind, "access_denied");
  assert.equal(detectProtectionProvider(h({}), "<p>Incapsula incident ID</p>"), "Imperva/Incapsula");
  assert.equal(diagnoseChallenge(h({ "x-datadome": "1" }), "").provider, "DataDome");
  const t = diagnoseFetchFailure("FETCH_TIMEOUT", 2, 31000);
  assert.equal(t.retryable, true);
  assert.match(t.advice, /2 pogingen \(31 s\)/);
  assert.equal(classifyScanOutcome(422, "HTTP_AUTH_REQUIRED"), "site_blocked");
  assert.equal(classifyScanOutcome(502, "REDIRECT_LOOP"), "network");
});

test("TestLab: a target website's 429 or login is a site block and never stops the run as quota", () => {
  assert.equal(failureCategory(429, "SITE_RATE_LIMITED"), "site_blocked");
  assert.equal(failureCategory(422, "HTTP_AUTH_REQUIRED"), "site_blocked");
  assert.equal(failureCategory(502, "REDIRECT_LOOP"), "network");
  assert.equal(failureCategory(429, "RATE_LIMIT"), "quota");
});

test("redirect loop with an unchanged cookie jar stops at once; a one-time cookie redirect still works", async () => {
  assert.ok(redirectChainLoops([{ from: "https://a.test/", to: "https://a.test/nl" }, { from: "https://a.test/nl", to: "https://a.test/" }]));
  assert.ok(!redirectChainLoops([{ from: "https://a.test/", to: "https://a.test/nl" }]));
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url) => { calls++; return new Response(null, { status: 302, headers: { location: String(url).endsWith("/a") ? "/b" : "/a" } }); };
    await assert.rejects(safePublicFetch("https://93.184.216.34/a", { maxRedirects: 8 }), (error) => fetchFailureCode(error) === "REDIRECT_LOOP");
    assert.ok(calls <= 3, `loop detected after ${calls} requests`);
    calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      const cookie = new Headers(init?.headers).get("cookie") || "";
      if (cookie.includes("consent=1")) return new Response("<html><title>ok</title></html>", { status: 200 });
      return new Response(null, { status: 302, headers: { location: "/a", "set-cookie": "consent=1; Path=/" } });
    };
    const done = await safePublicFetch("https://93.184.216.34/a", { maxRedirects: 4 });
    assert.equal(done.response.status, 200, "a consent cookie redirect back to the same URL is not a loop");
  } finally {
    globalThis.fetch = original;
  }
});

// Tightened after the TestLab run of 23-10 (evening): fewer than a quarter of a
// sample of 8+ pages is "insufficient" (indication), a thin sample above that "provisional".
test("a thin representative sample is never definitive; 1 of 16 pages is only an indication", () => {
  const base = { coveragePercent: 95, javascriptRequiredButNotRendered: false, unconfirmed: 0 };
  assert.equal(evidenceLevel(base).level, "complete");
  const thin = evidenceLevel({ ...base, pageSample: { selected: 16, fetched: 1 } });
  assert.equal(thin.level, "insufficient");
  assert.equal(evidenceLevel({ ...base, pageSample: { selected: 16, fetched: 6 } }).level, "provisional");
  assert.ok(thin.reasons.some((r) => /1 van 16/.test(r)));
  assert.equal(evidenceLevel({ ...base, pageSample: { selected: 16, fetched: 12 } }).level, "complete");
});

test("self-check records duplicate and contradicting findings", () => {
  const check = (status) => ({ key: "title", category: "seo", status, issue_status: status, points: 0, maxPoints: 10, message: "x" });
  const out = enforceReportConsistency({
    sector: { sector: "unknown", key: "unknown", label: "Sector niet bevestigd", confidence: "low", confidenceScore: 0, evidence: [], applicableModules: [] },
    checks: [check("PASS"), check("WARNING")], scannedUrl: "https://site.test/",
    scores: { seo: 90, geo: 90, overall: 90, mode: "both" }, coveragePercent: 95,
  });
  assert.ok(out.selfCheck.flags.some((f) => f.code === "contradicting_finding"));
  assert.equal(out.selfCheck.consistent, false);
});

test("PageSpeed: Speed Index parsed from Google data; mobile and desktop stay independent; no invented scores", async () => {
  const lighthouse = (score) => ({ lighthouseResult: { categories: { performance: { score } }, audits: { "first-contentful-paint": { numericValue: 1200 }, "largest-contentful-paint": { numericValue: 2500 }, "cumulative-layout-shift": { numericValue: 0.0123456 }, "total-blocking-time": { numericValue: 150.4 }, "speed-index": { numericValue: 3100 } }, fetchTime: "2026-10-23T08:00:00.000Z" } });
  const parsed = parsePageSpeed(lighthouse(0.71));
  assert.equal(parsed.lab.speedIndexMs, 3100);
  assert.equal(formatSpeedLab(parsed.lab), "FCP 1.20 s · LCP 2.50 s · CLS 0.012 · TBT 150 ms · SI 3.10 s");
  assert.equal(formatSpeedLab({ fcpMs: null, lcpMs: null, cls: null, tbtMs: null }), "FCP — · LCP — · CLS — · TBT — · SI —", "old saved reports without Speed Index");
  const fetcher = async (url) => String(url).includes("strategy=mobile")
    ? new Response(JSON.stringify(lighthouse(0.42)), { status: 200 })
    : new Response(JSON.stringify({ error: { errors: [{ reason: "backendError" }] } }), { status: 500 });
  const speed = await measureWebsiteSpeed("https://site.test/", { apiKey: "test", fetcher, wait: async () => {}, timeoutMs: 10000 });
  assert.equal(speed.mobile.score, 42);
  assert.equal(speed.desktop.status, "unavailable");
  assert.equal(speed.desktop.score, null);
  assert.equal(speed.status, "partial");
  const runtimeError = parsePageSpeed({ lighthouseResult: { runtimeError: { code: "NO_FCP" }, categories: { performance: { score: 0.9 } } } });
  assert.equal(runtimeError.score, null, "a Lighthouse runtime error never yields a score");
});
