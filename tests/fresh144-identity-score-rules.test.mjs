import test from "node:test";
import assert from "node:assert/strict";
import { missionOrganisationIdentity } from "../lib/organisation-identity.ts";
import { detectPrimaryBusinessIdentity } from "../lib/primary-business-identity.ts";
import { buildWebsiteProfile } from "../lib/website-profile.ts";
import { evidenceGradeBasis, headlineScore } from "../lib/audit-score.ts";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";
import { scoreDisplay } from "../lib/testlab-score-evidence.ts";

// Generic rules behind the Fresh144 repairs of 6 Nov 2026. Invented names only.

test("compound foundation names with fundraising are mission organisations", () => {
  const charity = missionOrganisationIdentity({ title: "Steun patiënten met een nierziekte | Nierstichting", h1: "Steun de Nierstichting", siteName: "Nierstichting", navLabels: ["Doneer eenmalig", "Nalaten", "Word collectant"] });
  assert.equal(charity.primary, true);
  const german = missionOrganisationIdentity({ title: "Krebsstiftung Musterland", navLabels: ["Jetzt spenden", "Ehrenamt"] });
  assert.equal(german.primary, true);
});

test("a care or housing foundation that only recruits volunteers is not a charity", () => {
  const care = missionOrganisationIdentity({ title: "Zorgstichting Rivierland | Wonen en zorg voor ouderen", navLabels: ["Locaties", "Werken bij", "Word vrijwilliger"] });
  assert.equal(care.primary, false);
  const housing = missionOrganisationIdentity({ title: "Woningstichting Noord | Huurwoningen", navLabels: ["Woning zoeken", "Reparatie melden"] });
  assert.equal(housing.primary, false);
  const pension = missionOrganisationIdentity({ title: "Pensioenfonds Metaal | Uw pensioen", navLabels: ["Mijn pensioen"] });
  assert.equal(pension.primary, false);
});

test("an insurer that also sells mortgages and investments stays an insurer", () => {
  const r = detectPrimaryBusinessIdentity({ title: "Verzekeringen, pensioen, hypotheken en beleggen | Voorbeeld Verzekeraar", description: "Sluit een verzekering af, regel je pensioen of vraag een hypotheek aan. Beleggen en vermogensbeheer.", headings: ["Verzekeringen voor elke situatie"], schemaTypes: [] });
  assert.equal(r.sector, "financial_services");
  assert.equal(r.financialKind, "insurance");
});

test("a bank that also sells insurance stays a bank", () => {
  const r = detectPrimaryBusinessIdentity({ title: "Betaalrekening, sparen, hypotheek en verzekeringen | Voorbeeldbank", description: "Open een betaalrekening of spaarrekening, mobiel bankieren en een hypotheek bij jouw bank.", headings: ["Bankieren zoals het hoort"], schemaTypes: [] });
  assert.equal(r.financialKind, "banking");
});

const profile = (sector, label) => buildWebsiteProfile({ commerceState: "not_confirmed", sector, sectorLabel: label, sectorConfidence: 88, technologies: [], commercePlatform: null, cms: null, framework: null, catalog: [] });

test("a manufacturer without a confirmed webshop is a manufacturer, not a service provider", () => {
  const p = profile("manufacturing_industrial", "Industrie & productie");
  assert.equal(p.websiteType.value, "manufacturer");
  assert.equal(p.websiteType.label, "Fabrikant / producent");
  assert.equal(profile("events_culture", "Cultuur").websiteType.value, "organisation");
  assert.equal(profile("legal", "Juridisch").websiteType.value, "services");
});

test("insufficient evidence: grade rests on the proven lower bound; the score is unchanged", () => {
  assert.equal(evidenceGradeBasis(98, { low: 61, high: 99 }, "insufficient"), 61);
  assert.equal(evidenceGradeBasis(98, { low: 61, high: 99 }, "provisional"), 98);
  assert.equal(evidenceGradeBasis(98, { low: 61, high: 99 }, "complete"), 98);
  assert.equal(evidenceGradeBasis(90, null, "insufficient"), 90);
  const h = headlineScore(98, { low: 61, high: 99 }, 63, "insufficient");
  assert.equal(h.numeric, 98);
  assert.equal(h.indication, true);
  assert.equal(headlineScore(91, { low: 80, high: 99 }, 100, "complete").indication, false);
});

test("TestLab never shows a bare number on insufficient evidence", () => {
  assert.equal(scoreDisplay(99, { headlineKind: "score", headline: "99", rangeLow: 99, rangeHigh: 99, coveragePercent: 95 }, "insufficient").main, "99 (indicatie)");
  assert.equal(scoreDisplay(92, { headlineKind: "score", headline: "92", coveragePercent: 100 }, "complete").main, "92");
});

const eu = (title, description) => detectEuPrimaryIdentity({ title, description, siteName: title, hostname: "example.com", navLabels: [], schemaTypes: [] })?.sector ?? null;

test("technology enterprises and engineering groups with physical products are manufacturers", () => {
  assert.equal(eu("Optix", "Optix is an international technology enterprise operating in the optics and optoelectronics industries."), "manufacturing_industrial");
  assert.equal(eu("Rockline Group", "Rockline is an engineering group providing products and solutions for mining, rock processing and metal cutting."), "manufacturing_industrial");
});

test("engineering consultancies and software enterprises are not manufacturers", () => {
  assert.notEqual(eu("Designco", "Designco is a global design, engineering and consultancy company delivering services for natural and built assets."), "manufacturing_industrial");
  assert.notEqual(eu("Acme Software", "Acme is a technology enterprise building cloud software for industries."), "manufacturing_industrial");
});
