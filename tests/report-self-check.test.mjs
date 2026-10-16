import test from "node:test";
import assert from "node:assert/strict";
import { enforceReportConsistency, labelFitsSector, SECTOR_FAMILY_LABEL } from "../lib/report-consistency.ts";
import { newsMediaIdentity } from "../lib/sector-identity.ts";
import { capPerfectScore } from "../lib/audit-score.ts";
import { buildScanEvidence } from "../lib/scan-evidence.ts";

const chk = (key, status, points, maxPoints, extra = {}) => ({
  key, category: extra.category || "seo", status, issue_status: status === "not_applicable" ? "NOT_APPLICABLE" : status === "unable_to_confirm" ? "UNABLE_TO_CONFIRM" : status.toUpperCase(),
  points, maxPoints, message: extra.message || "ok", recommendation: extra.recommendation || "", evidence: { url: extra.url ?? "https://www.example.nl/", found: null, details: "" },
});
const sector = (o) => ({ sector: "telecom_technology", key: "telecom_technology", label: "Telecom & Technologie", confidence: "high", confidenceScore: 96, evidence: [], applicableModules: ["core_seo", "geo", "technical"], ...o });
const run = (o) => enforceReportConsistency({ scannedUrl: "https://www.example.nl/", scores: { seo: 90, geo: 80, overall: 86, mode: "both" }, coveragePercent: 95, checks: [], ...o });

test("self-check: a label from another sector (news site labelled dentist) is corrected and recorded", () => {
  const s = sector({ sector: "news_media", key: "dentist", label: "Tandarts / Dentist", evidence: ["Primaire identiteit: telecomabonnementen en netwerkdiensten", "Primaire identiteit: 4 onafhankelijke sectorsignalen"], applicableModules: ["core_seo", "geo", "telecom_technology", "health_wellness", "news_media"] });
  const { selfCheck } = run({ sector: s });
  assert.equal(s.label, SECTOR_FAMILY_LABEL.news_media);
  assert.deepEqual(s.evidence, ["Primaire identiteit: 4 onafhankelijke sectorsignalen"]);
  assert.ok(!s.applicableModules.includes("telecom_technology") && !s.applicableModules.includes("health_wellness"));
  assert.ok(s.applicableModules.includes("news_media"));
  assert.equal(selfCheck.consistent, false);
  assert.deepEqual([...new Set(selfCheck.corrections.map((c) => c.code))].sort(), ["foreign_sector_module", "sector_evidence_mismatch", "sector_label_mismatch"]);
});

test("self-check: legitimate hybrids keep their secondary modules", () => {
  const s = sector({ sector: "hospitality", key: "hotel", label: "Hotel / accommodatie", applicableModules: ["core_seo", "accommodation", "events_culture", "fitness_sports"] });
  const { selfCheck } = run({ sector: s });
  assert.deepEqual(s.applicableModules, ["core_seo", "accommodation", "events_culture", "fitness_sports"]);
  assert.equal(selfCheck.corrections.length, 0);
});

test("self-check: LocalBusiness advice on a non-local sector is rewritten", () => {
  const schema = chk("schema", "warning", 4, 12, { category: "geo", message: "Geen geldige JSON-LD structured data gevonden voor deze lokale bedrijfs-/dienstpagina.", recommendation: "Voeg JSON-LD toe. Voor dit paginatype is LocalBusiness de belangrijkste richting." });
  run({ sector: sector({ sector: "news_media", label: "Nieuws & Media" }), checks: [schema] });
  assert.doesNotMatch(schema.message + schema.recommendation, /LocalBusiness|lokale bedrijfs/);
  assert.match(schema.recommendation, /NewsMediaOrganization/);
  const local = chk("schema", "warning", 4, 12, { category: "geo", message: "Geen geldige JSON-LD structured data gevonden voor deze lokale bedrijfs-/dienstpagina.", recommendation: "Voor dit paginatype is LocalBusiness de belangrijkste richting." });
  run({ sector: sector({ sector: "home_services", label: "Lokale vakdienst" }), checks: [local] });
  assert.match(local.recommendation, /LocalBusiness/, "local businesses keep LocalBusiness advice");
});

test("self-check: 100/100 is impossible next to an open issue, also outside the core checks", () => {
  const checks = [chk("title", "pass", 10, 10), chk("trust_legal_signals", "warning", 4, 5)];
  const { scores, selfCheck } = run({ sector: sector({}), checks, scores: { seo: 100, geo: 100, overall: 100, mode: "both" } });
  assert.equal(scores.seo, 99); assert.equal(scores.overall, 99); assert.equal(scores.geo, 100);
  assert.ok(selfCheck.corrections.some((c) => c.code === "perfect_score_with_issue"));
  assert.equal(capPerfectScore(100, checks), 99);
  assert.equal(capPerfectScore(100, [chk("checkout", "warning", 0, 0)]), 100, "informational 0-point checks do not cap");
});

test("self-check: unscored checks never carry points; points stay in bounds", () => {
  const na = chk("faq", "not_applicable", 6, 10); const over = chk("h1", "pass", 12, 8);
  run({ sector: sector({}), checks: [na, over] });
  assert.equal(na.points, 0); assert.equal(over.points, 8);
});

test("self-check: evidence from another website is never kept; own subdomains are fine", () => {
  const own = chk("trust_legal_signals", "pass", 5, 5, { url: "https://cookies.example.nl/settings" });
  const foreign = chk("title", "pass", 10, 10, { url: "https://www.other-site.de/" });
  const uk = enforceReportConsistency({ sector: sector({}), checks: [chk("x", "pass", 1, 1, { url: "https://shop.brand.co.uk/a" })], scannedUrl: "https://www.brand.co.uk/", scores: { seo: 1, geo: 1, overall: 1, mode: "seo" }, coveragePercent: 100 });
  run({ sector: sector({}), checks: [own, foreign] });
  assert.equal(own.evidence.url, "https://cookies.example.nl/settings");
  assert.equal(foreign.evidence.url, "https://www.example.nl/");
  assert.equal(uk.selfCheck.corrections.length, 0);
});

test("self-check: reliability is honest about coverage, rendering and sector certainty", () => {
  assert.equal(run({ sector: sector({}), coveragePercent: 96 }).selfCheck.reliability, "high");
  assert.equal(run({ sector: sector({}), coveragePercent: 82 }).selfCheck.reliability, "medium");
  const low = run({ sector: sector({}), coveragePercent: 68, javascriptRequiredButNotRendered: true }).selfCheck;
  assert.equal(low.reliability, "low");
  assert.ok(low.reliabilityReasons.some((r) => /JavaScript/.test(r)));
  assert.equal(run({ sector: sector({ sector: "unknown", label: "Sector niet bevestigd", confidenceScore: 30 }), coveragePercent: 95 }).selfCheck.reliability, "medium");
});

// Property test: whatever wrong label/modules an upstream detector produces,
// the stored report is internally consistent afterwards.
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
test("self-check property: 3000 random contradictory reports always end consistent", () => {
  const r = rng(42);
  const sectors = Object.keys(SECTOR_FAMILY_LABEL);
  const labels = [...Object.values(SECTOR_FAMILY_LABEL), "Tandarts / Dentist", "Juridisch / Advocatuur", "Hotel / accommodatie", "Betaaldienstverlener / fintech"];
  const modules = ["core_seo", "geo", "technical", "lead_conversion", "booking", "local", ...sectors];
  for (let i = 0; i < 3000; i++) {
    const primary = sectors[Math.floor(r() * sectors.length)];
    const s = sector({ sector: primary, key: primary, label: labels[Math.floor(r() * labels.length)], applicableModules: modules.filter(() => r() < 0.3) });
    const checks = Array.from({ length: 8 }, (_, k) => chk(`c${k}`, ["pass", "warning", "fail", "not_applicable", "unable_to_confirm"][Math.floor(r() * 5)], Math.floor(r() * 12), 10, { category: r() < 0.5 ? "seo" : "geo" }));
    const sc = { seo: Math.floor(r() * 101), geo: Math.floor(r() * 101), overall: 0, mode: "both" }; sc.overall = Math.round(sc.seo * 0.6 + sc.geo * 0.4);
    const out = run({ sector: s, checks, scores: sc });
    assert.ok(labelFitsSector(primary, s.label), `${primary} ← ${s.label}`);
    for (const c of checks) { assert.ok(c.points >= 0 && c.points <= c.maxPoints); if (["NOT_APPLICABLE", "UNABLE_TO_CONFIRM"].includes(c.issue_status)) assert.equal(c.points, 0); }
    if (checks.some((c) => ["WARNING", "FAIL"].includes(c.issue_status))) assert.ok(out.scores.overall <= 99);
    // Idempotent: a second pass finds nothing left to correct.
    assert.equal(run({ sector: s, checks, scores: { ...out.scores, mode: "both" } }).selfCheck.corrections.length, 0);
  }
});

test("news identity: strong publisher words or a news homepage; a company news page is not a publisher", () => {
  assert.equal(newsMediaIdentity({ title: "Omroep.nl - Nieuws, Sport en Evenementen | Nederlandse Omroep Stichting", description: "op Radio, TV en Internet", h1: "Blijf bij.", homepage: true }), true);
  assert.equal(newsMediaIdentity({ title: "NU - Het laatste nieuws het eerst", description: "Het laatste nieuws uit binnen- en buitenland", h1: "", homepage: true }), true);
  assert.equal(newsMediaIdentity({ title: "Nieuws | Bakkerij Jansen", description: "Lees het laatste nieuws van Bakkerij Jansen", h1: "Nieuws", homepage: false }), false);
  assert.equal(newsMediaIdentity({ title: "Sim only en glasvezel internet | Telco", description: "Internet, mobiel en tv", h1: "", homepage: true }), false);
  assert.equal(newsMediaIdentity({ title: "Journal app – notes for teams", description: "Write notes", h1: "", homepage: true }), false);
});

test("booking evidence: Facebook, notebook, e-book and bookkeeping links are not booking actions", () => {
  const ev = (body) => buildScanEvidence({ html: `<html><body>${body}</body></html>`, text: body.replace(/<[^>]+>/g, " "), url: "https://x.test/", schemaTypes: [] });
  for (const href of ["https://www.facebook.com/brand", "/notebooks", "/ebook-download", "/bookkeeping", "/bookstore"]) {
    const e = ev(`<p>Booking platforms use us.</p><a href="${href}">link</a>`);
    assert.notEqual(e.appointments.booking.confidence, "high", href);
  }
  assert.equal(ev(`<p>Booking</p><a href="/book-now">Boek nu</a>`).appointments.booking.confidence, "high");
});
