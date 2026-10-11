// Sector Motor 3.1 matrix: HTML fixture -> Evidence Engine -> Universal Evidence Arbiter.
// Fixtures are synthetic, brand-free reproductions of real page structures (no hardcoded
// hosts or brand names in the engine). Each case checks the primary sector, the role and
// that incidental mentions (delivery, jobs, restaurant) stay secondary.
import test from "node:test";
import assert from "node:assert/strict";
import { buildScanEvidence } from "../lib/scan-evidence.ts";
import { arbitratePrimarySector, arbiterEvidenceFromScan } from "../lib/sector-arbiter.ts";

const LABELS = {
  hospitality: "Hotels & hospitality", transport_travel: "Transport & Logistiek", tourism_recreation: "Toerisme & Recreatie",
  real_estate: "Vastgoed & Makelaardij", automotive: "Automotive", health_wellness: "Zorg & Gezondheid", beauty: "Beauty & Wellness",
  recruitment: "Recruitment", professional_services: "Zakelijke dienstverlening", food_local_retail: "Voeding & lokale retail",
  general_business: "Bedrijfswebsite",
};

const ld = (...items) => items.map(item => `<script type="application/ld+json">${JSON.stringify(item)}</script>`).join("");
const productCards = (count, path = "/p/") => Array.from({ length: count }, (_, i) =>
  `<a href="${path}artikel-${i}-${1000 + i}/"><span>Artikel ${i}</span><span class="price">€ ${19 + i},99</span></a>`).join("");

function decide(html, { url = "https://www.voorbeeld.nl/", current = { sector: "unknown", key: "unknown", label: "Sector niet bevestigd", confidenceScore: 0 }, identity = [], bodySectors = [], siteSampleProduct = false, technologyOnly = false } = {}) {
  const evidence = buildScanEvidence({ url, html });
  return arbitratePrimarySector({
    current,
    ...arbiterEvidenceFromScan(evidence, { siteSampleProduct, previouslyConfirmed: false, technologyOnly }),
    shortStayIdentity: Boolean(evidence.sectorDetails.lodging.shortStay.value && evidence.sectorDetails.lodging.shortStay.confidence === "high"),
    identity: identity.map(sector => ({ sector, sources: ["title"] })),
    bodySectors,
    labels: LABELS,
  });
}

test("large furniture retailer homepage (cart + priced catalogue, no Product schema, delivery/restaurant/jobs in footer) is a webshop", () => {
  const html = `<html><head><title>Betaalbare meubels & accessoires – Alles voor je huis</title></head><body>
    <header><a href="/nl/nl/shoppingcart/">Winkelwagen</a><a href="/nl/nl/favourites/">Favorieten</a></header>
    <main>${productCards(14)}<a href="/nl/nl/cat/cadeaus/">Cadeaus onder €10,-</a></main>
    <footer><a href="/nl/nl/customer-service/services/delivery/">Transport en bezorging</a> Pakketbezorging vanaf 2,99
    <a href="/nl/nl/stores/restaurant/">Zweeds restaurant</a> <a href="/nl/nl/this-is-ikea/work-with-us/">Werken bij</a> vacatures</footer>
  </body></html>`;
  // Earlier layers were misled by the footer words.
  const decision = decide(html, { url: "https://www.example-retail.com/nl/nl/", current: { sector: "transport_travel", key: "transport_travel", label: LABELS.transport_travel, confidenceScore: 62 }, bodySectors: ["transport_travel", "hospitality", "recruitment"] });
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.role, "storefront");
  assert.equal(decision.status, "supported");
  assert.equal(decision.commerceConfirmed, true);
  assert.equal(decision.storefrontGrade, "strong");
  assert.equal(decision.changed, true);
  const secondary = decision.secondaryActivities.map(item => item.sector);
  assert.ok(secondary.includes("transport_travel") && secondary.includes("hospitality"), "delivery/restaurant stay secondary");
  assert.ok(decision.secondaryActivities.every(item => item.basis !== "structural" || item.sector === "ecommerce"));
});

test("international corporate brand portal (stories, jobs, newsroom; no cart, no prices) is neither a webshop nor recruitment", () => {
  const html = `<html><head><title>Hej! Welcome to our global site</title></head><body>
    <nav><a href="/global/en/stories/">Stories</a><a href="/global/en/jobs/">Jobs</a><a href="/global/en/newsroom/">Newsroom</a><a href="/global/en/our-business/">Our business</a></nav>
    <main>Careers at our company. Read the latest news.</main>
    ${ld({ "@context": "https://schema.org", "@type": "Organization", name: "Brand" })}
    <footer><a href="/nl/nl/">Nederland</a><a href="/de/de/">Deutschland</a><a href="/fr/fr/">France</a></footer></body></html>`;
  const decision = decide(html, { url: "https://www.example-retail.com/", current: { sector: "recruitment", key: "recruitment", label: LABELS.recruitment, confidenceScore: 55 }, bodySectors: ["recruitment", "news_media"] });
  assert.notEqual(decision.sector, "ecommerce");
  assert.notEqual(decision.sector, "recruitment");
  assert.equal(decision.commerceConfirmed, false);
  assert.ok(["uncertain", "probable"].includes(decision.status));
});

test("office-supplies webshop with add-to-cart buttons, delivery promises and a vacancy link is a webshop", () => {
  const html = `<html><head><title>Kantoorartikelen online bestellen</title></head><body>
    <a href="/winkelwagen">Winkelwagen</a>
    ${Array.from({ length: 8 }, (_, i) => `<div class="product"><a href="/product/pen-${i}">Pen ${i}</a> € ${i + 2},49 <button>In winkelwagen</button></div>`).join("")}
    Voor 23:00 besteld, morgen bezorgd. <a href="/vacatures">Vacatures</a></body></html>`;
  const decision = decide(html, { bodySectors: ["transport_travel", "recruitment"] });
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.commerceConfirmed, true);
});

test("beauty webshop stays a webshop; beauty is the topic, the purchase flow is the role", () => {
  const html = `<html><head><title>Huidverzorging & make-up online | Beauty shop</title></head><body>
    <a href="/cart">Cart</a>${Array.from({ length: 6 }, (_, i) => `<a href="/products/serum-${i}">Serum ${i}</a> €${i + 12},95 <button>Add to cart</button>`).join("")}
    ${ld({ "@type": "Product", name: "Serum", offers: { "@type": "Offer", price: "12.95", priceCurrency: "EUR" } })}</body></html>`;
  const decision = decide(html, { identity: ["beauty"], current: { sector: "beauty", key: "beauty", label: LABELS.beauty, confidenceScore: 70 } });
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.role, "storefront");
});

test("beauty salon with BeautySalon schema and appointment booking is a beauty business", () => {
  const html = `<html><head><title>Schoonheidssalon Lotus – behandelingen</title></head><body>
    <a href="/afspraak-maken">Afspraak maken</a> Gezichtsbehandeling €65 Manicure €35
    ${ld({ "@type": "BeautySalon", name: "Lotus", address: { "@type": "PostalAddress", streetAddress: "Dorpsstraat 1" } })}</body></html>`;
  const decision = decide(html, { identity: ["beauty"] });
  assert.equal(decision.sector, "beauty");
  assert.equal(decision.commerceConfirmed, false);
});

test("dental practice with Dentist schema is health care, not commerce", () => {
  const html = `<html><head><title>Tandartspraktijk De Molen</title></head><body>
    <a href="/afspraak">Afspraak maken</a> Inschrijven als patiënt. Tarieven vanaf €25. <a href="/vacatures">Vacatures</a>
    ${ld({ "@type": "Dentist", name: "De Molen" })}</body></html>`;
  const decision = decide(html, { identity: ["health_wellness"], bodySectors: ["recruitment"] });
  assert.equal(decision.sector, "health_wellness");
  assert.equal(decision.role, "specialist_business");
});

test("real-estate agent with schema and priced listings is real estate", () => {
  const html = `<html><head><title>Makelaar in Utrecht | Woningaanbod</title></head><body>
    ${Array.from({ length: 6 }, (_, i) => `<a href="/woningaanbod/koop/utrecht/straat-${i}">Woning ${i}</a> Koopprijs € ${350 + i}.000 k.k. te koop`).join("")}
    ${ld({ "@type": "RealEstateAgent", name: "Makelaardij" })}</body></html>`;
  const decision = decide(html, { identity: ["real_estate"] });
  assert.equal(decision.sector, "real_estate");
  assert.equal(decision.status, "supported");
});

test("transport company with MovingCompany schema and quote requests is transport", () => {
  const html = `<html><head><title>Verhuisbedrijf & transport</title></head><body>
    <a href="/offerte-aanvragen">Offerte aanvragen</a> Wij verzorgen nationaal en internationaal transport.
    ${ld({ "@type": "MovingCompany", name: "Verhuizer" })}</body></html>`;
  const decision = decide(html, { identity: ["transport_travel"] });
  assert.equal(decision.sector, "transport_travel");
});

test("transport company without schema is a probable transport business from its own title", () => {
  const html = `<html><head><title>Transportbedrijf Jansen – wegtransport en logistiek</title></head><body><a href="/offerte">Offerte</a></body></html>`;
  const decision = decide(html, { identity: ["transport_travel"], current: { sector: "transport_travel", key: "transport_travel", label: LABELS.transport_travel, confidenceScore: 70 } });
  assert.equal(decision.sector, "transport_travel");
  assert.equal(decision.status, "probable");
});

test("car garage with AutoRepair schema is automotive", () => {
  const html = `<html><head><title>Autogarage – APK en onderhoud</title></head><body><a href="/afspraak">APK afspraak</a> Onderhoud, banden, reparatie.
    ${ld({ "@type": "AutoRepair", name: "Garage" })}</body></html>`;
  const decision = decide(html, { identity: ["automotive"] });
  assert.equal(decision.sector, "automotive");
});

test("hotel with Hotel schema, rooms and booking is hospitality", () => {
  const html = `<html><head><title>Hotel aan Zee – kamers en arrangementen</title></head><body>
    <a href="/boeken">Boek nu</a> Kamers vanaf € 99 per nacht. Aankomst en vertrek, 2 gasten.
    ${ld({ "@type": "Hotel", name: "Hotel aan Zee" })}</body></html>`;
  const decision = decide(html, { identity: ["hospitality"] });
  assert.equal(decision.sector, "hospitality");
  assert.equal(decision.status, "supported");
});

test("restaurant with Restaurant schema, menu and reservations is hospitality", () => {
  const html = `<html><head><title>Restaurant De Haven – menukaart</title></head><body>
    <a href="/reserveren">Reserveren</a> Bekijk onze menukaart. Hoofdgerechten vanaf €22.
    ${ld({ "@type": "Restaurant", name: "De Haven", servesCuisine: "Frans" })}</body></html>`;
  const decision = decide(html, { identity: ["hospitality"] });
  assert.equal(decision.sector, "hospitality");
});

test("restaurant that also sells gift cards online remains a restaurant (shop is a secondary activity)", () => {
  const html = `<html><head><title>Restaurant De Haven – menukaart en cadeaubonnen</title></head><body>
    <a href="/reserveren">Reserveren</a> menukaart <a href="/winkelwagen">Winkelwagen</a>
    <div><a href="/product/cadeaubon-25">Cadeaubon</a> €25 <button>In winkelwagen</button></div>
    ${ld({ "@type": "Restaurant", name: "De Haven" })}</body></html>`;
  const decision = decide(html, { identity: ["hospitality"] });
  assert.equal(decision.sector, "hospitality");
  assert.equal(decision.commerceConfirmed, true, "the gift-card shop is kept as a confirmed commerce function");
});

test("accounting firm with AccountingService schema is professional services", () => {
  const html = `<html><head><title>Administratiekantoor – boekhouding en belastingaangifte</title></head><body><a href="/contact">Contact</a> Offerte aanvragen.
    ${ld({ "@type": "AccountingService", name: "Kantoor" })}</body></html>`;
  const decision = decide(html, { identity: ["professional_services"] });
  assert.equal(decision.sector, "professional_services");
});

test("German and French storefronts are recognised with the same generic rules", () => {
  const de = `<html><head><title>Möbel online kaufen</title></head><body><a href="/de/warenkorb">Warenkorb</a>${productCards(8, "/de/p/")}</body></html>`;
  assert.equal(decide(de, { url: "https://www.example.de/de/" }).sector, "ecommerce");
  const fr = `<html><head><title>Meubles en ligne</title></head><body><a href="/fr/panier">Panier</a>${Array.from({ length: 5 }, (_, i) => `<a href="/produit/x-${i}">X</a> ${i + 10},00 € <button>Ajouter au panier</button>`).join("")}</body></html>`;
  assert.equal(decide(fr, { url: "https://www.example.fr/fr/" }).sector, "ecommerce");
});

test("a single mention of transport, vacancies or a restaurant never creates a primary sector", () => {
  const html = `<html><head><title>Welkom</title></head><body>Wij werken met transport partners. Bekijk onze vacatures. Naast ons zit een restaurant.</body></html>`;
  const decision = decide(html, { bodySectors: ["transport_travel", "recruitment", "hospitality"], current: { sector: "transport_travel", key: "transport_travel", label: LABELS.transport_travel, confidenceScore: 50 } });
  assert.equal(decision.sector, "unknown");
  assert.equal(decision.status, "uncertain");
});

test("a priced catalogue without a cart is only a webshop hint, never a confirmation", () => {
  const html = `<html><head><title>Collectie</title></head><body>${Array.from({ length: 8 }, (_, i) => `<a href="/p/item-${i}">Item</a> €${i + 5}`).join("")}</body></html>`;
  const decision = decide(html);
  assert.equal(decision.commerceConfirmed, false);
  assert.equal(decision.storefrontGrade, "weak");
  assert.ok(decision.secondaryActivities.some(item => item.sector === "ecommerce" && /niet bevestigd/.test(item.label)));
});

test("a cart icon plus a few prices (e.g. a service site with a small shop link) is not a catalogue storefront", () => {
  const html = `<html><head><title>Fysiotherapie praktijk</title></head><body><a href="/cart">Cart</a><a href="/shop/bal">Oefenbal</a> €12 <a href="/shop/band">Band</a> €9</body></html>`;
  const decision = decide(html);
  assert.notEqual(decision.storefrontGrade, "strong");
  assert.equal(decision.commerceConfirmed, false);
});

test("evidence engine ignores words that merely contain cart/kasse/pago (cartoon, Sparkasse, pagoda)", () => {
  const evidence = buildScanEvidence({ url: "https://www.voorbeeld.de/", html: `<div class="cartoon"></div><a href="https://www.sparkasse.de">Bank</a><span class="pagoda"></span>` });
  assert.equal(evidence.commerce.cart.value, false);
  assert.equal(evidence.commerce.checkout.value, false);
  const real = buildScanEvidence({ url: "https://www.voorbeeld.de/", html: `<a href="/nl/nl/shoppingcart/">Winkelwagen</a><button class="ShoppingCartIcon"></button><a href="/kasse">Zur Kasse</a>` });
  assert.equal(real.commerce.cart.value, true);
  assert.equal(real.commerce.checkout.value, true);
});

test("electronics retailer with add-to-cart, delivery and repair-service text is a webshop", () => {
  const html = `<html><head><title>Elektronica kopen? Laptops, tv's en telefoons</title></head><body>
    <a href="/winkelmandje">Winkelmandje</a>
    ${Array.from({ length: 10 }, (_, i) => `<a href="/product/laptop-${i}">Laptop ${i}</a> € ${599 + i},- <button>In winkelwagen</button>`).join("")}
    Morgen gratis bezorgd. Reparatieservice en installatie aan huis.</body></html>`;
  const decision = decide(html, { bodySectors: ["transport_travel", "home_services"], current: { sector: "home_services", key: "home_services", label: "Vakmensen", confidenceScore: 55 } });
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.commerceConfirmed, true);
});

test("small webshop (few products, WooCommerce-style buttons) is still a webshop", () => {
  const html = `<html><head><title>Handgemaakte kaarsen</title></head><body><a href="/cart/">Winkelwagen</a>
    ${Array.from({ length: 3 }, (_, i) => `<a href="/product/kaars-${i}/">Kaars ${i}</a> €${i + 9},95 <button class="add_to_cart_button">Toevoegen aan winkelwagen</button>`).join("")}</body></html>`;
  const decision = decide(html);
  assert.equal(decision.sector, "ecommerce");
  assert.equal(decision.commerceConfirmed, true);
});

test("hair salon with HairSalon schema and online booking is a beauty business, not a booking platform", () => {
  const html = `<html><head><title>Kapsalon Knip & Kleur</title></head><body><a href="/afspraak-maken">Boek online</a> Knippen €32
    ${ld({ "@type": "HairSalon", name: "Knip & Kleur" })}</body></html>`;
  const decision = decide(html, { identity: ["beauty"], current: { sector: "service_marketplace", key: "service_marketplace", label: "Boekingsplatform", confidenceScore: 50 } });
  assert.equal(decision.sector, "beauty");
});

test("dentist without schema but with its own title and a booking widget stays health care, not a booking platform", () => {
  const html = `<html><head><title>Tandartspraktijk De Molen – afspraak maken</title></head><body>
    <a href="/afspraak">Afspraak maken</a> <a href="/boeken">Boek direct online</a> Nieuwe patiënten welkom.</body></html>`;
  const decision = decide(html, { identity: ["health_wellness"], bodySectors: ["service_marketplace"], current: { sector: "service_marketplace", key: "service_marketplace", label: "Boekingsplatform", confidenceScore: 52 } });
  assert.equal(decision.sector, "health_wellness");
  assert.equal(decision.status, "probable");
});

test("informative website (articles, no purchase flow) is never a webshop", () => {
  const html = `<html><head><title>Alles over tuinieren – tips en artikelen</title></head><body>
    ${Array.from({ length: 6 }, (_, i) => `<a href="/artikel/tip-${i}">Tip ${i}</a>`).join("")} Kosten van een schutting: ongeveer € 40 per meter.</body></html>`;
  const decision = decide(html);
  assert.notEqual(decision.sector, "ecommerce");
  assert.equal(decision.commerceConfirmed, false);
});

test("multilingual storefront (language switcher, English UI) is a webshop", () => {
  const html = `<html lang="en"><head><title>Design furniture online</title>
    <link rel="alternate" hreflang="nl" href="/nl/"><link rel="alternate" hreflang="de" href="/de/"></head><body>
    <a href="/en/basket">Basket</a>${Array.from({ length: 5 }, (_, i) => `<a href="/en/products/chair-${i}">Chair</a> €${i + 99} <button>Add to basket</button>`).join("")}</body></html>`;
  assert.equal(decide(html, { url: "https://www.example.com/en/" }).sector, "ecommerce");
});

test("conflicting identity terms from three or more sectors stay uncertain", () => {
  const html = `<html><head><title>Hotel, restaurant en autogarage De Kruising</title></head><body>Welkom.</body></html>`;
  const decision = decide(html, { identity: ["hospitality", "automotive", "real_estate"], current: { sector: "hospitality", key: "hospitality", label: LABELS.hospitality, confidenceScore: 60 } });
  assert.equal(decision.status, "uncertain");
});

test("a generic word in the title (transport) alone never replaces an unsupported earlier sector", () => {
  const html = `<html><head><title>Snel transport van uw bestelling</title></head><body>Welkom.</body></html>`;
  const decision = decide(html, { identity: ["transport_travel"], current: { sector: "service_marketplace", key: "service_marketplace", label: "Boekingsplatform", confidenceScore: 50 } });
  assert.equal(decision.sector, "unknown");
  assert.equal(decision.status, "uncertain");
});

test("evidence engine recognises Dutch cart variants (winkelmandje, winkelwagentje) and shopping bags", () => {
  for (const html of [`<a href="/winkelmandje">Mandje</a>`, `<a href="/winkelwagentje">x</a>`, `<button class="shopping-bag-icon"></button>`]) {
    assert.equal(buildScanEvidence({ url: "https://www.voorbeeld.nl/", html }).commerce.cart.value, true, html);
  }
});

test("business website with only a WooCommerce fingerprint (no shop) never gets confirmed commerce", () => {
  const html = `<html><head><title>Administratiekantoor Jansen</title><link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css"></head><body>
    Boekhouding voor ondernemers. <a href="/contact">Contact</a> Tarief vanaf € 95 per maand.</body></html>`;
  const decision = decide(html, { technologyOnly: true, identity: ["professional_services"], current: { sector: "professional_services", key: "professional_services", label: LABELS.professional_services, confidenceScore: 66 } });
  assert.equal(decision.commerceConfirmed, false);
  assert.equal(decision.storefrontGrade, "weak");
  assert.notEqual(decision.sector, "ecommerce");
  assert.ok(decision.secondaryActivities.some(item => item.sector === "ecommerce" && /niet bevestigd/.test(item.label)), "shown only as an unconfirmed hint");
});
