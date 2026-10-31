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

// --- PDF P9 part 2: sector schema, H1 copies, HTML size, libraries, YMYL, hreflang ---
import { distinctH1s, htmlByteSize, detectLibraryVersions, isYmylSector, ymylExpertiseEvidence } from "../lib/page-quality-signals.ts";
import { sectorSchemaType, isGenericSchemaAdvice } from "../lib/sector-schema.ts";

test("sector schema: type follows sector/key and multilingual wording, never the domain", () => {
  assert.equal(sectorSchemaType({ sector: "beauty", key: "hair_salon", identityText: "Kapsalon Utrecht" }), "HairSalon");
  assert.equal(sectorSchemaType({ sector: "health_wellness", key: "health_wellness", identityText: "Krankenhaus Nord – Klinikum" }), "Hospital");
  assert.equal(sectorSchemaType({ sector: "health_wellness", key: "health_wellness", identityText: "Fysiotherapie praktijk" }), null);
  assert.equal(sectorSchemaType({ sector: "transport_travel", key: "passenger_transport", identityText: "Compagnia aerea – prenota voli" }), "Airline");
  // A rail or bus operator is not an airline.
  assert.equal(sectorSchemaType({ sector: "transport_travel", key: "passenger_transport", identityText: "Treinkaartjes en reisinformatie" }), null);
  assert.equal(sectorSchemaType({ sector: "real_estate", key: "real_estate", identityText: "Huurwoningen in heel Nederland" }), null);
  assert.equal(sectorSchemaType({ sector: "real_estate", key: "real_estate", identityText: "Immobilienmakler in Köln" }), "RealEstateAgent");
  assert.equal(sectorSchemaType({ sector: "automotive", key: "car_repair", identityText: "Garage" }), "AutoRepair");
  assert.equal(isGenericSchemaAdvice("Organization + WebSite"), true);
  assert.equal(isGenericSchemaAdvice("GovernmentOrganization + WebSite"), false);
  assert.equal(isGenericSchemaAdvice("Product"), false);
});

test("H1 copies, HTML size, library versions and YMYL evidence", () => {
  assert.deepEqual(distinctH1s(["Design studio", "Design  studio", "design studio"]).distinct.length, 1);
  assert.equal(distinctH1s(["Design studio", "Design studio"]).duplicateCopies, 1);
  assert.equal(distinctH1s(["A", "B"]).distinct.length, 2);
  assert.equal(htmlByteSize("é"), 2);
  const libs = detectLibraryVersions(`<script src="https://code.jquery.com/jquery-3.4.1.min.js"></script><script src="/js/jquery-ui-1.12.1.custom.min.js"></script><script src="/wp-includes/js/jquery/jquery-migrate.min.js?ver=3.4.1"></script><script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>`);
  assert.deepEqual(libs.map((l) => `${l.name} ${l.version} ${l.outdated}`).sort(), ["jQuery 3.4.1 true", "jQuery UI 1.12.1 true"]);
  assert.deepEqual(detectLibraryVersions(`<script src="/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"></script>`).map((l) => l.outdated), [false]);
  assert.deepEqual(detectLibraryVersions(`<script src="/app.js?v=1.2.3"></script>`), []);
  assert.equal(isYmylSector("health_wellness", "dentist"), true);
  assert.equal(isYmylSector("financial_services", "financial_payments"), true);
  assert.equal(isYmylSector("beauty", "hair_salon"), false);
  assert.equal(ymylExpertiseEvidence({ text: "Onze medisch specialisten. BIG-registratie en NIAZ-accreditatie.", navigation: ["Over ons", "Patiënten"], schemaTypes: ["Hospital"] }).length, 4);
  assert.equal(ymylExpertiseEvidence({ text: "Welkom", navigation: ["Home"], schemaTypes: [] }).length, 0);
});

test("route: Framer H1 copies, large HTML, outdated jQuery, YMYL hospital, hreflang proven alternate", () => {
  const dir = mkdtempSync(join(tmpdir(), "rf-p9b-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const body = (lang, extra) => '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ziekenhuis Noord | Universitair medisch centrum</title><meta name="description" content="Ziekenhuis Noord is een universitair medisch centrum voor patiëntenzorg, onderzoek en onderwijs in de regio."><link rel="canonical" href="https://p9b.test/"><script src="https://code.jquery.com/jquery-3.4.1.min.js"></script></head><body><nav><a href="/patienten">Patiënten</a><a href="/over-ons">Over ons</a><a href="/en/">English</a></nav><h1>Ziekenhuis Noord</h1><h1>Ziekenhuis Noord</h1><h1>Ziekenhuis Noord</h1><p>' + 'Onze medisch specialisten bieden topklinische zorg. NIAZ-geaccrediteerd ziekenhuis. '.repeat(30) + '</p>' + extra + '</body></html>';
const S = { "/": body("nl", '<script type="application/json">' + "x".repeat(2200000) + '</script>'), "/en/": body("en", "") };
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); return u.host === "p9b.test" && S[u.pathname] ? new Response(S[u.pathname], { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).pathname)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://p9b.test/", mode: "both", language: "nl" }) }))).json();
const all = [...j.seo.checks, ...j.geo.checks, ...(j.security?.checks || j.securityEngine?.checks || [])];
const by = (k) => all.find((c) => c.key === k) || {};
const pick = (k) => [by(k).status, by(k).points, by(k).maxPoints, by(k).message || "", by(k).fix || ""];
console.log("RESULT " + JSON.stringify({ sector: j.sectorProfile?.sector, h1: pick("h1"), size: pick("html_size"), lib: pick("security_outdated_libraries"), author: pick("author"), hreflang: pick("hreflang"), schema: pick("schema"), actions: (j.securityAccessibilityActions || []).map((a) => a.impact + ":" + a.key) }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url).pathname, encoding: "utf8", timeout: 240000 });
  const line = out.stdout.split("\n").find((l) => l.startsWith("RESULT "));
  assert.ok(line, out.stderr || out.stdout);
  const r = JSON.parse(line.slice(7));
  assert.equal(r.h1[0], "pass"); assert.match(r.h1[3], /3 identieke kopieën/);
  assert.deepEqual(r.size.slice(0, 3), ["warning", 1, 3]); assert.match(r.size[3], /2\.\d MB/);
  assert.equal(r.lib[0], "warning"); assert.match(r.lib[3], /jQuery 3\.4\.1/);
  assert.equal(r.sector, "health_wellness");
  assert.equal(r.author[0], "pass"); assert.match(r.author[3], /YMYL/);
  assert.equal(r.hreflang[0], "warning"); assert.match(r.hreflang[3], /en: /);
  assert.match(r.schema[4], /Hospital/);
  // P10: proven findings reach the action block, highest impact first.
  assert.ok(r.actions.includes("medium:security_outdated_libraries"), r.actions.join(","));
  assert.equal(r.actions[0].split(":")[0], "high");
});
