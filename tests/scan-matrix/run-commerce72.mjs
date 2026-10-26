// QA commerce 72/72 TestLab (26 Oct 2026, f65ebda): webshops that RankFix missed
// or described inconsistently. Reconstructed from the stored reports and the
// shops' public server HTML structure (diagnostic only; neutral .test hosts, no
// domain rules):
//   hyva.test       Magento Hyvä: product cards are <form action=/checkout/cart/add>,
//                   icon-only buy button named by aria-label, extensionless product
//                   URLs, no products on the homepage (Allekoffers: "unknown 0%").
//   bigcat.test     product grid starts after a 2 MB page head; <li class=product-item>
//                   with the product link 3 kB into the card (Bergfreunde: 297 prices
//                   read as 9, "webshop niet bevestigd").
//   orphan.test     shop with product pages but no shop words in its identity
//                   (Travelbags/Sarenza/Fixami: "webshop" + "sector unknown 0%").
//   jsshop.test     "dé online shop voor ..." in the title, products client-side
//                   (Medpets/Intertoys/Bruna: "unknown 0%", score 98).
//   refused.test    retailer whose category/product pages answer 405
//                   (Screwfix: retail sector + "Dienstverlener / organisatie").
//   plantshop.test  Shopify plant shop whose brand is a trade noun ("Bakker"):
//                   never a bakery.
//   runretail.test  "Running & Outdoor Fitness Retailer" (Sportsshoes: fitness 95%).
// Negative controls: shop software vendor ("start je eigen webshop"), pizzeria with
// online ordering, charity with a shop section.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...o })}</script>`;
const filler = (t, n = 30) => `<p>${(t + " ").repeat(n)}</p>`;
const doc = ({ lang = "nl", title, description, h1 = [], body = "", head = "", nav = "" }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${description}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/">${head}</head><body><header><nav>${nav}</nav></header>${h1.map((h) => `<h1>${h}</h1>`).join("")}<main>${body}</main><footer><a href="/privacy">Privacy</a> <a href="/contact">Contact</a> <a href="/over-ons">Over ons</a></footer></body></html>`;
const product = (name, sku, price, currency = "EUR") => ({ "@type": "Product", name, sku, image: `https://img.test/${sku}.jpg`, offers: { "@type": "Offer", price, priceCurrency: currency, availability: "https://schema.org/InStock" } });
const productPage = (lang, name, sku, price, extra = "") => doc({ lang, title: `${name}`, description: `${name} – direct leverbaar.`, h1: [name], head: ld(product(name, sku, price)), body: `<span class="price">€ ${price.replace(".", ",")}</span>${extra}` + filler("Productomschrijving en specificaties.") });

// Magento Hyvä (structure as served by a live store, names neutral).
const MAG_HEAD = `<link rel="stylesheet" href="/static/version1729000000/frontend/Hyva/default/nl_NL/css/styles.css"><script>require(['mage/cookies']);</script>`;
const hyvaCard = (id, slug, name, price) => `<li class="flex flex-col"><form method="post" action="https://www.hyva.test/checkout/cart/add/uenc/%25uenc%25/product/${id}/" class="product-item product_addtocart_form card flex flex-col h-full"><input name="form_key" type="hidden" value="abc"><input type="hidden" name="product" value="${id}"><a href="https://www.hyva.test/${slug}" class="product photo product-item-photo"><img src="/media/${slug}.jpg" alt="${name}"></a><a class="product-item-link" href="https://www.hyva.test/${slug}" :id="\`slide-desc-${id}\`"><span>${name}</span></a><div class="price-box"><span data-price-amount="${price}" class="price-wrapper"><span class="price">€ ${price.replace(".", ",")}</span></span></div><p class="stock available">Op voorraad</p><button class="btn btn-primary" title="In&#x20;Winkelwagen&#x20;${name}" aria-label="In&#x20;Winkelwagen&#x20;${name}" data-addto="cart"><i class="fa-cart"></i></button></form></li>`;
const hyvaGrid = (seed) => `<ol class="products list">${[1, 2, 3, 4, 5, 6].map((i) => hyvaCard(seed + i, `koffer-model-${seed + i}`, `Koffer model ${seed + i}`, `${60 + i}.50`)).join("")}</ol>`;
const hyva = {
  "/": doc({ title: "Koffers en kisten voor elke toepassing | Hyva.test", description: "Koffers, kisten en flightcases voor transport, luchtvaart, defensie en industrie.", h1: ["Koffers voor elke toepassing"], head: MAG_HEAD, nav: `<a href="/toepassingen/transportkoffers">Transportkoffers</a> <a href="/toepassingen/fotokoffers">Fotokoffers</a> <a href="/eigenschappen/waterdicht">Waterdicht</a> <a href="/veelgestelde-vragen">FAQ</a> <a href="/checkout/cart/">Winkelwagen</a>`, body: filler("Al meer dan 20 jaar specialist in beschermende koffers en kisten.") }),
  "/toepassingen/transportkoffers": doc({ title: "Transportkoffers - Toepassingen", description: "Transportkoffers in alle maten.", h1: ["Transportkoffers"], head: MAG_HEAD, body: hyvaGrid(400) }),
  "/toepassingen/fotokoffers": doc({ title: "Fotokoffers - Toepassingen", description: "Koffers voor camera's.", h1: ["Fotokoffers"], head: MAG_HEAD, body: hyvaGrid(500) }),
  "/eigenschappen/waterdicht": doc({ title: "Waterdichte koffers", description: "Waterdichte koffers.", h1: ["Waterdicht"], head: MAG_HEAD, body: hyvaGrid(600) }),
  ...Object.fromEntries([400, 500, 600].flatMap((seed) => [1, 2, 3, 4, 5, 6].map((i) => [`/koffer-model-${seed + i}`, productPage("nl", `Koffer model ${seed + i}`, `K-${seed + i}`, `${60 + i}.50`, `<form action="/checkout/cart/add/product/${seed + i}/" method="post"><button aria-label="In Winkelwagen">+</button></form>`).replace("</head>", `${MAG_HEAD}</head>`)]))),
};

// Large category page: product grid far beyond the first 12k characters of text.
const bigHead = `<div class="mega-menu">${Array.from({ length: 400 }, (_, i) => `<a href="/categorie-${i}/">Categorie nummer ${i} met een lange naam</a>`).join(" ")}</div>`;
const bigCard = (i) => `<li class="product-item product-fallback" data-artnum="852-${i}"><div class="product-popup"><div class="product-compare">${'<span class="x">vergelijken</span>'.repeat(40)}</div></div><a class="product-link" href="/merk-model-${i}-fietshelm/"><img src="/i/${i}.jpg" alt="Helm ${i}"><span class="product-name">Fietshelm model ${i}</span></a><div class="product-price"><span class="price">€ ${40 + i},95</span></div></li>`;
const bigcat = {
  "/": doc({ title: "Online Outdoorwinkel | Klimmen, Wandelen & Fietsen | Bigcat", description: "Outdoorkleding en uitrusting online kopen. Gratis verzending vanaf €69.", h1: ["Outdooruitrusting"], nav: `<a href="/outlet/fietsen/">Fietsen</a> <a href="/outlet/klimmen/">Klimmen</a>`, body: bigHead + `<span class="price">€ 49,95</span> <span class="price">€ 89,95</span>` + filler("Alles voor klimmen, wandelen en fietsen.") }),
  "/outlet/fietsen": doc({ title: "Fiets spullen | Online Sale | Bigcat", description: "Fietshelmen en meer in de sale.", h1: ["Fietsen"], body: bigHead + `<ul class="products">${Array.from({ length: 24 }, (_, i) => bigCard(i)).join("")}</ul>` }),
  "/outlet/klimmen": doc({ title: "Klimspullen | Online Sale | Bigcat", description: "Klimuitrusting in de sale.", h1: ["Klimmen"], body: bigHead + `<ul class="products">${Array.from({ length: 24 }, (_, i) => bigCard(100 + i)).join("")}</ul>` }),
  ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`/merk-model-${i}-fietshelm`, productPage("nl", `Fietshelm model ${i}`, `FH-${i}`, `${40 + i}.95`, `<button class="add-to-cart">In winkelwagen</button>`)])),
};

// Shop without shop words in its own identity; products only on category pages.
const orphanCard = (i) => `<div class="product-card"><a href="/flora-tas-${i}.html">Shopper ${i}</a><span class="price">€ ${30 + i},95</span></div>`;
const orphan = {
  "/": doc({ title: "Orphan | Tassen, koffers en accessoires", description: "Tassen, koffers en accessoires van topmerken. Snel in huis.", h1: [], nav: `<a href="/tassen/shoppers/">Shoppers</a> <a href="/koffers/harde-koffers/">Harde koffers</a> <a href="/klantenservice/">Klantenservice</a>`, body: filler("Ontdek tassen en koffers van bekende merken.") }),
  "/tassen/shoppers": doc({ title: "Shoppers | Orphan", description: "Shoppers.", h1: ["Shoppers"], body: [1, 2, 3, 4, 5].map(orphanCard).join("") }),
  "/koffers/harde-koffers": doc({ title: "Harde koffers | Orphan", description: "Harde koffers.", h1: ["Harde koffers"], body: [6, 7, 8, 9, 10].map(orphanCard).join("") }),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => [`/flora-tas-${i}.html`, productPage("nl", `Shopper ${i}`, `S-${i}`, `${30 + i}.95`)])),
  "/klantenservice": doc({ title: "Klantenservice | Orphan", description: "Vragen over bestellen en retourneren.", h1: ["Klantenservice"], body: filler("Bestellen, betalen, verzenden en retourneren.") }),
};

// Own shop declaration; products load client-side.
const jsshop = {
  "/": doc({ title: "Jsshop.test | dé online shop voor de gezondheid van je dier!", description: "Diervoeding en medicijnen voor hond en kat. Voor 22:00 besteld, morgen in huis.", h1: ["Alles voor je huisdier"], nav: `<a href="/hond">Hond</a> <a href="/kat">Kat</a> <a href="/klantenservice">Klantenservice</a>`, body: `<div id="__app" data-props="{}"></div>` + filler("Wij helpen je dier gezond te blijven.") }),
  "/hond": doc({ title: "Hond | Jsshop.test", description: "Alles voor je hond.", h1: ["Hond"], body: `<div id="__app"></div>` + filler("Voeding en verzorging voor honden.") }),
  "/kat": doc({ title: "Kat | Jsshop.test", description: "Alles voor je kat.", h1: ["Kat"], body: `<div id="__app"></div>` + filler("Voeding en verzorging voor katten.") }),
  "/klantenservice": doc({ title: "Klantenservice | Jsshop.test", description: "Vragen over je bestelling.", h1: ["Klantenservice"], body: filler("Bestellen en retourneren.") }),
};

// Retailer whose shop pages refuse RankFix.
const refused = {
  "/": doc({ lang: "en", title: "Refused | Tools, Fixings, Plumbing & Electrical online", description: "Buy tools, fixings and electrical supplies online or click & collect from over 900 stores.", h1: ["Trade prices for everyone"], nav: `<a href="/c/tools/drills/cat1">Drills</a> <a href="/c/fixings/screws/cat2">Screws</a> <a href="/c/heating/radiators/cat3">Radiators</a> <a href="/p/drill-18v/123">Drill 18V</a> <a href="/p/screws-box/456">Screws box</a> <a href="/help/aboutus">About us</a> <a href="/basket">Basket</a>`, body: filler("Over 30,000 products available for next day delivery.") }),
  "/help/aboutus": doc({ lang: "en", title: "About us | Refused", description: "Our story.", h1: ["About us"], body: filler("We sell tools and fixings to tradespeople.") }),
};
const REFUSED_PATHS = /^\/(?:c|p)\//;

// Shopify plant shop whose brand is a trade noun.
const SHOPIFY_HEAD = `<link rel="stylesheet" href="https://cdn.shopify.com/s/files/1/0001/theme.css"><script>window.Shopify = {}; Shopify.theme = {};</script>`;
const plantCard = (i) => `<div class="product-card"><a href="/products/plante-${i}">Lavande ${i}</a><span class="price">€${6 + i},99</span><form action="/cart/add" method="post"><button type="submit">Ajouter au panier</button></form></div>`;
const plantshop = {
  "/": doc({ lang: "fr", title: "Jardinerie en Ligne | Achat Plantes en Ligne | Bakker.com", description: "Bakker.com, votre jardinerie en ligne : plantes, bulbes et graines livrés chez vous.", h1: ["Bakker"], head: SHOPIFY_HEAD, nav: `<a href="/collections/plantes-vivaces">Plantes vivaces</a> <a href="/collections/bulbes">Bulbes</a>`, body: [1, 2, 3, 4].map(plantCard).join("") + filler("Des plantes de qualité pour votre jardin.") }),
  "/collections/plantes-vivaces": doc({ lang: "fr", title: "Plantes vivaces | Bakker.com", description: "Plantes vivaces pour le jardin.", h1: ["Plantes vivaces"], head: SHOPIFY_HEAD, body: [5, 6, 7, 8].map(plantCard).join("") }),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`/products/plante-${i}`, productPage("fr", `Lavande ${i} – plante vivace`, `L-${i}`, `${6 + i}.99`, `<form action="/cart/add" method="post"><button>Ajouter au panier</button></form>`).replace("</head>", `${SHOPIFY_HEAD}</head>`)])),
};

// "Fitness Retailer".
const runCard = (i) => `<div class="product-tile"><a href="/mens-running-shoe-${i}/">Running shoe ${i}</a><span class="price">£${80 + i}.00</span></div>`;
const runretail = {
  "/": doc({ lang: "en", title: "Runretail - The UK's No 1 Running & Outdoor Fitness Retailer | Runretail.test", description: "Shop running shoes, trail shoes and gym wear. Free UK delivery over £50.", h1: ["Running shoes"], nav: `<a href="/mens-running-shoes/">Men's running shoes</a> <a href="/basket">Basket</a>`, body: [1, 2, 3, 4].map(runCard).join("") + `<button class="add-to-cart">Add to basket</button>` + filler("Running, fitness and outdoor kit.") }),
  "/mens-running-shoes": doc({ lang: "en", title: "Men's running shoes | Runretail", description: "Running shoes for men.", h1: ["Men's running shoes"], body: [5, 6, 7, 8].map(runCard).join("") }),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`/mens-running-shoe-${i}`, productPage("en", `Running shoe ${i}`, `R-${i}`, `${80 + i}.00`, `<button class="add-to-cart">Add to basket</button>`).replace(/"priceCurrency":"EUR"/, '"priceCurrency":"GBP"').replace(/€ /g, "£")])),
};

// Rate limiting: homepage 200, every other page 429 (ram-geheugen / Haibu, #207).
const WP_HEAD = `<link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css"><script src="/wp-includes/js/jquery/jquery.min.js"></script><link rel="https://api.w.org/" href="/wp-json/">`;
const ratelimit = { "/": doc({ title: "Ramstore | Geheugen voor laptop en pc", description: "RAM-geheugen kopen voor laptop, pc en server.", h1: ["Geheugen kopen"], head: WP_HEAD, nav: Array.from({ length: 18 }, (_, i) => `<a href="/product-categorie/ram-${i}/">RAM ${i}</a>`).join(" "), body: [1, 2, 3].map((i) => `<li class="product type-product"><a href="/product/ddr4-${i}/" class="woocommerce-LoopProduct-link">DDR4 ${i}</a><span class="woocommerce-Price-amount amount"><bdi>&euro;&nbsp;${30 + i},00</bdi></span><a href="?add-to-cart=${i}" class="add_to_cart_button ajax_add_to_cart">In winkelwagen</a></li>`).join("") }) };
// WooCommerce product detail with related products, and wp-json links (#207).
const relatedGrid = [1, 2, 3, 4].map((i) => `<li class="product type-product"><a href="/product/olie-${i}/" class="woocommerce-LoopProduct-link">Olie ${i}</a><span class="woocommerce-Price-amount amount"><bdi>&euro;&nbsp;1${i},95</bdi></span></li>`).join("");
const wpjson = {
  "/": doc({ title: "Arganisch | Pure arganolie", description: "Pure, biologische arganolie voor huid en haar.", h1: ["Arganolie"], head: WP_HEAD, nav: `<a href="/product/puur-cosmetische-arganolie-kopen/">Arganolie kopen</a> <a href="/wp-json/wp/v2/product/58">api</a> <a href="/wp-json/wp/v2/product/59">api</a> <a href="/winkel/">Winkel</a>`, body: filler("Arganolie uit Marokko.") }),
  "/product/puur-cosmetische-arganolie-kopen": doc({ title: "Puur cosmetische arganolie kopen | Arganisch", description: "Arganolie 100 ml.", h1: ["Puur cosmetische arganolie"], head: WP_HEAD, body: `<div class="product type-product single-product"><p class="price"><span class="woocommerce-Price-amount amount"><bdi>&euro;&nbsp;24,95</bdi></span></p><form class="cart" method="post"><button type="submit" name="add-to-cart" value="58" class="single_add_to_cart_button">In winkelwagen</button></form></div><section class="related products"><ul class="products">${relatedGrid}</ul></section>` }),
  "/winkel": doc({ title: "Winkel | Arganisch", description: "Alle producten.", h1: ["Winkel"], head: WP_HEAD, body: `<ul class="products">${relatedGrid}</ul>` }),
};
// Hair & beauty wholesaler on Magento for professionals and consumers (Haibu, #207).
const wholesale = {
  "/": doc({ title: "Groothaar | Kappersgroothandel voor hair & beauty professionals", description: "De online kappersgroothandel met meer dan 20.000 producten. Snelle levering voor kappers, salons en consumenten.", h1: ["Kappersbenodigdheden"], head: MAG_HEAD, nav: `<a href="/haarproducten/">Haarproducten</a> <a href="/pro">PRO-klanten</a>`, body: [1, 2, 3, 4].map((i) => hyvaCard(900 + i, `shampoo-${i}`, `Professionele shampoo ${i}`, `${10 + i}.95`)).join("") }),
  "/haarproducten": doc({ title: "Haarproducten | Groothaar", description: "Haarverzorging voor kappers en consumenten.", h1: ["Haarproducten"], head: MAG_HEAD, body: [5, 6, 7, 8].map((i) => hyvaCard(900 + i, `shampoo-${i}`, `Professionele shampoo ${i}`, `${10 + i}.95`)).join("") }),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`/shampoo-${i}`, productPage("nl", `Professionele shampoo ${i}`, `SH-${i}`, `${10 + i}.95`, `<form action="/checkout/cart/add/product/${900 + i}/" method="post"><button aria-label="In winkelwagen">+</button></form>`).replace("</head>", `${MAG_HEAD}</head>`)])),
};

// Comparison platform: products with prices, "naar de winkel" links, no own cart (#207).
const cmpCard = (i) => `<div class="product-card"><a href="/schoenen/sneaker-${i}">Sneaker ${i}</a><span class="price">€ ${70 + i},00</span></div>`;
const comparison = {
  "/": doc({ title: "Schoenvind | Schoenen van alle webshops op één plek", description: "Vind en vergelijk schoenen van honderden webshops. De schoenenzoekmachine van Nederland.", h1: ["Alle schoenen op één plek"], nav: `<a href="/schoenen/sneakers">Sneakers</a> <a href="/over-ons">Over ons</a>`, body: [1, 2, 3, 4].map(cmpCard).join("") + filler("Vergelijk prijzen en vind de beste deal.") }),
  "/schoenen/sneakers": doc({ title: "Sneakers | Schoenvind", description: "Sneakers vergelijken.", h1: ["Sneakers"], body: [5, 6, 7, 8].map(cmpCard).join("") }),
  "/over-ons": doc({ title: "Over ons | Schoenvind", description: "Schoenvind is een schoenenzoekmachine en prijsvergelijker.", h1: ["Over Schoenvind"], body: filler("Wij hebben geen eigen voorraad; bestellen en betalen doe je bij de aangesloten winkels.") }),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`/schoenen/sneaker-${i}`, productPage("nl", `Sneaker ${i}`, `SN-${i}`, `${70 + i}.00`, `<a href="https://shop-elders.test/p/${i}" rel="nofollow sponsored">Bekijk bij de winkel</a>`)])),
};
// Quote marketplace with editorial content (#209).
const quotes = {
  "/": doc({ title: "Offertevind | Vergelijk offertes van specialisten", description: "Vraag gratis offertes aan bij vakbedrijven bij jou in de buurt en vergelijk prijzen voor energie, internet en klussen.", h1: ["Vergelijk en bespaar"], nav: `<a href="/klus-plaatsen">Klus plaatsen</a> <a href="/bedrijven/aanmelden">Bedrijf aanmelden</a> <a href="/nieuws/">Nieuws</a> <a href="/over">Over</a>`, body: filler("Ontvang tot drie offertes van vakbedrijven.") }),
  "/over": doc({ title: "Over Offertevind", description: "Offertevind is een online vergelijkingsplatform.", h1: ["Over ons"], body: filler("Wij sturen je aanvraag door naar aangesloten specialisten; wij voeren de werkzaamheden niet zelf uit.") }),
  "/nieuws": doc({ title: "Nieuws | Offertevind", description: "Nieuws en tips.", h1: ["Nieuws"], body: filler("Tips over energie besparen.") }),
};
// A shop that invites to compare its own models keeps its cart: a webshop.
const ownCompare = { "/": doc({ title: "Fietsland | Vergelijk onze e-bikes en bestel online", description: "Online fietsenwinkel: e-bikes en stadsfietsen. Gratis bezorging.", h1: ["E-bikes"], body: [1, 2, 3].map((i) => `<div class="product-card"><a href="/product/ebike-${i}">E-bike ${i}</a><span class="price">€ ${1999 + i},00</span><button class="add-to-cart">In winkelwagen</button></div>`).join("") + `<a href="/winkelwagen">Winkelwagen</a>` }), ...Object.fromEntries([1, 2, 3].map((i) => [`/product/ebike-${i}`, productPage("nl", `E-bike ${i}`, `EB-${i}`, `${1999 + i}.00`, `<button class="add-to-cart">In winkelwagen</button>`)])) };

// Negative controls.
const shopsoftware = { "/": doc({ title: "Bouwjeshop | Start je eigen webshop in 5 minuten", description: "Webshop software voor ondernemers. Probeer 14 dagen gratis.", h1: ["Start je eigen online winkel"], body: `<div class="pricing"><span class="price">€ 29,00</span> per maand <a href="/aanmelden">Probeer gratis</a></div>` + filler("Maak eenvoudig je eigen webshop met onze software.") }) };
const pizzeria = { "/": doc({ lang: "it", title: "Pizzeria Sole | Pizza napoletana | online pizza bestellen", description: "Pizzeria napoletana a Napoli. Ordina la pizza online o prenota un tavolo.", h1: ["La vera pizza napoletana"], head: ld({ "@type": "Restaurant", name: "Pizzeria Sole" }), body: `<p>Margherita € 7,50</p><p>Diavola € 9,00</p>` + filler("Forno a legna, ingredienti freschi.") }) };

const SITES = {
  "hyva.test": { pages: hyva, expect: { sector: ["ecommerce"], websiteType: "ecommerce_store", typeStatus: "confirmed", platform: /^Magento/, commerce: "confirmed", vertical: "luggage_cases", typedCategory: "/toepassingen/transportkoffers" } },
  "bigcat.test": { pages: bigcat, expect: { sector: ["ecommerce"], websiteType: "ecommerce_store", typeStatus: "confirmed", commerce: "confirmed", typedCategory: "/outlet/fietsen" } },
  "orphan.test": { pages: orphan, expect: { sector: ["ecommerce"], websiteType: "ecommerce_store", typeStatus: "confirmed", commerce: "confirmed", minConfidence: 70 } },
  "jsshop.test": { pages: jsshop, expect: { sector: ["ecommerce"], websiteType: "ecommerce_store", typeStatus: "probable", notCommerce: ["absent"] } },
  "refused.test": { pages: refused, expect: { sector: ["ecommerce"], websiteType: "ecommerce_store", typeStatus: "probable", commerceReason: "sample_refused" } },
  "plantshop.test": { pages: plantshop, expect: { sectorNot: ["food_local_retail"], keyNot: ["bakery"], websiteType: "ecommerce_store", vertical: "garden", platform: /^Shopify/ } },
  "runretail.test": { pages: runretail, expect: { sector: ["ecommerce"], websiteType: "ecommerce_store" } },
  "ratelimit.test": { pages: ratelimit, expect: { websiteType: "ecommerce_store", rateLimited: true } },
  "wpjson.test": { pages: wpjson, expect: { websiteType: "ecommerce_store", noApiSample: true, typedProduct: "/product/puur-cosmetische-arganolie-kopen" } },
  "wholesale.test": { pages: wholesale, expect: { sector: ["ecommerce"], keyNot: ["hair_salon", "beauty_salon"], websiteType: "ecommerce_store", typeStatus: "confirmed", vertical: "beauty_personal_care", platform: /^Magento/ } },
  "comparison.test": { pages: comparison, expect: { websiteType: "comparison_platform", sector: ["service_marketplace"], notCommerce: ["confirmed"] } },
  "quotes.test": { pages: quotes, expect: { websiteType: "comparison_platform", sector: ["service_marketplace"], sectorNot: ["news_media"] } },
  "owncompare.test": { pages: ownCompare, expect: { websiteType: "ecommerce_store", typeStatus: "confirmed", sector: ["ecommerce"] } },
  "shopsoftware.test": { pages: shopsoftware, expect: { sectorNot: ["ecommerce"], websiteTypeNot: "ecommerce_store" } },
  "pizzeria.test": { pages: pizzeria, expect: { sector: ["hospitality"], websiteTypeNot: "ecommerce_store" } },
};
const requested = [];
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const host = u.host.replace(/^www\./, "");
  const site = SITES[host];
  requested.push(`${host}${u.pathname}`);
  if (host === "ratelimit.test" && u.pathname !== "/" && u.pathname !== "") return new Response("Too Many Requests", { status: 429, headers: { "content-type": "text/html", "retry-after": "0" } });
  if (host === "wpjson.test" && u.pathname.startsWith("/wp-json/")) return new Response('{"id":58}', { status: 200, headers: { "content-type": "application/json" } });
  if (host === "refused.test" && REFUSED_PATHS.test(u.pathname)) return new Response("<html><head><title>Not allowed</title></head><body>405</body></html>", { status: 405, headers: { "content-type": "text/html" } });
  const path = u.pathname.replace(/\/$/, "") || "/";
  const html = site?.pages[path];
  if (!html) return new Response("<html><head><title>404 Niet gevonden</title></head><body><h1>Pagina niet gevonden</h1></body></html>", { status: 404, headers: { "content-type": "text/html" } });
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...(host === "hyva.test" ? { "x-magento-tags": "FPC" } : {}) } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const problems = [];
const rows = [];
for (const [host, site] of Object.entries(SITES)) {
  if (ONLY.length && !ONLY.includes(host)) continue;
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
  const j = await res.json();
  const e = site.expect;
  const sp = j.sectorProfile || {};
  const wp = j.websiteProfile || {};
  const pages = j.multiPage?.pageAudits || [];
  rows.push({ host, status: res.status, sector: sp.sector, key: sp.key, conf: sp.confidenceScore, ev: (sp.evidence || [])[0], websiteType: wp.websiteType?.value, typeStatus: wp.websiteType?.status, vertical: wp.industryVertical?.value, platform: wp.commercePlatform?.label, commerce: j.commerceApplicability?.state, reason: j.commerceApplicability?.reason, site: j.technologyProfile?.siteType, pages: pages.map((p) => `${new URL(p.url).pathname}:${p.type}:${p.httpStatus}:${p.commerceEvidence ? [p.commerceEvidence.priceSignals, p.commerceEvidence.repeatedProductLinks ? "L" : "", p.commerceEvidence.strongCommerceAction ? "A" : "", p.commerceEvidence.confirmedRetailPage ? "R" : ""].join("") : ""}`).join(" ") });
  const P = (m) => problems.push(`${host}: ${m}`);
  if (res.status !== 200) { P(`HTTP ${res.status} ${j.code}`); continue; }
  if (e.sector && !e.sector.includes(sp.sector)) P(`sector ${sp.sector}/${sp.key} ${sp.confidenceScore}, expected ${e.sector.join("|")} (${(sp.evidence || []).slice(0, 2).join("; ")})`);
  if (e.sectorNot?.includes(sp.sector)) P(`sector ${sp.sector}/${sp.key}`);
  if (e.keyNot?.includes(sp.key)) P(`key ${sp.key}`);
  if (e.minConfidence && sp.confidenceScore < e.minConfidence) P(`confidence ${sp.confidenceScore}`);
  if (e.websiteType && wp.websiteType?.value !== e.websiteType) P(`websiteType ${wp.websiteType?.value} (${wp.websiteType?.label})`);
  if (e.websiteTypeNot && wp.websiteType?.value === e.websiteTypeNot) P(`websiteType ${e.websiteTypeNot}`);
  if (e.typeStatus && wp.websiteType?.status !== e.typeStatus) P(`websiteType status ${wp.websiteType?.status}, expected ${e.typeStatus}`);
  if (e.platform && !e.platform.test(wp.commercePlatform?.label || "")) P(`platform ${wp.commercePlatform?.label}`);
  if (e.commerce && j.commerceApplicability?.state !== e.commerce) P(`commerce ${j.commerceApplicability?.state}/${j.commerceApplicability?.reason}, expected ${e.commerce}`);
  if (e.notCommerce?.includes(j.commerceApplicability?.state)) P(`commerce ${j.commerceApplicability?.state}`);
  if (e.commerceReason && j.commerceApplicability?.reason !== e.commerceReason) P(`commerce reason ${j.commerceApplicability?.reason}, expected ${e.commerceReason}`);
  if (e.vertical && wp.industryVertical?.value !== e.vertical) P(`vertical ${wp.industryVertical?.value}, expected ${e.vertical}`);
  if (e.typedCategory) { const p = pages.find((x) => new URL(x.url).pathname.replace(/\/$/, "") === e.typedCategory); if (p && p.type !== "category") P(`${e.typedCategory} typed ${p.type}`); }
  // One website type for every consumer: header (technology) and dimension agree.
  if (wp.websiteType?.value === "ecommerce_store" && wp.websiteType?.status === "confirmed" && j.technologyProfile?.siteType !== "Webshop") P(`header site type ${j.technologyProfile?.siteType} next to a confirmed webshop`);
  if (j.technologyProfile?.siteType === "Webshop" && !(wp.websiteType?.value === "ecommerce_store" && wp.websiteType?.status === "confirmed")) P(`header "Webshop" next to websiteType ${wp.websiteType?.value}/${wp.websiteType?.status}`);
  if (e.rateLimited) {
    const sub = requested.filter((r) => r.startsWith(host) && !/^[^/]+\/?$/.test(r) && !/robots\.txt|sitemap/.test(r)).length;
    if (!j.multiPage?.sampleRateLimit?.stopped) P(`sampling did not stop after repeated 429 (${JSON.stringify(j.multiPage?.sampleRateLimit)})`);
    if (sub > 14) P(`${sub} subpage requests after the site rate-limited RankFix`);
    if (pages.some((p) => p.httpStatus === 404)) P("429 reported as 404");
  }
  if (e.noApiSample && pages.some((p) => /\/wp-json\//.test(p.url))) P(`API endpoint sampled as a page: ${pages.filter((p) => /wp-json/.test(p.url)).map((p) => p.url).join(", ")}`);
  if (e.typedProduct) { const p = pages.find((x) => new URL(x.url).pathname.replace(/\/$/, "") === e.typedProduct); if (!p) P(`${e.typedProduct} not sampled`); else if (p.type !== "product") P(`${e.typedProduct} typed ${p.type}`); }
  // A webshop is never "sector unknown".
  if (wp.websiteType?.value === "ecommerce_store" && sp.sector === "unknown") P("websiteType webshop with sector unknown");
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
