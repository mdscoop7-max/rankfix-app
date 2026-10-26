// Real-browser check of the laptop/browser-operated TestLab (QA 144).
// Drives the real /dashboard/testlab page of a production build started with
// VERCEL_ENV=preview; every /api call is answered by this script, so no
// website is scanned and no database is touched.
//
//   A  site 1 succeeds, site 2 hits an expired RankFix session -> run stops,
//      site 2 is stored as "to retest", nothing else is touched.
//   B  tab closed and reopened -> results still there (per QA commit).
//   C  resume -> site 2 is scanned again (not skipped); site 3 loses the
//      connection once ("Failed to fetch") and is retried on the same site;
//      "Stop na huidige scan" during site 4 stops after site 4.
//   D  login gone -> run stops BEFORE scanning site 5 (no scan call made).
//   E  JSON export: one row per host, no duplicates, statuses correct.
//
// Run: RF_BASE=http://127.0.0.1:3123 CHROME_EXECUTABLE_PATH=/path/to/chrome node tests/manual/testlab-stop-resume.browser.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const BASE = process.env.RF_BASE || "http://127.0.0.1:3123";
const SHA = "a".repeat(40);
const fx = (p) => JSON.parse(readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8"));
const rounds = ["testlab-96/round-a.json", "testlab-96/round-b.json", "testlab-96/round-c-nieuw.json", "testlab-96/round-d-nieuw.json", "testlab-144/round-e-service-retail.json", "testlab-144/round-f-service-retail.json"].map(fx);
const sites = rounds.flatMap((r) => r.sites.map((s) => ({ host: s.hosts[0], name: s.name, country: s.country, expected: s.expected, group: s.group, round: r.id })));
assert.equal(sites.length, 144);
const H = sites.slice(0, 5).map((s) => s.host);

const state = { loggedIn: true, scanCalls: {}, behaviour: {}, aborted: new Set() };
const respond = (req, body, status = 200) => req.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
const ok = (host) => ({ success: true, scanId: `scan-${host}`, overallScore: 88, seo: { score: 90 }, geo: { score: 85 }, sectorProfile: { sector: "ecommerce", confidenceScore: 80 } });

const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
// Capture the export file instead of a real download.
await page.evaluateOnNewDocument(() => { const orig = URL.createObjectURL; URL.createObjectURL = (b) => { b.text().then((t) => { window.__lastExport = t; }); return orig(b); }; });
await page.setRequestInterception(true);
page.on("request", async (req) => {
  const url = new URL(req.url());
  if (!url.pathname.startsWith("/api/")) return req.continue();
  if (url.pathname === "/api/testlab/catalog") return respond(req, { sites, count: 144, catalogId: "baseline", categoryCounts: { webshops: 8, other: 136 }, runtime: { commitSha: SHA, environment: "preview" } });
  if (url.pathname === "/api/scan/version") return respond(req, { commitSha: SHA, environment: "preview" });
  if (url.pathname === "/api/auth/me") return respond(req, { user: state.loggedIn ? { id: "qa" } : null });
  if (url.pathname === "/api/scan") {
    const host = new URL(JSON.parse(req.postData()).url).host;
    state.scanCalls[host] = (state.scanCalls[host] || 0) + 1;
    const b = state.behaviour[host] || "success";
    if (b === "session") return respond(req, { code: "SESSION_EXPIRED", incident: { attribution: "rankfix_session", traceId: "rf-t1", originHttpStatus: null, apiHttpStatus: 401, phase: "session" } }, 401);
    if (b === "drop-once" && !state.aborted.has(host)) { state.aborted.add(host); return req.abort("connectionreset"); }
    if (b === "slow") { await new Promise((r) => setTimeout(r, 4000)); return respond(req, ok(host)); }
    return respond(req, ok(host));
  }
  return respond(req, {});
});
const statusText = () => page.$eval(".rf-lab-status", (e) => e.textContent);
const clickButton = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(l)); if (!b) throw new Error("button not found: " + l); b.click(); }, label);
const primaryText = () => page.$eval(".rf-lab-primary", (e) => e.textContent);
const stat = (i) => page.$$eval(".rf-lab-stat", (e, i) => e[i].textContent, i);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const waitStatus = async (re, ms = 60000) => { await page.waitForFunction((s) => new RegExp(s).test(document.querySelector(".rf-lab-status")?.textContent || ""), { timeout: ms }, re.source); return statusText(); };
const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), "rankfix-qa-testlab-144:" + SHA);
const log = [];

// A
await page.goto(`${BASE}/dashboard/testlab`);
// The catalog answer of #206 names the catalog; the notice counts webshops and others.
await waitStatus(/Klaar\. \d+ webshops en \d+ andere websites/);
state.behaviour[H[1]] = "session";
await clickButton("Start test");
let s = await waitStatus(/RankFix meldde login/);
let rows = await stored();
log.push({ phase: "A", status: s, rows: rows.map((r) => `${r.host}:${r.status}${r.pending ? "(opnieuw)" : ""}`) });
assert.deepEqual(rows.map((r) => r.host), [H[0], H[1]]);
assert.equal(rows[0].status, "succes");
assert.equal(rows[1].status, "login");
assert.equal(rows[1].pending, true);
assert.equal(rows[1].incident?.traceId, "rf-t1");
assert.equal(state.scanCalls[H[2]] || 0, 0, "run must stop at the RankFix-side failure");

// B
await page.reload();
await waitStatus(/Klaar\./);
rows = await stored();
assert.equal(rows.length, 2, "results survive closing/reopening the tab");
assert.match(await primaryText(), /Doorgaan met resterende/);
assert.match(await stat(1), /^1\D/, "only the finished site counts as treated");

// C
state.behaviour[H[1]] = "success";
state.behaviour[H[2]] = "drop-once";
state.behaviour[H[3]] = "slow";
await page.click(".rf-lab-primary");
await waitStatus(new RegExp(H[3].replace(/\./g, "\\.") + "|verbinding met RankFix"), 60000);
// Wait until site 4 is being scanned, then request a stop.
for (let i = 0; i < 120 && !(state.scanCalls[H[3]] > 0); i++) await pause(500);
await clickButton("Stop na huidige scan");
await page.waitForFunction(() => !document.querySelector(".rf-lab-primary")?.disabled, { timeout: 60000 });
rows = await stored();
log.push({ phase: "C", calls: { ...state.scanCalls }, rows: rows.map((r) => `${r.host}:${r.status}`) });
assert.equal(state.scanCalls[H[1]], 2, "the pending site is scanned again on resume");
assert.equal(state.scanCalls[H[2]], 2, "lost connection: same site retried once");
assert.equal(state.scanCalls[H[3]], 1);
assert.equal(state.scanCalls[H[4]] || 0, 0, "stop after the current scan");
assert.deepEqual(rows.map((r) => [r.host, r.status]), [[H[0], "succes"], [H[1], "succes"], [H[2], "succes"], [H[3], "succes"]]);
assert.equal(new Set(rows.map((r) => r.host)).size, rows.length, "no duplicate rows");

// D
state.loggedIn = false;
await page.click(".rf-lab-primary");
s = await waitStatus(/RankFix meldde login/);
rows = await stored();
assert.equal(state.scanCalls[H[4]] || 0, 0, "no scan without a valid RankFix session");
assert.equal(rows.find((r) => r.host === H[4])?.pending, true);
log.push({ phase: "D", status: s });

// E
await clickButton("Exporteer JSON");
await page.waitForFunction(() => Boolean(window.__lastExport), { timeout: 10000 });
const exported = JSON.parse(await page.evaluate(() => window.__lastExport));
assert.equal(exported.commitSha, SHA);
assert.equal(exported.sites.length, 144);
assert.equal(new Set(exported.sites.map((x) => x.host)).size, 144);
assert.equal(exported.sites.filter((x) => x.result?.status === "succes").length, 4);
assert.equal(exported.sites.find((x) => x.host === H[4]).result.pending, true);
log.push({ phase: "E", exported: exported.sites.length, succes: 4 });

await browser.close();
console.log(JSON.stringify(log, null, 1));
console.log("TESTLAB_STOP_RESUME_OK");
