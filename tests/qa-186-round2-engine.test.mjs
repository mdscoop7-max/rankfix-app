import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";
import { detectPrimaryBusinessIdentity } from "../lib/primary-business-identity.ts";
import { sectorPageEvidence, isAudiencePagePath } from "../lib/sector-page-evidence.ts";
import { classifyNonContentPage } from "../lib/page-gate.ts";
import { manufacturerRegistrationEvidence } from "../lib/manufacturer-evidence.ts";
import { jsonbStringify, jsonbSafeString } from "../lib/jsonb-safe.ts";
import { safeQueryParam } from "../lib/db.ts";
import { isSubstantiveRender } from "../lib/render-quality.ts";
import { replayAll } from "../scripts/testlab/replay-identity.mjs";

// QA #186 round 2 (96-site TestLab run of 23 Oct 2026). Every rule is generic and
// has negative controls; hosts are neutral (".test") unless the hostname
// structure itself is under test.
const id = (v) => detectEuPrimaryIdentity({ homepage: true, hostname: "brand.test", ...v });

test("press rooms are press relations, not a publication (was: energy group → news)", () => {
  const corporate = id({ title: "Groupe | Accueil", navLabels: ["Particuliers", "Entreprises", "Collectivités", "Espace journalistes", "Actualités", "Presse", "Le groupe", "Recrutement"] });
  assert.notEqual(corporate?.sector, "news_media", JSON.stringify(corporate));
  const newsroom = id({ title: "Konzern", navLabels: ["Privatkunden", "Firmenkunden", "Newsroom", "Pressemitteilungen", "Nachrichten", "Karriere"] });
  assert.notEqual(newsroom?.sector, "news_media");
  // A real publication keeps its section navigation.
  const paper = id({ title: "Krant", navLabels: ["Binnenland", "Buitenland", "Politiek", "Economie", "Sport", "Cultuur", "Opinie", "Nieuws"] });
  assert.equal(paper?.sector, "news_media");
});

test("multilingual false friends never decide a sector", () => {
  assert.notEqual(id({ title: "Unsere Aktionen | Markt", description: "Das aktuelle Flugblatt mit allen Angeboten der Woche." })?.sector, "transport_travel", "Flugblatt = leaflet");
  assert.notEqual(id({ title: "IJsberen vlak naast woning", description: "Poolonderzoekers zien ijsberen vlak naast een woning." })?.sector, "transport_travel", "Dutch vlak = right next to");
  assert.notEqual(id({ title: "Onderzoeken, behandelingen en operaties", description: "Informatie over operaties en onderzoeken." })?.sector, "events_culture", "operaties ≠ opera");
  assert.equal(id({ title: "Flugsuche: günstige Flüge buchen", description: "Flüge, Fahrplan und Tickets für Ihre Reise." })?.sector, "transport_travel", "real flight wording still works");
  assert.equal(id({ title: "Staatsoper | Spielplan", description: "Oper, Ballett und Konzert: Spielplan und Tickets." })?.sector, "events_culture", "opera house still works");
});

test("customers, trades served and an organisation's own governing bodies are not its sector", () => {
  assert.notEqual(id({ title: "Pagamenti per farmacie e studi medici", description: "Soluzioni per farmacie" })?.sector, "health_wellness");
  assert.notEqual(id({ title: "Consejo de Gobierno | Universidad", description: "Órganos de gobierno de la universidad" })?.sector, "government");
  assert.equal(id({ title: "Gobierno de la región", description: "Portal del gobierno: trámites y servicios públicos para la ciudadanía." })?.sector, "government", "a real government keeps government");
  assert.ok(isAudiencePagePath("https://pay.test/it/attivita-commerciali/studi-medici"));
  assert.ok(isAudiencePagePath("https://maker.test/en/markets-products/healthcare/"));
  assert.ok(!isAudiencePagePath("https://maker.test/en/markets-products/"), "the index of the company's own range stays identity");
});

test("financial groups, bank business lines and insurers that only name their group", () => {
  assert.equal(id({ title: "Accueil - Groupe", description: "Un leader européen des services financiers, avec la banque de détail et la banque de financement." })?.sector, "financial_services");
  const coop = id({ title: "Organisatie | Groep", description: "Groep is een coöperatieve financiële dienstverlener met verzekeringen en pensioenen." });
  assert.equal(coop?.sector, "financial_services");
  // Software and consultancy FOR financial institutions are not banks.
  assert.notEqual(id({ title: "FinSoft – software voor financiële instellingen", description: "Software voor financiële instellingen en banken." })?.sector, "financial_services");
  assert.notEqual(id({ title: "Advies", description: "Consultancy for financial services firms" })?.sector, "financial_services");
});

test("B2B payment providers name payment for businesses; shops that accept payment do not", () => {
  const provider = detectPrimaryBusinessIdentity({ title: "Das beste PAYMENT | Anbieter", description: "Anbieter bietet das beste Payment für Ihr Business: Online, Instore oder Omnichannel." });
  assert.equal(provider.financialKind, "payments");
  const shop = detectPrimaryBusinessIdentity({ title: "Möbel online kaufen | Shop", description: "Bequem bezahlen per Rechnung. Zahlung für Ihr Zuhause ganz einfach." });
  assert.notEqual(shop.sector, "financial_services");
});

test("lodging compounds, software vendors, mobile operators, energy producers, government hosts", () => {
  assert.equal(detectPrimaryBusinessIdentity({ title: "Hotels & Resorts I Premiumhotels online buchen", description: "Premiumhotels in Berlin und Wien buchen." }).sector, "hospitality");
  assert.notEqual(detectPrimaryBusinessIdentity({ title: "Hotelshampoo online kaufen", description: "Pflege wie im Hotel – Shop" }).sector, "hospitality");
  assert.equal(id({ title: "Vendor Software - Succes begint hier", description: "Vendor automatiseert je organisatie in één systeem." })?.sector, "saas_b2b");
  assert.equal(id({ title: "Administratiekantoor", description: "Wij verzorgen uw boekhouding en belastingaangifte." })?.sector === "saas_b2b", false, "an accountant is not software");
  assert.equal(id({ title: "Sim only en mobiele abonnementen", description: "Mobiele abonnementen op ons 5G netwerk met dekking in heel het land." })?.sector, "telecom_technology");
  assert.equal(id({ title: "Samsung Galaxy 5G kopen | PhoneShop webshop", description: "Smartphones online bestellen met sim only." }), null, "a phone shop is retail");
  assert.equal(id({ title: "Werk: water, wind and sun", description: "Austria's leading energy company and one of the largest producers of electricity from renewable energies." })?.sector, "energy_utilities");
  assert.notEqual(id({ title: "Energy coaching", description: "Coaching for more energy in daily life" })?.sector, "energy_utilities");
  const gov = id({ title: "Startseite von portal", hostname: "portal.gv.at" });
  assert.equal(gov?.sector, "government");
  assert.ok(gov.confidenceScore < 80, "host-only government is probable, not confirmed");
  assert.equal(id({ title: "Shop", hostname: "admin.shop.com" }), null);
});

test("page evidence: identity pages typed 'other' count; editorial and market sub-pages never vote; clear majorities win", () => {
  const p = (path, title, description, type = "other") => ({ url: "https://site.test" + path, type, status: "audited", title, description, identityHeadings: [] });
  const energy = [
    p("/privat", "Energieanbieter in Österreich | Werk", "Als größter Energieanbieter liefert Werk Strom aus Wasserkraft und Gas.", "service"),
    p("/konzern/unternehmen", "Österreichs führendes Energieunternehmen | Werk", "Werk ist Österreichs führendes Energieunternehmen und Stromerzeuger aus Wasserkraft."),
    p("/business/strom", "Strom aus Wasserkraft für Ihr Gewerbe", "Strom und Gas: Tarife für Unternehmen, Stromlieferant aus erneuerbarer Energie."),
    p("/business/fiber", "Glasvezel internet en tv-abonnementen | Werk", "Snel glasvezel internet met tv en vaste telefonie."),
  ];
  const r = sectorPageEvidence("https://site.test/", energy);
  assert.equal(r.decision?.sector, "energy_utilities", JSON.stringify(r.candidates.map((c) => [c.sector, c.pages.length])));
  assert.equal(r.reason, "dominant_page_identity");
  const split = sectorPageEvidence("https://site.test/", [energy[0], energy[1], energy[3], { ...energy[3], url: "https://site.test/mobiel", title: "Sim only en mobiele abonnementen | Werk", description: "Mobiele abonnementen op ons 5G netwerk met dekking." }]);
  assert.equal(split.decision, null, "2 against 2 abstains");
  const news = sectorPageEvidence("https://site.test/", [p("/2026/10/23/energiepreise", "Energieanbieter erhöhen Preise", "Stromanbieter und Gasversorger erhöhen Tarife."), p("/news/strom", "Energieanbieter im Vergleich", "Stromanbieter und Tarife")]);
  assert.equal(news.decision, null, "dated and news pages never vote");
});

test("page gate: block, error and maintenance pages are rejected; real content is not", () => {
  assert.equal(classifyNonContentPage({ title: "Colruyt-like | AntiBot", text: "Please wait", words: 2 })?.kind, "challenge");
  assert.equal(classifyNonContentPage({ title: "Human Verification", text: "", words: 0 })?.kind, "challenge");
  assert.equal(classifyNonContentPage({ title: "Sorry! The connection was interrupted due to an error", text: "Sorry", words: 30 })?.kind, "error");
  assert.equal(classifyNonContentPage({ title: "Our site is currently undergoing maintenance | Brand", text: "Back soon", words: 6 })?.kind, "maintenance");
  assert.equal(classifyNonContentPage({ title: "Wartungsarbeiten", text: "Wir sind bald zurück", words: 4 })?.kind, "maintenance");
  assert.equal(classifyNonContentPage({ title: "Something went wrong? How to plan maintenance", text: "word ".repeat(900), words: 900 }), null, "long article about errors");
  assert.equal(classifyNonContentPage({ title: "Onderhoud van je cv-ketel | Installateur", text: "word ".repeat(600), words: 600 }), null, "a service page about maintenance");
  assert.equal(classifyNonContentPage({ title: "FAQ", text: "Wat als er een fout optreedt? " + "Antwoord. ".repeat(200), words: 410 }), null);
  const block = `<html><head><title>Shop | AntiBot</title></head><body><p>${"Please wait while we check your request. ".repeat(10)}</p></body></html>`;
  assert.equal(isSubstantiveRender(block), false, "a recovered block page is not a recovery");
});

test("manufacturer evidence needs the fetched page to describe product registration", () => {
  const page = (path, title, description) => ({ url: "https://maker.test" + path, status: "audited", title, description });
  assert.ok(manufacturerRegistrationEvidence([page("/support/register-your-product", "Product registration | Maker", "To register a new purchase, have the product at hand.")]));
  assert.ok(manufacturerRegistrationEvidence([page("/service/produktregistrierung", "Produktregistrierung | Marke", "Gerät registrieren und Garantie verlängern.")]));
  assert.equal(manufacturerRegistrationEvidence([page("/register-your-product", "Contact | Shop", "Questions about your order")]), null, "a URL alone never decides");
  assert.equal(manufacturerRegistrationEvidence([page("/account/register", "Create an account | Shop", "Register for an account")]), null, "account sign-up is not product registration");
});

test("jsonb-safe serialisation: a cut emoji or NUL never makes a report unsavable", () => {
  const cut = "Halloween 🎃 deals".slice(0, 11);
  assert.equal(cut.isWellFormed(), false);
  const stored = jsonbStringify({ title: cut, nested: [{ t: "a\u0000b" }], [cut]: 1 });
  assert.doesNotMatch(stored, /\\ud[89a-f][0-9a-f]{2}|\\u0000/i);
  assert.equal(JSON.parse(stored).nested[0].t, "ab");
  assert.equal(jsonbSafeString("Normale tekst 🎃 blijft"), "Normale tekst 🎃 blijft");
  // The database layer repairs JSON text built elsewhere with JSON.stringify.
  const repaired = safeQueryParam(JSON.stringify({ title: cut }));
  assert.doesNotMatch(repaired, /\\ud83c(?!\\ud)/i);
  assert.equal(safeQueryParam("{not json \u0000"), "{not json ");
  assert.equal(safeQueryParam(42), 42);
  assert.equal(safeQueryParam('{"ok":"🎃"}'), '{"ok":"🎃"}');
});

test("replay of recorded 96-site identities: no wrong sector, and no regression below the measured level", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/testlab-96-replay/identity.json", import.meta.url), "utf8"));
  const rows = replayAll(fixture);
  const wrong = rows.filter((r) => r.verdict === "wrong");
  assert.deepEqual(wrong.map((r) => `${r.host}: ${r.decision.sector}`), [], "identity layer must never assign a wrong sector on recorded real pages");
  // Measured on 23 Oct 2026: 41 before this round, 52 after. A lower number is a regression.
  assert.ok(rows.filter((r) => r.verdict === "compatible").length >= 52);
});
