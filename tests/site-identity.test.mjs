import test from "node:test";
import assert from "node:assert/strict";
import { declaredSiteIdentity } from "../lib/site-identity.ts";

// Real titles/descriptions from the 13 Oct 2026 sector run (29 sites, 9 sectors).
const id = (title, description, hostname, schemaTypes = [], h1s = []) => declaredSiteIdentity({ title, description, h1s, schemaTypes, hostname })?.sector ?? null;

test("payment providers are finance, whatever their wording", () => {
  assert.equal(id("Mollie – hét platform voor al je online en fysieke betalingen", "", "www.mollie.com"), "finance");
  assert.equal(id("Geld overmaken, winkelen, betalingen beheren en nog veel meer | PayPal NL", "", "www.paypal.com"), "finance");
  assert.equal(id("Stripe | Financiële infrastructuur voor meer omzet", "Betalingen ontvangen en beheren", "stripe.com"), "finance");
  assert.equal(id("Adyen: Fintech waar je op kunt bouwen - Adyen", "", "www.adyen.com"), "finance");
  assert.equal(id("Buckaroo | Betaalplatform, pinautomaten & online betalen", "", "www.buckaroo.nl"), "finance");
});

test("public authorities are government", () => {
  assert.equal(id("Informatie van de Rijksoverheid | Rijksoverheid.nl", "", "www.rijksoverheid.nl", ["GovernmentOrganization"]), "government");
  assert.equal(id("Belastingdienst Nederland | Belastingdienst", "", "www.belastingdienst.nl"), "government");
  assert.equal(id("Home | Gemeente Amsterdam", "", "www.amsterdam.nl"), "government");
  assert.equal(id("Welcome", "", "www.usa.gov"), "government");
});

test("software, job boards, news and health information are recognised", () => {
  assert.equal(id("Het boekhoudpakket van ruim 400.000 ondernemers. | Moneybird", "", "www.moneybird.nl"), "saas_b2b");
  assert.equal(id("Crm, facturen, offertes en projecten in één tool | Teamleader", "", "www.teamleader.eu"), "saas_b2b");
  assert.equal(id("Exact | Bedrijfssoftware voor ondernemers en accountants", "", "www.exact.com"), "saas_b2b");
  assert.equal(id("De vacaturesite met vacatures, banen, stages en bijbanen | Nationale Vacaturebank", "", "www.nationalevacaturebank.nl"), "recruitment");
  assert.equal(id("NU - Het laatste nieuws het eerst op NU.nl", "", "www.nu.nl"), "news_media");
  assert.equal(id("Geen bezorging en verkeerde winkelprijzen", "", "nos.nl", ["NewsArticle"]), "news_media");
  assert.equal(id("Thuisarts | De eerste plek waar je het checkt.", "Betrouwbare informatie over gezondheid en ziekte, van huisartsen", "www.thuisarts.nl"), "health_wellness");
});

test("webshops and other sites declare nothing here; commerce rules decide them", () => {
  for (const [title, host] of [
    ["Coolblue - Alles voor een glimlach", "www.coolblue.nl"],
    ["Schuhe, Mode und Accessoires online bei ZALANDO", "www.zalando.de"],
    ["Betaalbare meubels & accessories – Alles voor je huis - IKEA", "www.ikea.com"],
    ["Alles voor uw kantoor en werkplek | DiscountOffice Nederland", "www.discountoffice.nl"],
    ["Acupunctuur Alkmaar | Acupunctuur Praktijk Gerda Dijkstra", "www.acupunctuurdijkstra.nl"],
    ["Wereld vol Wonderen - Efteling", "www.efteling.com"],
  ]) assert.equal(id(title, "", host), null, title);
});

test("news headlines in body H1s never make a news site a transport company", () => {
  const h1s = ["NS-storing legt treinverkeer plat", "Vrachtwagen kantelt op A12", "Kabinet valt"];
  assert.equal(id("NU - Het laatste nieuws het eerst op NU.nl", "", "www.nu.nl", [], h1s), "news_media");
});

test("telecom subscriptions outrank incidental device/shop navigation (KPN regression)", () => {
  assert.equal(id("Welkom bij KPN: het netwerk van Nederland | KPN",
    "Met KPN Combivoordeel stel je al jouw thuis en mobiele abonnementen zelf samen. Internet, mobiel, TV, entertainment en meer. Via het netwerk van Nederland.",
    "www.kpn.com", [], ["Het beste van KPN"]), "telecom_technology");
  assert.equal(id("Internetprovider voor glasvezel en mobiele abonnementen", "Internet en 5G voor thuis en onderweg", "example.net"), "telecom_technology");
});

test("mobile and fiber operators stay telecom even when they also sell online", () => {
  assert.equal(id(
    "Sim Only en Glasvezel | Simpel",
    "Kies jouw sim only abonnement, onbeperkt bellen, mobiele databundels en glasvezel internet",
    "www.simpel.nl"), "telecom_technology");
  assert.equal(id(
    "Telfort bij KPN - Diensten en abonnementen",
    "Bekijk informatie over mobiele abonnementen, bellen en internet voor bestaande klanten",
    "www.kpn.com", [], ["Telfort bij KPN"]), "telecom_technology");
  assert.equal(id(
    "Welkom bij KPN: het netwerk van Nederland | KPN",
    "Met KPN Combivoordeel stel je al jouw thuis en mobiele abonnementen zelf samen. Internet, mobiel, TV, entertainment en meer.",
    "www.kpn.com", ["OnlineStore"]), "telecom_technology");
  assert.equal(id("Sim Only aanbiedingen", "Scherpe abonnementen voor internet en mobiel", "example.net", ["OnlineStore"]), "telecom_technology");
});

test("online handset retailers and telecom comparisons do not inherit operator identity", () => {
  assert.equal(id("Mobiele abonnementen en smartphones online", "Bestel 5G toestellen en accessoires", "webshop.example", ["OnlineStore"]), null);
  assert.equal(id("Telecom vergelijken", "Vergelijk aanbieders, tarieven en mobiele abonnementen voor internet", "vergelijker.example"), null);
  assert.equal(id("Glasvezelrouter bestellen", "Shop online modems met 5G en fiber ondersteuning", "modems.example", ["OnlineStore"]), null);
});

test("utility, coworking, producer and Polish travel operator keep their primary service identity", () => {
  assert.equal(id("Energieleverancier | Vattenfall", "Bekijk onze tarieven voor gas en stroom", "www.vattenfall.nl"), "energy");
  assert.equal(id("Flexibele werkplekken en coworking", "Ontdek serviced offices en kantoorruimte", "example.org"), "coworking");
  assert.equal(id("Wakacje i wycieczki | Biuro podróży", "Wybierz hotele, loty i wakacje na świecie", "example.pl"), "travel");
  assert.equal(id("Fabrikant van huishoudelijke apparaten", "Ontwerp en ontwikkeling van producten", "example.com"), "manufacturer");
});

test("a real shop stays a shop and passing topics do not become site identities", () => {
  assert.equal(id("Mobiele abonnementen en smartphones online", "Bestel 5G toestellen", "example-shop.nl", ["OnlineStore"]), null);
  assert.equal(id("Energie, internet en kantoorartikelen bij de webshop", "Shop online", "shop.example"), null);
  assert.equal(id("Welkom | Nieuws en actualiteiten", "Deze week: een energieleverancier en de arbeidsmarkt", "news.example", ["NewsMediaOrganization"]), "news_media");
});
