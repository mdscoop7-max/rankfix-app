// Phase 1 (7 Nov 2026): scanner reliability 0-10, separate from the SEO/GEO score,
// recomputable from the report JSON. A high reliability without evidence is impossible.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeScanReliability } from "../lib/scan-reliability.ts";
import { readProcessResult } from "./helpers/process-result.mjs";

const strong = () => ({
  httpStatus: 200,
  sectorProfile: { sector: "health_wellness", key: "dentist", confidenceScore: 90 },
  websiteProfile: { operatingRole: { role: "own_service", independentSources: 3, counterEvidence: [], sectorCap: null } },
  coverage: { coveragePercent: 100, unableToConfirm: 0 },
  scoreModel: { evidenceLevel: "complete" },
  rendering: { completeness: "complete", mode: "raw_html", javascriptExecuted: false, botProtection: null },
  multiPage: { coverageDimensions: { pages: { selected: 10, fetched: 10 } } },
  selfCheck: { consistent: true, corrections: [], reliability: "high" },
  access: { rankfixBlocked: false },
  recovery: { limitedScope: false },
});

test("complete, corroborated evidence gives 10; components add up to the score", () => {
  const r = computeScanReliability(strong());
  assert.equal(r.score, 10);
  assert.equal(r.level, "hoog");
  assert.equal(r.components.reduce((t, c) => t + c.max, 0), 10);
  assert.ok(r.components.every((c) => c.basis && c.reason), "every component names its basis");
});

test("no high reliability without evidence: each cap holds", () => {
  const unknown = strong(); unknown.sectorProfile = { sector: "unknown", confidenceScore: 0 };
  assert.ok(computeScanReliability(unknown).score <= 7);
  const probable = strong(); probable.sectorProfile.confidenceScore = 70; probable.websiteProfile.operatingRole.independentSources = 1;
  assert.ok(computeScanReliability(probable).score <= 7.5);
  const insufficient = strong(); insufficient.scoreModel.evidenceLevel = "insufficient";
  assert.ok(computeScanReliability(insufficient).score <= 6);
  const shell = strong(); shell.rendering.completeness = "render_incomplete";
  assert.ok(computeScanReliability(shell).score <= 6);
  const blocked = strong(); blocked.access.rankfixBlocked = true;
  assert.ok(computeScanReliability(blocked).score <= 3);
});

test("the reliability is independent of the website's SEO/GEO score", () => {
  const good = { ...strong(), overallScore: 98 }, bad = { ...strong(), overallScore: 31 };
  assert.equal(computeScanReliability(good).score, computeScanReliability(bad).score);
});

test("route: the stored/returned reliability equals an independent recomputation from the JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "rf-rel-"));
  const script = join(dir, "run.mjs");
  const home = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tandartspraktijk Dorp | Tandarts in Dorp</title><meta name="description" content="Tandartspraktijk Dorp: tandarts voor controle, mondhygiëne en implantaten in Dorp."></head><body><h1>Tandarts in Dorp</h1><p>${"Wij zorgen voor gezonde tanden met persoonlijke aandacht. ".repeat(12)}</p><a href="/contact">Contact</a></body></html>`;
  writeFileSync(script, `
const home = ${JSON.stringify(home)};
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); return u.host === "rel.test" && u.pathname === "/" ? new Response(home, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const { computeScanReliability } = await import(${JSON.stringify(new URL("../lib/scan-reliability.ts", import.meta.url).href)});
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://rel.test/", mode: "both", language: "nl" }) }))).json();
const again = computeScanReliability(JSON.parse(JSON.stringify(j)));
console.log("RESULT " + JSON.stringify({ stored: j.scanReliability?.score, again: again.score, version: j.scanReliability?.version, seoGeo: j.overallScore, caps: j.scanReliability?.caps }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  const r = readProcessResult(out, "RESULT ", script);
  assert.equal(typeof r.stored, "number", JSON.stringify(r));
  assert.equal(r.stored, r.again);
  assert.equal(r.version, "reliability-1.0");
  assert.ok(r.stored <= 7.5, "one homepage: sector only probable, so never 'hoog'");
});
