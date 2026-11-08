// Phases A-D (8 Nov 2026, Codex 2 review of 97d8777).
// A: real measurements only: a retry passes the same challenge/error-page check; the
//    page sample settles a link without rewriting the probe's own status.
// B: a low-confidence pass never earns full points ("niet bevestigd", no penalty).
// C: holding and counter-evidence limits hold after the AI step and the webshop path.
// D: an HTTP 402 cause is named as a possibility, never a certainty.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkOutcome, linkEvidence } from "../lib/link-status.ts";
import { demoteLowConfidencePasses } from "../lib/scan-feedback.ts";
import { readProcessResult } from "./helpers/process-result.mjs";

test("A: the page sample settles an unanswered link without inventing an HTTP 200", () => {
  const link = { url: "https://x.test/a", status: null, error: true, verifiedBySample: { url: "https://x.test/a", status: 200 } };
  assert.equal(linkOutcome(link), "ok");
  assert.equal(link.status, null, "the probe's own measurement is kept");
  assert.match(linkEvidence(link).cause, /paginasteekproef \(HTTP 200\).*geen antwoord/);
  assert.equal(linkOutcome({ url: "https://x.test/b", status: 404, error: false, verifiedBySample: { url: "https://x.test/b", status: 200 } }), "missing", "a proven 404 is not overruled");
});

test("A: no invented measurements: a 5xx without an attempt count is one measurement", () => {
  assert.equal(linkOutcome({ url: "https://x.test/c", status: 500, error: false }), "temporary");
  assert.equal(linkOutcome({ url: "https://x.test/c", status: 500, error: false, attempts: 2 }), "server_error");
});

function scanLinks() {
  const dir = mkdtempSync(join(tmpdir(), "rf-a-"));
  const script = join(dir, "run.mjs");
  const home = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Voorbeeld | Installateur</title><meta name="description" content="Voorbeeld installeert warmtepompen in de regio."></head><body><h1>Voorbeeld</h1><nav><a href="/eerst-stil">Een</a> <a href="/stil-dan-fout">Twee</a></nav><p>${"Wij installeren warmtepompen en verzorgen onderhoud. ".repeat(30)}</p></body></html>`;
  writeFileSync(script, `
const seen = {};
const challenge = "<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing. Cloudflare Ray ID: 8a1b2c3d4e5f</body></html>";
const notFound = "<html><head><title>Pagina niet gevonden</title></head><body>De pagina die u zoekt bestaat niet.</body></html>";
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); if (u.host !== "a.test") return new Response("nf", { status: 404 });
  seen[u.pathname] = (seen[u.pathname] || 0) + 1;
  if (u.pathname === "/") return new Response(${JSON.stringify(home)}, { status: 200, headers: { "content-type": "text/html" } });
  // First probe gets no answer; the retry answers. The page sample (a third
  // request) gets no answer either, so only the probe's retry decides.
  if (seen[u.pathname] !== 2) throw new TypeError("fetch failed");
  if (u.pathname === "/eerst-stil") return new Response(challenge, { status: 404, headers: { "content-type": "text/html" } });
  return new Response(notFound, { status: 200, headers: { "content-type": "text/html" } }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://a.test/", mode: "both", language: "nl" }) }))).json();
const c = (j.seo?.checks || []).find((x) => x.key === "broken_links") || {};
console.log("RESULT " + JSON.stringify(Object.fromEntries((c.links || []).map((l) => [new URL(l.url).pathname, { outcome: l.outcome, attempts: l.attempts, source: l.source }]))));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
}

test("A route: a retry answer passes the challenge and soft-404 check like a first answer", () => {
  const r = scanLinks();
  assert.equal(r["/eerst-stil"]?.outcome, "unconfirmed", "a 404 carrying a bot-check page proves nothing: " + JSON.stringify(r));
  assert.equal(r["/stil-dan-fout"]?.outcome, "missing", "HTTP 200 with a not-found page is a soft 404: " + JSON.stringify(r));
  assert.equal(r["/stil-dan-fout"]?.attempts, 2, "two real measurements");
  assert.equal(r["/stil-dan-fout"]?.source, "probe");
});

test("B: a low-confidence pass is 'niet bevestigd' with 0 points; warnings and confident passes stay", () => {
  const checks = [
    { key: "sector_health_appointment", status: "pass", confidence: "low", points: 4, maxPoints: 4, message: "Een afspraak- of contactactie is bevestigd.", evidence: { url: "https://x.test/", found: true } },
    { key: "title", status: "pass", confidence: "high", points: 5, maxPoints: 5, message: "Titel aanwezig." },
    { key: "meta", status: "warning", confidence: "low", points: 2, maxPoints: 5, message: "Te kort." },
  ];
  assert.equal(demoteLowConfidencePasses(checks, "https://x.test/"), 1);
  assert.deepEqual(checks.map((c) => [c.status, c.points]), [["unable_to_confirm", 0], ["pass", 5], ["warning", 2]]);
  assert.match(checks[0].message, /^Niet bevestigd: .*geen aftrek/);
});

test("C: the role limit is re-applied after the AI step and the webshop path (source check)", () => {
  const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const ai = route.indexOf("const aiResult = await verifySectorWithAi(");
  const shop = route.indexOf("sectorProfile.confidenceScore = 88;");
  const reapply = route.indexOf("Phase C (8 Nov 2026): the holding and counter-evidence limits");
  assert.ok(ai > 0 && shop > 0 && reapply > shop && reapply > ai, "limit re-applied after both raises");
  assert.match(route.slice(reapply, reapply + 1600), /Tegenbewijs: /, "counter-evidence stays in the report");
});

test("D: the HTTP 402 message names possibilities, not a certainty", () => {
  const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /De oorzaak is vanuit RankFix niet vast te stellen; mogelijk is een hosting- of websiteabonnement niet actief/);
  assert.doesNotMatch(route, /meestal is het hosting- of websiteabonnement/);
});
