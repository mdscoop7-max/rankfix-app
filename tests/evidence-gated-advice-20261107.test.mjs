// P0-3 (7 Nov 2026): sector-specific advice needs its own evidence, after the final
// sector/role decision. Synthetic identities test the rules; no domains in code.
import test from "node:test";
import assert from "node:assert/strict";
import { schemaAdviceFor, gateSchemaCheck, gateTitleCheck, titleExample, brandFromTitle, countListedLocations } from "../lib/evidence-gated-advice.ts";

const id = (o) => ({ sector: "unknown", key: "unknown", label: "Sector niet bevestigd", confidence: 0, expectedType: null, ownLocalEvidence: false, pageSchemaTypes: [], ...o });
const gym = id({ sector: "fitness_sports", key: "fitness", label: "Sportschool & fitnessclub", confidence: 90, expectedType: "ExerciseGym", ownLocalEvidence: true });

test("a real gym with its own location details keeps ExerciseGym advice", () => {
  assert.deepEqual(schemaAdviceFor("ExerciseGym + WebSite", gym), { schema: "ExerciseGym + WebSite", gated: false, reason: null });
});

test("a gym directory/platform never gets ExerciseGym advice (Gymsearch-type)", () => {
  const r = schemaAdviceFor("ExerciseGym + WebSite", id({ sector: "service_marketplace", key: "comparison_platform", label: "Vergelijkingsplatform", confidence: 84 }));
  assert.equal(r.gated, true); assert.equal(r.schema, "Organization + WebSite"); assert.match(r.reason, /derden/);
});

test("unconfirmed sector, non-local business model or no own location details: no LocalBusiness subtype", () => {
  assert.equal(schemaAdviceFor("ExerciseGym + WebSite", { ...gym, confidence: 60 }).gated, true, "below 70% never");
  assert.equal(schemaAdviceFor("ExerciseGym + WebSite", { ...gym, confidence: 72 }).gated, false, "probable own trade that calls for this type");
  assert.equal(schemaAdviceFor("Dentist + WebSite", { ...gym, confidence: 72 }).gated, true, "another subtype needs a confirmed matching sector");
  const pharma = schemaAdviceFor("LocalBusiness", id({ sector: "manufacturing_industrial", key: "pharmaceutical_manufacturing", label: "Farmaceutische industrie", confidence: 88, expectedType: null }));
  assert.equal(pharma.gated, true); assert.match(pharma.reason, /geen lokale vestiging/);
  assert.equal(schemaAdviceFor("LocalBusiness", { ...gym, confidence: 76, ownLocalEvidence: false }).gated, true, "probable, generic LocalBusiness, no own location details");
  assert.equal(schemaAdviceFor("ExerciseGym + WebSite", { ...gym, confidence: 76, ownLocalEvidence: false }).gated, false, "probable own trade calls for this exact type");
  assert.equal(schemaAdviceFor("ExerciseGym + WebSite", { ...gym, ownLocalEvidence: false }).gated, false, "confirmed own trade: advise adding the type with its address");
  assert.equal(schemaAdviceFor("HairSalon + WebSite", gym).gated, true, "subtype must fit the confirmed sector");
});

test("non-local advice (Organization, OnlineStore) is never touched", () => {
  assert.equal(schemaAdviceFor("Organization + WebSite", id({})).gated, false);
  assert.equal(schemaAdviceFor("OnlineStore + WebSite", id({})).gated, false);
});

test("a deduction resting on the gated local premise is re-assessed when an entity schema is present", () => {
  const check = { key: "schema", status: "warning", points: 6, maxPoints: 12, message: "JSON-LD gevonden, maar geen herkenbaar relevant entity- of paginaschema voor deze lokale bedrijfspagina.", fix: "Relevante hoofdkeuze: ExerciseGym + WebSite." };
  const rec = gateSchemaCheck(check, "ExerciseGym + WebSite", id({ sector: "service_marketplace", key: "comparison_platform", label: "Platform", confidence: 84, pageSchemaTypes: ["Organization", "WebSite"] }));
  assert.equal(check.status, "pass"); assert.equal(check.points, 12);
  assert.equal(rec.applied, "Organization + WebSite"); assert.ok(check.evidence.adviceGate);
});

test("without any structured data the finding stays a warning, only the advice changes", () => {
  const check = { key: "schema", status: "warning", points: 0, maxPoints: 12, message: "Geen structured data gevonden voor deze lokale bedrijfspagina.", fix: "Relevante hoofdkeuze: LocalBusiness." };
  gateSchemaCheck(check, "LocalBusiness", id({}));
  assert.equal(check.status, "warning"); assert.equal(check.points, 0);
  assert.match(check.fix, /Organization \+ WebSite/); assert.doesNotMatch(check.fix, /LocalBusiness\./);
});

test("the title example never invents a trade or city (Organon-type 'Home | Brand')", () => {
  const check = { key: "title", status: "warning", message: "x", fix: 'Noem het belangrijkste aanbod of de plaats in de title, bijvoorbeeld "Kapper in Utrecht | Merk".' };
  gateTitleCheck(check, id({ sector: "manufacturing_industrial", key: "pharmaceutical_manufacturing", label: "Farmaceutische industrie", confidence: 88 }), brandFromTitle("Home | Organon"));
  assert.match(check.fix, /"Farmaceutische industrie \| Organon"/); assert.doesNotMatch(check.fix, /Kapper|Utrecht/);
  assert.equal(titleExample(id({}), "Merk"), "Belangrijkste aanbod | Merk");
  assert.equal(titleExample(gym, "FitClub"), "Sportschool & fitnessclub in [plaats] | FitClub");
});

import { spawnSync } from "node:child_process";
import { readProcessResult } from "./helpers/process-result.mjs";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function scan(home) {
  const dir = mkdtempSync(join(tmpdir(), "rf-gate-"));
  const script = join(dir, "run.mjs");
  writeFileSync(script, `
const home = ${JSON.stringify(home)};
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); return u.host === "gate.test" && u.pathname === "/" ? new Response(home, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("no"); };
const { POST } = await import(${JSON.stringify(new URL("../app/api/scan/route.ts", import.meta.url).href)}); console.info = console.warn = console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://gate.test/", mode: "both", language: "nl" }) }))).json();
const c = [...(j.geo?.checks || [])].find((x) => x.key === "schema") || {};
console.log("RESULT " + JSON.stringify({ sector: j.sectorProfile?.sector, status: c.status, text: (c.message || "") + " " + (c.fix || ""), gate: c.evidence?.adviceGate || null }));
process.exit(0);`);
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 240000 });
  return readProcessResult(out, "RESULT ", script);
}

const page = (title, description, body, ld) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="https://gate.test/">${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ""}</head><body><h1>${title.split(" |")[0]}</h1>${body}<a href="/contact">Contact</a></body></html>`;

test("route: a gym directory without own location details gets no ExerciseGym advice", () => {
  const listing = Array.from({ length: 12 }, (_, i) => `<li><a href="/sportscholen/stad-${i}/club-${i}">Sportschool Club ${i}</a> Hoofdstraat ${i}, ${1011 + i} AB Stad · 020-12345${10 + i} · Openingstijden ma-vr 07:00-23:00</li>`).join("");
  const r = scan(page("Vind een sportschool bij jou in de buurt | GymGids", "Vergelijk meer dan 3.000 sportscholen in Nederland op prijs, faciliteiten en reviews.", `<ul>${listing}</ul>`, { "@context": "https://schema.org", "@type": "WebSite", name: "GymGids", url: "https://gate.test/" }));
  assert.doesNotMatch(r.text, /ExerciseGym/, r.text);
});

test("an overview page with 3+ establishment addresses gets no local type on that page; one address does", () => {
  assert.equal(countListedLocations("Club A, 1011 AB Amsterdam, 020-1234510. Club B, 3011 CD Rotterdam, 010-1234511. Club C, 3511 EF Utrecht, 030-1234512."), 3);
  assert.equal(countListedLocations("Bezoek ons: Dorpsstraat 1, 1234 AB Dorp, tel. 0123-456789"), 1);
  assert.equal(schemaAdviceFor("ExerciseGym + WebSite", { ...gym, listedLocations: 12 }).gated, true);
  assert.equal(schemaAdviceFor("ExerciseGym + WebSite", { ...gym, listedLocations: 1 }).gated, false);
});

test("route: a single gym with its own address keeps ExerciseGym advice", () => {
  const r = scan(page("FitClub Dorp | Sportschool en fitness in Dorp", "Sportschool FitClub in Dorp: fitness, groepslessen en personal training. Bezoek onze club.", "<p>Sportschool FitClub, Dorpsstraat 1, 1234 AB Dorp. Telefoon 0123-456789. Openingstijden ma-vr 07:00-23:00.</p>" + "<p>Bij FitClub train je in een ruime club met moderne apparatuur voor kracht en cardio. Onze trainers helpen je met een persoonlijk schema en we bieden elke week groepslessen zoals spinning, bootcamp en yoga. Je kunt een gratis proefles plannen en daarna kiezen uit flexibele lidmaatschappen per maand of per jaar.</p>".repeat(4), { "@context": "https://schema.org", "@type": "WebSite", name: "FitClub", url: "https://gate.test/" }));
  assert.match(r.text, /ExerciseGym/, r.text);
});
