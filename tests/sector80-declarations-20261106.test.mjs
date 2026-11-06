import test from "node:test";
import assert from "node:assert/strict";
import { detectDeclaredIndustry } from "../lib/site-sector-corroboration.mjs";

// sector80 export (993161a8, 6 Nov): 19 "Sector niet bevestigd". Own-activity
// declarations for the missing branches, plus the copular self-declaration in the
// description when a corporate title names no activity (real Organon scan:
// "Home | Organon"). Invented wording modelled on such homepages; negatives are
// audiences, shops, comparison sites and other trades.
const C = [
 ["BASF | We create chemistry", "BASF is the world's leading chemical company: we create chemistry for a sustainable future with chemicals, materials and plastics.", ["We create chemistry"], "chemical_manufacturing"],
 ["Heineken | Brewer of the world's most international beer", "HEINEKEN is the world's most international brewer, with beers and ciders sold in more than 190 countries.", ["The world's most international brewer"], "beverage_manufacturing"],
 ["Organon | A global healthcare company", "Organon is een farmaceutisch bedrijf gericht op de gezondheid van vrouwen, met geneesmiddelen en biosimilars.", ["Farmaceutisch bedrijf voor vrouwengezondheid"], "pharmaceutical_manufacturing"],
 ["Royal BAM Group | Bouwconcern", "BAM is een Europees bouwconcern actief in bouw en infra: woningbouw, utiliteitsbouw, wegen en bruggen.", ["Bouwconcern voor een duurzame toekomst"], "construction_infrastructure"],
 ["Liander | Netbeheerder voor stroom en gas", "Liander is de netbeheerder voor elektriciteit en gas. Meld een storing of vraag een aansluiting aan.", ["Netbeheerder"], "grid_operator"],
 ["Vitens | Drinkwaterbedrijf", "Vitens levert drinkwater aan 5,8 miljoen mensen. Bekijk je waterkwaliteit of geef je meterstand door.", ["Drinkwaterbedrijf"], "water_utility"],
 ["Allego | EV charging network", "Allego operates one of Europe's leading charging networks for electric vehicles.", ["Charging network for electric vehicles"], "ev_charging"],
 ["Robeco | Asset manager", "Robeco is an international asset manager offering investment funds and solutions for investors.", ["Asset management"], "financial_asset_management"],
 ["APG | Pensioenuitvoerder", "APG is pensioenuitvoerder voor pensioenfondsen en werkgevers en verzorgt pensioen voor deelnemers.", ["Pensioenuitvoerder"], "financial_pension"],
 ["Notariskantoor Jansen | Notaris in Utrecht", "Notariskantoor Jansen helpt bij je testament, huwelijkse voorwaarden en de levering van je huis via een akte.", ["Uw notaris in Utrecht"], "notary"],
 ["Home | Organon", "Organon is a global healthcare company with a focus on women's health, offering medicines and biosimilars to patients.", ["Here for her health"], "pharmaceutical_manufacturing"],
 ["Home | Pharmaco", "Pharmaco is a pharmaceutical company developing medicines for patients worldwide.", [], "pharmaceutical_manufacturing"],
 ["MedTech Weekly | News", "News for every healthcare company and hospital: medicines, patients and policy.", ["Healthcare news"], null],
 ["Home | Ziekenhuis Oost", "Ziekenhuis Oost is een algemeen ziekenhuis voor patiënten in de regio.", [], "health_wellness"],
 ["Buurtzorg | Wijkverpleging", "Buurtzorg biedt thuiszorg en wijkverpleging: verpleegkundigen geven zorg aan huis.", ["Wijkverpleging"], "home_care"],
 ["Schoonenberg | Hoorspecialist", "Schoonenberg is hoorspecialist: gratis hoortest en hoortoestellen in 200 winkels.", ["Hoorspecialist"], "hearing_care"],
 ["Van Mossel | Autodealer", "Van Mossel is autodealer van 30 merken: nieuwe auto's, occasions en private lease. Plan een proefrit.", ["Autodealer"], "car_dealership"],
 ["RAI Amsterdam | Congrescentrum", "RAI Amsterdam is beurs- en congrescentrum voor beurzen, congressen en evenementen.", ["Beurs- en congrescentrum"], "event_venue"],
 ["Croonwolter&dros | Elektrotechnisch installatiebedrijf", "Technisch dienstverlener in installatietechniek, elektra en onderhoud van installaties.", ["Elektrotechniek en installaties"], "electrician"],
 // negatives
 ["Bierwinkel | Speciaalbier online kopen", "Bestel speciaalbieren online. Gratis verzending.", ["Speciaalbier kopen"], null],
 ["Garage De Weg | Autobedrijf", "APK, onderhoud en reparatie van alle merken.", ["Autobedrijf"], "car_repair"],
 ["Loodgieter Jansen | Installatiebedrijf", "Cv-ketels, sanitair en ontstoppen.", ["Installatiebedrijf"], null],
 ["Bouwsoftware | Planning voor bouwbedrijven", "Software voor bouwbedrijven: planning en projecten.", ["Software voor bouwbedrijven"], null],
 ["Energievergelijker | Vergelijk energieleveranciers", "Vergelijk stroom en gas tarieven van alle energieleveranciers.", ["Vergelijk energieleveranciers"], null],
];
test("sector80 branches are recognised from their own declaration; audiences and shops are not", () => {
  const wrong = C.filter(([title, description, identityHeadings, want]) => {
    const r = detectDeclaredIndustry({ title, description, identityHeadings, schemaTypes: [], hostname: "x.example" });
    return (r?.key ?? null) !== want;
  }).map((c) => c[0]);
  assert.deepEqual(wrong, []);
});
