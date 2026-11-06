// Sector catalogue 6 Nov 2026: role before sector (carrier vs travel intermediary),
// no webshop modules for travel services, catalogue mapping for TestLab verdicts.
// Synthetic identity fields only test the rules; they are no proof of live results.
import test from "node:test";
import assert from "node:assert/strict";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";
import { isPricedServiceIdentity } from "../lib/sector-navigation.ts";
import { SECTOR_CATALOG_CANDIDATES } from "../lib/sector-catalog-candidates.mjs";
import { sectorVerdict, catalogMainSector } from "../scripts/testlab/labels.mjs";

test("online travel agency (flights + hotels/car hire, many airlines, no own check-in) is travel mediation", () => {
  const ota = detectEuPrimaryIdentity({ title: "Reisplatform: goedkope vluchten, hotels en vakanties", description: "Boek goedkope vliegtickets, hotels en huurauto's. Vergelijk meer dan 600 luchtvaartmaatschappijen.", h1s: ["Vluchten"], hostname: "reisplatform.test" });
  assert.equal(ota?.key, "travel");
  assert.notEqual(ota?.key, "passenger_transport");
  const de = detectEuPrimaryIdentity({ title: "Flüge, Hotels und Mietwagen günstig buchen", description: "Über 500 Fluggesellschaften im Vergleich.", h1s: ["Flüge"], hostname: "reise.test" });
  assert.equal(de?.key, "travel");
});

test("an airline stays a carrier: own check-in or Airline data, also when it sells hotels", () => {
  const withCheckIn = detectEuPrimaryIdentity({ title: "Air Example | Vluchten naar Marokko", description: "Boek uw vliegtickets en hotels bij de nationale luchtvaartmaatschappij.", h1s: ["Vlieg met ons"], navLabels: ["Online inchecken", "Mijn reis"], hostname: "airexample.test" });
  assert.equal(withCheckIn?.key, "passenger_transport");
  const schema = detectEuPrimaryIdentity({ title: "Example Airlines | Vluchten en vakanties", description: "Boek vluchten en hotels", h1s: [], schemaTypes: ["Airline"], hostname: "examplair.test" });
  assert.equal(schema?.key, "passenger_transport");
  const single = detectEuPrimaryIdentity({ title: "VliegMij | Goedkope vluchten boeken", description: "Boek je vliegtickets bij luchtvaartmaatschappij VliegMij.", h1s: ["Vluchten boeken"], hostname: "vliegmij.test" });
  assert.equal(single?.key, "passenger_transport");
});

test("hotels or holidays without flights are not travel mediation by this rule", () => {
  const hotel = detectEuPrimaryIdentity({ title: "Hotel De Haven | Kamers en arrangementen", description: "Boek uw hotelkamer en vakantiearrangement aan zee.", h1s: ["Hotel De Haven"], hostname: "hoteldehaven.test" });
  assert.notEqual(hotel?.key, "travel");
});

test("travel mediation and carriers never get webshop modules", () => {
  assert.equal(isPricedServiceIdentity("travel"), true);
  assert.equal(isPricedServiceIdentity("passenger_transport"), true);
  assert.equal(isPricedServiceIdentity("ecommerce"), false);
});

test("sector catalogue: every one of the 446 entries maps to engine sectors and roles", () => {
  const { entries, mainSectors, roles } = SECTOR_CATALOG_CANDIDATES;
  assert.equal(entries.length, 446);
  assert.ok(roles.includes("bemiddelaar") && roles.includes("software_saas") && roles.includes("onbekend"));
  for (const e of entries) {
    const m = mainSectors[e.hoofdsector];
    assert.ok(m && m.engineSectors.length && m.roles.every((r) => roles.includes(r)), e.id);
  }
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length, "no duplicate ids");
});

test("catalogue labels as TestLab expectation: unknown stays unconfirmed, wrong sector is a mismatch", () => {
  assert.equal(catalogMainSector("verbouwen-verhuizen__asbestverwijderaars"), "Verbouwen & verhuizen");
  assert.equal(sectorVerdict("Reizen, toerisme & verblijf", { sector: "transport_travel", key: "travel" }).verdict, "partial");
  assert.equal(sectorVerdict("Reizen, toerisme & verblijf", { sector: "financial_services", key: "financial_insurance" }).verdict, "mismatch");
  assert.equal(sectorVerdict("Onderwijs & opleidingen", { sector: "unknown" }).verdict, "unconfirmed");
  // Existing labels keep their verdicts.
  assert.equal(sectorVerdict("retail", { sector: "transport_travel", key: "passenger_transport" }).verdict, "mismatch");
});

test("a flight-ticket seller that never names itself an airline, without check-in or Airline data, is a booking platform", () => {
  const seller = detectEuPrimaryIdentity({ title: "Goedkope vluchten en vliegtickets boeken | Reisplatform", description: "Vind en boek goedkope vliegtickets naar elke bestemming.", h1s: ["Goedkope vluchten"], hostname: "reisplatform.test" });
  assert.equal(seller?.key, "travel");
  // A carrier naming itself stays a carrier (existing EU fixture).
  const lot = detectEuPrimaryIdentity({ title: "Tanie loty i bilety lotnicze | Polskie Linie Lotnicze", description: "Zarezerwuj lot online.", h1s: [], hostname: "lot.test" });
  assert.equal(lot?.key, "passenger_transport");
});
