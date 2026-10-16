import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { detectEuPrimaryIdentity, governmentHostname, retailSelfDescription } from "../lib/eu-identity.ts";

// Real identity data read from live EU homepages (issue #151). Neutral hosts:
// the detector may only use language, structure and schema, never a brand.
const DIR = new URL("./fixtures/eu-real-identity/", import.meta.url);
const real = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const neutralHost = (f) => (/\.gov\./.test(f.site) ? f.site : `site-${f.country.toLowerCase()}.test`);
const input = (f) => ({ title: f.title, description: f.desc, h1s: f.h1, h2s: f.h2, ogSiteName: f.ogSite, navLabels: f.nav, schemaTypes: f.types, hostname: neutralHost(f), homepage: true });

for (const f of real) {
  test(`real EU homepage ${f.site} (${f.country}, ${f.lang}): identity is ${f.expected}${f.acceptUnknown ? " or abstains" : ""}`, () => {
    const id = detectEuPrimaryIdentity(input(f));
    if (f.expected === "ecommerce") {
      assert.equal(id, null, `a shop must not get a non-retail identity: ${JSON.stringify(id)}`);
      assert.ok(retailSelfDescription([f.title, f.desc].join(" ")), "retail self-description recognised");
      return;
    }
    if (f.acceptUnknown && !id) return;
    assert.ok(id, "identity expected");
    assert.equal(id.sector, f.expected, JSON.stringify(id));
    assert.ok(id.evidence.length > 0);
  });
}

test("weak (navigation-only) identity is medium confidence, never 90+", () => {
  const oebb = real.find((f) => f.site === "oebb.at");
  const id = detectEuPrimaryIdentity(input(oebb));
  assert.equal(id?.sector, "transport_travel");
  assert.equal(id.confidence, "medium");
  assert.ok(id.confidenceScore < 80);
});

// Negative controls: ordinary pages that contain the risky words but are not
// that kind of organisation. Each must abstain (null) or name its own sector.
const negatives = [
  { name: "IT electronics shop with financing and gift cards", expectNot: ["financial_services"], v: { title: "ElettroShop – negozio online di elettronica", description: "Smartphone, TV e lavatrici. Finanziamento e credito al consumo, carte regalo, spedizione gratuita.", h1s: ["Offerte"] } },
  { name: "DE shop selling travel goods and tickets", expectNot: ["transport_travel", "events_culture"], v: { title: "Reisegepäck online kaufen | Koffer-Shop", description: "Koffer und Reiserucksäcke im Onlineshop. Zugang zu Gutscheinen, Tickets fürs Gewinnspiel.", h1s: ["Koffer"] } },
  { name: "NL corporate page with investor relations", expectNot: ["financial_services"], v: { title: "Over ons | Industrie BV", description: "Investor relations, jaarverslag en kredietbeoordeling van onze industriegroep.", h1s: ["Over ons"] } },
  { name: "Hotel with 24h reception", expectNot: ["health_wellness"], v: { title: "Hotel Aurora – 24/7 reception", description: "Rooms with breakfast, reception open day and night.", h1s: ["Hotel Aurora"] } },
  { name: "Italian travel agency selling packages", expectNot: ["transport_travel"], allowSector: ["transport_travel"], v: { title: "Agenzia Viaggi Sole – pacchetti vacanze", description: "Pacchetti vacanze, posti disponibili e offerte last minute.", h1s: ["Viaggi"] } },
  { name: "ES company with e-mail contact and shipping", expectNot: ["transport_travel"], v: { title: "Muebles García – tienda online", description: "Envío gratis. Contacto por correo electrónico.", h1s: ["Muebles"] } },
  { name: "Dutch recipe blog", expectNot: ["health_wellness"], v: { title: "Recepten voor elke dag | Kookblog", description: "Gezonde recepten en ziektevrije tuintips.", h1s: ["Recepten"] } },
  { name: "German electrician", expectNot: ["energy_utilities"], v: { title: "Elektriker Müller – Elektroinstallation", description: "Ihr Elektriker für Strominstallation und Gastronomiebetriebe.", h1s: ["Elektriker Müller"] } },
  { name: "Swedish communication agency", expectNot: ["government"], v: { title: "Kommunikationsbyrå i Stockholm", description: "Vi hjälper kommunikationsavdelningar med strategi.", h1s: ["Byrån"] } },
  { name: "Optician (Optik) is not telecom", expectNot: ["telecom_technology"], v: { title: "Optik Weber – Brillen und Kontaktlinsen", description: "Ihr Optiker in Graz. Sehtest und Brillen.", h1s: ["Optik Weber"] } },
  { name: "Admin subdomain of a shop is not government", expectNot: ["government"], v: { title: "Login", description: "Admin portal", hostname: "admin.shop.com" } },
  { name: "Blog post about trends with 'trend'/'Zugang' words", expectNot: ["transport_travel"], v: { title: "Trends 2026 – Zugang zu neuen Märkten", description: "Strong trends and trip reports for marketers.", h1s: ["Trends"] } },
];
for (const n of negatives) {
  test(`negative control: ${n.name}`, () => {
    const id = detectEuPrimaryIdentity({ homepage: true, ...n.v });
    if (!id) return;
    if (n.allowSector?.includes(id.sector)) return;
    assert.ok(!n.expectNot.includes(id.sector), `${n.name} wrongly became ${id.sector}: ${JSON.stringify(id.evidence)}`);
  });
}

// Positive controls in further EU languages (synthetic, no brands).
const positives = [
  { lang: "pl", sector: "news_media", v: { title: "Wiadomości z kraju i ze świata | Portal", description: "Najnowsze wiadomości, redakcja portalu informacyjnego." } },
  { lang: "hu", sector: "news_media", v: { title: "Hírek – friss hírek itthonról", description: "A legfrissebb hírek, szerkesztőség és hírportál.", h1s: ["Hírek"] } },
  { lang: "el", sector: "news_media", v: { title: "Ειδήσεις σήμερα", description: "Οι τελευταίες ειδήσεις από την Ελλάδα και τον κόσμο." } },
  { lang: "fi", sector: "news_media", v: { title: "Uutiset | Yleisradio", description: "Tuoreimmat uutiset, televisio ja radio." } },
  { lang: "lt", sector: "financial_services", v: { title: "Bankas – sąskaitos, paskolos ir kortelės", description: "Atidarykite sąskaitą, gaukite paskolą, kredito kortelę ir taupymo indėlį.", schemaTypes: ["BankOrCreditUnion"] } },
  { lang: "es", sector: "financial_services", v: { title: "Banco – cuentas, hipotecas y tarjetas", description: "Abre tu cuenta corriente, solicita una hipoteca o una tarjeta de crédito. Ahorro e inversión." } },
  { lang: "pl", sector: "transport_travel", v: { title: "Bilety kolejowe i rozkład jazdy | Koleje", description: "Kup bilet na pociąg i sprawdź rozkład jazdy." } },
  { lang: "fr", sector: "transport_travel", v: { title: "Billets de train et horaires", description: "Réservez vos billets de train, consultez les horaires et votre voyage." } },
  { lang: "de", sector: "transport_travel", v: { title: "Post – Briefe und Pakete verschicken", description: "Briefmarken kaufen, Paket versenden und Postfiliale finden." } },
  { lang: "fr", sector: "government", v: { title: "Service Public – démarches administratives", description: "Le site officiel de l'administration publique.", hostname: "www.service.gouv.fr" } },
  { lang: "pl", sector: "government", v: { title: "Portal obywatela", description: "Usługi administracji publicznej online.", hostname: "www.gov.pl" } },
  { lang: "it", sector: "education", v: { title: "Università degli Studi – corsi di laurea", description: "Facoltà, studenti e ricerca." } },
  { lang: "fi", sector: "education", v: { title: "Yliopisto – opiskelu ja tutkimus", description: "Opiskelijat ja tiedekunnat." } },
  { lang: "de", sector: "health_wellness", v: { title: "Gesundheitsportal", description: "Informationen zu Krankheiten, Gesundheit und Krankenhaus-Suche. E-Rezept einlösen." } },
  { lang: "it", sector: "telecom_technology", v: { title: "Fibra e offerte mobile", description: "Internet in fibra ottica e offerte mobile con 5G." } },
  { lang: "pt", sector: "energy_utilities", v: { title: "Eletricidade e gás natural", description: "Contrate eletricidade e gás com o melhor tarifário do fornecedor." } },
];
for (const p of positives) {
  test(`positive control (${p.lang}): ${p.sector}`, () => {
    const id = detectEuPrimaryIdentity({ homepage: true, ...p.v });
    assert.equal(id?.sector, p.sector, JSON.stringify(id));
  });
}

test("government hostname uses only the label before the TLD", () => {
  for (const h of ["portal.gov.cz", "www.gov.pl", "www.service.gouv.fr", "www.bmf.gv.at", "www.admin.ch", "www.gob.es", "agency.gov"]) assert.ok(governmentHostname(h), h);
  for (const h of ["admin.shop.com", "gov.example.com", "govshop.nl", "mygov.test", "bund-shop.de"]) assert.ok(!governmentHostname(h), h);
});
