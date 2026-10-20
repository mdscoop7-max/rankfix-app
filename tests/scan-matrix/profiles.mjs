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


// WooCommerce product page as WordPress renders it (classes, wp-content assets).
const wooProduct = ({ name, visible, offer }) => page({ title: `${name} - Winkel`, desc: `${name} online bestellen. Op voorraad, snel in huis.`, h1: name,
  extraHead: "<link rel='stylesheet' href='/wp-content/plugins/woocommerce/assets/css/woocommerce.css'><meta name='generator' content='WooCommerce 9.3.1'>",
  body: `<div class="product type-product"><p class="price"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&euro;</span>&nbsp;${visible}</bdi></span></p><form class="cart" method="post"><button name="add-to-cart" class="single_add_to_cart_button">In winkelwagen</button></form><p class="stock in-stock">Op voorraad</p></div>`,
  lds: [{ "@type": "Product", name, image: "https://__HOST__/wp-content/uploads/p.jpg", sku: "GH-250", offers: [{ "@type": "Offer", ...offer, priceCurrency: "EUR", availability: "https://schema.org/InStock", url: "https://__HOST__/producten/x/" }] }] });

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
  // Missing Offer.price (WooCommerce priceSpecification only) is not a price of 0.
  { id: "woo-product-pricespec", host: "klei.test", path: "/producten/kleimasker-250-gram/", expect: ["ecommerce"], page: "product", commerce: true,
    checkStatus: { product_price_consistency: ["pass"], price_currency_consistency: ["pass"] }, noMessage: { product_price_consistency: /\b0(?:[.,]00?)?\b\)|prijzen \(0/ },
    raw: wooProduct({ name: "Kleimasker 250 gram", visible: "13,95", offer: { priceSpecification: [{ "@type": "UnitPriceSpecification", price: "13.95", priceCurrency: "EUR" }] } }) },
  { id: "woo-product-price-null", host: "klei2.test", path: "/producten/kleimasker/", expect: ["ecommerce"], page: "product", commerce: true,
    checkStatus: { product_price_consistency: ["unable_to_confirm"] },
    raw: wooProduct({ name: "Kleimasker", visible: "13,95", offer: { price: null } }) },
  // A real difference must still be reported.
  { id: "woo-product-price-mismatch", host: "klei3.test", path: "/producten/kleimasker-xl/", expect: ["ecommerce"], page: "product", commerce: true,
    checkStatus: { product_price_consistency: ["warning", "unable_to_confirm"] },
    raw: wooProduct({ name: "Kleimasker XL", visible: "13,95", offer: { price: "19.95" } }) },
  // WooCommerce shop: a /product-categorie/ grid (several Product objects, add-to-cart
  // buttons) and a store finder are never the representative product page.
  { id: "woo-category-vs-product", host: "argan.test", expect: ["ecommerce"], commerce: true,
    sampleTypes: { "/product-categorie/maskers/": ["category"], "/winkels/": ["other", "contact", "service"] }, productSample: /^\/producten\/kleimasker-250-gram\/$/,
    home: { title: "Arganolie en natuurlijke verzorging | Argan Winkel", desc: "Natuurlijke huidverzorging online bestellen. Gratis verzending vanaf € 35.", h1: "Natuurlijke verzorging",
      extraHead: "<link rel='stylesheet' href='/wp-content/plugins/woocommerce/assets/css/woocommerce.css'>",
      body: "<p><a href='/product-categorie/maskers/'>Maskers</a> <a href='/winkels/'>Onze winkels</a> <a href='/producten/kleimasker-250-gram/'>Kleimasker 250 gram</a> <a href='/winkelwagen/'>Winkelwagen</a></p><div class='product-card'>Kleimasker <span>€ 13,95</span><button class='add_to_cart_button'>In winkelwagen</button></div>" },
    files: {
      "/product-categorie/maskers/": { body: page({ title: "Maskers - Argan Winkel", desc: "Alle maskers online bestellen.", h1: "Maskers", body: `<ul class="products"><li class="product type-product"><a href="/producten/item-1/">Item 1</a><span class="price"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&euro;</span>&nbsp;10,95</bdi></span></span><a href="?add-to-cart=1" class="button add_to_cart_button">In winkelwagen</a></li><li class="product type-product"><a href="/producten/item-2/">Item 2</a><span class="price"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&euro;</span>&nbsp;11,95</bdi></span></span><a href="?add-to-cart=2" class="button add_to_cart_button">In winkelwagen</a></li><li class="product type-product"><a href="/producten/item-3/">Item 3</a><span class="price"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">&euro;</span>&nbsp;12,95</bdi></span></span><a href="?add-to-cart=3" class="button add_to_cart_button">In winkelwagen</a></li></ul>`,
        lds: [1, 2, 3].map((i) => ({ "@type": "Product", name: `Item ${i}`, image: "https://__HOST__/i.jpg", offers: { "@type": "Offer", price: `${9 + i}.95`, priceCurrency: "EUR" } })) }) },
      "/winkels/": { body: page({ title: "Onze winkels - Argan Winkel", desc: "Bezoek onze winkels in Amsterdam en Utrecht.", h1: "Onze winkels", body: "<p>Winkel Amsterdam, Kerkstraat 1. Openingstijden ma–za 10–18. <a href='/franchise/'>Franchisenemer worden</a></p>" }) },
      "/producten/kleimasker-250-gram/": { body: wooProduct({ name: "Kleimasker 250 gram", visible: "13,95", offer: { price: "13.95" } }) },
    } },
  // Plain WordPress without a shop: CMS only, no commerce platform.
  { id: "wp-plain-site", host: "wpbureau.test", expect: ["professional_services", "unknown", "general_business"], notExpect: ["ecommerce"], tech: { cms: "WordPress", commercePlatform: null },
    home: { title: "Adviesbureau Noord – advies voor ondernemers", desc: "Wij adviseren mkb-bedrijven over financiën en groei. Vraag een gesprek aan.", h1: "Advies voor ondernemers",
      extraHead: "<link rel='stylesheet' href='/wp-content/themes/bureau/style.css'><script src='/wp-includes/js/jquery/jquery.min.js'></script><link rel='https://api.w.org/' href='/wp-json/'>", body: "<p>Ons team helpt met strategie en financiering. <a href='/contact/'>Contact</a></p>" } },
  // WordPress blog with an embedded Shopify Buy Button is not a Shopify store.
  { id: "wp-shopify-buybutton", host: "wpblog.test", expect: ["news_media", "unknown", "general_business", "ecommerce"], tech: { cms: "WordPress" }, notTech: { commercePlatform: "Shopify" },
    home: { title: "Koffieblog – recepten en reviews", desc: "Alles over koffie zetten, bonen en apparaten.", h1: "Koffieblog",
      extraHead: "<link rel='stylesheet' href='/wp-content/themes/blog/style.css'><script src='/wp-includes/js/wp-embed.min.js'></script><script src='https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js'></script>", body: "<article><h2>De beste bonen</h2><p>Onze favoriete bonen, te koop via onze partner. <img src='https://cdn.shopify.com/s/files/1/bonen.jpg'> Domain: koffie.myshopify.com</p></article>" } },
  // Shopify theme shop (Intersport-like): collections are categories, store finder and
  // franchise pages are not product ranges, a product page is the product sample.
  { id: "shopify-collections-stores", host: "sportshop.test", expect: ["ecommerce"], commerce: true, tech: { commercePlatform: "Shopify" },
    sampleTypes: { "/collections/hardloopschoenen": ["category"], "/pages/winkels": ["other", "contact", "service"], "/pages/franchise": ["other", "service", "contact"] }, productSample: /^\/products\/hardloopschoen-x$/,
    home: { title: "Sportshop – sportkleding en schoenen online", desc: "Sportkleding, hardloopschoenen en outdoor online bestellen. Gratis retour.", h1: "Sportshop", extraHead: "<link rel='stylesheet' href='//__HOST__/cdn/shop/t/12/assets/base.css'><script src='https://cdn.shopify.com/s/files/1/0001/t/1/assets/global.js'></script><script>window.Shopify = window.Shopify || {}; Shopify.theme = {name:'Dawn'};</script>",
      body: "<div class='shopify-section'><a href='/collections/hardloopschoenen'>Hardloopschoenen</a> <a href='/pages/winkels'>Winkels</a> <a href='/pages/franchise'>Franchise</a> <a href='/products/hardloopschoen-x'>Hardloopschoen X</a> <a href='/cart'>Winkelwagen</a></div><div class='product-card'>Hardloopschoen X <span class='price-item price-item--regular'>€129,95</span><button name='add'>In winkelwagen</button></div>" },
    files: {
      "/collections/hardloopschoenen": { body: page({ title: "Hardloopschoenen – Sportshop", desc: "Alle hardloopschoenen.", h1: "Hardloopschoenen", extraHead: "<link rel='stylesheet' href='//__HOST__/cdn/shop/t/12/assets/base.css'><script src='https://cdn.shopify.com/s/files/1/0001/t/1/assets/global.js'></script><script>window.Shopify = window.Shopify || {}; Shopify.theme = {name:'Dawn'};</script>",
        body: [1,2,3].map((i) => `<div class='card-wrapper'><a href='/products/schoen-${i}'>Schoen ${i}</a><span class='price-item price-item--regular'>€${90+i},95</span></div>`).join(""),
        lds: [{ "@type": "ItemList", itemListElement: [1,2,3].map((i) => ({ "@type": "ListItem", position: i, url: `https://__HOST__/products/schoen-${i}` })) }] }) },
      "/pages/winkels": { body: page({ title: "Winkels – Sportshop", desc: "Vind een winkel bij jou in de buurt.", h1: "Winkelzoeker", extraHead: "<link rel='stylesheet' href='//__HOST__/cdn/shop/t/12/assets/base.css'><script src='https://cdn.shopify.com/s/files/1/0001/t/1/assets/global.js'></script><script>window.Shopify = window.Shopify || {}; Shopify.theme = {name:'Dawn'};</script>", body: "<p>Sportshop Utrecht, Oudegracht 1 · Sportshop Breda, Ginnekenweg 4. Openingstijden en route.</p>" }) },
      "/pages/franchise": { body: page({ title: "Franchisenemer worden – Sportshop", desc: "Start je eigen Sportshop-winkel.", h1: "Word franchisenemer", extraHead: "<link rel='stylesheet' href='//__HOST__/cdn/shop/t/12/assets/base.css'><script src='https://cdn.shopify.com/s/files/1/0001/t/1/assets/global.js'></script><script>window.Shopify = window.Shopify || {}; Shopify.theme = {name:'Dawn'};</script>", body: "<p>Ondernemen met een sterk merk. Investering, begeleiding en formule.</p>" }) },
      "/products/hardloopschoen-x": { body: page({ title: "Hardloopschoen X – Sportshop", desc: "Hardloopschoen X met demping. Op voorraad.", h1: "Hardloopschoen X", extraHead: "<link rel='stylesheet' href='//__HOST__/cdn/shop/t/12/assets/base.css'><script src='https://cdn.shopify.com/s/files/1/0001/t/1/assets/global.js'></script><script>window.Shopify = window.Shopify || {}; Shopify.theme = {name:'Dawn'};</script>",
        body: "<div class='product__info'><span class='price-item price-item--regular'>€129,95</span><form action='/cart/add' method='post'><button name='add'>In winkelwagen</button></form><p>Op voorraad</p><p>SKU: HX-1</p></div>",
        lds: [{ "@type": "Product", name: "Hardloopschoen X", image: "https://__HOST__/x.jpg", sku: "HX-1", offers: { "@type": "Offer", price: "129.95", priceCurrency: "EUR", availability: "https://schema.org/InStock" } }] }) },
    } },
  // Headless Shopify on Next.js: platform shown as headless with medium confidence.
  { id: "shopify-headless-next", host: "headless.test", expect: ["ecommerce"], commerce: true, tech: { commercePlatform: "Shopify (headless)", framework: "Next.js" },
    home: { title: "Studio Shoes – sneakers online kopen", desc: "Sneakers online bestellen. Gratis verzending.", h1: "Sneakers",
      extraHead: "<script src='/_next/static/chunks/main.js'></script><script id='__NEXT_DATA__' type='application/json'>{\"props\":{\"storefront\":\"https://studio.myshopify.com/api/2024-07/graphql.json\"}}</script>",
      body: "<div class='product-card'>Sneaker A <span>€ 99,95</span><img src='https://cdn.shopify.com/s/files/1/a.jpg'><button>In winkelwagen</button></div><a href='/products/sneaker-a'>Sneaker A</a> <a href='/cart'>Winkelwagen</a>" } },
  // Industrial manufacturers and suppliers (B2B), generic.
  { id: "industrial-semiconductor-en", host: "litho.test", expect: ["manufacturing_industrial"], notExpect: ["ecommerce", "saas_b2b"],
    home: { lang: "en", title: "Lumetrix | Supplier to the semiconductor industry", desc: "Lumetrix is an innovation leader in the semiconductor industry. We provide chipmakers with hardware, software and services for lithography.", h1: "Lumetrix",
      body: "<nav><a href='/products'>Products</a> <a href='/technology'>Technology</a> <a href='/investors'>Investors</a> <a href='/careers'>Careers</a> <a href='/news'>News</a></nav><p>Our lithography systems help chipmakers shrink patterns on silicon wafers. 40,000 employees worldwide.</p>",
      lds: [org("Lumetrix", "Corporation"), site] } },
  { id: "industrial-machinebuilder-nl", host: "machinefabriek.test", expect: ["manufacturing_industrial"],
    home: { title: "Machinefabriek Noord – machinebouw op maat", desc: "Wij ontwerpen en bouwen verpakkingsmachines voor de voedingsindustrie.", h1: "Machinebouw op maat", body: "<p>Engineering, productie en service. <a href='/contact'>Vraag een offerte aan</a></p>" } },
  { id: "industrial-de", host: "werkzeug.test", expect: ["manufacturing_industrial"],
    home: { lang: "de", title: "Brenner – Werkzeugmaschinen", desc: "Hersteller von Werkzeugmaschinen für die industrielle Fertigung.", h1: "Werkzeugmaschinen", body: "<p>Drehmaschinen, Fräsmaschinen und Service weltweit.</p>" } },
  // Academic hospital with press releases, events and a small shop page.
  { id: "hospital-press-events", host: "klinikum.test", expect: ["health_wellness"],
    sampleTypes: { "/service/pressemitteilung/artikel/detail/neue_station/": ["article"], "/service/veranstaltung/veranstaltung/details/vortrag/": ["event"] },
    home: { lang: "de", title: "Musterstadt – Universitätsmedizin", desc: "Eine der größten Universitätskliniken Europas: Krankenversorgung, Forschung und Lehre.", h1: "Universitätsmedizin Musterstadt",
      body: "<nav><a href='/klinikum/'>Klinikum</a> <a href='/forschung/'>Forschung</a> <a href='/lehre/'>Studium</a> <a href='/shop/'>Shop</a></nav><p>Notaufnahme, Kliniken und Sprechstunden.</p><a href='/service/pressemitteilung/artikel/detail/neue_station/'>Neue Station eröffnet</a> <a href='/service/veranstaltung/veranstaltung/details/vortrag/'>Vortrag Herzmedizin</a>" },
    files: {
      "/service/pressemitteilung/artikel/detail/neue_station/": { body: page({ lang: "de", title: "Neue Station eröffnet – Universitätsmedizin", desc: "Pressemitteilung: vier Pflegekräfte, vier Stationen.", h1: "Neue Station eröffnet", body: "<p>Pressemitteilung vom 10.10.2026. <a href='/shop/'>Shop</a></p><p>SKU-freie Meldung, Kontakt Pressestelle.</p>" }) },
      "/service/veranstaltung/veranstaltung/details/vortrag/": { body: page({ lang: "de", title: "Vortrag Herzmedizin – Universitätsmedizin", desc: "Öffentlicher Vortrag am 20.11.2026.", h1: "Vortrag Herzmedizin", body: "<p>Ort: Hörsaal 1, Eintritt frei, Anmeldung erforderlich.</p>" }) },
    } },
  // Industrial manufacturer with a global "Products" menu, careers and governance pages:
  // no retail modules, corporate pages are not categories.
  { id: "industrial-corporate-pages", host: "machines.test", expect: ["manufacturing_industrial"], notExpect: ["ecommerce"],
    sampleTypes: { "/en/careers/working-at-machines/united-states": ["corporate"], "/en/company/governance": ["corporate"] },
    retailNA: true,
    home: { lang: "en", title: "Macro Systems | Supplier to the semiconductor industry", desc: "We provide chipmakers with lithography hardware, software and services.", h1: "Macro Systems",
      body: "<nav><a href='/en/products/euv-systems'>EUV systems</a> <a href='/en/products/duv-systems'>DUV systems</a> <a href='/en/company/governance'>Governance</a> <a href='/en/careers/working-at-machines/united-states'>Careers US</a></nav><p>Our machines pattern silicon wafers for chipmakers worldwide.</p>" + "<p>Lithography is the critical step in making microchips. Our systems project light through a blueprint of the pattern onto a silicon wafer coated with light-sensitive material. Customers use our hardware, software and services to mass produce patterns on silicon, from the most advanced logic to memory chips. </p>".repeat(6) },
    files: {
      "/en/careers/working-at-machines/united-states": { body: page({ lang: "en", title: "Working at Macro Systems in the United States", desc: "Careers and locations in the US.", h1: "Working in the US", body: "<nav><a href='/en/products/euv-systems'>EUV</a> <a href='/en/products/duv-systems'>DUV</a></nav><p>Open positions in San Diego and Wilton.</p>" }) },
      "/en/company/governance": { body: page({ lang: "en", title: "Corporate governance – Macro Systems", desc: "Board of management and supervisory board.", h1: "Governance", body: "<nav><a href='/en/products/euv-systems'>EUV</a> <a href='/en/products/duv-systems'>DUV</a></nav><p>Our two-tier board structure.</p>" }) },
    } },
  // Component maker that names the systems it builds but never says "manufacturer";
  // first-equipment supply in the navigation. Not a shop, not unknown (field scan 16-10, IT).
  { id: "component-maker-brakes-en", host: "frena.test", expect: ["manufacturing_industrial"], notExpect: ["ecommerce", "unknown"], retailNA: true,
    home: { lang: "en", title: "Innovation and Safety in Braking Systems for Cars and Bikes | Frena EN", desc: "Discover the latest innovations in braking systems and mobility. Safety, performance and sustainability: explore our products.", h1: "When the car drives itself, the brakes are up to us",
      body: "<nav><a href='/en/solutions/car'>Car</a> <a href='/en/solutions/car/first-equipment'>First Equipment: Success Stories</a> <a href='/en/solutions/motorcycle'>Motorcycle</a> <a href='/en/solutions/motorcycle/original-equipment'>Original Equipment: Success Stories</a> <a href='/en/motorsport'>Motorsport</a> <a href='/en/motorsport/formula-1'>Formula 1</a></nav><p>Frena N.V., Bergamo, Italy. <a href='/en/contact'>Contact us</a></p>" } },
  // Bank whose account and card pages carry Product + FinancialProduct schema with a
  // 0 PLN offer below /produkty/: financial services, never retail products (field scan 16-10, PL).
  { id: "bank-financial-products-pl", host: "bank-pl.test", expect: ["financial_services"], notExpect: ["ecommerce"], retailNA: true, noProductSample: true,
    sampleTypes: { "/produkty/konto-osobiste": ["service"], "/produkty/karta-kredytowa": ["service"] },
    home: { lang: "pl", title: "Bank – konto osobiste, kredyty, karty i lokaty", desc: "Załóż konto osobiste, weź kredyt gotówkowy, zamów kartę kredytową. Bankowość internetowa i mobilna.", h1: "Bank dla Ciebie",
      body: "<nav><a href='/produkty/konto-osobiste'>Konto osobiste</a> <a href='/produkty/karta-kredytowa'>Karta kredytowa</a> <a href='/kredyty'>Kredyty</a> <a href='/lokaty'>Lokaty</a> <a href='/bankowosc-internetowa'>Bankowość internetowa</a></nav><p>Konto za 0 zł, karta i aplikacja mobilna.</p>", lds: [org("Bank", "BankOrCreditUnion"), site] },
    files: {
      "/produkty/konto-osobiste": { body: page({ lang: "pl", title: "Konto osobiste za 0 zł – Bank", desc: "Otwórz konto osobiste online w 10 minut.", h1: "Konto osobiste", body: "<p>Prowadzenie konta 0 zł. <a href='/wniosek/konto'>Otwórz konto</a></p>", lds: [{ "@type": ["Product", "FinancialProduct"], name: "Konto osobiste", image: "https://__HOST__/img/konto.png", offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" } }] }) },
      "/produkty/karta-kredytowa": { body: page({ lang: "pl", title: "Karta kredytowa – Bank", desc: "Karta kredytowa z limitem do 50 000 zł.", h1: "Karta kredytowa", body: "<p>RRSO 19,8%. <a href='/wniosek/karta'>Złóż wniosek</a></p>", lds: [{ "@type": "CreditCard", name: "Karta kredytowa", annualPercentageRate: 19.8 }] }) },
    } },
  // A long homepage description is advice without deduction (report text and points agree).
  { id: "long-description-home", host: "langdesc.test", expect: ["professional_services", "unknown", "general_business"], checkStatus: { description: ["pass"] },
    home: { title: "Adviesbureau Noord – advies voor ondernemers", desc: "Wij zijn een adviesbureau voor ondernemers in Noord-Nederland en helpen met financiering, strategie, groei en overname, met een vast team van adviseurs die uw sector kennen en snel schakelen bij elke vraag.", h1: "Advies voor ondernemers", body: "<p>Ons team helpt met strategie en financiering. <a href='/contact'>Contact</a></p>" } },
  // Multi-activity group: the first activity named in its own title is primary,
  // the others are secondary, certainty is capped and the score stays provisional.
  { id: "group-postal-finance-insurance-it", host: "gruppo.test", expect: ["transport_travel"], notExpect: ["financial_services", "ecommerce"], secondary: ["financial_services"], maxSectorConfidence: 75, evidenceLevel: ["provisional", "insufficient"],
    sampleTypes: { "/recupero-credenziali/": [] },
    home: { lang: "it", title: "Gruppo Nazionale - Servizi postali, finanziari e assicurativi", desc: "Spedizioni e pacchi, conti e carte, assicurazioni e pagamenti: tutti i servizi del Gruppo.", h1: "Gruppo Nazionale",
      body: "<nav><a href='/spedizioni'>Spedizioni</a> <a href='/conti'>Conti</a> <a href='/assicurazioni'>Assicurazioni</a> <a href='/recupero-credenziali/'>Recupero credenziali</a> <a href='/area-clienti/dashboard'>Area clienti</a> <a href='/uffici-postali'>Cerca un ufficio postale</a></nav><p>Invia lettere e pacchi, apri un conto, proteggi la tua casa.</p>" },
    files: { "/area-clienti/dashboard": { status: 302, location: "https://__HOST__/recupero-credenziali/" }, "/recupero-credenziali/": { body: page({ lang: "it", title: "Recupero credenziali", desc: "", h1: "Recupera le credenziali", body: "<form><input name='email'></form>" }) } } },
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
    if (own?.location) return new Response("", { status: own.status || 302, headers: { location: fill(own.location) } });
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
  // NOS-like broadcaster: "Radio, TV en Internet" is distribution, not telecom;
  // a dentist story in the news must not relabel the sector.
  { id: "report-broadcaster-news", host: "omroep.test", expect: ["news_media"], labelLike: /nieuws/i,
    checkStatus: { entity: ["pass"] }, noMessage: { schema: /LocalBusiness|lokale bedrijfs/i },
    raw: "<!doctype html><html lang='nl'><head><meta charset='utf-8'><title>Omroep.nl - Nieuws, Sport en Evenementen | Nederlandse Omroep Stichting</title><meta name='description' content='Omroep.nl - Nieuws, Sport en Evenementen op Radio, TV en Internet'><meta property='og:site_name' content='Omroep'><meta name='viewport' content='width=device-width, initial-scale=1'><link rel='canonical' href='__URL__'></head><body><header><a href='/'>Omroep</a> <a href='/nieuws'>Nieuws</a> <a href='/sport'>Sport</a> <a href='/contact'>Contact</a> <a href='/over-ons'>Over ons</a> <a href='/privacy'>Privacy</a> <a href='/cookies'>Cookies</a></header><main><h1>Blijf bij. Omroep.</h1><article><h2>Tandarts behandelingen duurder in 2027</h2><p>Patiënten betalen volgend jaar meer voor een behandeling bij de tandarts, meldt de redactie.</p></article><article><h2>Glasvezel en 5G: kabinet wil sneller internet op het platteland</h2><p>Politiek nieuws uit Den Haag.</p></article><article><h2>Binnenland</h2><p>Het laatste nieuws uit binnenland en buitenland, economie en sport.</p></article><p>Volg het journaal op radio, tv en internet.</p><a href='/contact'>Neem contact op met de redactie</a> <form action='/contact' method='post'><textarea name='bericht'></textarea><input type='email' name='email'><button>Verstuur</button></form></main><footer><img class='logo' src='/logo.svg' alt='Omroep'></footer></body></html>" },
  // A company's own news page is not a publisher.
  { id: "company-news-page", host: "bakkerij.test", path: "/nieuws", notExpect: ["news_media"],
    home: { title: "Nieuws | Bakkerij Jansen", desc: "Lees het laatste nieuws van Bakkerij Jansen: nieuwe broden en openingstijden.", h1: "Nieuws", body: "<p>Ons nieuwe speltbrood ligt in de winkel. Bakkerij Jansen bakt elke dag vers brood.</p>" } },
  // Payment provider with booking-industry copy, a Facebook link, service
  // "products" and a non-core trust warning (tracker present, no cookie link): never 100, no
  // booking module, no retail product checks.
  { id: "report-payments-products-trust", host: "payprod.test", expect: ["financial_services"], maxScore: 99, noModules: ["booking"],
    checkStatus: { merchant_product_readiness: ["not_applicable"], product_availability: ["not_applicable"], price_format: ["not_applicable", "pass"], trust_legal_signals: ["warning"] },
    raw: "<!doctype html><html lang='en'><head><meta charset='utf-8'><title>PayProd – the platform for online and in-person payments</title><script async src='https://www.googletagmanager.com/gtag/js?id=G-TEST'></script><meta name='description' content='One platform to accept payments, manage money and access funding. Grow your business with PayProd.'><meta name='viewport' content='width=device-width'><link rel='canonical' href='__URL__'><meta property='og:title' content='PayProd'><meta property='og:description' content='Payments platform'><meta property='og:image' content='https://__HOST__/og.jpg'><meta name='twitter:card' content='summary_large_image'><script type='application/ld+json'>{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"PayProd\",\"url\":\"https://__HOST__/\",\"sameAs\":[\"https://www.facebook.com/payprod\"]}</script><script type='application/ld+json'>{\"@context\":\"https://schema.org\",\"@type\":\"WebSite\",\"name\":\"PayProd\",\"url\":\"https://__HOST__/\"}</script></head><body><header><a href='/products/checkout'>Checkout</a> <a href='/products/payment-links'>Payment links</a> <a href='/products/terminals'>Terminals</a> <a href='/pricing'>Pricing</a> <a href='/contact/sales'>Contact sales</a> <a href='/privacy'>Privacy</a> <a href='/about'>About us</a></header><main><h1>Every payment</h1><p>Hotels, travel and booking platforms accept online payments with PayProd. Booking payments, subscriptions and invoices in one place.</p><h2>Feature 1</h2><p>Accept cards, wallets and bank transfers from customers across Europe. Settle funds quickly, reconcile payouts automatically and see every transaction in one dashboard built for growing businesses.</p><h2>Feature 2</h2><p>Accept cards, wallets and bank transfers from customers across Europe. Settle funds quickly, reconcile payouts automatically and see every transaction in one dashboard built for growing businesses.</p><h2>Feature 3</h2><p>Accept cards, wallets and bank transfers from customers across Europe. Settle funds quickly, reconcile payouts automatically and see every transaction in one dashboard built for growing businesses.</p><h2>Feature 4</h2><p>Accept cards, wallets and bank transfers from customers across Europe. Settle funds quickly, reconcile payouts automatically and see every transaction in one dashboard built for growing businesses.</p><h2>Feature 5</h2><p>Accept cards, wallets and bank transfers from customers across Europe. Settle funds quickly, reconcile payouts automatically and see every transaction in one dashboard built for growing businesses.</p><h2>Feature 6</h2><p>Accept cards, wallets and bank transfers from customers across Europe. Settle funds quickly, reconcile payouts automatically and see every transaction in one dashboard built for growing businesses.</p><p>Questions? Mail support@__HOST__.</p><a href='https://www.facebook.com/payprod'>Facebook</a> <a href='/book-a-demo'>Book a demo</a></main><footer><img class='logo' src='/logo.svg' alt='PayProd'></footer></body></html>",
    files: { "/cookies": { body: "nf", status: 404 }, "/cookie-policy": { body: "nf", status: 404 }, "/privacy": { body: "<html><body><h1>Privacy</h1><p>Privacy statement.</p></body></html>" } } },
  // No sitemap anywhere and none declared: clear wording, not "server unreachable".
  { id: "report-no-sitemap-wording", host: "nositemap.test", expect: ["transport_travel"],
    checkStatus: { sitemap: ["unable_to_confirm"] }, message: { sitemap: /standaardlocaties/ }, noMessage: { sitemap: /server bereikbaar/ },
    files: { "/robots.txt": { type: "text/plain", body: "User-agent: *\nAllow: /\n" }, "/sitemap.xml": { body: "nf", status: 404 }, "/sitemap_index.xml": { body: "nf", status: 404 }, "/wp-sitemap.xml": { body: "nf", status: 404 }, "/sitemap-index.xml": { body: "nf", status: 404 } },
    home: { title: "Transportbedrijf Noord | wegtransport en logistiek", desc: "Wegtransport, groupage en volle vrachten naar Frankrijk en Duitsland.", h1: "Transportbedrijf Noord", body: "<p>Logistiek en internationaal transport, pallets en containers.</p>" } },
  // QA 20 Oct 2026 (neutral reproductions, generic failure classes).
  // robots.txt: Googlebot has its own group, the wildcard group blocks everything. The
  // homepage is crawlable for Google; a 403 on the sitemap is a crawler block, not a broken sitemap.
  { id: "qa-robots-googlebot-group-sitemap-403", host: "gemeente-qa.test", expect: ["government"],
    checkStatus: { indexability: ["pass"], robots_txt: ["pass"], sitemap: ["unable_to_confirm"] },
    message: { indexability: /Googlebot/ }, noMessage: { indexability: /blokkeert het gescande pad/, sitemap: /geen geldige/i },
    home: { title: "Gemeente Voorbeeld – officiële website van de gemeente", desc: "Informatie over gemeentelijke diensten, afval, paspoort, vergunningen en meldingen van de gemeente.", h1: "Gemeente Voorbeeld", body: "<p>Vraag een paspoort aan, meld een storing of regel een vergunning bij de gemeente.</p>", lds: [org("Gemeente Voorbeeld", "GovernmentOrganization"), site] },
    files: {
      "/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /\n\nUser-agent: GoogleBot\nDisallow: /aspx/\nDisallow: /*?*appidt=*\n\nSitemap: https://__HOST__/sitemap.xml\n" },
      "/sitemap.xml": { type: "text/html", status: 403, body: "<html><head><title>Access Denied</title></head><body>Access Denied</body></html>" },
    } },
  // Same wildcard block without a Googlebot group IS a real indexability warning,
  // reported once (shared root cause), not twice.
  { id: "qa-robots-wildcard-blocks-all", host: "blocked-qa.test", expect: ["professional_services", "unknown", "general_business"],
    checkStatus: { indexability: ["warning"], robots_txt: ["warning"] },
    home: { title: "Adviesbureau Voorbeeld – advies voor ondernemers", desc: "Wij adviseren mkb-bedrijven over financiën en groei. Vraag een gesprek aan.", h1: "Advies voor ondernemers", body: "<p>Ons team helpt met strategie en financiering.</p>" },
    files: { "/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /\n" } } },
  // University hospital: Hospital is the specific type; LocalBusiness is never advised.
  { id: "qa-umc-hospital-jsonld-hospital", host: "umc-qa.test", expect: ["health_wellness"],
    checkStatus: { schema: ["pass"], organization_website: ["pass"] },
    home: { title: "Universitair Medisch Centrum Voorbeeld | patiëntenzorg, onderzoek en onderwijs", desc: "Universitair ziekenhuis voor patiënten: zorg, onderzoek en opleiding. Maak een afspraak of vind een specialist.", h1: "Universitair Medisch Centrum Voorbeeld", body: "<p>Patiëntenzorg, behandelingen en afspraak maken bij onze specialisten.</p>", lds: [org("UMC Voorbeeld", "Hospital"), site] } },
  { id: "qa-umc-hospital-no-jsonld", host: "umc2-qa.test", expect: ["health_wellness"],
    checkStatus: { schema: ["warning", "unable_to_confirm"] }, fixHas: { schema: /Hospital/ }, noFix: { schema: /LocalBusiness/ }, noMessage: { schema: /lokale bedrijfs/ },
    home: { title: "Universitair Medisch Centrum Voorbeeld | patiëntenzorg, onderzoek en onderwijs", desc: "Universitair ziekenhuis voor patiënten: zorg, onderzoek en opleiding. Maak een afspraak of vind een specialist.", h1: "Universitair Medisch Centrum Voorbeeld", body: "<p>Patiëntenzorg, behandelingen en afspraak maken bij onze specialisten. Telefoon 020 123 4567, adres Kerkstraat 1.</p>" } },
  // University: JSON-LD @type written as full schema.org URLs must be recognised.
  { id: "qa-university-fullurl-types", host: "uni-qa.test", expect: ["education"],
    checkStatus: { schema: ["pass"], organization_website: ["pass"] },
    home: { title: "Universiteit Voorbeeld | studeren, onderzoek en opleidingen", desc: "Studeer aan Universiteit Voorbeeld: bachelor- en masteropleidingen, onderzoek en faculteiten.", h1: "Universiteit Voorbeeld", body: "<p>Opleidingen, faculteiten en onderzoek. Meld je aan voor een studie.</p>", lds: [org("Universiteit Voorbeeld", "https://schema.org/CollegeOrUniversity"), { "@type": "https://schema.org/WebSite", name: "Universiteit Voorbeeld", url: "https://__HOST__/" }] } },
  { id: "qa-university-no-jsonld", host: "uni2-qa.test", expect: ["education"],
    checkStatus: { schema: ["warning", "unable_to_confirm"] }, fixHas: { schema: /CollegeOrUniversity/ }, noFix: { schema: /LocalBusiness/ }, noMessage: { schema: /lokale bedrijfs/ },
    home: { title: "Universiteit Voorbeeld | studeren, onderzoek en opleidingen", desc: "Studeer aan Universiteit Voorbeeld: bachelor- en masteropleidingen, onderzoek en faculteiten.", h1: "Universiteit Voorbeeld", body: "<p>Opleidingen, faculteiten en onderzoek. Contact: Kerkstraat 1, telefoon 020 123 4567.</p>" } },
];
for (const p of REPORT_CASES) PROFILES.push(p);

// Contradictory-signal stress set (generated, no brands): every single-sector
// seed site gets a body section that names many OTHER sectors as clients,
// news topics or partners. The primary sector must come from the site's own
// identity (title, description, H1, schema), never from that noise.
const NOISE = "<section><h2>Onze klanten en partners</h2><p>Wij werken voor tandartspraktijken, fysiotherapeuten, hotels en restaurants, webshops, telecomproviders, banken en verzekeraars, gemeenten, scholen en transportbedrijven.</p><h3>In het nieuws</h3><ul><li>Tandarts behandelingen duurder</li><li>Hotelkamers boeken voor de zomer</li><li>Sim only en glasvezel internet goedkoper</li><li>Vacatures in de zorg</li><li>Nieuwe hypotheekregels</li></ul></section>";
const CONTRADICTION_SEEDS = ["telecom-nl", "lawyer-nl", "plumber-nl", "saas-en", "logistics-nl", "gov-nl", "school-nl", "energy-nl", "dentist-nl", "hotel-nl", "garage-nl", "bank-nl", "insurer-nl", "payments-en", "recruit-nl", "gym-nl", "museum-nl", "charity-nl"];
for (const id of CONTRADICTION_SEEDS) {
  const seed = PROFILES.find((p) => p.id === id);
  if (!seed?.home) continue;
  PROFILES.push({ ...seed, id: `noise-${id}`, host: `noise-${seed.host}`, home: { ...seed.home, body: (seed.home.body || "") + NOISE } });
}
