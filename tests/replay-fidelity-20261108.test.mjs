// Replay fidelity (8 Nov 2026) and two false-positive guards.
// The replay answers only what was recorded; anything else is "not recorded" and
// RankFix reports it as "niet bevestigd", never as an invented 404.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replayResponse, failedPageRoute, NOT_RECORDED } from "./scan-matrix/replay-routes.mjs";
import { linkOutcome } from "../lib/link-status.ts";
import { classifyNonContentPage } from "../lib/page-gate.ts";
import { readProcessResult } from "./helpers/process-result.mjs";

const routes = new Map([
  ["r.test/ok", { status: 200, html: "<html><body>ok</body></html>" }],
  ["r.test/weg", failedPageRoute({ httpStatus: 404 })],
  ["r.test/verdwenen", failedPageRoute({ httpStatus: 410 })],
  ["r.test/half", failedPageRoute({ httpStatus: null })],
  ["r.test/geen-audit", failedPageRoute({ httpStatus: 200 })],
  ["r.test/oud", { status: 301, location: "https://r.test/nergens" }],
]);
const notRecorded = (path) => assert.throws(() => replayResponse(routes, `https://r.test${path}`, "honest"), (e) => e.cause?.code === NOT_RECORDED, path);

test("recorded answers are kept: 200, real 404 and real 410", () => {
  assert.equal(replayResponse(routes, "https://r.test/ok", "honest").status, 200);
  assert.equal(replayResponse(routes, "https://r.test/weg", "honest").status, 404);
  assert.equal(replayResponse(routes, "https://r.test/verdwenen", "honest").status, 410);
});

test("an unrecorded URL or a recorded failure without status is 'not recorded', never 404", () => {
  notRecorded("/nooit-opgenomen");
  notRecorded("/half");
  notRecorded("/geen-audit");
  assert.equal(replayResponse(routes, "https://r.test/nooit-opgenomen", "legacy404").status, 404, "old behaviour only on request");
});

test("a redirect to an unrecorded page: the redirect is replayed, the target is not recorded", () => {
  const r = replayResponse(routes, "https://r.test/oud", "honest");
  assert.equal(r.status, 301);
  notRecorded(new URL(r.headers.get("location")).pathname);
  assert.equal(linkOutcome({ url: "https://r.test/oud", status: null, error: true }), "unconfirmed", "no answer is never a broken link");
});

test("normal content that says 'niet gevonden' is not a soft 404", () => {
  const text = "Garage Noord in Groningen: APK, onderhoud en banden. Uw gewenste onderdeel niet gevonden in onze webshop? Bel ons, dan bestellen wij het voor u. " + "Wij helpen u graag met onderhoud en reparatie van alle merken. ".repeat(20);
  assert.equal(classifyNonContentPage({ title: "Onderdelen bestellen | Garage Noord", text })?.kind ?? null, null);
  assert.equal(classifyNonContentPage({ title: "Pagina niet gevonden", text: "De pagina die u zoekt bestaat niet." })?.kind, "error", "a real not-found page stays an error");
});

test("route: a link that answers 405 to HEAD but 200 to GET is not broken (RankFix checks links with GET)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rf-head-"));
  const script = join(dir, "run.mjs");
  const home = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Voorbeeld | Installateur</title><meta name="description" content="Voorbeeld installeert warmtepompen in de regio."></head><body><h1>Voorbeeld</h1><nav><a href="/diensten">Diensten</a></nav><p>${"Wij installeren warmtepompen en verzorgen onderhoud. ".repeat(30)}</p></body></html>`;
  writeFileSync(script, `
const methods = [];
globalThis.fetch = async (i, init = {}) => { const u = new URL(typeof i === "string" ? i : i.url); const method = String(init.method || (typeof i === "object" && i.method) || "GET").toUpperCase(); if (u.pathname === "/diensten") methods.push(method);
  if (u.host !== "head.test") return new Response("nf", { status: 404 });
  if (u.pathname === "/") return new Response(${JSON.stringify(home)}, { status: 200, headers: { "content-type": "text/html" } });
  if (u.pathname === "/diensten") return method === "HEAD" ? new Response(null, { status: 405 }) : new Response("<html><head><title>Diensten</title></head><body>" + "Onze diensten voor warmtepompen. ".repeat(40) + "</body></html>", { status: 200, headers: { "content-type": "text/html" } });
  return new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://head.test/", mode: "both", language: "nl" }) }))).json();
const c = (j.seo?.checks || []).find((x) => x.key === "broken_links") || {};
console.log("RESULT " + JSON.stringify({ status: c.status, links: (c.links || []).map((l) => [l.url, l.outcome]), methods }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  const r = readProcessResult(out, "RESULT ", script);
  assert.ok(!r.links.some(([url]) => url.endsWith("/diensten")), JSON.stringify(r));
  assert.ok(r.methods.length > 0 && !r.methods.includes("HEAD"), "links are checked with GET: " + JSON.stringify(r.methods));
});
