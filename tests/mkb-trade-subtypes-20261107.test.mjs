// MKB48 (6 Nov/7 Nov): local trades collapsed into their generic parent sector
// (home_services, fitness_sports) and catering had no rule at all. Generic trade
// vocabulary only — no domains or brands. Synthetic identity fields test the rules.
import test from "node:test";
import assert from "node:assert/strict";
import { refineSubtype, detectDeclaredIndustry } from "../lib/site-sector-corroboration.mjs";

const sub = (sector, title, description) => refineSubtype({ sector, key: sector }, { title, description });

test("home_services refines to plumber and gardener from the site's own identity", () => {
  assert.equal(sub("home_services", "Loodgieter Noord | Dé loodgieter in de regio", "Sanitair, ontstopping en installatie door onze loodgieters.")?.key, "plumber");
  assert.equal(sub("home_services", "Groen & Tuin | Hovenier", "Uw hovenier voor tuinaanleg en tuinonderhoud.")?.key, "gardener");
});

test("fitness_sports refines to a fitness club, but a sports federation does not", () => {
  assert.equal(sub("fitness_sports", "FitClub | Sportschool en fitnessclub", "Sport bij onze fitnessclub met moderne gym.")?.key, "fitness");
  assert.equal(sub("fitness_sports", "Nationale Sportbond", "De bond en federatie voor de georganiseerde sport."), null);
});

test("a heating/installation company is not promoted to plumber (stays generic)", () => {
  assert.equal(sub("home_services", "Verwarmingsexpert | installatie en onderhoud", "Dé expert in installatie en onderhoud van verwarming, koeling en ventilatie."), null);
});

test("plumber and gardener stay apart via the reject vocabulary", () => {
  // A gardener page that explicitly disclaims plumbing is not typed plumber.
  assert.notEqual(sub("home_services", "Hovenier Jansen | tuinaanleg", "Tuinaanleg en tuinonderhoud.")?.key, "plumber");
});

test("caterers are recognised; a restaurant that merely reserves tables is not catering", () => {
  const det = (t, d) => detectDeclaredIndustry({ url: "https://x.nl/", title: t, description: d, identityHeadings: [t.split(" |")[0]], schemaTypes: [] });
  assert.equal(det("Foodservice & Catering", "Wij verzorgen catering en bedrijfscatering op locatie: buffetten, hapjes en lunchservice.")?.key, "catering");
  assert.equal(det("Horeca en catering op locatie", "Bedrijfscatering, buffetten en banqueting voor feesten en partijen.")?.key, "catering");
  assert.notEqual(det("Restaurant De Kas", "Ons restaurant serveert een dagvers menu. Reserveer een tafel.")?.key, "catering");
});

test("subtype refinement only runs on a generic parent, never over an already specific key", () => {
  assert.equal(refineSubtype({ sector: "home_services", key: "electrician" }, { title: "Loodgieter", description: "sanitair" }), null);
});
