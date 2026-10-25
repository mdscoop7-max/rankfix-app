// QA 144-site test (24 Oct 2026): unit tests for the P0/P1 repairs.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { summarizeSiteAccess } from "../lib/site-access.ts";
import { buildSitewideIssues } from "../lib/sitewide-issues.ts";
import { buildScoreScope } from "../lib/score-scope.ts";
import { selectPageProduct } from "../lib/product-provenance.ts";
import { careersSiteIdentity } from "../lib/careers-identity.ts";
import { compoundBankBrand } from "../lib/eu-identity.ts";
import { brokenLinkRecords, linkOutcome } from "../lib/link-status.ts";
import { AXE_RUN_SCRIPT } from "../lib/axe-script.ts";
import { detectDeclaredIndustry } from "../lib/site-sector-corroboration.mjs";

test("site access: blocked homepage, subpage start → partial; never claims the whole site is accessible", () => {
  const s = summarizeSiteAccess({ startUrl: "https://shop.example/schoenen/fitness", startIsHomepage: false, homepageUrl: "https://shop.example/", pages: [
    { url: "https://shop.example/schoenen/fitness", status: "audited", httpStatus: 200 },
    { url: "https://shop.example/", type: "homepage", status: "unable_to_confirm", httpStatus: 403 },
    { url: "https://shop.example/a", status: "audited", httpStatus: 200 },
    { url: "https://shop.example/b", status: "unable_to_confirm", httpStatus: 403 },
    { url: "https://shop.example/c", status: "unable_to_confirm", httpStatus: null },
  ] });
  assert.equal(s.homepage.access, "blocked");
  assert.equal(s.homepage.httpStatus, 403);
  assert.deepEqual(s.pages, { selected: 5, assessed: 2, refused: 2, missing: 0, notRetrieved: 1 });
  assert.equal(s.scanCoverage, "partial");
  assert.match(s.note, /niet dat de hele website toegankelijk is/);
  const only = summarizeSiteAccess({ startUrl: "https://x.example/p", startIsHomepage: false, homepageUrl: "https://x.example/", pages: [{ url: "https://x.example/p", status: "audited" }, { url: "https://x.example/", status: "unable_to_confirm", httpStatus: 403 }] });
  assert.equal(only.scanCoverage, "start_only");
  const full = summarizeSiteAccess({ startUrl: "https://x.example/", startIsHomepage: true, homepageUrl: "https://x.example/", pages: [{ url: "https://x.example/", status: "audited" }, { url: "https://x.example/a", status: "audited" }] });
  assert.equal(full.scanCoverage, "complete");
  assert.equal(full.homepage.access, "is_start_page");
});

test("sitewide issues: every proven sample problem listed with URL/check/severity/evidence/fix; raw-HTML absence of everything needs confirmation", () => {
  const W = (key, details) => ({ key, status: "WARNING", details });
  const P = (key) => ({ key, status: "PASS", details: "ok" });
  const issues = buildSitewideIssues([
    { url: "https://w.example/", status: "audited", title: "Home", description: "d", h1Count: 1, evidenceChecks: [W("description", "kort")] },
    { url: "https://w.example/job-alert", status: "audited", title: "Job alert", description: "", h1Count: 1, evidenceSource: "raw_html", evidenceChecks: [P("title"), W("description", "Meta description is leeg."), P("h1"), P("canonical")] },
    { url: "https://w.example/faq", status: "audited", title: "FAQ", description: "x", h1Count: 0, evidenceChecks: [P("title"), P("description"), W("h1", "0 H1-heading(s) gevonden."), P("canonical")] },
    { url: "https://w.example/overview/categories", status: "audited", title: null, description: null, h1Count: 0, evidenceSource: "raw_html", evidenceChecks: [W("title", "Title ontbreekt."), W("description", "Meta description ontbreekt."), W("h1", "0 H1-heading(s) gevonden."), W("canonical", "canonical")] },
    { url: "https://w.example/blocked", status: "unable_to_confirm", evidenceChecks: [W("description", "x")] },
  ], "https://w.example/");
  assert.ok(!issues.some((i) => i.url === "https://w.example/"), "entered page stays in the page checks");
  assert.ok(!issues.some((i) => i.url.endsWith("/blocked")), "only assessed pages");
  const job = issues.find((i) => i.url.endsWith("/job-alert"));
  assert.equal(job.certainty, "confirmed");
  assert.equal(job.severity, "warning");
  assert.match(job.recommendation, /120–160/);
  assert.equal(issues.find((i) => i.url.endsWith("/faq")).check, "h1");
  const cat = issues.filter((i) => i.url.endsWith("/overview/categories"));
  assert.equal(cat.length, 4);
  assert.ok(cat.every((i) => i.certainty === "needs_render_confirmation"));
  assert.equal(issues[0].certainty, "confirmed", "confirmed points are listed first");
});

test("score scope: 99 with 4/30 pages is partial with a caution; range is never a statistical interval", () => {
  const s = buildScoreScope({ overallScore: 98, startUrl: "https://d.example/x", startIsHomepage: false, evidenceCoveragePercent: 75, unconfirmedChecks: 6, evidenceLevel: "provisional", range: { low: 73, high: 99 }, pages: { selected: 30, assessed: 4 }, siteCoverage: "partial", homepageAccess: "blocked", sampleScore: 90, sitewideIssues: { confirmed: 2, toConfirm: 1 }, sectorStatus: "confirmed" });
  assert.equal(s.scoreAppliesTo, "start_page");
  assert.equal(s.scanStatus, "partial");
  assert.deepEqual(s.pageCoverage, { assessed: 4, selected: 30, percent: 13 });
  assert.match(s.caution, /niet dat de hele website vrijwel perfect is/);
  assert.equal(s.range.statisticalInterval, false);
  assert.ok(s.notes.some((n) => /geen statistische onzekerheidsmarge/.test(n)));
  const unknown = buildScoreScope({ overallScore: 97, startUrl: "https://u.example/", startIsHomepage: true, evidenceCoveragePercent: 100, unconfirmedChecks: 0, evidenceLevel: "complete", range: null, pages: { selected: 1, assessed: 1 }, siteCoverage: "complete", sampleScore: null, sitewideIssues: { confirmed: 0, toConfirm: 0 }, sectorStatus: "unconfirmed" });
  assert.equal(unknown.sectorConfirmed, false);
  assert.ok(unknown.notes.some((n) => /bevestigt geen sector/.test(n)));
  assert.match(unknown.caution, /sector niet bevestigd/);
  const clean = buildScoreScope({ overallScore: 95, startUrl: "https://c.example/", startIsHomepage: true, evidenceCoveragePercent: 100, unconfirmedChecks: 0, evidenceLevel: "complete", range: null, pages: { selected: 10, assessed: 10 }, siteCoverage: "complete", sampleScore: 96, sitewideIssues: { confirmed: 0, toConfirm: 0 }, sectorStatus: "confirmed" });
  assert.equal(clean.caution, null);
  assert.equal(clean.scanStatus, "definitive");
});

test("product provenance: article number in URL, URL match, name match, single; ambiguous never merged", () => {
  const page = { url: "https://m.example/nl/product/_merk-7000-serie-wasmachine-1807532.html", title: "MERK 7000 serie wasmachine", h1s: ["MERK 7000 serie wasmachine"] };
  assert.deepEqual([selectPageProduct([{ name: "MERK 8000", sku: "1807530" }, { name: "MERK 7000", sku: "1807532" }], page).index, selectPageProduct([{ name: "MERK 8000", sku: "1807530" }, { name: "MERK 7000", sku: "1807532" }], page).matchedBy], [1, "url_identifier"]);
  assert.equal(selectPageProduct([{ name: "A", url: "https://m.example/other" }, { name: "B", url: page.url }], page).matchedBy, "url");
  assert.equal(selectPageProduct([{ name: "Accessoire set" }, { name: "MERK 7000 serie wasmachine" }], { url: "https://m.example/p/x", h1s: ["MERK 7000 serie wasmachine"] }).index, 1);
  assert.equal(selectPageProduct([{ name: "Only" }], page).matchedBy, "single");
  const amb = selectPageProduct([{ name: "Wasmachine" }, { name: "Droger" }], { url: "https://m.example/bundel", h1s: ["Voordeelbundel"] });
  assert.equal(amb.index, null);
  assert.equal(amb.conflict, true);
  // A short number inside another number is not an article-number match.
  assert.equal(selectPageProduct([{ name: "X", sku: "807" }, { name: "Y", sku: "999" }], { url: "https://m.example/p/1807532" }).matchedBy, null);
});

test("careers identity: careers site needs a careers name/host AND vacancy wording; a company's careers section is not a careers site", () => {
  const sub = careersSiteIdentity({ title: "Teamleider logistiek | Werken bij Sportwinkel", description: "Solliciteer direct.", hostname: "www.werkenbijsportwinkel.nl", homepage: false });
  assert.equal(sub?.sector, "recruitment");
  assert.equal(sub?.key, "employer_careers");
  assert.equal(careersSiteIdentity({ title: "Werken bij ons | Bedrijf", description: "Bekijk onze vacatures.", hostname: "bedrijf.nl", homepage: false }), null);
  assert.equal(careersSiteIdentity({ title: "Werken bij Bedrijf | Vacatures", description: "Solliciteer bij Bedrijf.", hostname: "werkenbijbedrijf.nl", ogSiteName: "Werken bij Bedrijf", homepage: true })?.confidence, "high");
  assert.equal(careersSiteIdentity({ title: "Logistiek en transport | Transportbedrijf", description: "Wij vervoeren goederen.", hostname: "careers-x.nl" }), null, "no vacancy wording → no careers identity");
  assert.equal(careersSiteIdentity({ title: "Jobs", description: "Apply now", hostname: "jobs.example.com", homepage: true })?.sector, "recruitment");
});

test("compound bank brand needs brand=title segment=hostname AND two banking products; food bank never", () => {
  assert.equal(compoundBankBrand("Particulieren | Spaarbank", "", "www.spaarbank.nl", "Betalen, sparen, lenen en hypotheek")?.key, "financial_banking");
  assert.equal(compoundBankBrand("Particulieren | Spaarbank", "", "www.spaarbank.nl", "Welkom"), null);
  assert.equal(compoundBankBrand("Voedselbank Stad", "", "voedselbank.nl", "Doneer of word vrijwilliger"), null);
  assert.equal(compoundBankBrand("Home | Databank", "", "databank.nl", "Zoek in onze data"), null);
});

test("declared industry: supermarket chains in IT/ES/SE; supermarket software is an audience, not a supermarket", () => {
  assert.equal(detectDeclaredIndustry({ title: "Supermercati, promozioni e servizi | Marca", description: "Scopri i supermercati Marca, le promozioni e i servizi." })?.key, "supermarket");
  assert.equal(detectDeclaredIndustry({ title: "Supermercados Marca - Compra online", description: "Haz tu compra online en Supermercados Marca y encuentra tu supermercado más cercano." })?.key, "supermarket");
  assert.equal(detectDeclaredIndustry({ title: "Marka – Recept, erbjudanden och matbutiker", description: "Handla mat online eller i någon av våra matbutiker." })?.key, "supermarket");
  assert.equal(detectDeclaredIndustry({ title: "Kassasoftware voor supermarkten | PosCo", description: "Software voor supermarkten en winkels." })?.key ?? null, null);
});

test("broken links: structured records; HTTP 200 challenge page is unconfirmed, not healthy", () => {
  assert.equal(linkOutcome({ url: "u", status: 200, error: false, challenged: true }), "unconfirmed");
  const recs = brokenLinkRecords([
    { url: "https://s.example/oud", status: 404, error: false, finalUrl: "https://s.example/oud" },
    { url: "https://s.example/soft", status: 200, error: false, softNotFound: true, finalUrl: "https://s.example/niet-gevonden" },
    { url: "https://s.example/wall", status: 200, error: false, challenged: true },
    { url: "https://s.example/slow", status: null, error: true },
    { url: "https://s.example/ok", status: 200, error: false },
  ], "https://s.example/");
  assert.equal(recs.length, 4);
  for (const r of recs) for (const k of ["sourceUrl", "targetUrl", "finalUrl", "httpStatus", "evidence", "impact", "recommendedAction"]) assert.ok(k in r, k);
  assert.equal(recs[0].proven, true);
  assert.equal(recs[1].finalUrl, "https://s.example/niet-gevonden");
  assert.equal(recs.find((r) => r.targetUrl.endsWith("/wall")).proven, false);
  assert.equal(recs.find((r) => r.targetUrl.endsWith("/slow")).proven, false);
  assert.match(recs.find((r) => r.targetUrl.endsWith("/slow")).impact, /geen bevestigde kapotte link/);
});

test("axe-core run script is plain JavaScript without transpiler helpers and returns the summary", async () => {
  const fakeAxe = { run: async () => ({ violations: [{ id: "label", impact: "serious", nodes: [1, 2] }], passes: [1, 2, 3], incomplete: [] }) };
  const ctx = vm.createContext({ window: { axe: fakeAxe }, document: {} });
  const out = await vm.runInContext(AXE_RUN_SCRIPT, ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), { violations: [{ id: "label", impact: "serious", nodes: 2 }], passes: 3, incomplete: 0, scope: "hydrated_wcag_a_aa" });
  await assert.rejects(vm.runInContext(AXE_RUN_SCRIPT, vm.createContext({ window: {}, document: {} })), /AXE_NOT_INJECTED/);
});

test("axe-core stays outside the server bundle (bundled axe.source fails in the browser with 't is not defined')", async () => {
  const { readFile } = await import("node:fs/promises");
  const cfg = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /serverExternalPackages:\s*\[[^\]]*"axe-core"/);
  const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(ci, /axe-bundle-check\.mjs/);
});

test("round 2: score caution from 80 and always with an unknown sector", () => {
  const base = { startUrl: "https://a.example/", startIsHomepage: true, evidenceCoveragePercent: 88, unconfirmedChecks: 2, evidenceLevel: "provisional", range: null, pages: { selected: 10, assessed: 10 }, siteCoverage: "complete", sampleScore: null, sitewideIssues: { confirmed: 0, toConfirm: 0 } };
  assert.match(buildScoreScope({ ...base, overallScore: 89, sectorStatus: "unconfirmed" }).caution, /sector niet bevestigd/);
  assert.match(buildScoreScope({ ...base, overallScore: 66, sectorStatus: "unconfirmed" }).caution, /66\/100/);
  assert.ok(buildScoreScope({ ...base, overallScore: 88, sectorStatus: "probable" }).caution);
  assert.equal(buildScoreScope({ ...base, overallScore: 75, sectorStatus: "confirmed" }).caution, null);
});

test("round 2: comparison wording on own product pages is not a publication; a real comparison site still is", async () => {
  const { isPublication } = await import("../lib/eu-identity.ts");
  assert.equal(isPublication("Bekijk en vergelijk Frisdrankmakers-producten | Merk"), false);
  assert.equal(isPublication("Compare our models | Brand"), false);
  assert.equal(isPublication("Vergelijkwijzer | Vergelijk energie, internet en verzekeringen"), true);
  assert.equal(isPublication("Merk Blog: tips en trends"), true);
});

test("round 3: refusal recovery is decided on content; own navigation is counted (one-page anchors included) for the warning", async () => {
  const { isSubstantiveRender, internalLinkCount } = await import("../lib/render-quality.ts");
  const real = `<html><head><title>Nord Airlines</title></head><body><h1>Welcome</h1><p>${"Book flights and holidays with us. ".repeat(12)}</p></body></html>`;
  assert.equal(isSubstantiveRender(real, { afterRefusal: true, hostname: "nord.example" }), true, "real homepage without links is not blocked");
  const err = `<html><head><title>Sorry, er gaat iets niet goed…</title></head><body><h1>Sorry, er gaat iets niet goed…</h1><p>${"Probeer het later nog eens. ".repeat(10)}</p></body></html>`;
  assert.equal(isSubstantiveRender(err, { afterRefusal: true, hostname: "bank.example" }), false);
  const maint = `<html><head><title>maintenance</title></head><body><h1>We'll be back soon</h1><p>${"Our website is temporarily unavailable. ".repeat(15)}</p></body></html>`;
  assert.equal(isSubstantiveRender(maint, { afterRefusal: true }), false);
  const onePage = `<a href="#brood">Brood</a><a href="#gebak">Gebak</a><a href="#nergens">x</a><a href="#">top</a><section id="brood"></section><section id="gebak"></section>`;
  assert.equal(internalLinkCount(onePage, "bakker.example"), 2, "only anchors whose target exists");
  assert.equal(internalLinkCount(`<a href="/a">a</a><a href="/a">a</a><a href="https://www.site.example/b">b</a><a href="https://other.example/">o</a><a href="tel:1">t</a>`, "site.example"), 2, "distinct same-site links only");
});
