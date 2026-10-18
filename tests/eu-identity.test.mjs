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

test("further EU languages: PL airline, FI bank, EE telecom, LV news, LT rail, HU post, DK rail", () => {
  const cases = [
    ["passenger_transport", { title: "Tanie loty i bilety lotnicze | Polskie Linie Lotnicze", description: "Zarezerwuj lot online." }],
    ["financial_banking", { title: "Pankki – lainat, säästäminen ja pankkitili", description: "Avaa pankkitili, hae lainaa ja luottokortti." }],
    ["telecom_technology", { title: "Mobiilside, kiudoptiline internet ja TV", description: "Mobiilside paketid ja kiire internet." }],
    ["news_media", { title: "Ziņas | Latvijas sabiedriskie mediji", description: "Jaunākās ziņas no Latvijas un pasaules." }],
    ["passenger_transport", { title: "Traukinių bilietai ir tvarkaraštis", description: "Pirkite traukinio bilietus internetu." }],
    ["postal_logistics", { title: "Posta – levél- és csomagküldés, bélyeg", description: "Csomagfeladás, levélküldés és postai szolgáltatások." }],
    ["passenger_transport", { title: "Tog, billetter og rejseplan", description: "Køb billetter til tog i hele Danmark." }],
  ];
  for (const [key, v] of cases) assert.equal(detectEuPrimaryIdentity({ ...v, homepage: true })?.key, key, v.title);
  // "a lot of", "parking lot" are not flights.
  assert.equal(detectEuPrimaryIdentity({ title: "Parking lot cleaning – a lot of experience", description: "We clean parking lots and garages.", homepage: true }), null);
});

test("academic medical centres: care is primary, teaching and research secondary", async () => {
  const { detectEuPrimaryIdentity: d } = await import("../lib/eu-identity.ts");
  const cases = [
    { title: "Musterstadt – Universitätsmedizin", description: "Krankenversorgung, Forschung und Lehre an einem der größten Universitätsklinika.", schemaTypes: ["CollegeOrUniversity"] },
    { title: "UMC Noordstad – ziekenhuis, onderzoek en onderwijs", description: "Universitair medisch centrum voor patiëntenzorg." },
    { title: "CHU de Villeneuve", description: "Centre hospitalier universitaire : soins, urgences, recherche." },
    { title: "Policlinico Universitario Esempio", description: "Assistenza sanitaria, ricerca e didattica." },
    { title: "Hospital Universitario Ejemplo", description: "Atención sanitaria, investigación y docencia." },
  ];
  for (const c of cases) {
    const r = d({ ...c, homepage: true });
    assert.equal(r?.sector, "health_wellness", c.title);
    assert.ok((r?.secondary || []).some((x) => x.sector === "education") || !/univers/i.test(c.title + c.description), `${c.title}: education secondary`);
  }
  // Universities (also medical universities) stay education.
  for (const title of ["Universiteit Noordstad", "Medizinische Universität Musterstadt", "University of Exampletown"]) {
    assert.equal(d({ title, description: "Studium, Forschung und Lehre; faculties and students.", homepage: true })?.sector, "education", title);
  }
  // A bare acronym without any care concept is not a hospital.
  assert.notEqual(d({ title: "UKM Holding", description: "Investments and consulting.", homepage: true })?.sector, "health_wellness");
});

test("manufacturers and industrial suppliers are recognised in EU languages, software stays software", async () => {
  const { detectEuPrimaryIdentity: d } = await import("../lib/eu-identity.ts");
  const ind = [
    { title: "Lumetrix | Supplier to the semiconductor industry", description: "We provide chipmakers with hardware, software and services for lithography." },
    { title: "Machinefabriek Noord – machinebouw op maat", description: "Wij ontwerpen en bouwen verpakkingsmachines voor de voedingsindustrie." },
    { title: "Brenner – Werkzeugmaschinen", description: "Hersteller von Werkzeugmaschinen für die industrielle Fertigung." },
    { title: "Fonderie Martin", description: "Fabricant de pièces en acier pour l'industrie aéronautique." },
    { title: "Rossi Valvole", description: "Produttore di valvole e pompe industriali." },
    { title: "Componentes Ibéricos", description: "Fabricante de componentes y maquinaria industrial." },
  ];
  for (const c of ind) assert.equal(d({ ...c, homepage: true })?.sector, "manufacturing_industrial", c.title);
  const not = [
    { title: "Acme – planning software for manufacturing", description: "SaaS platform for production planning in the manufacturing industry. Book a demo." },
    { title: "Fabriek Bar & Restaurant", description: "Lunch, diner en borrel in een oude fabriek." },
    { title: "Laserkliniek Amsterdam", description: "Laserbehandeling tegen pigmentvlekken. Maak een afspraak." },
    { title: "Advies voor de industrie | Bureau X", description: "Strategisch advies en interim management voor industriële bedrijven." },
  ];
  for (const c of not) assert.notEqual(d({ ...c, homepage: true })?.sector, "manufacturing_industrial", c.title);
});

test("multi-activity groups: certainty is capped and the other activities stay visible", async () => {
  const { detectEuPrimaryIdentity: d } = await import("../lib/eu-identity.ts");
  const r = d({ title: "Gruppo Nazionale - Servizi postali, finanziari e assicurativi", description: "Spedizioni, pacchi, conti, carte, assicurazioni e pagamenti.", homepage: true });
  assert.ok(r && r.confidenceScore <= 72 && r.confidence === "medium", JSON.stringify(r));
  // The activity named first in the organisation's own title is primary.
  assert.equal(r.sector, "transport_travel");
  assert.ok((r.secondary || []).some((x) => x.sector === "financial_services"));
  assert.equal(d({ title: "Gruppo Y - Servizi assicurativi, finanziari e postali", homepage: true }).sector, "financial_services");
  // A single-activity insurer or bank keeps its certainty.
  assert.ok(d({ title: "Versicherer Nord – Versicherung und Vorsorge", description: "Autoversicherung, Hausratversicherung", homepage: true }).confidenceScore >= 90);
});

test("component makers that name the systems they build are industrial, without a maker word (field scan 16-10)", async () => {
  const { detectEuPrimaryIdentity: d } = await import("../lib/eu-identity.ts");
  const nav = ["Car", "First Equipment: Success Stories", "Motorcycle", "Original Equipment: Success Stories", "Motorsport", "Formula 1"];
  const yes = [
    { title: "Innovation and Safety in Braking Systems for Cars and Bikes | Frena EN", description: "Discover the latest innovations in braking systems and mobility. Explore our products.", navLabels: nav },
    { title: "Bremssysteme für Pkw und Nutzfahrzeuge | Muster AG", description: "Wir liefern Bremssysteme in Erstausrüstung an Fahrzeughersteller." },
    { title: "Sistemi frenanti per auto e moto | Freni Nord", description: "Sistemi frenanti e componenti per il primo equipaggiamento." },
  ];
  for (const c of yes) {
    const r = d({ ...c, homepage: true });
    assert.equal(r?.sector, "manufacturing_industrial", c.title);
    // No maker word: medium certainty, never a confidently claimed identity.
    assert.ok(r.confidence === "medium" && r.confidenceScore < 85 && r.confidenceScore >= 75, JSON.stringify(r));
  }
  const no = [
    { title: "Autogarage De Vries – APK, onderhoud, remmen en banden", description: "Uw garage in Utrecht voor APK, onderhoud en reparatie." },
    { title: "Remschijven en remblokken kopen | AutoParts webshop", description: "Remschijven in OEM-kwaliteit, snel geleverd." },
    { title: "Best brake systems of 2026 reviewed", description: "Our guide to brake pads and discs." },
    { title: "Fleet software for braking systems monitoring", description: "SaaS platform for brake wear analytics. Book a demo." },
  ];
  for (const c of no) assert.notEqual(d({ ...c, homepage: true })?.sector, "manufacturing_industrial", c.title);
});

test("carrier sector from own mode label and independent booking/search heading", () => {
  const examples = [
    { title: "Northline Airlines", h2s: ["Flight search", "Explore our destinations"], hostname: "neutral-en.test" },
    { title: "Skybridge Airlines", h2s: ["Find flights", "Our highlight"], hostname: "neutral2-en.test" },
    { title: "Noordelijke Luchtvaart", h2s: ["Vluchten zoeken", "Bestemmingen"], hostname: "neutral-nl.test" },
    { title: "Compagnie aérienne du Nord", h2s: ["Rechercher des vols", "Nos destinations"], hostname: "neutral-fr.test" },
  ];
  for (const value of examples) {
    const id = detectEuPrimaryIdentity({ homepage: true, ...value });
    assert.equal(id?.sector, "transport_travel", JSON.stringify({ value, id }));
    assert.equal(id?.confidence, "medium", JSON.stringify(id));
    assert.ok(id?.confidenceScore < 80, JSON.stringify(id));
  }
});

test("booking widgets and transport commentary are not sufficient for operator identity", () => {
  const negatives = [
    { title: "Airlines Comparison | Ticket Finder", h2s: ["Flight search", "Find flights"] },
    { title: "Compare Airlines & Flights", description: "Find and compare available flights.", h2s: ["Flight search"] },
    { title: "Airline Reviews Blog", h2s: ["Flight search", "Guide to flights"] },
    { title: "TechCo | Travel Booking Software", h2s: ["Flight search", "Book flights"] },
    { title: "Holiday Travel Agency", h2s: ["Flight search", "Book flights"] },
  ];
  for (const value of negatives) {
    const id = detectEuPrimaryIdentity({ homepage: true, hostname: "neutral.test", ...value });
    assert.notEqual(id?.key, "passenger_transport", JSON.stringify({ value, id }));
  }
});

test("primary NGO identity outranks an incidental Store and LegalService schema", () => {
  const id=detectEuPrimaryIdentity({
    title:"Natuur beschermen in Nederland | Natuurmonumenten",
    description:"Bescherm natuurgebieden. Word lid of doneer en help de natuur te behouden.",
    h1s:["Natuurmonumenten"],
    navLabels:["Word lid","Doneer","Natuurgebieden","Webwinkel","Nieuws"],
    schemaTypes:["NGO","Organization","Store","LegalService"],
    hostname:"neutral-cause.test",homepage:true,
  });
  assert.equal(id?.sector,"nonprofit",JSON.stringify(id));
  assert.equal(id?.key,"nonprofit");
  assert.equal(id?.label,"Goede doelen & Non-profit");
  assert.ok(id.confidenceScore<=92 && id.confidenceScore>=80,JSON.stringify(id));
  assert.ok(id.evidence.some(x=>/NGO/.test(x)),JSON.stringify(id));
});

test("nonprofit identity requires real mission evidence and respects retail/page identity", () => {
  const negativeCases=[
    {title:"Winkel met natuurproducten | Groene Shop",description:"Online webshop en retail voor natuurliefhebbers.",schemaTypes:["Store","Organization"],navLabels:["Doneren","Producten","Winkelwagen"]},
    {title:"Advocatenkantoor De Buren",description:"Onze cliënten omvatten organisaties voor natuurbescherming.",schemaTypes:["LegalService"],navLabels:["Diensten","Nieuws","Contact"]},
    {title:"Natuurexcursies",description:"Wandelroutes en excursies in de natuur.",schemaTypes:["Organization","Store"],navLabels:["Tickets","Boek nu"]},
    {title:"Online webshop en winkel | GoedDoel Producten",description:"Shop online voor producten.",schemaTypes:["NGO","Store"],navLabels:["Winkelwagen","Checkout"]},
  ];
  for(const value of negativeCases){
    const id=detectEuPrimaryIdentity({hostname:"neutral.test",homepage:true,...value});
    assert.notEqual(id?.sector,"nonprofit",JSON.stringify({value,id}));
  }
});
