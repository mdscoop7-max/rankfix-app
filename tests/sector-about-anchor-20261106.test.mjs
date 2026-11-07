// Branch recognition for thin homepages (Fresh144 Liander) and driving schools
// (field report 6 Nov, growrijopleidingen.nl "Sector niet bevestigd").
// Generic rules only: no domains, brands or countries.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corroborateDeclaredIndustry, detectDeclaredIndustry } from "../lib/site-sector-corroboration.mjs";

const { pages } = JSON.parse(readFileSync(new URL("./fixtures/fresh144-about-anchor/liander.json", import.meta.url), "utf8"));
const home = pages.find((p) => p.type === "homepage");
const rest = pages.filter((p) => p !== home);

test("Fresh144 Liander: thin homepage + own About page 'X is een netbeheerder' => grid operator", () => {
  const r = corroborateDeclaredIndustry(home.url, home, rest);
  assert.equal(r.decision?.key, "grid_operator");
  assert.equal(r.decision?.confidence, "medium");
});

test("without the About page the thin homepage stays unconfirmed", () => {
  const r = corroborateDeclaredIndustry(home.url, home, rest.filter((p) => !/\/over-ons$/.test(p.url)));
  assert.equal(r.decision, null);
});

test("an About self-declaration does not decide when another own page names a different activity", () => {
  const conflicting = { url: "https://www.liander.nl/zakelijk/laadpalen", type: "service", status: "audited", title: "Laadpaalbedrijf voor bedrijven", description: "Wij plaatsen laadpalen en laadstations voor elektrische auto's bij bedrijven.", identityHeadings: ["Laadpalen"], schemaTypes: [] };
  const r = corroborateDeclaredIndustry(home.url, home, [...rest, conflicting, { ...conflicting, url: conflicting.url + "-2", title: "Laadpaal installeren" }]);
  if (r.decision) assert.equal(r.decision.key, "grid_operator", "never another sector from a single About line");
});

test("an About page that only mentions an activity (no 'X is een …') does not anchor", () => {
  const about = { url: "https://example-org.nl/over-ons", type: "corporate", status: "audited", title: "Over ons | Org", description: "Wij werken samen met netbeheerders aan stroomnetten en storingen.", identityHeadings: ["Over ons"], schemaTypes: [] };
  const thin = { url: "https://example-org.nl/", type: "homepage", status: "audited", title: "Home", description: "", identityHeadings: [], schemaTypes: [] };
  assert.equal(corroborateDeclaredIndustry(thin.url, thin, [about]).decision, null);
});

test("driving schools are recognised in Dutch and other EU languages", () => {
  const cases = [
    { title: "Grow Rijopleidingen | Rijschool in Utrecht", description: "Rijlessen voor auto en motor. Haal je rijbewijs met ervaren instructeurs en een hoog slagingspercentage bij het CBR-examen.", identityHeadings: ["Rijschool Grow"] },
    { title: "Fahrschule Müller", description: "Fahrstunden und Führerschein Klasse B in Köln.", identityHeadings: ["Ihre Fahrschule"] },
    { title: "Auto-école Lumière", description: "Leçons de conduite et préparation au permis de conduire.", identityHeadings: ["Auto-école"] },
  ];
  for (const c of cases) assert.equal(detectDeclaredIndustry({ ...c, url: "https://x.nl/", schemaTypes: [] })?.key, "driving_school", c.title);
});

test("negatives: driving-school words used as audience or topic do not make a driving school", () => {
  const notSchools = [
    { title: "Lesplanner software voor rijscholen", description: "Planningssoftware met abonnement voor rijscholen en instructeurs.", identityHeadings: ["Software voor rijscholen"] },
    { title: "Autoverzekering | Verzekeraar", description: "Verzeker je auto direct na het halen van je rijbewijs.", identityHeadings: ["Autoverzekering"] },
  ];
  for (const c of notSchools) assert.notEqual(detectDeclaredIndustry({ ...c, url: "https://x.nl/", schemaTypes: [] })?.key, "driving_school", c.title);
});

test("growrijopleidingen.nl (live fields fetched 6 Nov 2026): compounds praktijkexamen/proefles/autorijbewijs support the driving school", () => {
  const home = { url: "https://growrijopleidingen.nl/", type: "homepage", status: "audited", title: "Grow Rijopleidingen | Eerder ANWB Rijopleiding, nu Grow", description: "Herfstdeal: gratis praktijkexamen t.w.v. €335, alleen t/m 29 november. Beoordeeld met een 4,3 uit 3.366 reviews op Google. Plan een proefles direct online.", identityHeadings: ["Eerder ANWB Rijopleiding, nu Grow."], schemaTypes: [] };
  const sub = { url: "https://growrijopleidingen.nl/rijopleidingen", type: "service", status: "audited", title: "Rijopleidingen | Auto, Motor, Scooter en meer | Grow Rijopleidingen", description: "Bekijk alle rijopleidingen van Grow. Van autorijbewijs B tot motorrijbewijs A. Persoonlijke begeleiding, vaste instructeur en heldere prijzen. Eerder ANWB Rijopleidingen, nu Grow.", identityHeadings: ["Rijopleidingen bij Grow"], schemaTypes: [] };
  assert.equal(detectDeclaredIndustry(home)?.key, "driving_school");
  assert.equal(detectDeclaredIndustry(sub)?.key, "driving_school");
  assert.equal(corroborateDeclaredIndustry(home.url, home, [sub]).decision?.key, "driving_school");
});
