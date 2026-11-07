import test from "node:test";
import assert from "node:assert/strict";
import { runOffline } from "../scripts/engine-benchmark/offline.mjs";
import { baselineRows } from "../scripts/engine-benchmark/eu81.mjs";
import { evaluate, scorecard } from "../scripts/engine-benchmark/metrics.mjs";
import { readFileSync } from "node:fs";

// Quality gate: future changes may not silently reduce measured engine quality.
// The hold-outs were written blind and measured before tuning (first results:
// 85.9% and 86.1% accuracy, see docs/ENGINE-QUALITY-REPORT.md); they now act as
// frozen regression sets. Real-world quality is measured on the EU-81 pilot.
const GATES = { minAccuracyPct: 95, maxHighConfidenceWrong: 0, maxHonestyIssues: 0, maxConsistency: 0 };

function assertGates(name, m) {
  assert.ok(m.sector.accuracyPct >= GATES.minAccuracyPct, `${name}: accuracy ${m.sector.accuracyPct}% < ${GATES.minAccuracyPct}% — ${JSON.stringify(m.sector.confusion)}`);
  assert.equal(m.sector.highConfidenceWrong, GATES.maxHighConfidenceWrong, `${name}: confident wrong sectors ${JSON.stringify(m.sector.confusion)}`);
  assert.equal(m.honesty.perfectWithIncompleteEvidence + m.honesty.score98PlusAtLowCoverage + m.honesty.lowCoverageNotQualified, GATES.maxHonestyIssues, `${name}: score honesty`);
  assert.equal(m.consistency.reportsWithViolations, GATES.maxConsistency, `${name}: report consistency`);
}

test("benchmark gate: synthetic matrix + real EU identities", () => assertGates("matrix", runOffline().all));
test("benchmark gate: hold-out 1 (64 sites, 20 languages)", () => assertGates("holdout1", runOffline(undefined, { HOLDOUT: "only", HOLDOUT_FILE: "holdout.json" }).all));
test("benchmark gate: hold-out 2 (36 sites, incl. bg/sk/sl/et/da/lv/lb)", () => assertGates("holdout2", runOffline(undefined, { HOLDOUT: "only", HOLDOUT_FILE: "holdout2.json" }).all));

test("benchmark gate: hold-out 3 (33 weak real-world-like homepages, 21 languages)", () => assertGates("holdout3", runOffline(undefined, { HOLDOUT: "only", HOLDOUT_FILE: "holdout3.json" }).all));

test("EU-81 baseline from issue #151 is reproducible", () => {
  const m = evaluate(baselineRows());
  assert.equal(m.sector.planned, 81);
  assert.equal(m.sector.scanned, 53);
  assert.equal(m.sector.correct, 27);
  assert.equal(m.sector.wrong, 6);
  assert.equal(m.sector.abstained, 20);
  assert.equal(m.honesty.perfectWithIncompleteEvidence, 3);
});

test("scorecard never fills in unmeasured criteria", () => {
  const sc = scorecard({ sector: { accuracyPct: 100, wrongSectorPct: 0, scanned: 10, scanSuccessPct: 100 } });
  assert.equal(sc.complete, false);
  assert.ok(sc.score < sc.maxPossible);
});

test("pilot pipeline: a read-only Neon export is matched to the EU-81 plan and measured", async () => {
  const { exportRows, attemptSummary } = await import("../scripts/engine-benchmark/eu81.mjs");
  const scans = [
    { scanned_url: "https://orf.at/", created_at: "2026-10-17T10:00:00Z", overall_score: 91, result: { sectorProfile: { sector: "news_media", confidenceScore: 94 }, coverage: { coveragePercent: 95 }, selfCheck: { reliability: "high", corrections: [] }, scoreModel: { evidenceLevel: "complete", headline: { kind: "score" } }, checks: [], scanDurationMs: 42000 } },
    { scanned_url: "https://www.bcr.ro", created_at: "2026-10-17T10:05:00Z", overall_score: 97, result: { sectorProfile: { sector: "financial_services", confidenceScore: 95 }, coverage: { coveragePercent: 80 }, selfCheck: { reliability: "medium", corrections: [] }, scoreModel: { evidenceLevel: "provisional" }, checks: [{ status: "unable_to_confirm" }] } },
    { scanned_url: "https://www.bcr.ro", created_at: "2026-10-16T10:05:00Z", overall_score: 98, result: { sectorProfile: { sector: "ecommerce" } } },
  ];
  const m = evaluate(exportRows(scans));
  assert.equal(m.sector.scanned, 2);
  assert.equal(m.sector.correct, 2, "newest scan per site is used");
  assert.equal(m.performance.n, 1);
  const a = attemptSummary([{ requested_url: "https://dsb.dk", outcome: "failed", error: "HTTP 403" }, { requested_url: "orf.at", outcome: "success" }]);
  assert.equal(a.sitesWithSuccess, 1);
  assert.equal(a.failedSites[0].lastError, "HTTP 403");
});

test("pilot 2 plan is blind: 40 real sites, no overlap with EU-81, every family covered", async () => {
  const p2 = JSON.parse(readFileSync(new URL("./fixtures/eu-pilot2/plan.json", import.meta.url), "utf8")).sites;
  const eu81 = JSON.parse(readFileSync(new URL("./fixtures/eu81/plan.json", import.meta.url), "utf8")).sites;
  const h = (x) => x.replace(/^www\./, "");
  const used = new Set(eu81.flatMap((s) => s.hosts.map(h)));
  assert.equal(p2.length, 40);
  assert.deepEqual(p2.filter((s) => s.hosts.some((x) => used.has(h(x)))).map((s) => s.name), []);
  assert.deepEqual([...new Set(p2.map((s) => s.expected))].sort(), [...new Set(eu81.map((s) => s.expected))].sort());
});

test("pilot runner output is measurable by the export pipeline", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const dir = mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "rf-pilot-"));
  writeFileSync(`${dir}/s.json`, JSON.stringify([{ scanned_url: "https://ns.nl/", overall_score: 90, created_at: "2026-10-17T10:00:00Z", result: { sectorProfile: { sector: "transport_travel", confidenceScore: 90 }, coverage: { coveragePercent: 92 } } }]));
  writeFileSync(`${dir}/a.json`, JSON.stringify([{ requested_url: "https://ns.nl/", http_status: 200, outcome: "success", category: "success" }, { requested_url: "https://ing.nl/", http_status: 422, outcome: "failed", category: "site_blocked", error_code: "HTTP_BLOCKED" }]));
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/engine-benchmark/eu81.mjs", "export", `${dir}/s.json`, `${dir}/a.json`], { env: { ...process.env, RF_PLAN: "tests/fixtures/eu-pilot2/plan.json" }, encoding: "utf8" });
  const m = JSON.parse(r.stdout);
  assert.equal(m.sector.planned, 40);
  assert.equal(m.sector.correct, 1);
  assert.equal(m.attempts.failedByCategory.site_blocked, 1);
  const runner = readFileSync(new URL("../scripts/engine-benchmark/run-pilot.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(runner, /writeFileSync\([^)]*session/i, "credentials are never written to output");
});

test("frozen plans stay unchanged; exposed cases are reported apart from blind results", async () => {
  const p2 = JSON.parse(readFileSync(new URL("./fixtures/eu-pilot2/plan.json", import.meta.url), "utf8"));
  assert.equal(p2.seenAfterFreeze, undefined, "plan file is not an evaluation log");
  const reg = JSON.parse(readFileSync(new URL("./fixtures/evaluation/exposures.json", import.meta.url), "utf8")).exposures;
  assert.ok(reg.some((x) => x.host === "charite.de" && x.originalVerdict.startsWith("wrong")));
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const dir = mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "rf-exp-"));
  writeFileSync(`${dir}/s.json`, JSON.stringify([
    { scanned_url: "https://www.charite.de/", created_at: "2026-10-17T10:00:00Z", result: { sectorProfile: { sector: "health_wellness", confidenceScore: 92 } } },
    { scanned_url: "https://hus.fi/", created_at: "2026-10-17T10:00:00Z", result: { sectorProfile: { sector: "education", confidenceScore: 90 } } },
  ]));
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/engine-benchmark/eu81.mjs", "export", `${dir}/s.json`], { env: { ...process.env, RF_PLAN: "tests/fixtures/eu-pilot2/plan.json" }, encoding: "utf8" });
  const m = JSON.parse(r.stdout);
  assert.equal(m.sector.correct, 1);
  assert.equal(m.independent.sector.correct, 0, "the exposed Charité result does not count as blind evidence");
  assert.equal(m.independent.sector.scanned, 1);
  assert.equal(m.exposedCases.length, 1);
});

test("independent set 3 is disjoint from every set and exploratory site seen so far", () => {
  const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")).sites;
  const h = (x) => x.replace(/^www\./, "");
  const seen = new Set([...load("./fixtures/eu81/plan.json"), ...load("./fixtures/eu-pilot2/plan.json")].flatMap((s) => s.hosts.map(h)));
  for (const x of JSON.parse(readFileSync(new URL("./fixtures/evaluation/exposures.json", import.meta.url), "utf8")).exposures) seen.add(h(x.host));
  const explo = JSON.parse(readFileSync(new URL("./fixtures/evaluation/exploratory.json", import.meta.url), "utf8"));
  // Exploratory sites must never overlap a frozen set either.
  for (const x of [...explo.tested, ...explo.planned]) assert.ok(!seen.has(h(x.host)), `exploratory ${x.host} is in a frozen set`);
  const s3hosts = new Set(JSON.parse(readFileSync(new URL("./fixtures/eu-independent3/plan.json", import.meta.url), "utf8")).sites.flatMap((s) => s.hosts.map(h)));
  for (const x of [...explo.tested, ...explo.planned]) assert.ok(!s3hosts.has(h(x.host)), `exploratory ${x.host} is in independent set 3`);
  // Exploratory sites from QA issue #154 and the owner's field tests.
  for (const x of ["belastingdienst.nl", "postnl.nl", "rabobank.nl", "tweakers.net", "dw.com", "ameli.fr", "elpais.com", "kela.fi", "poczta-polska.pl", "aade.gr", "bnb.bg", "publico.pt", "poste.it", "suspilne.media", "nhk.or.jp", "aljazeera.net", "nhs.uk", "utoronto.ca", "stanford.edu", "kuleuven.be", "asml.com", "arganwinkel.nl", "intersport.nl", "decathlon.nl"]) seen.add(x);
  const s3 = load("./fixtures/eu-independent3/plan.json");
  assert.ok(s3.length >= 60);
  assert.deepEqual(s3.filter((s) => s.hosts.some((x) => seen.has(h(x)))).map((s) => s.name), []);
  assert.ok(new Set(s3.map((s) => s.language)).size >= 10, "at least 10 languages");
  assert.ok(new Set(s3.flatMap((s) => [].concat(s.expected))).size >= 15, "at least 15 sector families");
});

test("scorecard v2 is frozen: weights sum to 10, unmeasured criteria block acceptance", async () => {
  const { SCORECARD_V2, scorecardV2 } = await import("../scripts/engine-benchmark/scorecard-v2.mjs");
  assert.equal(SCORECARD_V2.criteria.reduce((a, c) => a + c.weight, 0), 10);
  assert.equal(SCORECARD_V2.criteria.length, 10);
  const perfectRows = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, expected: "education", predicted: "education", confidence: 92, scanned: true, country: "NL" }));
  const sc = scorecardV2(perfectRows, { attemptedSites: 10, sitesWithSuccess: 10 }, null);
  assert.equal(sc.accepted, false, "without the manual review the scorecard is incomplete");
  assert.ok(sc.unmeasured.includes("page_type") && sc.unmeasured.includes("seo_geo"));
  const wrong = scorecardV2([...perfectRows, { id: "w", expected: "health_wellness", predicted: "education", confidence: 93, scanned: true, country: "DE" }], null, null);
  assert.deepEqual(wrong.sectorFailures, ["health_wellness"], "one confident wrong sector fails the sector gate");
});

test("pilot runner retries only transient failures, never blocked sites or quota", async () => {
  const { pendingSites, attemptCategory, sanitizeResult } = await import("../scripts/engine-benchmark/run-pilot.mjs");
  const sites = ["a.test", "b.test", "c.test", "d.test", "e.test"].map((h) => ({ hosts: [h], expected: "news_media" }));
  const att = [
    { requested_url: "https://a.test/", outcome: "failed", category: "network", http_status: 502 },
    { requested_url: "https://b.test/", outcome: "failed", category: "site_blocked", http_status: 422 },
    { requested_url: "https://c.test/", outcome: "success", category: "success", http_status: 200 },
    { requested_url: "https://d.test/", outcome: "failed", category: "function_timeout", http_status: 0 },
    { requested_url: "https://d.test/", outcome: "failed", category: "function_timeout", http_status: 0 },
  ];
  assert.deepEqual(pendingSites(sites, att, 2).map((s) => s.hosts[0]), ["a.test", "e.test"]);
  assert.equal(attemptCategory(0, "CLIENT_TIMEOUT"), "function_timeout");
  assert.equal(attemptCategory(429, "SITE_RATE_LIMITED"), "site_blocked");
  assert.equal(attemptCategory(429, "SCAN_LIMIT"), "quota");
  assert.deepEqual(Object.keys(sanitizeResult({ rawHtml: "<html>", cookies: ["x"], sectorProfile: {} })), ["sectorProfile"]);
  const src = readFileSync(new URL("../scripts/engine-benchmark/run-pilot.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /writeFileSync\([^)]*session[^0]/i, "credentials are never written");
  assert.match(src, /deploymentSha/);
});
