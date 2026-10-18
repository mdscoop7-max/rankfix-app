import test from "node:test";
import assert from "node:assert/strict";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";
import { detectPrimaryBusinessIdentity } from "../lib/primary-business-identity.ts";

// RankFix 3.6 — regressions for the identity gaps found in the independent
// 68-site pilot (docs/ENGINE-3.6-HERSTELPLAN.md, G2–G10). Every case below is
// written for this test (own wording, neutral .test hosts); none is a copy of
// a pilot site. Each sector has positive cases in several languages and
// negative controls that contain the risky words but are another business.

const id = (v) => detectEuPrimaryIdentity({ homepage: true, hostname: "site.test", ...v });

const positives = [
  // G2 telecom: mobile + internet + TV/calling + plans/operator, any language.
  ["telecom", "de", { title: "Mobilfunk, DSL & TV-Tarife | Netzanbieter", description: "Handytarife und Internet für zu Hause im eigenen Netz." }],
  ["telecom", "da", { title: "Mobilabonnementer og bredbånd | Teleselskab", description: "Billige abonnementer med mobilt bredbånd og fibernet." }],
  ["telecom", "sv", { title: "Mobilt bredband och fiber | Operatör", description: "Teckna familjeabonnemang och företagsabonnemang hos oss." }],
  ["telecom", "cs",{ title: "Mobilní operátor – tarify, internet a televize", description: "Neomezené volání a domácí internet pro celou rodinu." }],
  ["telecom", "nl", { title: "Internet, TV en Bellen | Provider", description: "Snel internet met wifi, tv-pakketten en vaste telefonie." }],
  ["telecom", "pl", { title: "Operator komórkowy – abonament, internet światłowodowy i telewizja", description: "Rozmowy bez limitu i szybki internet w domu." }],
  ["telecom", "fr", { title: "Forfaits mobile, box internet et TV | Opérateur", description: "Fibre et 5G sur notre réseau, appels illimités." }],
  // G3 energy: an energy/electricity company names itself.
  ["energy", "fi", { title: "Sähköyhtiö kotiin ja yrityksille", description: "Olemme energiayhtiö, joka myy sähköä ja kaukolämpöä." }],
  ["energy", "es", { title: "Compañía de luz y gas para tu hogar", description: "Contrata tu tarifa y ahorra en la factura." }],
  ["energy", "es", { title: "Tu compañía de luz, gas y energía solar", description: "Contrata la tarifa que necesitas." }],
  ["energy", "de", { title: "Ihr Energieversorger für Strom und Wärme", description: "Ökostrom-Tarife für Haushalte." }],
  ["energy", "sv", { title: "Elbolaget för hela Norden", description: "Teckna elavtal med fast eller rörligt pris." }],
  // G4 real estate portals.
  ["real_estate", "es", { title: "Pisos en venta y alquiler | Portal inmobiliario", description: "Busca casas y pisos de obra nueva o de segunda mano." }],
  ["real_estate", "de", { title: "Immobilien kaufen und mieten | Wohnungen & Häuser", description: "Tausende Immobilienangebote von Maklern und privat." }],
  ["real_estate", "fr", { title: "Annonces immobilières – appartements à louer et maisons à vendre", description: "Trouvez votre logement parmi nos annonces." }],
  ["real_estate", "sv", { title: "Bostäder till salu i hela Sverige", description: "Hitta lägenheter och villor till salu och bostadspriser." }],
  ["real_estate", "it", { title: "Case e appartamenti in vendita e in affitto", description: "Annunci immobiliari di agenzie e privati." }],
  // G4 nonprofits / NGOs.
  ["nonprofit", "fr", { title: "Association humanitaire – ONG indépendante", description: "Faites un don pour soutenir nos actions sur le terrain." }],
  ["nonprofit", "de", { title: "Organisation für Umweltschutz und Tierschutz", description: "Unsere Mission: Natur bewahren. Jetzt spenden." }],
  ["nonprofit", "nl", { title: "Hulporganisatie voor mensen in nood", description: "Wij bieden noodhulp bij rampen en conflicten. Help je mee?" }],
  ["nonprofit", "it", { title: "Organizzazione umanitaria internazionale", description: "Aiutiamo le persone in difficoltà. Dona ora." }],
  ["nonprofit", "en", { title: "Charity helping people in need", description: "Donate today to support families affected by disasters." }],
  ["nonprofit", "es", { title: "Organización de derechos humanos", description: "Defendemos los derechos humanos en todo el mundo. Hazte socio." }],
  ["nonprofit", "nl", { title: "Hulporganisatie voor mensen in nood", description: "Wij bieden noodhulp bij rampen. Bekijk ook onze webwinkel." }],
  // G5 hotels.
  ["hotel", "en", { title: "Boutique Hotels in European Cities", description: "Smart rooms and comfortable beds in every hotel. Book your stay today." }],
  ["hotel", "de", { title: "Hotels in Berlin und Hamburg", description: "Moderne Zimmer im Stadtzentrum – jetzt direkt buchen." }],
  // amusement parks (tourism & recreation).
  ["amusement", "da", { title: "Forlystelsespark for hele familien", description: "Forlystelser, shows og restauranter i hjertet af byen." }],
  ["amusement", "de", { title: "Freizeitpark mit Achterbahnen und Shows", description: "Ein Tag voller Attraktionen für die ganze Familie." }],
  ["amusement", "nl", { title: "Attractiepark voor het hele gezin", description: "Achtbanen, shows en sprookjes." }],
  // G6/G7/G8 culture, academic hospital, hospital name after a generic title part.
  ["culture", "it", { title: "Homepage Sito Ufficiale | Gallerie e Musei Civici", description: "Il sito ufficiale dei musei. Orari, biglietti e mostre." }],
  ["health", "nl", { title: "Regio MC: patiëntenzorg", description: "Excellente zorg, wetenschappelijk onderzoek en onderwijs voor een gezonde regio." }],
  ["health", "it", { title: "Home Page | Grande Ospedale Regionale", description: "" }],
  // G9 SaaS named by product category; G10 engineering group.
  ["saas", "en", { title: "CRM, invoicing and projects in one tool | Brand", description: "Business software that small teams use every day." }],
  ["saas", "de", { title: "HR-Software für den Mittelstand", description: "Personalverwaltung und Lohnabrechnung in einer Plattform." }],
  ["industrial", "en", { title: "Brand Group", description: "An engineering group providing products and solutions for mining, rock processing and metal cutting." }],
];

const sectorOf = { telecom: "telecom_technology", energy: "energy_utilities", real_estate: "real_estate", nonprofit: "nonprofit", hotel: "hospitality", amusement: "tourism_recreation", culture: "events_culture", health: "health_wellness", saas: "saas_b2b", industrial: "manufacturing_industrial" };

for (const [kind, lang, v] of positives) {
  test(`3.6 identity: ${kind} (${lang}) — "${v.title}"`, () => {
    const r = id(v);
    assert.ok(r, "identity expected, got null");
    assert.equal(r.sector, sectorOf[kind], JSON.stringify(r));
    assert.ok(r.evidence.length > 0);
  });
}

test("3.6 identity: a government host label alone gives a probable government identity, never above 85", () => {
  const r = id({ title: "Portal GOV", description: "", hostname: "www.gov.test" });
  assert.equal(r?.sector, "government");
  assert.ok(r.confidenceScore < 85, JSON.stringify(r));
});

// Negative controls: risky words, other business. Must abstain or name their own sector.
const negatives = [
  ["electronics shop with phones and TVs is not telecom", ["telecom_technology"], { title: "Smartphones, TV og tablets – lave priser", description: "Køb mobiler, fjernsyn og computere med hurtig levering." }],
  ["electronics shop that also sells phone subscriptions is not telecom", ["telecom_technology"], { title: "Køb mobiler, tablets og hvidevarer", description: "Mobiler med mobilabonnementer og familieabonnementer til lave priser." }],
  ["web agency with 'internet' is not telecom", ["telecom_technology"], { title: "Internetbureau voor websites en apps", description: "Wij bouwen webshops, apps en online campagnes." }],
  ["news site with TV and radio stays news", ["telecom_technology"], { title: "Nachrichten aus der Region | TV und Radio", description: "Aktuelle Nachrichten, Videos und Livestreams." }],
  ["lighting shop with 'luz' is not energy", ["energy_utilities"], { title: "Lámparas y luz LED – tienda online", description: "Compra lámparas, bombillas y focos con envío gratis." }],
  ["solar panel webshop is not an energy supplier", ["energy_utilities"], { title: "Zonnepanelen kopen | webshop", description: "Bestel zonnepanelen en omvormers online." }],
  ["mortgage bank is not real estate", ["real_estate"], { title: "Hypotheken en sparen | Bank", description: "Bereken uw hypotheek, open een spaarrekening en beleg online." }],
  ["interior blog is not real estate", ["real_estate"], { title: "Woonblog – interieur en woonideeën", description: "Inspiratie voor je huis en appartement." }],
  ["CRM for charities is software, not a charity", ["nonprofit"], { title: "Fundraising CRM software for charities and nonprofits", description: "Manage donors and donations. Book a demo." }],
  ["webshop that donates part of its profit is not a charity", ["nonprofit"], { title: "Webshop voor duurzame kleding", description: "Bestel online; wij doneren 5% aan een goed doel." }],
  ["hotel comparison site is not a hotel", ["hospitality"], { title: "Compare hotel deals in 500 cities", description: "Find the cheapest rooms from 200 booking sites." }],
  ["museum shop online is retail, not culture", ["events_culture"], { title: "Museumshop online – posters en kunstboeken", description: "Bestel museumcadeaus in onze webshop." }],
  ["'official site' of a shoe brand is not government", ["government"], { title: "Sito ufficiale | Scarpe e borse", description: "Il sito ufficiale del brand. Spedizione gratuita." }],
  ["fitness app is not a hospital", ["health_wellness"], { title: "Home | Workout app", description: "Train at home with guided workouts." }],
];
for (const [name, notSectors, v] of negatives) {
  test(`3.6 negative control: ${name}`, () => {
    const r = id(v);
    assert.ok(!r || !notSectors.includes(r.sector), JSON.stringify(r));
  });
}

// G9 payments: a fintech/payments platform is financial services, not SaaS.
test("3.6 payments: a fintech platform that runs payments is financial services", () => {
  const r = detectPrimaryBusinessIdentity({ title: "Brand: Fintech platform for enterprises", description: "Run payments, manage your data and offer financial products in one platform.", headings: [] });
  assert.equal(r.sector, "financial_services", JSON.stringify(r));
  assert.equal(r.financialKind, "payments");
});
test("3.6 payments negative: a shop that accepts payments is not a payment company", () => {
  const r = detectPrimaryBusinessIdentity({ title: "Sneaker store – buy online", description: "Secure payments with all major cards. Free returns.", headings: [] });
  assert.notEqual(r.sector, "financial_services", JSON.stringify(r));
});
