// QA international-28 (TestLab @ 3d9239aa, 25 Oct 2026): structural classes, not
// sites. Every text below is a neutral invented example; no brand or domain rule.
import test from "node:test";
import assert from "node:assert/strict";
import { detectDeclaredIndustry } from "../lib/site-sector-corroboration.mjs";
import { buildScanEvidence } from "../lib/scan-evidence.ts";
import { confirmedFaqContent } from "../lib/faq-evidence.ts";
import { matchedLegalSignals } from "../lib/legal-lexicon.ts";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";

const declared = (title, description) => detectDeclaredIndustry({ title, description });

test("own self-description is recognised in more European languages (existing sectors only)", () => {
  const cases = [
    ["real_estate", "Ejendomsmægler | Boliger til salg", "Vi er ejendomsmæglere og hjælper dig med at sælge din bolig."],
    ["real_estate", "Fastighetsmäklare | Bostäder till salu", "Vi är fastighetsmäklare som hjälper dig att sälja din bostad."],
    ["real_estate", "Eiendomsmegler | Boliger til salgs", "Vi er eiendomsmeglere og hjelper deg å selge boligen din."],
    ["real_estate", "Kiinteistönvälitys | Asunnot myynnissä", "Olemme kiinteistönvälittäjä. Löydä myytävät asunnot."],
    ["real_estate", "Biuro nieruchomości | Mieszkania na sprzedaż", "Jesteśmy biurem nieruchomości."],
    ["real_estate", "Imobiliária | Casas à venda", "Somos uma imobiliária: comprar, vender ou arrendar casa."],
    ["financial_services", "Hypotheekadviseur | Onafhankelijk hypotheekadvies", "Wij zijn hypotheekadviseurs en helpen je aan de beste hypotheek."],
    ["financial_services", "Baufinanzierung | Beratung", "Wir sind Ihr Berater für Baufinanzierung und Immobilienkredite."],
    ["health_wellness", "Hospitais e clínicas | Marcar consulta", "Somos uma rede de hospitais e clínicas privadas. Marque a sua consulta."],
    ["health_wellness", "Arzttermine online buchen", "Finden Sie Ärzte und buchen Sie Ihren Termin online."],
    ["saas_b2b", "Hosting, domini e server | Hosting provider", "Siamo un provider di hosting: registra il tuo dominio, hosting web, server e cloud."],
    ["manufacturing_industrial", "Construction company | Building and civil engineering", "We are a construction company that builds tunnels, bridges and infrastructure."],
    ["service_marketplace", "Få tilbud fra håndverkere", "Legg ut jobben gratis og få tilbud fra kvalifiserte håndverkere."],
    ["service_marketplace", "Encuentra profesionales para tu reforma | Pide presupuestos", "Pide presupuestos gratis a profesionales de reformas."],
  ];
  for (const [sector, title, description] of cases) assert.equal(declared(title, description)?.sector, sector, title);
});

test("negative controls: audiences, agencies, own staff, local builders and banks keep their own identity", () => {
  for (const [title, description] of [
    ["Ziekenhuissoftware | EPD voor zorg", "Software voor ziekenhuizen en klinieken: afspraken, patiëntendossier."],
    ["Bauunternehmen Meier | Hausbau", "Wir sind ein Bauunternehmen für Einfamilienhäuser und Gebäude in der Region."],
    ["Webbureau Pixel | Webdesign en hosting", "Wij maken websites en verzorgen hosting, domeinnamen en e-mail."],
    ["CRM voor makelaars", "Software voor makelaars: woningaanbod en bezichtigingen."],
    ["Hypotheeksoftware", "Software voor hypotheekadviseurs: dossier en rente."],
    ["Tømrer Hansen | Få tilbud", "Få et gratis tilbud fra våre håndverkere i Oslo."],
    ["Event hosting | Party venue", "We are a venue for event hosting, weddings and parties."],
    ["Bank Zuid | Betalen, sparen, hypotheken", "Bank Zuid: betaalrekening, sparen, hypotheek en lenen."],
  ]) {
    const d = declared(title, description);
    assert.ok(!d || !["health_wellness", "manufacturing_industrial", "saas_b2b", "real_estate", "financial_services", "service_marketplace"].includes(d.sector) || (title.startsWith("Bank") && d.key !== "financial_mortgage"), `${title}: ${JSON.stringify(d)}`);
  }
  // An animal hospital stays veterinary care.
  assert.equal(detectDeclaredIndustry({ title: "Veterinary clinic", description: "Animal health treatment and veterinary care", identityHeadings: ["Veterinary hospital"] })?.key, "veterinary");
  // A software vendor for hospitals is not a care provider.
  const id = detectEuPrimaryIdentity({ title: "EPD Zorg | Ziekenhuissoftware", description: "Software voor ziekenhuizen en klinieken: afspraken, patiëntendossier en planning.", h1s: ["Het EPD voor de zorg"], navLabels: ["Functies", "Demo aanvragen", "Prijzen"], homepage: true, hostname: "x.test" });
  assert.notEqual(id?.sector, "health_wellness");
});

test("visible prices: Swiss francs, round-price notation, Nordic kr by country, non-EU European currencies", () => {
  const prices = (url, lang, body) => buildScanEvidence({ url, html: `<html lang="${lang}"><body><p>${body}</p></body></html>`, language: lang }).commerce.prices.value;
  assert.deepEqual(prices("https://x.ch/", "de", "CHF 1’299.– statt Fr. 1'499.90"), { count: 2, currencies: ["CHF"] });
  assert.deepEqual(prices("https://x.nl/", "nl", "Nu € 12,- of €12,95"), { count: 2, currencies: ["EUR"] });
  assert.deepEqual(prices("https://x.se/", "sv", "Pris 199 kr, 1 299 kr").currencies, ["SEK"]);
  assert.deepEqual(prices("https://x.dk/", "da", "Pris 199,- kr.").currencies, ["DKK"]);
  assert.deepEqual(prices("https://x.no/", "nb", "Kr 1 499,-").currencies, ["NOK"]);
  // Plain "kr" without a country stays unassigned (never guessed).
  assert.deepEqual(prices("https://x.com/", "en", "Only 199 kr"), { count: 1, currencies: [] });
  assert.deepEqual(prices("https://x.rs/", "sr", "Cena 1.299 RSD ili 999 дин.").currencies, ["RSD"]);
  assert.deepEqual(prices("https://x.ua/", "uk", "Ціна 1 299 грн або ₴499").currencies, ["UAH"]);
  // Not prices: years, phone numbers, opening hours, words that equal currency codes.
  for (const body of ["Sinds 1999 werken wij met 25 medewerkers.", "Bel 020-1234567", "Ruf an: Fr. 9-18 Uhr", "Try 14 days free", "Shower gel 250 ml", "All 25 emergencies", "5 km 3 stops"]) {
    assert.equal(prices("https://x.com/", "en", body).count, 0, body);
  }
});

test("FAQ: a question and its answer in more languages and markups; a lone FAQ heading is not proof", () => {
  const A = "<p>Dit is het volledige antwoord op de vraag.</p>";
  assert.equal(confirmedFaqContent(`<h3>¿Cuánto tarda el envío</h3>${A}`), true);
  assert.equal(confirmedFaqContent(`<h3>Quanto costa la spedizione in Italia</h3><div><div>${A}</div></div>`), true);
  assert.equal(confirmedFaqContent(`<dt>Hur lång är leveranstiden</dt><dd>Leveranstiden är normalt två till tre dagar.</dd>`), true);
  assert.equal(confirmedFaqContent(`<button aria-expanded="false">Ile kosztuje dostawa do domu?</button><div>Dostawa kosztuje 9,99 zł w całej Polsce.</div>`), true);
  assert.equal(confirmedFaqContent(`<h3>Πόσο κοστίζει η αποστολή;</h3>${A}`), true);
  assert.equal(confirmedFaqContent(`<h3>Care instructions for wool</h3>${A}`), false);
  assert.equal(confirmedFaqContent(`<h3>Co-working spaces in Krakow</h3>${A}`), false);
  assert.equal(confirmedFaqContent(`<h2>FAQ</h2>${A}`), false);
  assert.equal(confirmedFaqContent(`<h3>Wat kost het?</h3><p>Niets.</p>`), false);
});

test("legal links (privacy, cookies, terms) in Nordic, Finnish, Polish and other EU/EEA languages", () => {
  for (const [href, label, kind] of [
    ["/integritetspolicy", "Integritetspolicy", "privacy"], ["/personvern", "Personvernerklæring", "privacy"], ["/tietosuoja", "Tietosuojaseloste", "privacy"],
    ["/polityka-prywatnosci", "Polityka prywatności", "privacy"], ["/evasteet", "Evästeet", "cookies"], ["/kopvillkor", "Köpvillkor", "terms"],
    ["/regulamin", "Regulamin sklepu", "terms"], ["/handelsbetingelser", "Handelsbetingelser", "terms"],
  ]) assert.equal(matchedLegalSignals(href, label)[kind], true, href);
});
