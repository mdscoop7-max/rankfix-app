// 31 Oct: surname brands never declare the trade their surname names.
import test from "node:test";
import assert from "node:assert/strict";
import { detectDeclaredIndustry, personNameBrandPhrases } from "../lib/site-sector-corroboration.mjs";

test("person-name brand phrases are found at either end of the title", () => {
  assert.deepEqual(personNameBrandPhrases("Leen Bakker | Meubels en woonaccessoires"), ["Leen Bakker"]);
  assert.deepEqual(personNameBrandPhrases("Boxsprings kopen? | Leen Bakker"), ["Leen Bakker"]);
  assert.deepEqual(personNameBrandPhrases("Jan de Bakker | Ambachtelijke bakker"), ["Jan de Bakker"]);
  assert.deepEqual(personNameBrandPhrases("J. Bakker - Woonwinkel"), ["J. Bakker"]);
  // The trade comes first, a generic word precedes it, or the last word is no trade.
  for (const t of ["Bakker Bart | Vers brood", "Bakkerij Leen | Brood", "Bakkerij Jansen", "Studio Kapper | Kapsalon", "De Bakker | Brood", "Warme Bakker Utrecht", "International Airport | Flights", "Science Museum"])
    assert.deepEqual(personNameBrandPhrases(t), [], t);
});

test("a furniture chain named after a person is not a bakery; real bakeries are", () => {
  assert.equal(detectDeclaredIndustry({ title: "Leen Bakker | Meubels, woonaccessoires en raamdecoratie", description: "Leen Bakker is dé woonwinkel voor iedereen.", identityHeadings: ["Welkom bij Leen Bakker"] }), null);
  assert.equal(detectDeclaredIndustry({ title: "Boxsprings kopen? | Leen Bakker", description: "Bekijk alle boxsprings bij Leen Bakker." }), null);
  for (const p of [
    { title: "Bakkerij Leen | Vers brood en gebak", description: "Ambachtelijke bakker met vers brood en taart." },
    { title: "Bakker Bart | Vers brood", description: "Bakker Bart bakt elke dag vers brood." },
    { title: "Jan de Bakker | Ambachtelijke bakker", description: "Jan de Bakker is uw warme bakker voor vers brood." },
    { title: "Bakkerij Jansen", description: "Wij zijn een warme bakker in Utrecht met vers brood en gebak." },
  ]) assert.equal(detectDeclaredIndustry(p)?.key, "bakery", p.title);
});
