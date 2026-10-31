// 31 Oct (PDF P9): title and Open Graph rules through the real scan route.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isGenericBrandTitle, invisibleTitleCharacters } from "../lib/report-quality.ts";

test("generic 'Home | Brand' titles and invisible characters are recognised", () => {
  assert.equal(isGenericBrandTitle("Home | BrainWash Kappers", "brainwash-kappers.nl"), true);
  assert.equal(isGenericBrandTitle("Welkom - Garage Jansen", "garagejansen.nl"), true);
  assert.equal(isGenericBrandTitle("Banden | Garage Jansen", "garagejansen.nl"), false);
  assert.equal(isGenericBrandTitle("Garage Jansen", "garagejansen.nl"), false);
  assert.equal(invisibleTitleCharacters("Klinik für Neuro­logie"), 1);
  assert.equal(invisibleTitleCharacters("Klinik für Neurologie"), 0);
});

test("route: generic title, soft hyphen, og:image:url alias, og:url ≠ canonical and og:type=article", () => {
  const dir = mkdtempSync(join(tmpdir(), "rf-p9-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const page = (title, head) => '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + '</title><meta name="description" content="Kapsalon in Utrecht voor knippen, kleuren en stylen. Maak eenvoudig online een afspraak bij onze kappers."><link rel="canonical" href="https://p9.test/">' + head + '</head><body><nav><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></nav><h1>Kapsalon</h1><p>' + 'Knippen en kleuren in Utrecht. '.repeat(40) + '</p></body></html>';
const S = {
  "/": page("Home | P9", '<meta property="og:title" content="P9"><meta property="og:description" content="Kapsalon"><meta property="og:image:url" content="https://p9.test/a.jpg"><meta property="og:url" content="https://p9.test/?ref=og"><meta property="og:type" content="article">'),
};
let host = "p9.test";
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); return u.host === host && S[u.pathname] ? new Response(S[u.pathname], { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).pathname)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://p9.test/", mode: "both", language: "nl" }) }))).json();
const by = (k) => j.seo.checks.find((c) => c.key === k);
console.log("RESULT " + JSON.stringify({ title: [by("title").status, by("title").points, by("title").message], social: [by("social").status, by("social").message] }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url).pathname, encoding: "utf8", timeout: 240000 });
  const line = out.stdout.split("\n").find((l) => l.startsWith("RESULT "));
  assert.ok(line, out.stderr || out.stdout);
  const r = JSON.parse(line.slice(7));
  assert.deepEqual(r.title.slice(0, 2), ["warning", 8]); assert.match(r.title[2], /algemeen woord en de merknaam/);
  assert.equal(r.social[0], "warning");
  assert.doesNotMatch(r.social[1], /Ontbrekend: .*og:image/);
  assert.match(r.social[1], /og:url .* wijkt af van de canonical/);
  assert.match(r.social[1], /og:type=article/);
});
