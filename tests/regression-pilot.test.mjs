import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { snapshotFromScan, emptySnapshot } from "../lib/regression/snapshot.ts";
import { classifyResult, SCORE_DROP_REGRESSION } from "../lib/regression/compare.ts";
import { buildMarkdownReport, isGreenRun, runTotals } from "../lib/regression/report.ts";
import { regressionGuard } from "../lib/regression/auth.ts";
import { enabledPilotSites, PILOT_SITES, MAX_PILOT_SITES } from "../lib/regression/pilot-sites.ts";
import { runAsRegressionScan, regressionScanContext } from "../lib/regression/context.ts";

// ---------------------------------------------------------------------------
// Fixtures: a minimal scanner response with only the fields the pilot reads.
// ---------------------------------------------------------------------------
function scanBody(overrides = {}) {
  const o = {
    overall: 90, seo: 91, geo: 88, security: 80, coverage: 92, sector: "ecommerce", sectorScore: 95,
    websiteType: "Webshop", pageType: "homepage", mode: "javascript_rendered", fallback: null, bot: null,
    title: "Shop", description: "Beste shop", checks: [], contradictions: [], ...overrides,
  };
  return {
    success: true, finalUrl: "https://shop.example/", httpStatus: 200,
    overallScore: o.overall, seo: { score: o.seo }, geo: { score: o.geo }, security: { score: o.security },
    coverage: { coveragePercent: o.coverage, highConfidencePercent: 90 },
    scoreModel: { provisional: o.coverage < 90 },
    classification: { websiteType: o.websiteType, sector: { key: o.sector, label: o.sector, confidenceScore: o.sectorScore }, pageType: { type: o.pageType, confidence: "high" } },
    pageTypeInvariant: { valid: o.contradictions.length === 0, contradictions: o.contradictions },
    rendering: { mode: o.mode, fallbackReason: o.fallback, botProtection: o.bot },
    recovery: { attempted: false, browserRecovered: false },
    summary: { passed: 30, issues: 2, notApplicable: 10, unableToConfirm: 1 },
    metrics: { title: o.title, description: o.description, canonical: "https://shop.example/", h1s: ["Shop"], lang: "nl", schemaTypes: ["Organization"] },
    checks: o.checks,
  };
}
const v1 = { crawler: "2.6.0", rules: "1.4.0", scoreModel: "3.0", commit: "aaa" };
const v2 = { ...v1, commit: "bbb" };
const snap = (overrides, scanner = v1) => snapshotFromScan({ httpStatus: 200, body: scanBody(overrides), durationMs: 40000, scanner });
const fail = (rule, confidence = "high") => ({ rule_id: rule, issue_status: "FAIL", confidence, category: "seo" });
const shopExpect = { sectors: ["ecommerce"], websiteTypes: ["Webshop"], pageTypes: ["homepage"] };

// ---------------------------------------------------------------------------
// Snapshot: scanner responses → outcomes
// ---------------------------------------------------------------------------
test("a successful scan becomes a compact snapshot without page text", () => {
  const s = snap({ checks: [fail("canonical"), { rule_id: "twitter", issue_status: "WARNING", confidence: "medium" }, { rule_id: "x", issue_status: "PASS" }] });
  assert.equal(s.outcome, "scanned");
  assert.equal(s.seoScore, 91);
  assert.equal(s.securityScore, 80);
  assert.equal(s.renderer, "javascript_rendered");
  assert.deepEqual(s.findings.map((f) => f.rule), ["canonical", "twitter"]);
  assert.match(s.fingerprint, /^[0-9a-f]{16}$/);
  assert.ok(!JSON.stringify(s).includes("Beste shop"), "no page text stored");
});

test("site refusals, challenges and unreachable sites are never scanner errors", () => {
  const blocked = snapshotFromScan({ httpStatus: 422, body: { error: "x", recovery: { originalHttpStatus: 403 } }, durationMs: 1 });
  assert.equal(blocked.outcome, "blocked");
  const limited = snapshotFromScan({ httpStatus: 422, body: { error: "x", recovery: { originalHttpStatus: 429 } }, durationMs: 1 });
  assert.equal(limited.outcome, "blocked");
  const unavailable = snapshotFromScan({ httpStatus: 422, body: { error: "x", recovery: { originalHttpStatus: 503 } }, durationMs: 1 });
  assert.equal(unavailable.outcome, "blocked");
  const challenge = snapshotFromScan({ httpStatus: 422, body: { error: "x", charged: false }, durationMs: 1 });
  assert.equal(challenge.outcome, "blocked");
  assert.equal(snapshotFromScan({ httpStatus: 502, body: { error: "x" }, durationMs: 1 }).outcome, "http_error");
  assert.equal(snapshotFromScan({ httpStatus: 504, body: null, durationMs: 1 }).outcome, "timeout");
  assert.equal(snapshotFromScan({ httpStatus: 500, body: { code: "SCAN_TIMEOUT" }, durationMs: 1 }).outcome, "timeout");
  assert.equal(snapshotFromScan({ httpStatus: 500, body: { code: "SCAN_INTERNAL_ERROR" }, durationMs: 1 }).outcome, "scan_error");
  assert.equal(snapshotFromScan({ httpStatus: 0, body: null, durationMs: 1, timedOut: true }).outcome, "timeout");
});

// ---------------------------------------------------------------------------
// Classification: real regression vs content change vs thin evidence
// ---------------------------------------------------------------------------
test("first usable scan creates the baseline", () => {
  assert.equal(classifyResult(snap({}), null, shopExpect).result, "baseline_created");
});

test("unchanged page + new confirmed FAIL = real regression", () => {
  const c = classifyResult(snap({ checks: [fail("canonical")] }, v2), snap({}), shopExpect);
  assert.equal(c.result, "regression");
  assert.deepEqual(c.newFindings.map((f) => f.rule), ["canonical"]);
  assert.equal(c.scannerChanged, true);
});

test("a low-confidence FAIL is not a confirmed new failure", () => {
  assert.equal(classifyResult(snap({ checks: [fail("canonical", "low")] }), snap({}), shopExpect).result, "passed");
});

test("unchanged page + large score drop = regression; small drop = warning", () => {
  assert.equal(classifyResult(snap({ overall: 90 - SCORE_DROP_REGRESSION }), snap({}), shopExpect).result, "regression");
  assert.equal(classifyResult(snap({ overall: 86 }), snap({}), shopExpect).result, "warning");
  assert.equal(classifyResult(snap({ overall: 95 }), snap({}), shopExpect).result, "passed");
});

test("changed website content turns differences into warnings, not regressions", () => {
  const c = classifyResult(snap({ title: "Nieuwe homepage", checks: [fail("canonical")], overall: 70 }), snap({}), shopExpect);
  assert.equal(c.result, "warning");
  assert.equal(c.contentChanged, true);
  assert.match(c.reasons.join(" "), /inhoud gewijzigd/);
});

test("a new invariant violation is a regression even after a content change", () => {
  const c = classifyResult(snap({ title: "Andere titel", sector: "recruitment", sectorScore: 90 }), snap({}), shopExpect);
  assert.equal(c.result, "regression");
  assert.match(c.reasons.join(" "), /sector recruitment/);
});

test("a practice website classified as webshop is a false claim", () => {
  const practice = { forbiddenWebsiteTypes: ["Webshop"], pageTypes: ["homepage", "service"] };
  const ok = snap({ websiteType: "Boekings-/afsprakenwebsite", sector: "health_wellness" });
  const wrong = snap({ websiteType: "Webshop", sector: "health_wellness" });
  assert.equal(classifyResult(wrong, ok, practice).result, "regression");
});

test("an already known violation stays a warning, not a nightly regression", () => {
  const bad = snap({ pageType: "article" });
  assert.equal(classifyResult(bad, null, shopExpect).result, "warning");
  // Baseline with a violation is still a usable baseline; same violation = known.
  const c = classifyResult(snap({ pageType: "article" }), bad, shopExpect);
  assert.equal(c.result, "warning");
  assert.match(c.reasons.join(" "), /bekend:/);
});

test("low coverage and bot-reduced pages are unconfirmed, never regressions", () => {
  assert.equal(classifyResult(snap({ coverage: 55, checks: [fail("canonical")] }), snap({}), shopExpect).result, "unconfirmed");
  assert.equal(classifyResult(snap({ bot: ["_abck"], sector: "unknown", checks: [fail("h1")] }), snap({}), shopExpect).result, "unconfirmed");
});

test("blocked, timeout and skipped never become regressions", () => {
  for (const outcome of ["blocked", "timeout", "skipped"]) {
    assert.notEqual(classifyResult(emptySnapshot(outcome), snap({}), shopExpect).result, "regression");
  }
});

test("a RankFix internal error on a previously good site is ours", () => {
  assert.equal(classifyResult(emptySnapshot("scan_error", { errorCode: "SCAN_INTERNAL_ERROR" }), snap({}), shopExpect).result, "regression");
  assert.equal(classifyResult(emptySnapshot("scan_error"), null, shopExpect).result, "warning");
});

test("a JavaScript site falling back to raw HTML is flagged", () => {
  const c = classifyResult(snap({ mode: "raw_html", fallback: "BROWSER_UNAVAILABLE" }), snap({}), { ...shopExpect, javascriptSite: true });
  assert.equal(c.result, "warning");
  assert.match(c.reasons.join(" "), /raw HTML/);
});

// ---------------------------------------------------------------------------
// Report and green nights
// ---------------------------------------------------------------------------
test("report totals, green verdict and one overview", () => {
  const row = (id, snapshot, classification) => ({ siteId: id, label: id, url: null, snapshot, classification });
  const rows = [
    row("a", snap({}), classifyResult(snap({}), snap({}), shopExpect)),
    row("b", emptySnapshot("blocked"), classifyResult(emptySnapshot("blocked"), null, {})),
    row("c", emptySnapshot("skipped"), classifyResult(emptySnapshot("skipped"), null, {})),
    row("d", snap({}), classifyResult(snap({}), null, shopExpect)),
    row("e", snap({}), classifyResult(snap({}), snap({}), shopExpect)),
  ];
  const totals = runTotals(rows);
  assert.deepEqual([totals.total, totals.passed, totals.blocked, totals.skipped, totals.regressions], [5, 3, 1, 1, 0]);
  assert.equal(isGreenRun(totals), true, "3 of 4 attempted scanned ≥ 70%");
  const report = buildMarkdownReport({ runKey: "nightly-2026-10-12", commit: "abcdef1234", sitesVersion: "t", rows, consecutiveGreen: 1 });
  assert.match(report.markdown, /\| 5 \| 3 \| 0 \| 0 \| 1 \| 0 \| 1 \| 0 \|/);
  assert.equal(isGreenRun({ ...totals, regressions: 1 }), false);
  assert.equal(isGreenRun({ ...totals, scanErrors: 1 }), false);
  assert.equal(isGreenRun({ ...totals, scannedOk: 2 }), false, "2 of 4 is not enough");
});

// ---------------------------------------------------------------------------
// Access, config and context
// ---------------------------------------------------------------------------
test("internal routes need the dedicated secret and explicit activation", () => {
  const secret = "s".repeat(40);
  assert.equal(regressionGuard(null, { REGRESSION_SECRET: secret, RANKFIX_REGRESSION_PILOT: "1" })?.status, 401);
  assert.equal(regressionGuard(`Bearer ${"x".repeat(40)}`, { REGRESSION_SECRET: secret, RANKFIX_REGRESSION_PILOT: "1" })?.status, 401);
  assert.equal(regressionGuard(`Bearer ${secret}`, { REGRESSION_SECRET: secret })?.status, 503, "inert until activated");
  assert.equal(regressionGuard("Bearer short", { REGRESSION_SECRET: "short", RANKFIX_REGRESSION_PILOT: "1" })?.status, 401, "short secrets never valid");
  assert.equal(regressionGuard(`Bearer ${secret}`, { REGRESSION_SECRET: secret, RANKFIX_REGRESSION_PILOT: "1" }), null);
});

test("pilot config: 6 approved sites, Shopify waits for approval, hard cap 29", () => {
  const enabled = enabledPilotSites();
  assert.equal(enabled.length, 6);
  assert.ok(!enabled.some((s) => s.id === "shopify-shop"));
  assert.equal(PILOT_SITES.length, 7);
  assert.equal(MAX_PILOT_SITES, 29);
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, label: "x", url: "https://x.example/", enabled: true, approval: "approved", expect: {} }));
  assert.equal(enabledPilotSites(many).length, 29);
  for (const site of PILOT_SITES) assert.ok(!("score" in site.expect), "no fixed total scores");
});

test("regression context exists only inside runAsRegressionScan", async () => {
  assert.equal(regressionScanContext(), null);
  await runAsRegressionScan({ runKey: "r", siteId: "s" }, async () => {
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(regressionScanContext()?.siteId, "s");
  });
  assert.equal(regressionScanContext(), null);
});

test("scanner route: regression context skips session, history, usage and public limit", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const dashboardScan = !regressionScan && body\?\.dashboard === true/);
  assert.match(source, /if \(!regressionScan\) \{ try \{ usageUser = await getCurrentUser\(\); \} catch \{\} \}/);
  assert.match(source, /if \(!regressionScan\) \{ try \{ user = await getCurrentUser\(\); \} catch \{\} \}/);
  assert.match(source, /if \(!scanRateLimit \|\| regressionScan\) return null;/);
  // Every history/usage write is inside `if (user)`, which stays null here.
  assert.equal((source.match(/getCurrentUser\(\)/g) || []).length, 2);
});

// ---------------------------------------------------------------------------
// Store + service against a real PostgreSQL (lease, idempotency, one alert).
// Runs when TEST_DATABASE_URL is set; skipped otherwise (CI has no database).
// ---------------------------------------------------------------------------
const dbUrl = process.env.TEST_DATABASE_URL;
test("service flow on PostgreSQL: claims, retries, budgets and a single notification", { skip: !dbUrl && "TEST_DATABASE_URL not set" }, async () => {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: dbUrl, max: 4 });
  const query = (sql, params) => pool.query(sql, params);
  const { startRegressionRun, scanRegressionSite, finishRegressionRun } = await import("../lib/regression/service.ts");
  try {
    await query("DROP TABLE IF EXISTS regression_results; DROP TABLE IF EXISTS regression_runs;");
    const sites = [
      { id: "shop", label: "Shop", url: "https://shop.example/", enabled: true, approval: "approved", expect: shopExpect },
      { id: "slow", label: "Slow", url: "https://slow.example/", enabled: true, approval: "approved", expect: {} },
      { id: "blocked", label: "Blocked", url: "https://blocked.example/", enabled: true, approval: "approved", expect: { botProtectionExpected: true } },
      { id: "pending", label: "Pending", url: null, enabled: false, approval: "awaiting_owner_approval", expect: {} },
    ];
    let scans = 0;
    const notes = [];
    let shopBody = scanBody({});
    const deps = {
      query, sites, budgetMs: 200, version: v1,
      notify: async (n) => { notes.push(n); },
      scan: async (url) => {
        scans++;
        if (url.includes("slow")) return new Promise(() => {});        // never answers → budget
        if (url.includes("blocked")) return { httpStatus: 422, body: { error: "x", recovery: { originalHttpStatus: 403 } } };
        return { httpStatus: 200, body: shopBody };
      },
    };

    // Night 1: baseline.
    const start = await startRegressionRun(deps, "nightly-2026-10-12");
    assert.equal(start.ok, true);
    assert.deepEqual(start.sites.map((s) => s.id), ["shop", "slow", "blocked"]);
    const other = await startRegressionRun(deps, "manual-other");
    assert.equal(other.status, 409, "one active run at a time");

    const first = await scanRegressionSite(deps, "nightly-2026-10-12", "shop");
    assert.equal(first.classification.result, "baseline_created");
    const again = await scanRegressionSite(deps, "nightly-2026-10-12", "shop");
    assert.equal(again.reused, true, "idempotent: no second scan");
    assert.equal(scans, 1);

    const slow = await scanRegressionSite(deps, "nightly-2026-10-12", "slow");
    assert.equal(slow.snapshot.outcome, "timeout");
    const blocked = await scanRegressionSite(deps, "nightly-2026-10-12", "blocked");
    assert.equal(blocked.classification.result, "blocked");
    assert.equal((await scanRegressionSite(deps, "nightly-2026-10-12", "nope")).status, 404);

    const night1 = await finishRegressionRun(deps, "nightly-2026-10-12");
    assert.equal(night1.totals.skipped, 1, "Shopify awaiting approval → skipped");
    assert.equal(night1.totals.regressions, 0);
    assert.equal(night1.green, false, "1 of 3 scanned is not enough");
    assert.equal(notes.length, 0);
    const replay = await finishRegressionRun(deps, "nightly-2026-10-12");
    assert.equal(replay.totals.total, night1.totals.total, "finish is idempotent");
    assert.equal((await scanRegressionSite(deps, "nightly-2026-10-12", "shop")).status, 409, "completed run accepts no scans");

    // Night 2: same page, new confirmed FAIL → one regression, one notification.
    shopBody = scanBody({ checks: [fail("canonical")] });
    await startRegressionRun(deps, "nightly-2026-10-13");
    const regressed = await scanRegressionSite(deps, "nightly-2026-10-13", "shop");
    assert.equal(regressed.classification.result, "regression");
    const night2 = await finishRegressionRun(deps, "nightly-2026-10-13");
    assert.equal(night2.totals.regressions, 1);
    await finishRegressionRun(deps, "nightly-2026-10-13");
    assert.equal(notes.length, 1, "exactly one bundled notification per run");
    assert.match(notes[0].markdown, /REGRESSIE/);

    // A crashed claim is retried once after its lease, then reported as timeout.
    await startRegressionRun(deps, "nightly-2026-10-14");
    await query("INSERT INTO regression_results (run_key,site_id,status,attempts,lease_until) VALUES ('nightly-2026-10-14','slow','claimed',1,NOW()-INTERVAL '1 second')");
    const retried = await scanRegressionSite(deps, "nightly-2026-10-14", "slow");
    assert.equal(retried.snapshot.outcome, "timeout");
    await query("INSERT INTO regression_results (run_key,site_id,status,attempts,lease_until) VALUES ('nightly-2026-10-14','blocked','claimed',1,NOW()+INTERVAL '5 minutes')");
    assert.equal((await scanRegressionSite(deps, "nightly-2026-10-14", "blocked")).status, 409, "live lease: no duplicate scan");
    await query("UPDATE regression_results SET attempts=2, lease_until=NOW()-INTERVAL '1 second' WHERE run_key='nightly-2026-10-14' AND site_id='blocked'");
    assert.equal((await scanRegressionSite(deps, "nightly-2026-10-14", "blocked")).status, 409, "attempts exhausted");
    const night3 = await finishRegressionRun(deps, "nightly-2026-10-14");
    assert.equal(night3.totals.timeouts, 2, "exhausted claim reported as timeout");

    // Notification failure is retried by a later finish, still only once delivered.
    shopBody = scanBody({ checks: [fail("canonical"), fail("h1")] });
    await startRegressionRun(deps, "nightly-2026-10-15");
    await scanRegressionSite(deps, "nightly-2026-10-15", "shop");
    let failOnce = true;
    deps.notify = async (n) => { if (failOnce) { failOnce = false; throw new Error("smtp down"); } notes.push(n); };
    assert.equal((await finishRegressionRun(deps, "nightly-2026-10-15")).notified, false);
    assert.equal((await finishRegressionRun(deps, "nightly-2026-10-15")).notified, true);
    assert.equal((await finishRegressionRun(deps, "nightly-2026-10-15")).notified, false);
    assert.equal(notes.length, 2);
  } finally {
    await pool.end();
  }
});

test("green-night counter counts consecutive completed green runs", { skip: !dbUrl && "TEST_DATABASE_URL not set" }, async () => {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  const query = (sql, params) => pool.query(sql, params);
  const { startRegressionRun, scanRegressionSite, finishRegressionRun } = await import("../lib/regression/service.ts");
  try {
    await query("DROP TABLE IF EXISTS regression_results; DROP TABLE IF EXISTS regression_runs;");
    const sites = [{ id: "shop", label: "Shop", url: "https://shop.example/", enabled: true, approval: "approved", expect: shopExpect }];
    const deps = { query, sites, version: v1, notify: async () => {}, scan: async () => ({ httpStatus: 200, body: scanBody({}) }) };
    const counts = [];
    for (const day of ["12", "13", "14"]) {
      await startRegressionRun(deps, `nightly-2026-10-${day}`);
      await scanRegressionSite(deps, `nightly-2026-10-${day}`, "shop");
      counts.push((await finishRegressionRun(deps, `nightly-2026-10-${day}`)).consecutiveGreen);
    }
    assert.deepEqual(counts, [1, 2, 3]);
  } finally {
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// Runner against a mock server: sequential, retry once, secret required.
// ---------------------------------------------------------------------------
function runRunner(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL("../scripts/regression/run-pilot.mjs", import.meta.url).pathname], { env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve({ code, out }));
  });
}

test("runner: sequential scans, one retry on 504, one report", async () => {
  const secret = "r".repeat(40);
  const calls = [];
  let active = 0, maxActive = 0, failedOnce = false;
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    calls.push(`${req.url}:${body.siteId || ""}`);
    if (req.headers.authorization !== `Bearer ${secret}`) { res.writeHead(401).end("{}"); return; }
    const send = (status, json) => { res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json)); };
    if (req.url.endsWith("/start")) return send(200, { ok: true, sites: [{ id: "a", label: "A" }, { id: "b", label: "B" }] });
    if (req.url.endsWith("/scan")) {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      if (body.siteId === "b" && !failedOnce) { failedOnce = true; return send(504, {}); }
      return send(200, { ok: true, classification: { result: "passed" } });
    }
    if (req.url.endsWith("/finish")) return send(200, { ok: true, markdown: "## RAPPORT" });
    send(404, {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const ok = await runRunner({ RANKFIX_BASE_URL: baseUrl, REGRESSION_SECRET: secret, RUN_KEY: "manual-test", PAUSE_MS: "1", RETRY_DELAY_MS: "1" });
    assert.equal(ok.code, 0, ok.out);
    assert.deepEqual(calls, ["/api/internal/regression/start:", "/api/internal/regression/scan:a", "/api/internal/regression/scan:b", "/api/internal/regression/scan:b", "/api/internal/regression/finish:"]);
    assert.equal(maxActive, 1, "never two scans at once");
    assert.match(ok.out, /## RAPPORT/);
    const noSecret = await runRunner({ RANKFIX_BASE_URL: baseUrl, REGRESSION_SECRET: "" });
    assert.equal(noSecret.code, 2);
  } finally {
    server.close();
  }
});

test("the regression scan route ships the serverless Chromium binary like /api/scan", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /"\/api\/internal\/regression\/scan": \["\.\/node_modules\/@sparticuz\/chromium\/bin\/\*\*"\]/);
  const route = await readFile(new URL("../app/api/internal/regression/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /export const maxDuration = 300;/);
});
