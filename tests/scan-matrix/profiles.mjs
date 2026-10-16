// Broad synthetic matrix through the REAL scan route. No brand rules: profiles are generic.
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...o })}</script>`;
const nav = (links) => `<header><nav>${links.map(([h, t]) => `<a href="${h}">${t}</a>`).join(" ")}</nav></header>`;
function page({ title, desc, h1, body = "", lds = [], lang = "nl", links = [], canonical = true, extraHead = "" }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>${desc ? `<meta name="description" content="${desc}">` : ""}<meta name="viewport" content="width=device-width, initial-scale=1">${canonical ? '<link rel="canonical" href="__URL__">' : ""}<meta property="og:title" content="${title}"><meta property="og:description" content="${desc || title}"><meta property="og:image" content="https://__HOST__/og.jpg"><meta name="twitter:card" content="summary">${lds.map(ld).join("")}${extraHead}</head><body>${nav([["/", "Home"], ...links, ["/contact", "Contact"], ["/privacy", "Privacy"], ["/voorwaarden", "Voorwaarden"]])}<main><h1>${h1}</h1>${body}<img src="/hero.jpg" alt="${h1}"></main><footer><p>Example B.V. · KvK 12345678 · Kerkstraat 1, 1011 AB Amsterdam · info@__HOST__ · +31 20 123 4567</p><a href="/cookies">Cookies</a></footer></body></html>`;
}
const org = (name, type = "Organization") => ({ "@type": type, name, url: "https://__HOST__/", address: { "@type": "PostalAddress", streetAddress: "Kerkstraat 1", addressLocality: "Amsterdam", postalCode: "1011 AB", addressCountry: "NL" }, telephone: "+31201234567" });
const site = { "@type": "WebSite", name: "Site", url: "https://__HOST__/" };
const productPage = (name, price, lang = "nl") => page({ lang, title: `${name} kopen | Shop`, desc: `${name} online bestellen voor € ${price}. Op voorraad, morgen in huis.`, h1: name,
  body: `<p>Prijs € ${price}</p><p>Op voorraad</p><form action="/cart/add" method="post"><button>In winkelwagen</button></form><p>SKU: ABC-${price}</p>`,
  lds: [{ "@type": "Product", name, image: "https://__HOST__/p.jpg", sku: "ABC", offers: { "@type": "Offer", price: String(price), priceCurrency: "EUR", availability: "https://schema.org/InStock", url: "https://__HOST__/product/x" } }] });

// expect: allowed sectorProfile.sector values; page: expected page type; commerce: whether product/merchant warnings may appear
export const PROFILES = [
  // Finance
  { id: "payments-en", host: "pay-a.test", expect: ["financial_services"], home: { lang: "en", title: "PayFlow – the platform for online and in-person payments", desc: "Accept payments online and in person. One platform for businesses.", h1: "Payments made simple", body: "<p>Hosted checkout, payment links, terminals. Guests at hotels pay at arrival.</p><p>€0.29 per transaction</p><a href='/checkout'>Checkout</a> <a href='/pricing'>Pricing</a>", lds: [org("PayFlow"), site] } },
  { id: "wallet-en-us-home", host: "wallet.test", path: "/us/home", expect: ["financial_services"], page: "homepage", home: { lang: "en", title: "Pay, Send and Save Money | Wallet US", desc: "The faster, safer way to send money and make an online payment.", h1: "Pay, send and save smarter", body: "<div class='product-card'>Deals <span>$19.99</span><button>Add to cart</button></div><div class='product-card'>Gift cards <span>$25.00</span><button>Add to cart</button></div><a href='/checkout'>Checkout</a> <a href='/shipping'>Shipping</a> <a href='/returns'>Returns</a>", lds: [org("Wallet", "Corporation"), site, { "@type": "PaymentCard", name: "Debit" }, { "@type": "LoanOrCredit", name: "Credit" }] } },
  { id: "bank-nl", host: "bank.test", expect: ["financial_services"], home: { title: "Bankieren, sparen en hypotheken | Bank", desc: "Open een betaalrekening, spaarrekening of vraag een hypotheek aan.", h1: "Bankieren zoals het hoort", body: "<p>Rente 2,1%. Mobiel bankieren.</p>", lds: [org("Bank", "BankOrCreditUnion"), site] } },
  { id: "insurer-nl", host: "verzekeraar.test", expect: ["financial_services"], home: { title: "Autoverzekering en zorgverzekering | Verzekeraar", desc: "Vergelijk en sluit direct je verzekering af.", h1: "Verzekeringen", body: "<p>Premie vanaf € 12,50 per maand. Polis direct online.</p>", lds: [org("Verzekeraar", "InsuranceAgency"), site] } },
  // Telecom
  { id: "telecom-nl", host: "telco.test", expect: ["telecom_technology"], home: { title: "Sim only en glasvezel internet | Telco", desc: "Mobiele abonnementen, glasvezel internet en tv. 5G netwerk met dekking in heel Nederland.", h1: "Het netwerk van Nederland", body: "<p>Sim only vanaf € 10 per maand.</p><a href='/shop'>Shop</a> <a href='/shop/telefoons'>Telefoons</a>", lds: [org("Telco"), site] } },
  // Retail
  { id: "shop-nl", host: "sneakers.test", expect: ["ecommerce"], commerce: true, home: { title: "Sneakers webshop – online bestellen", desc: "Sneakers online kopen. Gratis verzending en retourneren.", h1: "Sneakers", body: "<div class='product-card' data-price='89.99'>Air <span>€ 89,99</span><form action='/cart/add'><button>In winkelwagen</button></form></div><div class='product-card' data-price='99.99'>Run <span>€ 99,99</span><form action='/cart/add'><button>In winkelwagen</button></form></div><a href='/winkelwagen'>Winkelwagen</a> <a href='/product/air'>Air</a> <a href='/product/run'>Run</a> <a href='/verzending'>Verzending</a> <a href='/retour'>Retour</a>", lds: [{ ...org("Sneakers", "OnlineStore") }, site] } },
  { id: "shop-de", host: "moebel.test", expect: ["ecommerce"], commerce: true, home: { lang: "de", title: "Möbel online kaufen | Möbelshop", desc: "Möbel und Wohnaccessoires online bestellen. Kostenloser Versand.", h1: "Möbel", body: "<div class='product-card'>Sofa <span>€ 499,00</span><form action='/warenkorb/add'><button>In den Warenkorb</button></form></div><div class='product-card'>Tisch <span>€ 199,00</span><form action='/cart/add'><button>In den Warenkorb</button></form></div><a href='/warenkorb'>Warenkorb</a> <a href='/product/sofa'>Sofa</a> <a href='/product/tisch'>Tisch</a> <a href='/versand'>Versand</a> <a href='/ruecksendung'>Rücksendung</a>", lds: [org("Möbelshop", "FurnitureStore"), site] } },
  { id: "shop-product", host: "sneakers.test", path: "/product/air", expect: ["ecommerce"], page: "product", commerce: true, raw: productPage("Air Sneaker", 89.99) },
  { id: "camping-shop", host: "outdoor.test", expect: ["ecommerce", "unknown", "general_business"], notExpect: ["hospitality"], home: { title: "Campingartikelen en camping kopen | Outdoor webshop", desc: "Camping spullen online bestellen, tenten en slaapzakken. Gratis verzending.", h1: "Camping", body: "<div class='product-card'>Tent <span>€ 199,00</span><form action='/cart/add'><button>In winkelwagen</button></form></div><div class='product-card'>Slaapzak <span>€ 59,00</span><form action='/cart/add'><button>In winkelwagen</button></form></div><a href='/winkelwagen'>Winkelwagen</a> <a href='/product/tent'>Tent</a> <a href='/product/slaapzak'>Slaapzak</a> <a href='/verzending'>Verzending</a>", lds: [org("Outdoor", "SportingGoodsStore"), site] } },
  { id: "sofa-shop", host: "banken.test", expect: ["ecommerce", "unknown", "general_business"], notExpect: ["financial_services"], home: { title: "Zitbank kopen? Banken en hoekbanken | Meubelshop", desc: "Banken online bestellen, gratis bezorgd.", h1: "Banken", body: "<div class='product-card'>Hoekbank <span>€ 899,00</span><form action='/cart/add'><button>In winkelwagen</button></form></div><div class='product-card'>Zitbank <span>€ 599,00</span><form action='/cart/add'><button>In winkelwagen</button></form></div><a href='/winkelwagen'>Winkelwagen</a> <a href='/product/hoekbank'>Hoekbank</a> <a href='/product/zitbank'>Zitbank</a>", lds: [org("Meubelshop", "FurnitureStore"), site] } },
  // Lodging / hospitality
  { id: "hotel-nl", host: "hotel.test", expect: ["hospitality"], home: { title: "Hotel De Paris – kamers boeken in Amsterdam", desc: "Boutique hotel in het centrum. Overnachten vanaf €129 per nacht.", h1: "Hotel De Paris", body: "<p>Check-in 15:00, check-out 11:00. Aantal gasten. <a href='/boeken'>Boek nu</a></p>", lds: [org("Hotel De Paris", "Hotel"), site] } },
  { id: "bnb-nl", host: "bnb.test", expect: ["hospitality"], home: { title: "B&B De Linde – overnachten op de Veluwe", desc: "Bed and breakfast met twee gastenkamers. Reserveer je verblijf.", h1: "B&B De Linde", body: "<p>Prijs per nacht € 95 inclusief ontbijt.</p><a href='/reserveren'>Reserveren</a>" } },
  { id: "camping-real", host: "camping.test", expect: ["hospitality"], home: { title: "Camping De Berken – kamperen op de Veluwe", desc: "Ruime kampeerplaatsen en chalets. Reserveer je verblijf.", h1: "Camping De Berken", body: "<p>Aankomst en vertrek, aantal personen. <a href='/reserveren'>Reserveer</a></p>", lds: [org("Camping De Berken", "Campground")] } },
  { id: "restaurant-nl", host: "restaurant.test", expect: ["hospitality"], home: { title: "Restaurant De Kas – lunch en diner", desc: "Seizoensgebonden gerechten. Reserveer een tafel.", h1: "Restaurant De Kas", body: "<p>Menukaart, openingstijden di-zo 12:00-22:00. <a href='/reserveren'>Tafel reserveren</a></p>", lds: [org("De Kas", "Restaurant")] } },
  // Health / beauty
  { id: "dentist-nl", host: "tandarts.test", expect: ["health_wellness"], home: { title: "Tandarts Amsterdam – Tandartspraktijk Centrum", desc: "Snel een afspraak bij de tandarts. Behandelingen en spoed.", h1: "Tandartspraktijk Centrum", body: "<p>Behandelingen: controle, implantaten. <a href='/afspraak'>Afspraak maken</a></p>", lds: [org("Tandartspraktijk", "Dentist")] } },
  { id: "physio-nl", host: "fysio.test", expect: ["health_wellness"], home: { title: "Fysiotherapie Utrecht – Praktijk Beweeg", desc: "Fysiotherapeut voor rugklachten en sportblessures. Maak een afspraak.", h1: "Fysiotherapiepraktijk", body: "<p>Behandeling vergoed door je zorgverzekering. <a href='/afspraak'>Afspraak</a></p>" } },
  { id: "beauty-nl", host: "beauty.test", expect: ["beauty"], home: { title: "Schoonheidssalon Glow – gezichtsbehandeling en manicure", desc: "Beautysalon in Haarlem. Boek je behandeling online.", h1: "Schoonheidssalon Glow", body: "<p>Prijzen: manicure € 35. <a href='/afspraak'>Afspraak</a></p>", lds: [org("Glow", "BeautySalon")] } },
  { id: "hair-nl", host: "kapper.test", expect: ["beauty"], home: { title: "Kapper Rotterdam – Kapsalon Knip", desc: "Kapsalon voor dames en heren. Knippen vanaf € 25.", h1: "Kapsalon Knip", body: "<p><a href='/afspraak'>Afspraak maken</a></p>", lds: [org("Knip", "HairSalon")] } },
  // Automotive / real estate
  { id: "garage-nl", host: "garage.test", expect: ["automotive"], home: { title: "Autobedrijf Jansen – APK, onderhoud en banden", desc: "Garage voor APK, onderhoud en reparatie. Maak een afspraak in de werkplaats.", h1: "Autobedrijf Jansen", body: "<p>APK vanaf € 39.</p>", lds: [org("Jansen", "AutoRepair")] } },
  { id: "dealer-nl", host: "dealer.test", expect: ["automotive"], home: { title: "Occasions te koop | Autodealer Van Dijk", desc: "Ruim aanbod occasions. Plan een proefrit.", h1: "Occasions", body: "<p>VW Golf € 18.950 · Proefrit plannen</p><a href='/occasions/vw-golf-123'>VW Golf</a>", lds: [org("Van Dijk", "AutoDealer")] } },
  { id: "realestate-nl", host: "makelaar.test", expect: ["real_estate"], home: { title: "Makelaar Utrecht – woningen te koop en te huur", desc: "Uw makelaar voor kopen, verkopen en huren. Bekijk ons woningaanbod.", h1: "Makelaardij Utrecht", body: "<p>Woningaanbod: Kerkstraat 5, € 450.000 k.k. <a href='/woningaanbod'>Aanbod</a> Bezichtiging aanvragen.</p>", lds: [org("Makelaardij", "RealEstateAgent")] } },
  // Services
  { id: "recruit-nl", host: "uitzend.test", expect: ["recruitment"], home: { title: "Uitzendbureau Werkt – vacatures en personeel", desc: "Uitzendbureau voor werkgevers en kandidaten. Bekijk vacatures.", h1: "Uitzendbureau Werkt", body: "<p>Vacatures, detachering, werving en selectie.</p>", lds: [org("Werkt", "EmploymentAgency")] } },
  { id: "lawyer-nl", host: "advocaat.test", expect: ["professional_services"], home: { title: "Advocatenkantoor De Wit – advocaat arbeidsrecht", desc: "Advocaat voor arbeidsrecht en ondernemingsrecht. Vraag advies.", h1: "Advocatenkantoor De Wit", body: "<p>Expertise, diensten, gratis eerste consult.</p>", lds: [org("De Wit", "LegalService")] } },
  { id: "plumber-nl", host: "loodgieter.test", expect: ["home_services"], home: { title: "Loodgieter Den Haag – 24/7 lekkage en ontstopping", desc: "Loodgieter voor lekkage, cv en riool. Vraag een offerte aan.", h1: "Loodgietersbedrijf", body: "<p>Werkgebied Den Haag. Offerte aanvragen.</p>", lds: [org("Loodgieter", "Plumber")] } },
  { id: "cleaning-nl", host: "schoonmaak.test", expect: ["home_services"], home: { title: "Schoonmaakbedrijf Glans – zakelijke schoonmaak", desc: "Betrouwbare kantoorschoonmaak. Vraag een offerte aan.", h1: "Schoonmaakbedrijf Glans", body: "<p>Werkgebied Randstad.</p>" } },
  { id: "saas-en", host: "saas.test", expect: ["saas_b2b"], home: { lang: "en", title: "Acme – project management software for teams", desc: "SaaS platform with integrations and dashboards. Start a free trial or book a demo.", h1: "Project management software", body: "<p>Features, integrations, pricing: $12 per user/month.</p><a href='/pricing'>Pricing</a>", lds: [org("Acme"), { "@type": "SoftwareApplication", name: "Acme", applicationCategory: "BusinessApplication", offers: { "@type": "Offer", price: "12", priceCurrency: "USD" } }] } },
  { id: "logistics-nl", host: "transport.test", expect: ["transport_travel"], home: { title: "Internationaal transport en logistiek | Trans", desc: "Wegtransport, zeevracht, luchtvracht en douane.", h1: "Transport & logistiek", body: "<p>Zendingen, warehousing, pallets. Offerte aanvragen.</p>" } },
  { id: "rail-en", host: "rail.test", expect: ["transport_travel"], home: { lang: "en", title: "National railway – train tickets and timetable", desc: "Buy train tickets, check the timetable and plan your journey.", h1: "Train tickets", body: "<p>Departure, arrival, passengers. Tickets from €9.</p>" } },
  // Public / media / misc
  { id: "gov-nl", host: "gemeente.test", expect: ["government"], home: { title: "Gemeente Voorbeeld – inwoners en ondernemers", desc: "Paspoort aanvragen, vergunningen en afval. Digitaal loket.", h1: "Gemeente Voorbeeld", body: "<p>DigiD, burgerzaken, vergunning.</p>", lds: [org("Gemeente", "GovernmentOrganization")] } },
  { id: "news-nl", host: "nieuws.test", expect: ["news_media"], home: { title: "Nieuws – het laatste nieuws uit binnen- en buitenland", desc: "Breaking news, politiek, sport en economie.", h1: "Laatste nieuws", body: "<article><h2>Kabinet presenteert plan</h2><time datetime='2026-10-16'>16 okt</time> door redactie</article>", lds: [org("Nieuws", "NewsMediaOrganization")] } },
  { id: "tourism-nl", host: "visitzeeland.test", expect: ["tourism_recreation"], home: { title: "VVV Zeeland – toeristische informatie", desc: "Bezienswaardigheden, evenementen en overnachten in Zeeland.", h1: "Ontdek Zeeland", body: "<p>Agenda, activiteiten, attracties.</p>" } },
  { id: "school-nl", host: "hogeschool.test", expect: ["education"], home: { title: "Hogeschool Noord – hbo opleidingen", desc: "Bekijk onze opleidingen en meld je aan voor de open dag.", h1: "Hogeschool Noord", body: "<p>Studenten, inschrijven, studiegids.</p>", lds: [org("Hogeschool Noord", "CollegeOrUniversity")] } },
  { id: "charity-nl", host: "goeddoel.test", expect: ["nonprofit"], home: { title: "Stichting Help – goed doel voor kinderen", desc: "Doneer en steun ons werk. ANBI-erkend.", h1: "Stichting Help", body: "<p>Doneren, vrijwilliger worden, missie.</p>", lds: [org("Stichting Help", "NGO")] } },
  { id: "energy-nl", host: "energie.test", expect: ["energy_utilities"], home: { title: "Groene stroom en gas | Energieleverancier Zon", desc: "Energiecontract afsluiten met vaste tarieven. Bereken je kosten.", h1: "Energieleverancier Zon", body: "<p>Tarieven per kWh, terugleveren, meterstand.</p>" } },
  { id: "museum-nl", host: "museum.test", expect: ["events_culture"], home: { title: "Museum Kunst – tentoonstellingen en tickets", desc: "Bekijk de tentoonstellingen en koop tickets online.", h1: "Museum Kunst", body: "<p>Openingstijden, programma, tickets € 15.</p>", lds: [org("Museum", "Museum")] } },
  { id: "gym-nl", host: "gym.test", expect: ["fitness_sports"], home: { title: "Sportschool Fit – fitness en groepslessen", desc: "Lidmaatschap vanaf € 25 per maand. Probeer een gratis proefles.", h1: "Sportschool Fit", body: "<p>Rooster, lessen, personal training.</p>", lds: [org("Fit", "ExerciseGym")] } },
  { id: "bakery-nl", host: "bakker.test", expect: ["food_local_retail"], home: { title: "Bakkerij Brood – ambachtelijke bakker", desc: "Vers brood, taart en gebak. Bestel je taart vooraf.", h1: "Bakkerij Brood", body: "<p>Zuurdesem, croissants, openingstijden.</p>", lds: [org("Brood", "Bakery")] } },
  // French / Italian / Spanish identity
  { id: "hotel-fr", host: "hotel-fr.test", expect: ["hospitality"], home: { lang: "fr", title: "Hôtel du Port – chambres à Marseille", desc: "Hébergement en centre-ville. Réservez votre séjour.", h1: "Hôtel du Port", body: "<p>Prix par nuit 120 €.</p>", lds: [org("Hôtel du Port", "Hotel")] } },
  { id: "shop-it", host: "negozio.test", expect: ["ecommerce"], commerce: true, home: { lang: "it", title: "Scarpe online – negozio online | Scarpe", desc: "Acquista scarpe online. Spedizione gratuita.", h1: "Scarpe", body: "<div class='product-card'>Scarpa <span>€ 79,00</span><form action='/cart/add'><button>Aggiungi al carrello</button></form></div><div class='product-card'>Stivale <span>€ 129,00</span><form action='/cart/add'><button>Aggiungi al carrello</button></form></div><a href='/carrello'>Carrello</a> <a href='/product/scarpa'>Scarpa</a> <a href='/product/stivale'>Stivale</a>", lds: [org("Scarpe", "ShoeStore"), site] } },
  // Edge cases
  { id: "spa-shell", host: "spa.test", expect: ["unknown"], jsShell: true, home: { lang: "en", title: "App", desc: "", h1: "", body: "<div id='__next'></div><script src='/_next/static/chunks/main.js'></script><script id='__NEXT_DATA__' type='application/json'>{}</script>" } },
  { id: "thin-unknown", host: "leeg.test", expect: ["unknown", "general_business"], home: { title: "Welkom", desc: "Welkom op onze website.", h1: "Welkom", body: "<p>Neem contact op.</p>" } },
  { id: "blog-article", host: "blog.test", path: "/blog/seo-tips-2026", page: "article", expect: ["news_media", "unknown", "general_business", "saas_b2b", "professional_services"], home: { lang: "nl", title: "10 SEO-tips voor 2026 | Blog", desc: "Praktische SEO-tips voor ondernemers.", h1: "10 SEO-tips voor 2026", body: "<article><p>Geschreven door Jan Jansen</p><time datetime='2026-10-01'>1 oktober 2026</time><p>Tekst...</p></article>", lds: [{ "@type": "BlogPosting", headline: "10 SEO-tips", author: { "@type": "Person", name: "Jan Jansen" }, datePublished: "2026-10-01" }] } },
  { id: "payments-pricing-subscription", host: "pay-b.test", path: "/pricing", expect: ["financial_services", "unknown", "saas_b2b"], notExpect: ["ecommerce", "hospitality"], home: { lang: "en", title: "Pricing – online payments platform | PayB", desc: "Transparent pricing for online payments. No monthly fees.", h1: "Pricing", body: "<p>iDEAL €0.29, cards 1.8% + €0.25. Checkout and payment links included.</p>" } },
];

export function buildSite(p) {
  const home = p.raw || page(p.home);
  const brand = (p.home?.title || "Shop").split(/[–|-]/).pop().trim();
  const sub = (path) => {
    if (p.commerce && /^\/product\//.test(path)) return productPage(path.split("/").pop().replace(/-/g, " "), 79.95, p.home?.lang || "nl");
    const name = path.replace(/^\//, "").replace(/[-/]/g, " ") || "home";
    return page({ lang: p.home?.lang || "nl", title: `${name[0].toUpperCase() + name.slice(1)} | ${brand}`, desc: `${name} – informatie van ${brand}. Lees meer over ${name} en neem contact op.`, h1: name, body: `<p>Informatie over ${name}.</p>` });
  };
  return { home, sub };
}

export function installMatrixFetch() {
  const byHost = new Map(PROFILES.map((p) => [p.host + (p.path || "/"), p]));
  const hostProfiles = new Map(); for (const p of PROFILES) if (!hostProfiles.has(p.host)) hostProfiles.set(p.host, p);
  globalThis.fetch = async (input) => {
    const u = new URL(typeof input === "string" ? input : input.url);
    const fill = (h) => h.replaceAll("__URL__", u.origin + u.pathname).replaceAll("__HOST__", u.host);
    const html = (body, status = 200) => new Response(fill(body), { status, headers: { "content-type": "text/html; charset=utf-8" } });
    const own = hostProfiles.get(u.host)?.files?.[u.pathname];
    if (own) return new Response(fill(own.body), { status: own.status || 200, headers: { "content-type": own.type || "text/html; charset=utf-8" } });
    if (u.pathname === "/robots.txt") return new Response(`User-agent: *\nAllow: /\nSitemap: https://${u.host}/sitemap.xml\n`, { status: 200, headers: { "content-type": "text/plain" } });
    if (u.pathname === "/sitemap.xml") return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${u.host}/</loc></url><url><loc>https://${u.host}/contact</loc></url></urlset>`, { status: 200, headers: { "content-type": "application/xml" } });
    if (/\.(jpg|png|svg|js|css|ico)$/.test(u.pathname)) return new Response("x", { status: 200, headers: { "content-type": /\.js$/.test(u.pathname) ? "application/javascript" : "image/jpeg", "content-length": "1" } });
    const exact = byHost.get(u.host + (u.pathname.replace(/\/$/, "") || "/")) || byHost.get(u.host + u.pathname);
    const base = hostProfiles.get(u.host);
    if (!base) return html("not found", 404);
    if (exact) return html(buildSite(exact).home);
    if (u.pathname === "/" && base.path) return new Response("", { status: 301, headers: { location: `https://${u.host}${base.path}` } });
    return html(buildSite(base).sub(u.pathname));
  };
}

const EXTRA = [
  { id: "payments-for-webshops-nl", host: "psp-nl.test", expect: ["financial_services"], notExpect: ["ecommerce"], home: { title: "PayNL – betaalplatform voor webshops", desc: "Online betalingen accepteren in je webshop met iDEAL, creditcard en Klarna.", h1: "Betalingen voor webshops", body: "<p>Checkout-integratie voor WooCommerce en Shopify. Tarieven vanaf € 0,25.</p><a href='/tarieven'>Tarieven</a>", lds: [org("PayNL"), site] } },
  { id: "store-builder-saas", host: "storebuilder.test", expect: ["saas_b2b", "unknown", "general_business"], notExpect: ["ecommerce"], home: { lang: "en", title: "Build your online store – ecommerce platform | StoreBuilder", desc: "Start a free trial of the ecommerce software trusted by merchants. Themes, apps and integrations.", h1: "The ecommerce platform for every business", body: "<p>Pricing from $29/month. Start free trial. Features, integrations, dashboard.</p><a href='/pricing'>Pricing</a>", lds: [org("StoreBuilder"), { "@type": "SoftwareApplication", name: "StoreBuilder" }] } },
  { id: "telecom-phone-product", host: "telco.test", path: "/shop/mobiel/apple/iphone-18-pro/zwart-256gb", expect: ["telecom_technology"], page: "product", commerce: true, raw: page({ title: "Apple iPhone 18 Pro 256 GB met abonnement | Telco", desc: "Bestel de iPhone 18 Pro met sim only of mobiel abonnement. Vandaag besteld, morgen in huis.", h1: "Apple iPhone 18 Pro 256 GB", body: "<p>Vanaf € 45 per maand met abonnement. Toestelprijs € 1.299.</p><form action='/winkelwagen/add'><button>In winkelwagen</button></form><p>Op voorraad</p>", lds: [{ "@type": "Product", name: "iPhone 18 Pro", image: "https://__HOST__/i.jpg", offers: { "@type": "Offer", price: "1299", priceCurrency: "EUR", availability: "https://schema.org/InStock" } }] }) },
  { id: "retailer-with-restaurant", host: "woonwinkel.test", expect: ["ecommerce"], commerce: true, notExpect: ["hospitality"], home: { title: "Meubels en woonaccessoires online kopen | Woonwinkel", desc: "Bestel online of kom langs in onze woonwinkels. Met restaurant en kinderparadijs.", h1: "Alles voor je huis", body: "<div class='product-card'>Kast <span>€ 149,00</span><form action='/cart/add'><button>In winkelwagen</button></form></div><div class='product-card'>Lamp <span>€ 39,00</span><form action='/cart/add'><button>In winkelwagen</button></form></div><a href='/winkelwagen'>Winkelwagen</a> <a href='/product/kast'>Kast</a> <a href='/product/lamp'>Lamp</a> <a href='/restaurant'>Restaurant</a> <a href='/verzending'>Bezorging</a>", lds: [org("Woonwinkel", "FurnitureStore"), site] } },
  { id: "hotel-booking-engine", host: "hotelboek.test", expect: ["hospitality"], notExpect: ["ecommerce"], home: { lang: "en", title: "Grand Hotel – rooms & suites in Vienna", desc: "Book your stay at our 5-star hotel. Best rate guarantee.", h1: "Grand Hotel Vienna", body: "<p>Rooms from €189 per night. Check-in, check-out, guests.</p><form action='/booking/checkout'><button>Book now</button></form><a href='/checkout'>Checkout</a>", lds: [org("Grand Hotel", "Hotel")] } },
  { id: "multilang-hreflang", host: "multi.test", path: "/en/", expect: ["saas_b2b"], page: "homepage", home: { lang: "en", title: "Invoicing software for freelancers | Invo", desc: "Send invoices, track payments and manage expenses. SaaS with integrations. Start a free trial.", h1: "Invoicing software", body: "<p>Features, dashboard, integrations. Book a demo.</p>", extraHead: "<link rel='alternate' hreflang='en' href='https://multi.test/en/'><link rel='alternate' hreflang='nl' href='https://multi.test/nl/'><link rel='alternate' hreflang='x-default' href='https://multi.test/'>", lds: [org("Invo"), { "@type": "SoftwareApplication", name: "Invo" }] } },
  { id: "noindex-page", host: "noindex.test", expect: ["unknown", "general_business", "professional_services"], home: { title: "Bedankt voor je aanvraag | Advies", desc: "Bedankt, we nemen snel contact op.", h1: "Bedankt", body: "<p>Advies.</p>", extraHead: "<meta name='robots' content='noindex,follow'>" } },
  { id: "http-404", host: "dood.test", status: 404, expectHttp: [200, 400, 422, 502], home: { title: "Pagina niet gevonden", desc: "", h1: "404", body: "<p>Niet gevonden</p>" } },
  { id: "http-500", host: "kapot.test", status: 500, expectHttp: [200, 400, 422, 502, 503], home: { title: "Server error", desc: "", h1: "500", body: "" } },
  { id: "bot-challenge", host: "beschermd.test", status: 403, bot: true, expectHttp: [200, 400, 403, 422, 502], home: { lang: "en", title: "Just a moment...", desc: "", h1: "", body: "<p>Checking your browser before accessing. Enable JavaScript and cookies to continue. cf-challenge</p>" } },
  { id: "pdf-not-html", host: "pdf.test", pdf: true, expectHttp: [200, 400, 415, 422, 502], home: { title: "x", h1: "x" } },
  { id: "redirect-www", host: "redirect.test", redirectTo: "https://www.redirect.test/", expectHttp: [200], expect: ["professional_services", "unknown", "general_business"] },
  { id: "empty-body", host: "leegbody.test", empty: true, expectHttp: [200, 400, 422, 502], expect: ["unknown"] },
];
for (const p of EXTRA) PROFILES.push(p);
PROFILES.push({ id: "redirect-target", host: "www.redirect.test", expect: ["professional_services", "unknown", "general_business"], home: { title: "Adviesbureau Groen – consultancy voor duurzaamheid", desc: "Consultancy en advies voor duurzame bedrijven. Neem contact op voor een offerte.", h1: "Adviesbureau Groen", body: "<p>Diensten, expertise, advies.</p>" } });

const baseInstall = installMatrixFetch;
export function installMatrixFetch2() {
  baseInstall();
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = new URL(typeof input === "string" ? input : input.url);
    const p = PROFILES.find((x) => x.host === u.host && (u.pathname === (x.path || "/") || u.pathname === "/"));
    if (p?.redirectTo && u.pathname === "/") return new Response("", { status: 301, headers: { location: p.redirectTo } });
    if (p?.pdf && u.pathname === "/") return new Response("%PDF-1.4 binary", { status: 200, headers: { "content-type": "application/pdf" } });
    if (p?.empty && u.pathname === "/") return new Response("", { status: 200, headers: { "content-type": "text/html" } });
    if (p?.status && u.pathname === "/") {
      const res = await inner(input, init); const body = await res.text();
      return new Response(body, { status: p.status, headers: { "content-type": "text/html", ...(p.bot ? { "set-cookie": "__cf_bm=abc; path=/", "cf-mitigated": "challenge", server: "cloudflare" } : {}) } });
    }
    return inner(input, init);
  };
}

// Reproductions of real report defects (16 Oct 2026) with per-check expectations.
const REPORT_CASES = [
  { id: "report-payments-demo-cookies", host: "paymentsdemo.test", expect: ["financial_services"], maxScore: 99, noModules: ["booking"],
    checkStatus: { product_schema: ["not_applicable"], merchant_product_readiness: ["not_applicable"], product_availability: ["not_applicable"] },
    noMessage: { product_schema: /webshopsignalen gevonden/i },
    home: { lang: "en", title: "PayCo – the platform for online and in-person payments", desc: "One platform to accept payments, manage money and access funding for your business.", h1: "Every payment",
      body: "<p>Book a demo with our sales team. Hosted checkout, payment links and terminals. Hotels and restaurants use PayCo.</p><a href='/book-a-demo'>Book a demo</a>", lds: [org("PayCo"), site] },
    files: { "/cookies": { body: "nf", status: 404 } } },
  { id: "report-shop-newsletter-sitemaps", host: "shopsitemap.test", expect: ["ecommerce"], commerce: true,
    checkStatus: { lead_form_presence: ["__absent__"] }, sitemap: "/sitemap_index.xml",
    home: { title: "Elektronica online kopen | ShopSitemap", desc: "Elektronica online bestellen. Morgen gratis bezorgd en gratis retourneren.", h1: "Elektronica",
      body: "<form action='/zoeken'><input type='search' name='q'><button>Zoek</button></form><form action='/nieuwsbrief'><label>Nieuwsbrief</label><input type='email' name='email'><button>Aanmelden</button></form><div class='product-card'>TV <span>€ 499,00</span><form action='/cart/add'><button>In winkelwagen</button></form></div><div class='product-card'>Laptop <span>€ 899,00</span><form action='/cart/add'><button>In winkelwagen</button></form></div><a href='/winkelwagen'>Winkelwagen</a> <a href='/product/tv'>TV</a> <a href='/product/laptop'>Laptop</a> <a href='/klantenservice'>Klantenservice</a>", lds: [org("ShopSitemap", "ElectronicsStore"), site] },
    files: {
      "/robots.txt": { type: "text/plain", body: "User-agent: *\nAllow: /\nSitemap: https://__HOST__/vacatures/sitemap.xml\nSitemap: https://__HOST__/sitemap_index.xml\n" },
      "/vacatures/sitemap.xml": { type: "application/xml", body: "<?xml version='1.0'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'><url><loc>https://__HOST__/vacatures/1</loc></url></urlset>" },
      "/sitemap_index.xml": { type: "application/xml", body: "<?xml version='1.0'?><sitemapindex xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'><sitemap><loc>https://__HOST__/sitemap-products.xml</loc></sitemap></sitemapindex>" },
    } },
  { id: "report-leading-separator-title", host: "timetrans.test", expect: ["transport_travel"],
    checkStatus: { title: ["warning"], entity: ["pass"], identity: ["pass", "warning"] }, noMessage: { identity: /Ontbrekend: merknaam/ },
    home: { title: "| Time Trans | specialist in bloemen en planten naar de regio Rhône-Alpes", desc: "Time Trans is gespecialiseerd in het geconditioneerd vervoer van sierteeltproducten. Voor groepage en volle vrachten.", h1: "Welkom Specialist in bloemen en planten",
      body: "<p>Time Trans verzorgt wegtransport en logistiek, groupage en volle vrachten naar Frankrijk.</p><img class='logo' src='/logo.png' alt='Time Trans'>" } },
  { id: "report-about-no-contact", host: "overons.test", expect: ["unknown", "general_business", "professional_services"],
    checkStatus: { trust: ["pass", "warning", "unable_to_confirm"] }, message: { trust: /niet bevestigd|beperkt|onvoldoende/i },
    raw: "<!doctype html><html lang='nl'><head><meta charset='utf-8'><title>Over ons – Studio Licht</title><meta name='description' content='Over Studio Licht: wie we zijn, onze missie en ons verhaal sinds 2010 in Utrecht.'></head><body><h1>Over ons</h1><p>Over ons: Studio Licht is opgericht in 2010. Ons verhaal en onze missie.</p></body></html>" },
  { id: "report-wallet-sitemap-index-cdn", host: "walletcdn.test", path: "/us/home", expect: ["financial_services"], page: "homepage",
    checkStatus: { sitemap: ["pass"], product_schema: ["not_applicable"] },
    home: { lang: "en", title: "Pay, Send and Save Money | WalletCDN US", desc: "The faster, safer way to send money, make an online payment and receive money.", h1: "Pay, send and save smarter",
      body: "<div class='product-card'>Deals <span>$19.99</span><button>Add to cart</button></div><div class='product-card'>Gift cards <span>$25.00</span><button>Add to cart</button></div><a href='/checkout'>Checkout</a> <a href='/shipping'>Shipping</a>", lds: [org("WalletCDN", "Corporation"), site, { "@type": "PaymentCard", name: "Debit" }, { "@type": "LoanOrCredit", name: "Credit" }] },
    files: {
      "/robots.txt": { type: "text/plain", body: "User-agent: *\nAllow: /\nSitemap: https://__HOST__/wallet-sitemap-index.xml\n" },
      "/wallet-sitemap-index.xml": { type: "text/xml", body: "<?xml version='1.0'?><sitemapindex xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'><sitemap><loc>https://cdn.walletobjects.test/sitemaps/us.xml</loc></sitemap></sitemapindex>" },
    } },
];
for (const p of REPORT_CASES) PROFILES.push(p);
