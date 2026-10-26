// QA #203/#204 (26 Oct 2026): webshops must be recognised and audited reliably,
// whatever their platform, and a webshop's product range never makes it a
// service provider of that range. Reconstructed from three owner reports
// (diagnostic only, neutral .test hosts, no domain rules):
//   - WooCommerce skincare shop: webshop confirmed, yet "hoofdsector niet
//     vastgesteld · 0%" and "alleen algemene controles" (Combray, 7825e233).
//   - Headless Shopify storefront on Next.js: platform "Custom", "visible
//     currencies EUR·GBP·USD" next to "multiple visible currencies: no", a
//     collection counted as product, legal page as article (Ray, ec7838c2).
//   - Magento case/flight-case shop: "Personenvervoer 90%" from the word
//     "luchtvaart"/"flightcases", 26 webshop checks N.v.t., and a 404 for
//     "/item.product_url" next to "broken links: pass" (Allekoffers, 055c5a4c).
// Plus PrestaShop and OpenCart shops and negative controls: a brochure site with
// one Shopify-CDN image, WordPress with an inactive WooCommerce plugin, a blog
// that reviews products, a salon with online booking, a mini-cart script without
// products, and a real airline that sells tickets.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...o })}</script>`;
const filler = (t, n = 25) => `<p>${(t + " ").repeat(n)}</p>`;
const doc = ({ lang = "nl", title, description, h1 = [], body = "", head = "", nav = "" }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${description}"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body><header><nav>${nav}</nav></header>${h1.map((h) => `<h1>${h}</h1>`).join("")}<main>${body}</main><footer><a href="/privacy">Privacy</a> <a href="/contact">Contact</a></footer></body></html>`;
const product = (name, { sku, price, currency = "EUR", availability = "https://schema.org/InStock", image } = {}) => ({ "@type": "Product", name, ...(sku ? { sku } : {}), ...(image ? { image } : {}), offers: { "@type": "Offer", price, priceCurrency: currency, availability } });

// ---------------------------------------------------------------- WooCommerce
const WP_HEAD = `<link rel="stylesheet" href="/wp-content/themes/flatsome/style.css"><link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css"><script src="/wp-includes/js/jquery/jquery.min.js"></script><link rel="https://api.w.org/" href="/wp-json/"><meta name="generator" content="WordPress 6.6">`;
const WOO_NAV = `<a href="/shop/">Shop</a> <a href="/product-categorie/facial-oils/">Facial oils</a> <a href="/about-us/">About us</a> <a href="/shipping-info/">Shipping</a> <a href="/cart/">Cart</a>`;
const wooProduct = (slug, name, sku, price) => doc({ lang: "en", title: `${name} - Combrai Skin Care`, description: `${name}, a natural plant-based oil for the face. Free shipping in the EU.`, h1: [name], head: WP_HEAD + ld({ "@graph": [product(name, { sku, price, image: `https://combrai.test/wp-content/uploads/${slug}.jpg` })] }), nav: WOO_NAV,
  body: `<div class="product type-product"><p class="price"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&euro;</span>&nbsp;${price.replace(".", ",")}</bdi></span></p><form class="cart" action="/product/${slug}/" method="post"><button type="submit" name="add-to-cart" value="123" class="single_add_to_cart_button">Add to cart</button></form><p class="stock in-stock">In stock</p></div>` + filler("Cold-pressed oils for a radiant skin, suitable for every skin type.") });
const combrai = {
  "/": doc({ lang: "en", title: "Combrai Skin Care", description: "Skin care rituals inspired by the gardens of Combrai. Get 15% off your first order.", h1: ["Natural care for a radiant skin"], head: WP_HEAD, nav: WOO_NAV,
    body: [["regenerating-facial-oil", "Regenerating facial oil", "34.00"], ["rejuvenating-facial-oil", "Rejuvenating facial oil", "38.00"], ["nourishing-facial-oil", "Nourishing facial oil", "36.00"]].map(([s, n, p]) => `<li class="product"><a href="/product/${s}/">${n}</a><span class="woocommerce-Price-amount amount"><bdi>&euro;&nbsp;${p.replace(".", ",")}</bdi></span><a href="?add-to-cart=12" class="add_to_cart_button ajax_add_to_cart">Add to cart</a></li>`).join("") + `<a href="/checkout/">Checkout</a>` + filler("Our oils are made from organic plant extracts and essential oils.") }),
  "/product/regenerating-facial-oil": wooProduct("regenerating-facial-oil", "Regenerating facial oil", "6097114022084", "34.00"),
  "/product/rejuvenating-facial-oil": wooProduct("rejuvenating-facial-oil", "Rejuvenating facial oil", "6097114022091", "38.00"),
  "/product/nourishing-facial-oil": wooProduct("nourishing-facial-oil", "Nourishing facial oil", "6097114022107", "36.00"),
  "/product-categorie/facial-oils": doc({ lang: "en", title: "Facial oils - Combrai Skin Care", description: "All facial oils.", h1: ["Facial oils"], head: WP_HEAD, nav: WOO_NAV, body: `<ul class="products">${[1, 2, 3].map((i) => `<li class="product"><a href="/product/oil-${i}/">Oil ${i}</a><span class="woocommerce-Price-amount amount">&euro;&nbsp;3${i},00</span></li>`).join("")}</ul>` }),
  "/about-us": doc({ lang: "en", title: "About us - Combrai Skin Care", description: "Our story.", h1: ["About us"], head: WP_HEAD, nav: WOO_NAV, body: filler("We make natural skincare products and facial oils in small batches.") }),
};

// Same shop, but the entry page is a brand hero without product cards or prices:
// products, prices and the cart only on sampled pages (the owner's report).
const combraiHero = { ...combrai,
  // Cart icon and mini-cart are injected by JavaScript (wc-cart-fragments): no cart link in raw HTML.
  "/": doc({ lang: "en", title: "Combrai Skin Care", description: "Skin care rituals inspired by the gardens of Combrai.", h1: ["Rituals for a radiant skin"], head: WP_HEAD + `<script src="/wp-content/plugins/woocommerce/assets/js/frontend/cart-fragments.min.js"></script>`, nav: WOO_NAV.replace(/ <a href="\/cart\/">Cart<\/a>/, ""),
    body: `<section class="hero"><a href="/product-categorie/facial-oils/">Discover the facial oils</a> <a href="/product/regenerating-facial-oil/">Regenerating facial oil</a> <a href="/product/rejuvenating-facial-oil/">Rejuvenating facial oil</a></section>` + filler("Rituals inspired by French gardens and the work of a family of perfumers.") }),
};

// ------------------------------------------------- Headless Shopify on Next.js
const NEXT_HEAD = `<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script><script src="/_next/static/chunks/main.js" defer></script>`;
const RAY_NAV = `<a href="/nl/nl/producten">Producten</a> <a href="/nl/nl/producten/zon">Zon</a> <a href="/nl/nl/quiz">Huidquiz</a> <a href="/nl/nl/verkooppunten">Verkooppunten</a> <a href="/nl/nl/gebruiksvoorwaarden">Gebruiksvoorwaarden</a> <a href="/nl/nl/over-ons">Over ons</a>
  <div class="region-selector"><button>Nederland (€ EUR)</button><ul><li><a href="/uk/en">United Kingdom (£ GBP)</a></li><li><a href="/us/en">United States ($ USD)</a></li><li><a href="/be/nl">België (€ EUR)</a></li></ul></div>`;
const rayCard = (slug, name, price) => `<div class="product-card"><a href="/nl/nl/producten/${slug}"><img src="https://cdn.shopify.com/s/files/1/0277/6992/9843/products/${slug}.jpg" alt="${name}">${name}</a><span class="price">€ ${price}</span><button type="button" class="add-to-cart">In winkelwagen</button></div>`;
const ray = {
  "/nl/nl": doc({ title: "Raya Skincare | Huidverzorging met zichtbaar resultaat", description: "Ontdek serums, reinigers en zonbescherming van Raya Skincare. Gratis verzending vanaf € 50.", h1: ["Huidverzorging die werkt"], head: NEXT_HEAD + ld({ "@type": "OnlineStore", name: "Raya Skincare", url: "https://raya.test/nl/nl" }), nav: RAY_NAV,
    body: rayCard("anti-aging-serum", "Anti-Aging Serum", "49,00") + rayCard("dagcreme-spf30", "Dagcrème SPF30", "35,00") + rayCard("reiniger", "Milde reiniger", "24,00") + filler("Wetenschappelijk ontwikkelde huidverzorging voor elk huidtype.") }),
  "/nl/nl/producten/anti-aging-serum": doc({ title: "Anti-Aging Serum + Gratis Oogcrème | Raya Skincare", description: "Anti-aging serum met gratis oogcrème.", h1: ["Anti-Aging Serum + Gratis Oogcrème"], head: NEXT_HEAD + ld(product("Anti-Aging Serum + Gratis Oogcrème", { price: "49.00", image: "https://cdn.shopify.com/s/files/1/0277/6992/9843/products/anti-aging-serum.jpg" })), nav: RAY_NAV,
    body: `<span class="price">€ 49,00</span><button type="button" class="add-to-cart">In winkelwagen</button>` + filler("Een serum met retinol en peptiden.") }),
  "/nl/nl/producten/zon": doc({ title: "Zonbescherming | Raya Skincare", description: "Alle zonproducten.", h1: ["Zon"], head: NEXT_HEAD, nav: RAY_NAV,
    body: [1, 2, 3, 4, 5, 6, 7].map((i) => rayCard(`zon-${i}`, `Zonnecrème ${i}`, `2${i},00`)).join("") }),
  "/nl/nl/quiz": doc({ title: "Huidquiz | Raya Skincare", description: "Doe de huidquiz en ontdek welke producten bij jouw huid passen.", h1: ["Welke huid heb jij?"], head: NEXT_HEAD, nav: RAY_NAV, body: `<form><label>Huidtype <select name="t"><option>Droog</option></select></label><button>Volgende vraag</button></form>` + filler("Beantwoord vijf vragen over je huid.") }),
  "/nl/nl/gebruiksvoorwaarden": doc({ title: "Gebruiksvoorwaarden | Raya Skincare", description: "De algemene voorwaarden voor het gebruik van deze website en bestellingen.", h1: ["Gebruiksvoorwaarden"], head: NEXT_HEAD, nav: RAY_NAV, body: filler("Artikel 1. Deze voorwaarden zijn van toepassing op iedere bestelling.") }),
  "/nl/nl/verkooppunten": doc({ title: "Verkooppunten | Raya Skincare", description: "Vind een verkooppunt bij jou in de buurt.", h1: ["Verkooppunten"], head: NEXT_HEAD, nav: RAY_NAV, body: filler("Zoek op postcode een apotheek of drogist die onze producten verkoopt.") }),
  "/nl/nl/over-ons": doc({ title: "Over ons | Raya Skincare", description: "Ons verhaal.", h1: ["Over ons"], head: NEXT_HEAD, nav: RAY_NAV, body: filler("Raya ontwikkelt huidverzorging met dermatologen.") }),
};

// ---------------------------------------------------------------- Magento
const MAGENTO_HEAD = `<link rel="stylesheet" href="/static/version1729000000/frontend/Hyva/default/nl_NL/css/styles.css"><script>var FORM_KEY = 'abc'; require(['mage/cookies']);</script>`;
const MAGENTO_NAV = `<a href="/alle-producten">Alle producten</a> <a href="/toepassingen/luchtvaart">Luchtvaart</a> <a href="/eigenschappen/waterdicht">Waterdicht</a> <a href="/merken/peli">Peli</a> <a href="/veelgestelde-vragen">Veelgestelde vragen</a> <a href="/checkout/cart/">Winkelwagen</a> <form action="/catalogsearch/result/"><input name="q" placeholder="Doorzoek de hele winkel..."></form>`;
// Hyvä/Alpine binding: a template expression, not a link (owner report: 404 "/item.product_url").
const ALPINE_TEMPLATE = `<template x-for="item in recentlyViewed"><a :href="item.product_url" class="product-item-link" x-text="item.name"></a></template>`;
const mItem = (slug, name, price) => `<li class="item product product-item"><a class="product-item-link" href="/${slug}.html">${name}</a><span class="price-wrapper"><span class="price">€ ${price}</span></span><span class="stock available">Op voorraad</span><form data-role="tocart-form" action="/checkout/cart/add/product/1/" method="post"><button type="submit" class="action tocart">In winkelwagen</button></form></li>`;
const kofferProduct = (slug, name, sku, price) => doc({ title: `${name} | Koffervak`, description: `${name} kopen? Op voorraad, voor 16:00 besteld morgen in huis.`, h1: [name], head: MAGENTO_HEAD + ld(product(name, { sku, price })), nav: MAGENTO_NAV,
  body: `<div class="product-info-main"><span class="price">€ ${price.replace(".", ",")}</span><div class="stock available">Op voorraad</div><form data-role="tocart-form" action="/checkout/cart/add/product/9/" method="post"><button class="action tocart primary">In winkelwagen</button></form></div>` + filler("Waterdichte en stofdichte koffer met plukschuim, geschikt als handbagage.") });
const koffervak = {
  "/": doc({ title: "Flightcases, transportkoffers en kisten | Koffervak.nl", description: "Koffervak.nl: koffers en kisten voor transport, luchtvaart, defensie en industrie. Ruim 700 flightcases en opbergkoffers op voorraad.", h1: ["Koffers en kisten voor elke toepassing"], head: MAGENTO_HEAD, nav: MAGENTO_NAV,
    body: `<ul class="products list">${mItem("peli-1510", "Peli 1510 koffer", "249,95")}${mItem("flightcase-19-inch", "Flightcase 19 inch 6U", "189,00")}${mItem("aluminium-kist-80l", "Aluminium kist 80 liter", "99,95")}</ul>${ALPINE_TEMPLATE}` + filler("Direct betalen via iDEAL, bestellen zonder account en 30 dagen gratis retourneren.") }),
  "/peli-1510.html": kofferProduct("peli-1510", "Peli 1510 koffer", "PELI-1510", "249.95"),
  "/flightcase-19-inch.html": kofferProduct("flightcase-19-inch", "Flightcase 19 inch 6U", "FC-19-6U", "189.00"),
  "/alle-producten": doc({ title: "Alle producten | Koffervak.nl", description: "Bekijk alle 741 koffers, kisten en flightcases.", h1: ["Alle producten"], head: MAGENTO_HEAD, nav: MAGENTO_NAV, body: `<ul class="products list">${[1, 2, 3, 4].map((i) => mItem(`koffer-${i}`, `Koffer ${i}`, `${i}9,95`)).join("")}</ul>` }),
  "/toepassingen/luchtvaart": doc({ title: "Koffers voor de luchtvaart | Koffervak.nl", description: "Koffers geschikt voor vliegreizen en luchtvracht.", h1: ["Luchtvaart"], head: MAGENTO_HEAD, nav: MAGENTO_NAV, body: `<ul class="products list">${[5, 6, 7].map((i) => mItem(`koffer-${i}`, `Koffer ${i}`, `${i}9,95`)).join("")}</ul>` }),
  "/veelgestelde-vragen": doc({ title: "Veelgestelde vragen | Koffervak.nl", description: "Antwoorden over bestellen, betalen en verzenden.", h1: ["Veelgestelde vragen"], head: MAGENTO_HEAD, nav: MAGENTO_NAV, body: filler("Koffervak.nl is de webshop om standaard koffers en kisten te kopen. U betaalt met iDEAL, creditcard of PayPal.") }),
};

// ---------------------------------------------------------------- PrestaShop
const PS_HEAD = `<link rel="stylesheet" href="/themes/classic/assets/css/theme.css"><script src="/modules/ps_shoppingcart/ps_shoppingcart.js"></script><script>var prestashop = {"cart":{}};</script>`;
const prestaPage = (title, h1, body) => doc({ lang: "fr", title, description: `${h1} — livraison offerte dès 49 €.`, h1: [h1], head: PS_HEAD, nav: `<a href="/12-chaussures">Chaussures</a> <a href="/panier">Panier</a> <a href="/nous-contacter">Contact</a>`, body });
const pastrel = {
  "/": prestaPage("Pastrel — chaussures en cuir faites main", "Chaussures en cuir faites main", [1, 2, 3].map((i) => `<article class="product-miniature"><a href="/chaussures/${i}-derby-${i}.html">Derby ${i}</a><span class="price">${119 + i},00 €</span><form action="/panier" method="post"><button class="add-to-cart" data-button-action="add-to-cart">Ajouter au panier</button></form></article>`).join("") + filler("Des chaussures fabriquées en France.")),
  "/chaussures/1-derby-1.html": prestaPage("Derby 1 — Pastrel", "Derby 1", `<span class="current-price"><span class="price">120,00 €</span></span><form action="/panier" method="post"><button class="add-to-cart" data-button-action="add-to-cart">Ajouter au panier</button></form>` + filler("Cuir pleine fleur, semelle cousue.")).replace("</head>", ld(product("Derby 1", { sku: "DRB-1", price: "120.00" })) + "</head>"),
};

// ---------------------------------------------------------------- OpenCart
const OC_HEAD = `<link href="catalog/view/theme/default/stylesheet/stylesheet.css" rel="stylesheet"><script src="catalog/view/javascript/common.js"></script>`;
const ocPage = (title, h1, body) => doc({ lang: "de", title, description: `${h1} günstig online kaufen.`, h1: [h1], head: OC_HEAD, nav: `<a href="/index.php?route=product/category&path=20">Werkzeug</a> <a href="/index.php?route=checkout/cart">Warenkorb</a>`, body });
const werkbank = {
  ...Object.fromEntries([1, 2, 3].map((i) => [`/index.php?route=product/product&product_id=${40 + i}`, ocPage(`Akkuschrauber ${i} – Werkbank24`, `Akkuschrauber ${i}`, `<ul class="list-unstyled"><li><h2>${79 + i},90 €</h2></li><li>Artikelnummer: AS-${i}</li><li>Verfügbarkeit: Auf Lager</li></ul><button type="button" id="button-cart">In den Warenkorb</button>` + filler("18 V Akkuschrauber mit zwei Akkus und Ladegerät.")).replace("</head>", ld(product(`Akkuschrauber ${i}`, { sku: `AS-${i}`, price: `${79 + i}.90` })) + "</head>")])),
  "/": ocPage("Werkbank24 – Werkzeug online kaufen", "Werkzeug online kaufen", [1, 2, 3].map((i) => `<div class="product-thumb"><a href="/index.php?route=product/product&product_id=${40 + i}">Akkuschrauber ${i}</a><p class="price">${79 + i},90 €</p><button type="button" onclick="cart.add('${40 + i}')">In den Warenkorb</button></div>`).join("") + filler("Werkzeug, Maschinen und Zubehör für Handwerk und Heimwerker.")),
};

// ---------------------------------------------------------------- negatives
const negatives = {
  // Brochure site of a dermatology practice with one image on a Shopify CDN.
  "huidpraktijk.test": { "/": doc({ title: "Huidpraktijk Oost | Dermatologie en huidtherapie", description: "Huidtherapeut en dermatoloog voor acne, eczeem en littekens. Maak een afspraak.", h1: ["Huidtherapie in Oost"], body: `<img src="https://cdn.shopify.com/s/files/1/0001/banner.jpg" alt="Behandelkamer"><a href="/afspraak">Afspraak maken</a>` + filler("Wij behandelen acne, eczeem, pigmentvlekken en littekens.") }) },
  // WordPress with the WooCommerce plugin installed but no shop on the page.
  "adviesbureau.test": { "/": doc({ title: "Adviesbureau Lindeboom | Belastingadvies voor ondernemers", description: "Belastingadvies, jaarrekeningen en salarisadministratie voor het mkb.", h1: ["Belastingadvies"], head: WP_HEAD, body: filler("Wij verzorgen uw aangifte, jaarrekening en loonadministratie.") }) },
  // A blog that reviews skincare products and links to shops.
  "huidblog.test": { "/": doc({ title: "Huidblog | Reviews van serums en crèmes", description: "Eerlijke reviews en vergelijkingen van huidverzorgingsproducten.", h1: ["De beste serums van 2026"], body: `<article><h2>Review: serum X</h2><p>Prijs: € 49,00 bij diverse winkels.</p><a href="https://shop.elders.test/serum-x">Bekijk bij de winkel</a></article>` + filler("Wij testen huidverzorging en schrijven eerlijke reviews.") }) },
  // A hair salon with online booking and no cart.
  "kapsalonzon.test": { "/": doc({ title: "Kapsalon Zon | Kapper in Utrecht", description: "Knippen, kleuren en föhnen in Utrecht. Boek online je afspraak.", h1: ["Kapsalon Zon"], body: `<a href="/afspraak-maken">Online afspraak boeken</a><p>Knippen dames € 45,00</p>` + filler("Onze kappers knippen, kleuren en stylen.") }) },
  // A mini-cart script on a consultancy site, no products.
  "consultlab.test": { "/": doc({ lang: "en", title: "ConsultLab | Strategy consulting", description: "Strategy and organisation consulting for scale-ups.", h1: ["Strategy that works"], head: `<script>window.miniCart={items:[]};</script>`, body: `<div id="mini-cart" class="minicart"></div>` + filler("We help leadership teams with strategy and organisation design.") }) },
  // A real airline: tickets and timetable, stays passenger transport.
  "vliegmij.test": { "/": doc({ title: "VliegMij | Goedkope vluchten boeken naar Europa", description: "Boek je vliegtickets bij luchtvaartmaatschappij VliegMij. Bekijk de dienstregeling en check online in.", h1: ["Vluchten boeken"], head: ld({ "@type": "Airline", name: "VliegMij" }), body: `<form action="/boeken"><input name="van"><input name="naar"><button>Zoek vluchten</button></form><p>Vanaf € 39,00 enkele reis</p>` + filler("Vlieg naar meer dan 80 bestemmingen in Europa.") }) },
};

const SITES = {
  "combrai.test": { pages: combrai, start: "/", expect: { websiteType: "ecommerce_store", platform: /^WooCommerce/, cms: "WordPress", sectorNot: ["unknown"], sector: ["ecommerce"], vertical: "beauty_personal_care", commerce: "confirmed", noQualifier: /hoofdsector niet vastgesteld/i } },
  "combrai-hero.test": { pages: combraiHero, start: "/", expect: { websiteType: "ecommerce_store", platform: /^WooCommerce/, sector: ["ecommerce"], vertical: "beauty_personal_care", commerce: "confirmed", noQualifier: /hoofdsector niet vastgesteld/i } },
  "raya.test": { pages: ray, start: "/nl/nl", expect: { websiteType: "ecommerce_store", platform: /^Shopify/, framework: "Next.js", sector: ["ecommerce"], vertical: "beauty_personal_care", commerce: "confirmed", noMixedCurrencyContradiction: true, pageTypes: { "/nl/nl/producten/zon": ["category", "listing"], "/nl/nl/gebruiksvoorwaarden": ["legal"] }, notPageTypes: { "/nl/nl/quiz": ["category", "product"], "/nl/nl/verkooppunten": ["product", "category"] } } },
  "koffervak.test": { pages: koffervak, start: "/", expect: { websiteType: "ecommerce_store", platform: /^Magento/, sector: ["ecommerce"], sectorNot: ["transport_travel"], commerce: "confirmed", productChecksApplicable: true, noTemplateLinks: true } },
  "pastrel.test": { pages: pastrel, start: "/", expect: { websiteType: "ecommerce_store", platform: /^PrestaShop/, sector: ["ecommerce"], commerce: "confirmed" } },
  "werkbank.test": { pages: werkbank, start: "/", expect: { websiteType: "ecommerce_store", platform: /^OpenCart/, sector: ["ecommerce"], commerce: "confirmed" } },
  "huidpraktijk.test": { pages: negatives["huidpraktijk.test"], start: "/", expect: { websiteTypeNot: "ecommerce_store", platformNot: /Shopify/, sectorNot: ["ecommerce"] } },
  "adviesbureau.test": { pages: negatives["adviesbureau.test"], start: "/", expect: { websiteTypeNot: "ecommerce_store", platformNot: /WooCommerce/, sectorNot: ["ecommerce"] } },
  "huidblog.test": { pages: negatives["huidblog.test"], start: "/", expect: { websiteTypeNot: "ecommerce_store", sectorNot: ["ecommerce"] } },
  "kapsalonzon.test": { pages: negatives["kapsalonzon.test"], start: "/", expect: { websiteTypeNot: "ecommerce_store", sectorNot: ["ecommerce"] } },
  "consultlab.test": { pages: negatives["consultlab.test"], start: "/", expect: { websiteTypeNot: "ecommerce_store", sectorNot: ["ecommerce"] } },
  "vliegmij.test": { pages: negatives["vliegmij.test"], start: "/", expect: { websiteTypeNot: "ecommerce_store", sector: ["transport_travel"] } },
};
const HEADERS = { "koffervak.test": { "x-magento-tags": "FPC", "x-magento-cache-debug": "HIT" } };
const requested = [];
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const host = u.host.replace(/^www\./, "");
  requested.push(`${host}${u.pathname}`);
  const site = SITES[host];
  const path = u.pathname.replace(/\/$/, "") || "/";
  const html = site?.pages[path + u.search] ?? site?.pages[path];
  if (!html) return new Response("<html><head><title>404 Niet gevonden</title></head><body><h1>Pagina niet gevonden</h1></body></html>", { status: 404, headers: { "content-type": "text/html" } });
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...(HEADERS[host] || {}) } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const problems = [];
const rows = [];
const PRODUCT_CHECKS = ["product_schema", "price_currency_consistency", "stock_availability", "checkout_funnel"];
for (const [host, site] of Object.entries(SITES)) {
  if (ONLY.length && !ONLY.includes(host)) continue;
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}${site.start}`, mode: "both", language: "nl" }) }));
  const j = await res.json();
  const e = site.expect;
  const sp = j.sectorProfile || {};
  const tp = j.technologyProfile || {};
  const wp = j.websiteProfile || {};
  const checks = [...(j.seo?.checks || []), ...(j.geo?.checks || [])];
  const pages = j.multiPage?.pageAudits || [];
  if (process.env.DEBUG_WP) console.log(host, JSON.stringify(wp.industryVertical));
  const row = { host, status: res.status, sector: sp.sector, key: sp.key, conf: sp.confidenceScore, websiteType: wp.websiteType?.value, vertical: wp.industryVertical?.value, platform: wp.commercePlatform?.value ?? tp.commercePlatform, cms: tp.cms, framework: tp.framework, commerce: j.commerceApplicability?.state, qualifier: j.scoreModel?.qualifier?.label || j.scoreModel?.evidenceReasons?.join(" | "), pages: pages.map((p) => `${new URL(p.url).pathname}:${p.type}:${p.httpStatus ?? p.status}`).join(" ") };
  rows.push(row);
  const P = (m) => problems.push(`${host}: ${m}`);
  if (res.status !== 200) { P(`HTTP ${res.status} ${j.code}`); continue; }
  if (e.websiteType && wp.websiteType?.value !== e.websiteType) P(`websiteType ${wp.websiteType?.value}, expected ${e.websiteType}`);
  if (e.websiteTypeNot && wp.websiteType?.value === e.websiteTypeNot) P(`websiteType ${e.websiteTypeNot} without a shop (${(wp.websiteType?.evidence || []).join("; ")})`);
  const platform = wp.commercePlatform?.value || tp.commercePlatform || "";
  if (e.platform && !e.platform.test(platform)) P(`commerce platform "${platform}", expected ${e.platform}`);
  // An installed plugin or a CDN asset may be reported, but never as a working shop platform.
  if (e.platformNot && e.platformNot.test(platform) && wp.commercePlatform?.status !== "installed_no_shop") P(`commerce platform "${platform}" (${wp.commercePlatform?.status}) from an incidental marker`);
  if (e.cms && tp.cms !== e.cms) P(`CMS ${tp.cms}, expected ${e.cms}`);
  if (e.framework && tp.framework !== e.framework) P(`framework ${tp.framework}, expected ${e.framework}`);
  if (e.sector && !e.sector.includes(sp.sector)) P(`sector ${sp.sector} (${sp.key} ${sp.confidenceScore}), expected ${e.sector.join("|")}; evidence: ${(sp.evidence || []).slice(0, 2).join("; ")}`);
  if (e.sectorNot?.includes(sp.sector)) P(`sector ${sp.sector} (${sp.key} ${sp.confidenceScore}); evidence: ${(sp.evidence || []).slice(0, 2).join("; ")}`);
  if (e.vertical && wp.industryVertical?.value !== e.vertical) P(`industry vertical ${wp.industryVertical?.value}, expected ${e.vertical}`);
  if (e.commerce && j.commerceApplicability?.state !== e.commerce) P(`webshop functionality ${j.commerceApplicability?.state}, expected ${e.commerce}`);
  if (e.noQualifier) { const q = JSON.stringify(j.scoreModel || {}); if (e.noQualifier.test(q)) P(`score says "hoofdsector niet vastgesteld" on a confirmed webshop`); }
  // A confirmed webshop never has its webshop checks switched off ("N.v.t.").
  if (j.commerceApplicability?.state === "confirmed") {
    const na = checks.filter((c) => PRODUCT_CHECKS.includes(c.key) && c.status === "not_applicable");
    if (na.length) P(`confirmed webshop, but webshop checks N.v.t.: ${na.map((c) => c.key).join(", ")}`);
    if (!(sp.applicableModules || []).includes("ecommerce")) P(`confirmed webshop without the webshop module (modules: ${(sp.applicableModules || []).join(",")})`);
  }
  if (e.noMixedCurrencyContradiction) {
    const pc = j.metrics?.pricingCurrency || {};
    if ((pc.visibleCurrencies || []).length > 1 && !pc.mixedVisibleCurrencies) P(`"visible currencies ${pc.visibleCurrencies.join("·")}" next to "multiple visible currencies: no"`);
    if ((pc.visibleCurrencies || []).length !== 1 || pc.visibleCurrencies[0] !== "EUR") P(`price currencies ${(pc.visibleCurrencies || []).join(",")}, expected EUR (GBP/USD only in the region selector)`);
    if (!(pc.selectorCurrencies || []).includes("GBP")) P(`region-selector currencies not reported separately (${JSON.stringify(pc.selectorCurrencies)})`);
  }
  for (const [path, types] of Object.entries(e.pageTypes || {})) {
    const p = pages.find((x) => new URL(x.url).pathname.replace(/\/$/, "") === path);
    if (p && !types.includes(p.type)) P(`${path} typed ${p.type}, expected ${types.join("|")}`);
  }
  for (const [path, types] of Object.entries(e.notPageTypes || {})) {
    const p = pages.find((x) => new URL(x.url).pathname.replace(/\/$/, "") === path);
    if (p && types.includes(p.type)) P(`${path} typed ${p.type}`);
  }
  if (e.noTemplateLinks) {
    const bad = requested.filter((r) => r.startsWith(host) && /item\.product_url|%7B|\{\{/.test(r));
    if (bad.length) P(`template expression fetched as a link: ${bad.join(", ")}`);
    const broken = checks.find((c) => c.key === "broken_links");
    const sample404 = pages.filter((p) => Number(p.httpStatus) === 404);
    if (sample404.length && broken?.status === "pass") P(`sample page answered 404 (${sample404.map((p) => p.url).join(", ")}) but broken links passes`);
  }
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
