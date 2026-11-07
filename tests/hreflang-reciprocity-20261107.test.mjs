// Fresh144 7 Nov 2026: hreflang stayed "not confirmed" on 13 of 30 sites only
// because alternates on other hosts were never checked, and self-only hreflang
// counted nothing. Through the real scan route with mocked sites (no network).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readProcessResult } from "./helpers/process-result.mjs";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(scenario) {
  const dir = mkdtempSync(join(tmpdir(), "rf-hreflang-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const scenario = ${JSON.stringify(scenario)};
const head = (lang, links) => '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Muziekwinkel Noord | Instrumenten en audio</title><meta name="description" content="Muziekwinkel Noord verkoopt gitaren, versterkers en studio-apparatuur met advies in onze winkel."><link rel="canonical" href="https://shop-nl.test/">' + links + '</head><body><h1>Muziekwinkel Noord</h1><p>Wij verkopen gitaren, versterkers en studio-apparatuur.</p><a href="/contact">Contact</a></body></html>';
const nl = '<link rel="alternate" hreflang="nl-nl" href="https://shop-nl.test/">';
const fr = '<link rel="alternate" hreflang="fr-fr" href="https://shop-fr.test/">';
const pages = {
  cross_ok: { "shop-nl.test/": head("nl", nl + fr), "shop-fr.test/": head("fr", nl + fr) },
  cross_missing: { "shop-nl.test/": head("nl", nl + fr), "shop-fr.test/": head("fr", fr) },
  cross_blocked: { "shop-nl.test/": head("nl", nl + fr) },
  self_only: { "shop-nl.test/": head("nl", nl + '<link rel="alternate" hreflang="x-default" href="https://shop-nl.test/">') },
}[scenario];
globalThis.fetch = async (i) => {
  const u = new URL(typeof i === "string" ? i : i.url);
  const body = pages[u.host + u.pathname];
  if (body) return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  if (scenario === "cross_blocked" && u.host === "shop-fr.test") return new Response("forbidden", { status: 403 });
  return new Response("nf", { status: 404 });
};
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://shop-nl.test/", mode: "both", language: "nl" }) }))).json();
const c = [...(j.seo?.checks || [])].find((x) => x.key === "hreflang") || {};
console.log("RESULT " + JSON.stringify([c.status, c.points, c.maxPoints, c.message || ""]));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
}

test("alternates on another domain that link back: hreflang proven (pass)", () => {
  const r = run("cross_ok");
  assert.equal(r[0], "pass", r[3]); assert.match(r[3], /andere domeinen/);
});

test("an alternate on another domain that does not link back: proven problem (warning)", () => {
  const r = run("cross_missing");
  assert.equal(r[0], "warning", r[3]); assert.match(r[3], /verwijst niet terug/);
});

test("an alternate that cannot be fetched (403) stays not confirmed: no invented verdict", () => {
  const r = run("cross_blocked");
  assert.equal(r[0], "unable_to_confirm", r[3]);
});

test("hreflang that only points at the page itself is reciprocal by definition (pass, no request)", () => {
  const r = run("self_only");
  assert.equal(r[0], "pass", r[3]); assert.match(r[3], /alleen naar deze pagina zelf/);
});
