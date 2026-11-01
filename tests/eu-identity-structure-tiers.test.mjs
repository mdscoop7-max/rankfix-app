import test from "node:test";
import assert from "node:assert/strict";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";

const id = (input) => detectEuPrimaryIdentity({ homepage: true, ...input });

test("energy transition + generation in navigation → probable energy; a consultancy is not", () => {
  const e = id({ title: "Agir pour la transition énergétique - Groupe", description: "Rejoignez-nous dans la transition énergétique avec des solutions fiables.", navLabels: ["Nos activités", "Production renouvelable et flexibilité", "Stratégie"] });
  assert.equal(e?.sector, "energy_utilities"); assert.equal(e?.confidence, "medium");
  assert.notEqual(id({ title: "Adviesbureau | Wij begeleiden de energietransitie", description: "Advies over de energietransitie voor gemeenten.", navLabels: ["Diensten", "Cases", "Contact"] })?.sector, "energy_utilities");
});

test("agriculture: farming in own fields + three farming concepts; machinery and farm software excluded", () => {
  const a = id({ title: "Group | Better Together", description: "Deliver sustainable value at farm, field and industry.", navLabels: ["Arable Solutions", "Nutritional Solutions", "The growing role of data in poultry production", "Healthy soil, healthy future"] });
  assert.equal(a?.sector, "agriculture_horticulture");
  assert.notEqual(id({ title: "FarmApp | Software for farm management", description: "The farm software platform for arable and dairy farms.", navLabels: ["Arable", "Poultry", "Soil health", "Pricing"] })?.sector, "agriculture_horticulture");
  assert.notEqual(id({ title: "Brand", description: "Agricultural machinery and tractors for every farm.", navLabels: ["Arable", "Livestock", "Seeds"] })?.sector, "agriculture_horticulture");
});

test("food service from dishes + menu + locations; recipe and grocery sites are not restaurants", () => {
  const r = id({ title: "Brand - Brand", description: "Favoriete bestemming voor heerlijke gerechten en gezellige ontmoetingen.", navLabels: ["Bekijk menu", "Bekijk locaties", "Contact"] });
  assert.equal(r?.sector, "hospitality"); assert.equal(r?.key, "restaurant");
  assert.notEqual(id({ title: "Kookvoorbeeld", description: "Recepten en gerechten voor elke dag.", navLabels: ["Menu", "Locaties", "Recepten"] })?.key, "restaurant");
});

test("sport organisation from sport + competition structure; gyms are not federations", () => {
  assert.equal(id({ title: "The Championships - Official Website", description: "The home of the tennis championships with news, scores, draws and ticket information." })?.sector, "sports_organizations");
  assert.equal(id({ title: "Sportkoepel | We winnen veel met sport", description: "Meer mensen sportplezier.", navLabels: ["Clubondersteuning", "TeamNL Academie Kalender", "Algemene Vergadering"] })?.sector, "sports_organizations");
  assert.notEqual(id({ title: "FitVoorbeeld | Sportschool en fitness", description: "Sport bij de beste gym. Lidmaatschap vanaf €20.", navLabels: ["Lessen", "Rooster", "Tickets", "Leden"] })?.sector, "sports_organizations");
});
