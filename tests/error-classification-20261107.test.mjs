// F1-F4 (7 Nov 2026): one error classification for links, the scanned page and the
// TestLab. Only response data proves an error; temporary failures and refusals are
// reported, never penalised; a URL pattern alone proves nothing. Simulated
// responses only (no network, no AI).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkOutcome, linkEvidence, brokenLinkSummary, brokenLinkRecords } from "../lib/link-status.ts";
import { attributeIncident } from "../lib/scan-incident.ts";
import { classifyScanAnswer } from "../lib/testlab-outcome.mjs";
import { failureCategory, compareSector } from "../scripts/testlab/labels.mjs";
import { readProcessResult } from "./helpers/process-result.mjs";
import sector80 from "./fixtures/testlab-144/catalog-sector-80-20261106.json" with { type: "json" };

const link = (status, extra = {}) => ({ url: "https://x.test/pagina", status, error: false, finalUrl: "https://x.test/pagina", ...extra });

test("every HTTP status gets an explicit outcome; 400/405/408 are never silently healthy", () => {
  const expected = { 200: "ok", 400: "unconfirmed", 401: "unconfirmed", 402: "unconfirmed", 403: "unconfirmed", 404: "missing", 405: "unconfirmed", 408: "temporary", 410: "missing", 429: "unconfirmed", 500: "temporary", 501: "temporary", 502: "temporary", 503: "temporary", 504: "temporary" };
  for (const [status, outcome] of Object.entries(expected)) assert.equal(linkOutcome(link(Number(status), { attempts: 1 })), outcome, `HTTP ${status} (one measurement)`);
});

test("5xx is only a proven server error after two measurements, and never for 502/503/504", () => {
  assert.equal(linkOutcome(link(500, { attempts: 2 })), "server_error");
  assert.equal(linkOutcome(link(500, { attempts: 1 })), "temporary", "one measurement (Retry-After too long) is not proof");
  assert.equal(linkOutcome(link(200, { url: "https://x.test/oud", finalUrl: "https://x.test/pagenotfound" })), "ok", "a redirect path alone does not prove a missing response");
  for (const s of [502, 503, 504]) assert.equal(linkOutcome(link(s, { attempts: 2 })), "temporary");
  assert.match(linkEvidence(link(503, { retryAfterSeconds: 120 })).cause, /Retry-After 120/);
});

test("no answer, a challenge page, a redirect limit or a URL pattern alone prove nothing", () => {
  assert.equal(linkOutcome({ url: "https://x.test/a", status: null, error: true }), "unconfirmed");
  assert.equal(linkOutcome(link(404, { challenged: true })), "unconfirmed", "a 404 carrying a bot-check page");
  assert.equal(linkOutcome(link(301)), "unconfirmed");
  assert.equal(linkOutcome(link(200, { url: "https://x.test/404", finalUrl: "https://x.test/404" })), "ok", "normal HTTP 200 content remains usable despite its URL name");
  assert.equal(linkOutcome(link(200, { url: "https://x.test/pagenotfound", softNotFound: true })), "missing", "the response content proves it");
  assert.equal(linkOutcome(link(403, { accountLink: true })), "skipped");
});

test("evidence strength per outcome; only proven errors cost points", () => {
  assert.equal(linkEvidence(link(404)).strength, "bewezen");
  assert.equal(linkEvidence(link(503)).strength, "tijdelijk");
  assert.equal(linkEvidence(link(429)).strength, "toegang_beperkt");
  assert.equal(linkEvidence(link(400)).strength, "niet_bevestigd");
  const ok = Array.from({ length: 20 }, (_, i) => link(200, { url: `https://x.test/p${i}`, finalUrl: `https://x.test/p${i}` }));
  const noProof = brokenLinkSummary([...ok, link(503), link(408), link(429), link(400), link(405)]);
  assert.notEqual(noProof.status, "warning", "temporary and refused links are no proven error");
  assert.equal(noProof.temporary, 2);
  const proven = brokenLinkSummary([...ok, link(404)]);
  assert.equal(proven.status, "warning");
  assert.ok(proven.points < 5);
  const records = brokenLinkRecords([link(404), link(503)], "https://x.test/");
  assert.deepEqual(records.map((r) => [r.outcome, r.proven, r.evidenceStrength]), [["missing", true, "bewezen"], ["temporary", false, "tijdelijk"]]);
});

test("one attribution for the scanned page: site, network, RankFix", () => {
  assert.equal(attributeIncident(422, "SITE_RATE_LIMITED"), "target_site", "the website's own 429 is not a RankFix quota");
  assert.equal(attributeIncident(422, "SITE_DOMAIN_NOT_FOUND"), "target_site");
  assert.equal(attributeIncident(422, "SITE_TLS_INVALID"), "target_site", "only a provable certificate fault");
  assert.equal(attributeIncident(502, "FETCH_TLS"), "network", "a handshake failure is not proven misconfiguration");
  assert.equal(attributeIncident(502, "FETCH_DNS"), "network", "a temporary resolver failure");
  assert.equal(attributeIncident(504, "FETCH_TIMEOUT"), "network");
  assert.equal(attributeIncident(502, "REDIRECT_LOOP"), "network");
  assert.equal(attributeIncident(503, "SCAN_TIMEOUT"), "rankfix_infrastructure", "RankFix's own time limit");
  assert.equal(attributeIncident(429, "SCAN_RATE_LIMIT"), "rankfix_quota");
});

test("TestLab and scripts use the scanner's attribution, also without incident evidence", () => {
  const answer = (status, code) => ({ status, ok: false, data: { code } });
  assert.equal(classifyScanAnswer(answer(422, "SITE_RATE_LIMITED")), "site_geblokkeerd");
  assert.equal(failureCategory(422, "SITE_RATE_LIMITED"), "site_blocked");
  assert.equal(classifyScanAnswer(answer(502, "FETCH_TLS")), "netwerk_website");
  assert.equal(failureCategory(502, "FETCH_TLS"), "network");
  assert.equal(classifyScanAnswer(answer(503, "SCAN_TIMEOUT")), "infrastructuur");
  assert.equal(failureCategory(503, "SCAN_TIMEOUT"), "infrastructure");
  assert.equal(failureCategory(403, ""), classifyScanAnswer(answer(403, "")) === "scan_mislukt" ? "site_or_input_error" : "?", "a code-less 403 is a failed scan, not a RankFix login");
});

test("Sector80: retail labels count as webshops (was 0 of 12)", () => {
  const webshops = sector80.sites.filter((s) => s.expected === "ecommerce" || compareSector(s.expected, {}).expectedSector === "ecommerce").length;
  assert.ok(webshops >= 10, `retail labels counted: ${webshops}`);
});

function scan(responses) {
  const dir = mkdtempSync(join(tmpdir(), "rf-err-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const responses = ${JSON.stringify(responses)};
const seen = {};
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); if (u.host !== "err.test") return new Response("nf", { status: 404 });
  seen[u.pathname] = (seen[u.pathname] || 0) + 1; const r = responses[u.pathname]; if (!r) return new Response("<html><head><title>Niet gevonden</title></head><body>404</body></html>", { status: 404, headers: { "content-type": "text/html" } });
  const step = Array.isArray(r) ? r[Math.min(seen[u.pathname] - 1, r.length - 1)] : r;
  return new Response(step.body || "<html><head><title>Pagina</title></head><body>" + "Inhoud van de pagina. ".repeat(40) + "</body></html>", { status: step.status, headers: { "content-type": "text/html", ...(step.headers || {}) } }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://err.test/", mode: "both", language: "nl" }) }))).json();
const c = (j.seo?.checks || []).find((x) => x.key === "broken_links") || {};
console.log("RESULT " + JSON.stringify({ status: c.status, points: c.points, links: Object.fromEntries((c.links || []).map((l) => [new URL(l.url).pathname, { outcome: l.outcome, strength: l.evidenceStrength, attempts: l.attempts, retryAfter: l.retryAfterSeconds, href: l.originalHref, referring: l.referringPage }])), seen }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
}

test("route: every link category is classified from its response, with evidence; only proven errors cost points", () => {
  const nav = ["weg", "onderhoud", "drukte", "ophalen", "fout", "verboden", "limiet", "niet-toegestaan", "kapot", "ok"].map((p) => `<a href="/${p}">${p}</a>`).join(" ");
  const home = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Voorbeeld Installatie | Warmtepompen</title><meta name="description" content="Voorbeeld installeert warmtepompen en verzorgt onderhoud in de regio."></head><body><h1>Voorbeeld Installatie</h1><nav>${nav}</nav><p>${"Wij installeren warmtepompen en verzorgen onderhoud. ".repeat(30)}</p></body></html>`;
  const r = scan({
    "/": { status: 200, body: home }, "/ok": { status: 200 },
    "/weg": { status: 404 },
    "/onderhoud": { status: 503, headers: { "retry-after": "120" } },
    "/drukte": [{ status: 503, headers: { "retry-after": "1" } }, { status: 503 }],
    "/ophalen": { status: 408 }, "/fout": { status: 400 }, "/niet-toegestaan": { status: 405 },
    "/verboden": { status: 403 }, "/limiet": { status: 429 },
    "/kapot": [{ status: 500 }, { status: 500 }],
  });
  const L = r.links || {};
  assert.equal(L["/weg"]?.outcome, "missing", JSON.stringify(r));
  assert.equal(L["/weg"]?.strength, "bewezen");
  assert.equal(L["/weg"]?.href, "/weg", "the original href is kept");
  assert.equal(L["/weg"]?.referring, "https://err.test/");
  assert.equal(L["/onderhoud"]?.outcome, "temporary");
  assert.equal(L["/onderhoud"]?.attempts, 1, "Retry-After 120 s is not waited for");
  assert.equal(L["/onderhoud"]?.retryAfter, 120);
  assert.equal(L["/drukte"]?.attempts, 2, "Retry-After 1 s: one bounded retry");
  assert.equal(L["/kapot"]?.outcome, "server_error", "500 on two measurements");
  for (const p of ["/ophalen", "/fout", "/niet-toegestaan", "/verboden", "/limiet"]) assert.notEqual(L[p]?.outcome, undefined, `${p} must be reported, not silently ok`);
  assert.equal(L["/ophalen"].outcome, "temporary");
  for (const p of ["/fout", "/niet-toegestaan", "/verboden", "/limiet"]) assert.equal(L[p].outcome, "unconfirmed", p);
  assert.equal(r.status, "warning", "a proven 404 and a repeated 500 are real findings");
});
