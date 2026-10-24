// Sector recognition 24-10: multilingual local-trade identity, market/audience
// mentions, side offers on sub-pages and the sales channel. Pure unit tests; the
// full-route behaviour is covered by tests/scan-matrix/run-local-business.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { detectDeclaredIndustry, corroborateDeclaredIndustry, refineSubtype, LOCAL_TRADE_KEYS } from "../lib/site-sector-corroboration.mjs";
import { compareSector } from "../scripts/testlab/labels.mjs";

const declared = (title, description = "", h1 = []) => detectDeclaredIndustry({ title, description, identityHeadings: h1 })?.key ?? null;

test("each local trade is recognised from its own trade noun in six languages", () => {
  const cases = [
    ["optician", "Brillen en contactlenzen | Optiek Jansen", "Uw opticien voor brillen en oogmeting."],
    ["optician", "Opticians | Glasses & Eye Tests", "Book an eye test with our optometrists."],
    ["optician", "Augenoptiker Weber | Brillen & Kontaktlinsen", "Ihr Optiker für Sehtest und Brillen."],
    ["optician", "Opticien Martin : lunettes de vue", "Votre opticien pour un examen de vue."],
    ["optician", "Óptica Sol | Gafas graduadas y lentillas", "Tu óptica para la revisión visual."],
    ["optician", "Ottica Bianchi | Occhiali da vista", "La tua ottica per il controllo della vista."],
    ["hair_salon", "Kapsalon Lotte | Knippen en kleuren", "Jouw kapper in Utrecht."],
    ["hair_salon", "Hair Salon in Leeds | Cutline", "Hairdressers for cuts, colour and blow dry."],
    ["hair_salon", "Friseur Schnitt | Haarschnitt & Farbe", "Ihr Friseur in Köln. Termin buchen."],
    ["hair_salon", "Salon de coiffure Belle | Coupe et couleur", "Votre coiffeur à Lyon."],
    ["hair_salon", "Peluquería Rosa | Corte y color", "Tu peluquería en Madrid. Pide cita."],
    ["hair_salon", "Parrucchiere Luca | Taglio e colore", "Il tuo parrucchiere a Milano."],
    ["hotel", "Hotel Sol | Habitaciones con desayuno", "Hotel de 4 estrellas en Madrid."],
    ["hotel", "Hôtel Lumière Paris", "Réservez votre chambre dans notre hôtel."],
    ["hotel", "Albergo Roma | Camere e suite", "Prenota il tuo soggiorno al nostro albergo."],
    ["restaurant", "Ristorante Da Mario | Pizza napoletana", "Prenota un tavolo o ordina a domicilio."],
    ["restaurant", "Restaurante Casa Pepe | Cocina tradicional", "Consulta nuestra carta y reserva tu mesa."],
    ["restaurant", "Gasthaus zum Löwen | Bayerische Küche", "Speisekarte und Tisch reservieren."],
    ["dentist", "Zahnarztpraxis Dr. Weber", "Ihre Zahnarztpraxis: Prophylaxe und Implantate. Termin vereinbaren."],
    ["dentist", "Studio Dentistico Rossi | Dentista a Torino", "Igiene e implantologia. Prenota una visita."],
    ["car_repair", "Taller Mecánico López | Reparación de coches", "Mantenimiento, neumáticos y frenos. Pide cita."],
    ["car_repair", "Officina Bianchi | Autofficina", "Tagliando, revisione e pneumatici."],
    ["physiotherapy", "Cabinet de kinésithérapie | Rennes", "Rééducation et massages. Prenez rendez-vous."],
    ["real_estate", "Agenzia Immobiliare Verdi | Roma", "Appartamenti in vendita e in affitto."],
    ["bakery", "Bäckerei Schmidt | Brot und Brötchen", "Frisches Brot und Kuchen jeden Tag."],
    ["pharmacy", "Farmacia Centrale | Genova", "Farmaci, ricette e consulenza del farmacista."],
  ];
  for (const [key, title, description] of cases) assert.equal(declared(title, description), key, `${title} → expected ${key}`);
});

test("products, markets and look-alike words never declare a trade", () => {
  const none = [
    // Product webshops: the trade's goods, not the trade.
    ["Contactlenzen online bestellen | Lenzenshop", "Bestel je contactlenzen en lenzenvloeistof online."],
    ["Sunglasses & Eyewear | Official Online Store", "Shop polarized sunglasses online."],
    ["Haarproducten online kopen | Haarshop", "Shampoo, conditioner en styling online bestellen."],
    // Software and suppliers for the trade.
    ["Hotel booking engine & channel manager | Roomly", "Software for hotels: booking engine and payments."],
    ["Salon booking software | Bookly", "Online booking for hair salons and barbers."],
    ["Kassasysteem voor kappers | Kassa", "Afspraken en betalingen voor jouw salon."],
    ["Logiciel de caisse pour les restaurants | Caisse", "Prise de commande et paiement pour votre restaurant."],
    ["Horeca-apparatuur online kopen | Keukenshop", "Keukenapparatuur voor restaurants en cafés."],
    ["Restaurant equipment wholesale | ChefSupply", "Commercial kitchen equipment for restaurants."],
    // Fibre optics is telecom, not an optician.
    ["Fibra óptica y móvil | Telco", "Internet de fibra óptica a 1 Gb."],
    ["Fibra ottica e mobile | Tel", "Internet in fibra ottica veloce."],
    ["Internet fibre optique | Opérateur", "Box internet fibre optique et mobile."],
  ];
  for (const [title, description] of none) assert.equal(declared(title, description), null, `${title} must not declare a trade`);
});

test("a side offer of another local trade on a sub-page does not contradict the homepage", () => {
  const root = "https://airport.test/";
  const home = { url: root, type: "homepage", status: "audited", title: "Airport.test: Welcome to Airport.test Airport", description: "The biggest airport in the region, serving hundreds of destinations and flights." };
  const pages = [
    { url: root + "travel/terminals", type: "service", status: "audited", title: "Terminals | Airport.test", description: "Departures and arrivals at our airport terminals and gates." },
    { url: root + "parking/hotel-and-parking", type: "service", status: "audited", title: "Hotel and parking | Airport.test", description: "Book a hotel room with breakfast and parking at the airport hotel." },
  ];
  const r = corroborateDeclaredIndustry(root, home, pages);
  assert.equal(r.decision?.key, "airports", JSON.stringify(r));
  // A real conflict between non-local activities still abstains.
  const conflict = corroborateDeclaredIndustry("https://mix.test/", { url: "https://mix.test/", type: "homepage", status: "audited", title: "Mix | Law firm", description: "We are a law firm providing legal advice." },
    [{ url: "https://mix.test/a", type: "service", status: "audited", title: "Architecture studio | Mix", description: "Mix is an architecture practice for building design." },
     { url: "https://mix.test/b", type: "service", status: "audited", title: "Architects | Mix", description: "Our architects design buildings and urban planning projects." }]);
  assert.equal(conflict.decision, null);
});

test("subtype refinement ignores market mentions", () => {
  assert.equal(refineSubtype({ sector: "hospitality", key: "hospitality" }, { title: "Ristorante Da Mario", description: "Pizza e cucina tradizionale." })?.key, "restaurant");
  assert.equal(refineSubtype({ sector: "hospitality", key: "hospitality" }, { title: "Software for hotels", description: "Booking engine for hotels." }), null);
  assert.ok(LOCAL_TRADE_KEYS.has("optician") && LOCAL_TRADE_KEYS.has("hair_salon") && !LOCAL_TRADE_KEYS.has("real_estate"));
});

test("market mentions are removed before keyword anchoring", async () => {
  const { stripMarketMentions } = await import("../lib/eu-identity.ts");
  const out = stripMarketMentions("Hotel booking engine & channel manager | More direct bookings for your hotel | Software for hotels");
  assert.doesNotMatch(out, /hotel/i);
  assert.match(stripMarketMentions("Hotel Bellavista Roma | Albergo 4 stelle"), /Hotel Bellavista/);
});

test("sales channel: physical shop, service on location, webshop and both", async () => {
  const { decideSalesChannel } = await import("../lib/sales-channel.ts");
  const base = { navLabels: [], internalPaths: [], identityText: "", schemaTypes: [], hasAddress: false, hasOpeningHours: false, onlineSalesConfirmed: false };
  assert.equal(decideSalesChannel({ ...base, sector: "health_wellness", key: "optician", navLabels: ["Vind een winkel"] }).channel, "physical_store");
  assert.equal(decideSalesChannel({ ...base, sector: "health_wellness", key: "optician", internalPaths: ["/filialen"], onlineSalesConfirmed: true }).channel, "omnichannel");
  assert.equal(decideSalesChannel({ ...base, sector: "beauty", key: "hair_salon" }).channel, "service_location");
  assert.equal(decideSalesChannel({ ...base, sector: "ecommerce", key: "ecommerce", onlineSalesConfirmed: true }).channel, "online_store");
  assert.equal(decideSalesChannel({ ...base, sector: "ecommerce", key: "ecommerce", onlineSalesConfirmed: true, identityText: "Shop online or in store near you" }).channel, "omnichannel");
  assert.equal(decideSalesChannel({ ...base, sector: "food_local_retail", key: "bakery", schemaTypes: ["Bakery"], hasAddress: true }).channel, "physical_store");
  // No evidence at all: the channel is not invented.
  assert.equal(decideSalesChannel({ ...base, sector: "professional_services", key: "legal" }).channel, "unknown");
  assert.equal(decideSalesChannel({ ...base, sector: "health_wellness", key: "dentist" }).channel, "unknown");
});

test("TestLab: a local retail trade meets the broad retail label, other health keys do not", () => {
  assert.equal(compareSector("retail", { sector: "health_wellness", key: "optician" }).sectorMatch, true);
  assert.equal(compareSector("retail", { sector: "health_wellness", key: "pharmacy" }).sectorMatch, true);
  assert.equal(compareSector("retail", { sector: "food_local_retail", key: "bakery" }).sectorMatch, true);
  assert.equal(compareSector("retail", { sector: "health_wellness", key: "dentist" }).sectorMatch, false);
  assert.equal(compareSector("beauty", { sector: "ecommerce" }).sectorMatch, false);
});
