// Generic local-business sector profiles (opticians, hair salons, hotels,
// restaurants) in NL, EN, DE, FR, ES and IT, plus negative controls.
// No real brands or domains: every host is a neutral `.test` name. The profiles
// reproduce the PRESENTATION PATTERNS of physical chains and independent
// businesses (store locator, appointment, own product shop, booking engine,
// online ordering), not any specific website.
const esc = (s) => String(s).replace(/"/g, "&quot;");
export const doc = ({ lang = "nl", title, description = "", h1 = [], h2 = [], nav = [], body = "", schema = [], head = "" }) =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>`
  + (description ? `<meta name="description" content="${esc(description)}">` : "")
  + `<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="__URL__">${head}`
  + schema.map((s) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...(typeof s === "string" ? { "@type": s, name: "Org", url: "https://__HOST__/" } : s) })}</script>`).join("")
  + `</head><body><header><nav>${nav.map(([href, label]) => `<a href="${href}">${label}</a>`).join(" ")}</nav></header><main>`
  + h1.map((h) => `<h1>${h}</h1>`).join("") + h2.map((h) => `<h2>${h}</h2>`).join("")
  + body + `</main><footer><a href="/contact">Contact</a> <a href="/privacy">Privacy</a></footer></body></html>`;
const para = (text) => `<p>${text}</p>`;
const filler = (text, n = 12) => `<p>${(text + " ").repeat(n)}</p>`;
const productCards = (items, cartLabel = "In winkelwagen", currency = "€") => items.map(([name, price], i) =>
  `<div class="product-card"><a href="/shop/p-${i + 1}">${name}</a><span class="price">${currency} ${price}</span><form action="/cart/add" method="post"><button>${cartLabel}</button></form></div>`).join("");
const productPage = ({ lang = "nl", name, price, cartLabel = "In winkelwagen" }) => doc({ lang, title: `${name} | Shop`, description: `${name}.`, h1: [name],
  body: `<span class="price">€ ${price}</span><form action="/cart/add" method="post"><button>${cartLabel}</button></form>`,
  schema: [{ "@type": "Product", name, image: "https://__HOST__/p.jpg", sku: "SKU1", offers: { "@type": "Offer", price: String(price).replace(",", "."), priceCurrency: "EUR", availability: "https://schema.org/InStock" } }] });

// expect.sector: allowed primary sectors; expect.key: allowed subtype keys (optional);
// expect.notSector: never allowed; expect.channel: allowed sales channels;
// expect.maxConfidence: abstention cases must not claim certainty.
export const LOCAL_SITES = {
  // ───────── Opticians ─────────
  "brilketen.test": {
    group: "optician", expect: { sector: ["health_wellness", "ecommerce"], key: ["optician"], notSector: ["unknown"], channel: ["physical_store", "omnichannel"] },
    pages: {
      "/": doc({ title: "Brillen, lenzen en oogmeting | Brilketen", description: "Bij onze opticiens vind je de nieuwste brillen, zonnebrillen en contactlenzen. Maak online een afspraak voor een gratis oogmeting in een winkel bij jou in de buurt.", h1: ["Zie jij het ook?"],
        nav: [["/brillen", "Brillen"], ["/zonnebrillen", "Zonnebrillen"], ["/lenzen", "Lenzen"], ["/oogmeting", "Oogmeting"], ["/winkels", "Winkels"], ["/afspraak", "Afspraak maken"], ["/over-ons", "Over ons"]],
        body: productCards([["Daglenzen 30 stuks", "24,95"], ["Maandlenzen 6 stuks", "39,95"]]) + filler("Gratis oogmeting door een gediplomeerde opticien. Bekijk ons montuur in de winkel.") },),
      "/winkels": doc({ title: "Vind een winkel bij jou in de buurt | Brilketen", description: "Meer dan 150 winkels in Nederland. Bekijk openingstijden en maak een afspraak.", h1: ["Winkels"] }),
      "/oogmeting": doc({ title: "Gratis oogmeting | Brilketen", description: "Laat je ogen gratis meten door een opticien in onze winkel. Maak direct een afspraak.", h1: ["Oogmeting"] }),
      "/over-ons": doc({ title: "Over ons | Brilketen", description: "Brilketen is een opticienketen met winkels in heel Nederland.", h1: ["Over Brilketen"] }),
      "/shop/p-1": productPage({ name: "Daglenzen 30 stuks", price: "24,95" }),
      "/shop/p-2": productPage({ name: "Maandlenzen 6 stuks", price: "39,95" }),
    },
  },
  "opticas-cadena.test": {
    group: "optician", expect: { sector: ["health_wellness", "ecommerce"], key: ["optician"], notSector: ["unknown"], channel: ["physical_store", "omnichannel"] },
    pages: {
      "/": doc({ lang: "es", title: "Ópticas cerca de ti: gafas graduadas, gafas de sol y lentillas | Opticas Cadena", description: "Más de 600 ópticas en España. Pide cita para tu revisión visual gratuita y descubre nuestras gafas graduadas, gafas de sol, lentillas y audífonos.", h1: ["Tu óptica de confianza"],
        nav: [["/gafas-graduadas", "Gafas graduadas"], ["/gafas-de-sol", "Gafas de sol"], ["/lentillas", "Lentillas"], ["/audifonos", "Audífonos"], ["/tiendas", "Tiendas"], ["/cita-previa", "Pedir cita"], ["/quienes-somos", "Quiénes somos"]],
        body: filler("Revisión visual gratuita en tu óptica más cercana. Ópticos-optometristas titulados.") },),
      "/tiendas": doc({ lang: "es", title: "Buscador de ópticas | Opticas Cadena", description: "Encuentra tu óptica más cercana, horarios y cita previa.", h1: ["Nuestras ópticas"] }),
      "/cita-previa": doc({ lang: "es", title: "Pide cita para tu revisión visual | Opticas Cadena", description: "Reserva tu revisión de la vista gratuita en una de nuestras ópticas.", h1: ["Cita previa"] }),
      "/quienes-somos": doc({ lang: "es", title: "Quiénes somos | Opticas Cadena", description: "Somos una cadena de ópticas con más de 30 años de experiencia en salud visual.", h1: ["Quiénes somos"] }),
    },
  },
  "opticien-centre.test": {
    group: "optician", expect: { sector: ["health_wellness", "ecommerce"], key: ["optician"], notSector: ["unknown", "hospitality"], channel: ["physical_store", "omnichannel"] },
    pages: {
      "/": doc({ lang: "fr", title: "Opticien Centre : lunettes de vue, lunettes de soleil, lentilles et audition", description: "Votre opticien et audioprothésiste. Plus de 600 magasins en France. Prenez rendez-vous pour un examen de vue gratuit en magasin.", h1: ["Lunettes de vue et solaires"],
        nav: [["/lunettes-de-vue", "Lunettes de vue"], ["/lunettes-de-soleil", "Lunettes de soleil"], ["/lentilles", "Lentilles"], ["/audition", "Audition"], ["/magasins", "Nos magasins"], ["/rendez-vous", "Prendre rendez-vous"]],
        body: productCards([["Lentilles journalières", "29,90"], ["Solution lentilles", "12,90"]], "Ajouter au panier") + filler("Examen de vue gratuit par nos opticiens diplômés en magasin. Accueil des clients et vérification des montures.") },),
      "/magasins": doc({ lang: "fr", title: "Trouver un magasin | Opticien Centre", description: "Trouvez le magasin d'optique le plus proche de chez vous.", h1: ["Nos magasins"] }),
      "/rendez-vous": doc({ lang: "fr", title: "Prendre rendez-vous en magasin | Opticien Centre", description: "Réservez votre examen de vue chez votre opticien.", h1: ["Rendez-vous"] }),
      "/shop/p-1": productPage({ lang: "fr", name: "Lentilles journalières", price: "29,90", cartLabel: "Ajouter au panier" }),
      "/shop/p-2": productPage({ lang: "fr", name: "Solution lentilles", price: "12,90", cartLabel: "Ajouter au panier" }),
    },
  },
  "optiker-kette.test": {
    group: "optician", expect: { sector: ["health_wellness", "ecommerce"], key: ["optician"], notSector: ["unknown"], channel: ["physical_store", "omnichannel"] },
    pages: {
      "/": doc({ lang: "de", title: "Brillen, Kontaktlinsen & Hörgeräte | Optiker Kette", description: "Ihr Optiker in über 700 Filialen: Brillen, Sonnenbrillen, Kontaktlinsen und kostenloser Sehtest. Jetzt Termin in Ihrer Filiale vereinbaren.", h1: ["Brille. Fertig."],
        nav: [["/brillen", "Brillen"], ["/sonnenbrillen", "Sonnenbrillen"], ["/kontaktlinsen", "Kontaktlinsen"], ["/sehtest", "Sehtest"], ["/filialen", "Filialen"], ["/termin", "Termin buchen"]],
        body: filler("Kostenloser Sehtest beim Augenoptiker in Ihrer Nähe.") },),
      "/filialen": doc({ lang: "de", title: "Filiale finden | Optiker Kette", description: "Finden Sie Ihre Filiale mit Öffnungszeiten.", h1: ["Filialfinder"] }),
      "/sehtest": doc({ lang: "de", title: "Kostenloser Sehtest | Optiker Kette", description: "Sehtest beim Optiker: kostenlos und unverbindlich in jeder Filiale.", h1: ["Sehtest"] }),
    },
  },
  "ottica-rete.test": {
    group: "optician", expect: { sector: ["health_wellness", "ecommerce"], key: ["optician"], notSector: ["unknown"], channel: ["physical_store", "omnichannel"] },
    pages: {
      "/": doc({ lang: "it", title: "Ottica: occhiali da vista, occhiali da sole e lenti a contatto | Ottica Rete", description: "Oltre 500 negozi di ottica in Italia. Prenota il tuo controllo della vista gratuito e scopri occhiali da vista, da sole e lenti a contatto.", h1: ["La tua vista, la nostra passione"],
        nav: [["/occhiali-da-vista", "Occhiali da vista"], ["/occhiali-da-sole", "Occhiali da sole"], ["/lenti-a-contatto", "Lenti a contatto"], ["/negozi", "Negozi"], ["/prenota", "Prenota un appuntamento"]],
        body: filler("Controllo della vista gratuito nei nostri negozi con ottici optometristi.") },),
      "/negozi": doc({ lang: "it", title: "Trova il negozio più vicino | Ottica Rete", description: "Cerca il negozio di ottica più vicino a te con orari e servizi.", h1: ["Negozi"] }),
      "/prenota": doc({ lang: "it", title: "Prenota il controllo della vista | Ottica Rete", description: "Prenota un esame della vista gratuito in negozio.", h1: ["Prenota"] }),
    },
  },
  "opticians-uk.test": {
    group: "optician", expect: { sector: ["health_wellness", "ecommerce"], key: ["optician"], notSector: ["unknown"], channel: ["physical_store", "omnichannel"] },
    pages: {
      "/": doc({ lang: "en", title: "Opticians | Glasses, Contact Lenses & Eye Tests | Visionline", description: "Book an eye test at your local Visionline store. Shop glasses, sunglasses and contact lenses online or in store.", h1: ["Your local opticians"],
        nav: [["/glasses", "Glasses"], ["/sunglasses", "Sunglasses"], ["/contact-lenses", "Contact lenses"], ["/eye-test", "Book an eye test"], ["/stores", "Find a store"]],
        body: productCards([["Daily lenses 30 pack", "22.00"], ["Monthly lenses 3 pack", "19.00"]], "Add to basket", "£") + filler("Eye tests by qualified optometrists in our stores.") },),
      "/stores": doc({ lang: "en", title: "Store finder | Visionline", description: "Find your nearest opticians store and opening hours.", h1: ["Find a store"] }),
      "/eye-test": doc({ lang: "en", title: "Book an eye test | Visionline", description: "Book a free NHS or private eye test with an optometrist in store.", h1: ["Eye tests"] }),
      "/shop/p-1": productPage({ lang: "en", name: "Daily lenses 30 pack", price: "22.00", cartLabel: "Add to basket" }),
      "/shop/p-2": productPage({ lang: "en", name: "Monthly lenses 3 pack", price: "19.00", cartLabel: "Add to basket" }),
    },
  },
  "optiek-dorp.test": {
    group: "optician", expect: { sector: ["health_wellness", "ecommerce"], key: ["optician"], notSector: ["unknown"], channel: ["physical_store"] },
    pages: {
      "/": doc({ title: "Optiek de Vries – uw opticien in Zwolle", description: "Persoonlijk advies over brillen en contactlenzen. Oogmeting op afspraak in onze winkel aan de Diezerstraat.", h1: ["Optiek de Vries"],
        schema: [{ "@type": "Optician", name: "Optiek de Vries", url: "https://__HOST__/", address: { "@type": "PostalAddress", streetAddress: "Diezerstraat 1", addressLocality: "Zwolle" }, telephone: "+31381234567" }],
        body: para("Openingstijden: di–za 9:00–17:30.") + filler("Brillen en contactlenzen met persoonlijk advies.") }),
    },
  },
  // Negative controls: pure online lens shop and eyewear brand webshop stay e-commerce.
  "lenzenshop.test": {
    group: "optician_negative", expect: { sector: ["ecommerce"], channel: ["online_store"] },
    pages: {
      "/": doc({ title: "Contactlenzen online bestellen – goedkoop en snel | Lenzenshop", description: "Bestel je contactlenzen en lenzenvloeistof online. Voor 23:00 besteld, morgen in huis. Gratis verzending.", h1: ["Contactlenzen online kopen"], schema: ["OnlineStore"],
        body: productCards([["Daglenzen", "19,95"], ["Maandlenzen", "29,95"], ["Lenzenvloeistof", "9,95"]]) },),
      "/shop/p-1": productPage({ name: "Daglenzen", price: "19,95" }), "/shop/p-2": productPage({ name: "Maandlenzen", price: "29,95" }),
    },
  },
  "sunglass-brand.test": {
    group: "optician_negative", expect: { sector: ["ecommerce"], notSector: ["health_wellness"] },
    pages: {
      "/": doc({ lang: "en", title: "Sunglasses & Eyewear | Official Online Store | Shadeco", description: "Shop polarized sunglasses online. Free shipping and 30-day returns.", h1: ["New collection"],
        body: productCards([["Aviator", "149.00"], ["Wayfarer", "139.00"], ["Round", "129.00"]], "Add to bag") },),
      "/shop/p-1": productPage({ lang: "en", name: "Aviator", price: "149.00", cartLabel: "Add to bag" }),
    },
  },

  // ───────── Hair salons ─────────
  "kapsalonketen.test": {
    group: "hair_salon", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce", "unknown"], channel: ["physical_store", "omnichannel", "service_location"] },
    pages: {
      "/": doc({ title: "Kappers bij jou in de buurt | Knipketen", description: "Meer dan 100 kapsalons in Nederland. Knippen, kleuren en stylen door vakkundige kappers. Maak online een afspraak of koop je haarproducten in onze webshop.", h1: ["Jouw kapper"],
        nav: [["/salons", "Salons"], ["/afspraak", "Afspraak maken"], ["/behandelingen", "Behandelingen"], ["/shop", "Webshop"], ["/werken-bij", "Werken bij"]],
        body: productCards([["Shampoo 250ml", "14,95"], ["Haarmasker", "19,95"]]) + filler("Knippen dames, knippen heren, kleuren, highlights.") },),
      "/salons": doc({ title: "Vind een salon | Knipketen", description: "Bekijk alle kapsalons met openingstijden.", h1: ["Onze salons"] }),
      "/behandelingen": doc({ title: "Behandelingen en prijzen | Knipketen", description: "Knippen, kleuren, föhnen en meer. Bekijk de prijzen van onze kappers.", h1: ["Behandelingen"], body: para("Knippen dames € 39,50. Knippen heren € 27,50. Kleuren vanaf € 49,50.") }),
      "/shop": doc({ title: "Haarproducten kopen | Knipketen", description: "Professionele haarproducten online bestellen.", h1: ["Webshop"], body: productCards([["Shampoo 250ml", "14,95"], ["Haarmasker", "19,95"], ["Haarlak", "12,95"]]) }),
      "/shop/p-1": productPage({ name: "Shampoo 250ml", price: "14,95" }), "/shop/p-2": productPage({ name: "Haarmasker", price: "19,95" }),
    },
  },
  "kapsalon-klein.test": {
    group: "hair_salon", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ title: "Kapsalon Lotte | Haarstudio in Utrecht", description: "Kapsalon Lotte in Utrecht: knippen, kleuren en balayage. Bel of boek online je afspraak.", h1: ["Welkom bij Kapsalon Lotte"],
        body: para("Knippen € 35,00 · Kleuren € 55,00 · Balayage € 120,00") + filler("Wij knippen dames, heren en kinderen.") }),
    },
  },
  "friseur-kette.test": {
    group: "hair_salon", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "de", title: "Friseur in Ihrer Nähe | Haarschnitt & Farbe | Schnittwerk", description: "Ihr Friseur mit über 600 Salons in Deutschland. Termin online buchen: Haarschnitt, Färben, Styling.", h1: ["Ihr Friseur"],
        nav: [["/salons", "Salonfinder"], ["/termin", "Termin buchen"], ["/leistungen", "Leistungen"], ["/shop", "Onlineshop"]],
        body: productCards([["Pflegeshampoo", "12,90"], ["Haarkur", "18,90"]], "In den Warenkorb") + filler("Haarschnitt Damen und Herren, Colorationen, Strähnen.") },),
      "/salons": doc({ lang: "de", title: "Salonfinder | Schnittwerk", description: "Finden Sie den Friseursalon in Ihrer Nähe.", h1: ["Salons"] }),
      "/shop/p-1": productPage({ lang: "de", name: "Pflegeshampoo", price: "12,90", cartLabel: "In den Warenkorb" }),
      "/shop/p-2": productPage({ lang: "de", name: "Haarkur", price: "18,90", cartLabel: "In den Warenkorb" }),
    },
  },
  "coiffeur-reseau.test": {
    group: "hair_salon", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "fr", title: "Coiffeur : salons de coiffure femme, homme et enfant | Coupe Réseau", description: "Trouvez votre salon de coiffure parmi nos 400 salons. Coupe, couleur, coiffage : prenez rendez-vous en ligne.", h1: ["Votre coiffeur"],
        nav: [["/salons", "Trouver un salon"], ["/rendez-vous", "Prendre rendez-vous"], ["/boutique", "Boutique"]],
        body: productCards([["Shampooing réparateur", "15,90"], ["Masque cheveux", "21,90"]], "Ajouter au panier") },),
      "/salons": doc({ lang: "fr", title: "Nos salons de coiffure | Coupe Réseau", description: "Tous nos salons de coiffure en France.", h1: ["Salons"] }),
      "/shop/p-1": productPage({ lang: "fr", name: "Shampooing réparateur", price: "15,90", cartLabel: "Ajouter au panier" }),
      "/shop/p-2": productPage({ lang: "fr", name: "Masque cheveux", price: "21,90", cartLabel: "Ajouter au panier" }),
    },
  },
  "peluqueria-red.test": {
    group: "hair_salon", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "es", title: "Peluquerías y centros de estética | Corte Red", description: "Más de 300 peluquerías en España. Corte, color, mechas y tratamientos de estética. Pide cita online en tu peluquería más cercana.", h1: ["Tu peluquería"],
        nav: [["/peluquerias", "Peluquerías"], ["/cita", "Pedir cita"], ["/servicios", "Servicios"], ["/tienda", "Tienda online"]],
        body: productCards([["Champú", "11,90"], ["Mascarilla", "16,90"]], "Añadir al carrito") },),
      "/peluquerias": doc({ lang: "es", title: "Buscador de peluquerías | Corte Red", description: "Encuentra tu peluquería más cercana.", h1: ["Peluquerías"] }),
    },
  },
  "parrucchiere-rete.test": {
    group: "hair_salon", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "it", title: "Parrucchieri: taglio, colore e piega | Taglio Rete", description: "I nostri saloni di parrucchieri in tutta Italia. Prenota online il tuo appuntamento per taglio, colore e trattamenti.", h1: ["Il tuo parrucchiere"],
        nav: [["/saloni", "Saloni"], ["/prenota", "Prenota"], ["/shop", "Shop"]],
        body: productCards([["Shampoo", "13,90"], ["Maschera", "18,90"]], "Aggiungi al carrello") },),
      "/saloni": doc({ lang: "it", title: "Trova il salone | Taglio Rete", description: "Cerca il salone di parrucchieri più vicino.", h1: ["Saloni"] }),
    },
  },
  "hairsalon-uk.test": {
    group: "hair_salon", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "en", title: "Hair Salons in London & across the UK | Cutline", description: "Award-winning hairdressers. Book a haircut, colour or blow dry at your nearest Cutline salon.", h1: ["Great hair, every time"],
        nav: [["/salons", "Our salons"], ["/book", "Book now"], ["/shop", "Shop"]],
        body: productCards([["Shampoo", "14.00"], ["Conditioner", "14.00"]], "Add to basket", "£") },),
      "/shop/p-1": productPage({ lang: "en", name: "Shampoo", price: "14.00", cartLabel: "Add to basket" }),
      "/shop/p-2": productPage({ lang: "en", name: "Conditioner", price: "14.00", cartLabel: "Add to basket" }),
    },
  },
  // Negative control: an online haircare webshop is retail, not a salon.
  "haarproducten.test": {
    group: "hair_negative", expect: { sector: ["ecommerce"], notSector: ["beauty"], channel: ["online_store"] },
    pages: {
      "/": doc({ title: "Haarproducten online kopen | Haarshop", description: "Professionele haarverzorging online bestellen. Shampoo, conditioner en styling. Gratis verzending vanaf € 25.", h1: ["Haarverzorging"], schema: ["OnlineStore"],
        body: productCards([["Shampoo", "14,95"], ["Conditioner", "14,95"], ["Haarlak", "9,95"]]) },),
      "/shop/p-1": productPage({ name: "Shampoo", price: "14,95" }), "/shop/p-2": productPage({ name: "Conditioner", price: "14,95" }),
    },
  },
  // Negative control: software for salons is not a salon.
  "salonsoftware.test": {
    group: "hair_negative", expect: { notSector: ["beauty", "ecommerce"] },
    pages: {
      "/": doc({ lang: "en", title: "Salon booking software for hair salons and barbers | Bookly", description: "Online booking, payments and marketing software for salons. Start your free trial.", h1: ["Run your salon smarter"],
        body: para("Integrations, dashboard, features, pricing. Book a demo.") }),
    },
  },

  // ───────── Hotels ─────────
  "hotel-roma.test": {
    group: "hotel", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "it", title: "Hotel Bellavista Roma | Albergo 4 stelle nel centro di Roma", description: "Prenota il tuo soggiorno al nostro albergo nel centro storico. Camere e suite con colazione inclusa. Miglior tariffa garantita.", h1: ["Benvenuti all'Hotel Bellavista"],
        nav: [["/camere", "Camere"], ["/offerte", "Offerte"], ["/prenota", "Prenota"]], body: para("Camere da € 129 a notte. Check-in dalle 14:00.") }),
    },
  },
  "hotel-paris.test": {
    group: "hotel", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "fr", title: "Hôtel Lumière Paris – hôtel 4 étoiles près du Louvre", description: "Réservez votre chambre dans notre hôtel au cœur de Paris. Petit-déjeuner, spa et meilleur tarif garanti.", h1: ["Hôtel Lumière"],
        nav: [["/chambres", "Chambres"], ["/reserver", "Réserver"]], body: para("Chambres à partir de 159 € la nuit.") }),
    },
  },
  "hotel-madrid.test": {
    group: "hotel", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "es", title: "Hotel Sol Madrid | Reserva tu habitación en el centro", description: "Hotel de 4 estrellas en Madrid. Reserva online tu habitación con desayuno al mejor precio.", h1: ["Bienvenido a Hotel Sol"],
        nav: [["/habitaciones", "Habitaciones"], ["/reservar", "Reservar"]], body: para("Habitaciones desde 99 € por noche.") }),
    },
  },
  "hotel-berlin.test": {
    group: "hotel", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "de", title: "Hotel am Park Berlin | Zimmer online buchen", description: "Ihr 4-Sterne-Hotel in Berlin-Mitte. Komfortable Zimmer mit Frühstück. Jetzt zum besten Preis buchen.", h1: ["Willkommen im Hotel am Park"],
        nav: [["/zimmer", "Zimmer"], ["/buchen", "Buchen"]], body: para("Zimmer ab 119 € pro Nacht.") }),
    },
  },
  "hotelgroep.test": {
    group: "hotel", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ title: "Hotels in Nederland en België | Hotelgroep", description: "Boek je hotelovernachting of arrangement in een van onze 40 hotels. Beste prijsgarantie bij direct boeken.", h1: ["Al onze hotels op één plek"],
        nav: [["/hotels", "Hotels"], ["/arrangementen", "Arrangementen"], ["/over-ons", "Over ons"]], body: para("Overnachting vanaf € 89 per kamer. Arrangement € 149 per persoon.") }),
      "/hotels": doc({ title: "Alle hotels | Hotelgroep", description: "Bekijk al onze hotels en boek direct.", h1: ["Hotels"] }),
    },
  },
  // Abstain: a booking-software vendor for hotels is not a hotel.
  "hotelsoftware.test": {
    group: "hotel_negative", expect: { notSector: ["hospitality"] },
    pages: {
      "/": doc({ lang: "en", title: "Hotel booking engine & channel manager | Roomly", description: "Software for hotels: booking engine, channel manager and payments. Book a demo.", h1: ["More direct bookings for your hotel"],
        body: para("Features, integrations, pricing for hotels and B&Bs. Start a free trial.") }),
    },
  },

  // ───────── Restaurants ─────────
  "ristorante.test": {
    group: "restaurant", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "it", title: "Ristorante Pizzeria Da Mario | Pizza napoletana a Milano", description: "Pizza napoletana e cucina tradizionale. Prenota un tavolo o ordina a domicilio.", h1: ["Da Mario"],
        nav: [["/menu", "Menù"], ["/prenota", "Prenota un tavolo"], ["/ordina", "Ordina online"]], body: para("Margherita € 8,00 · Diavola € 9,50") }),
    },
  },
  "ristorante-catena.test": {
    group: "restaurant", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "it", title: "Pizzerie e ristoranti napoletani in Italia | Rossoforno", description: "La vera pizza napoletana nei nostri ristoranti. Scopri il menu, trova il locale più vicino e ordina online con consegna a domicilio.", h1: ["Pizza napoletana dal 1998"],
        nav: [["/menu", "Menu"], ["/ristoranti", "Ristoranti"], ["/ordina", "Ordina online"]],
        body: productCards([["Margherita", "8,00"], ["Marinara", "7,00"]], "Aggiungi al carrello") },),
      "/ristoranti": doc({ lang: "it", title: "I nostri ristoranti | Rossoforno", description: "Trova il ristorante più vicino.", h1: ["Ristoranti"] }),
    },
  },
  "restaurant-paris.test": {
    group: "restaurant", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "fr", title: "Le Petit Bistrot | Restaurant traditionnel à Lyon", description: "Cuisine française de saison. Découvrez notre carte et réservez votre table en ligne.", h1: ["Le Petit Bistrot"],
        nav: [["/carte", "La carte"], ["/reserver", "Réserver une table"]], body: para("Menu du jour 19,50 €") }),
    },
  },
  "restaurante-madrid.test": {
    group: "restaurant", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "es", title: "Restaurante Casa Pepe | Cocina tradicional en Madrid", description: "Tapas y cocina española. Consulta nuestra carta y reserva tu mesa online.", h1: ["Casa Pepe"],
        nav: [["/carta", "Carta"], ["/reservas", "Reservar mesa"]], body: para("Menú del día 14,90 €") }),
    },
  },
  "restaurant-muenchen.test": {
    group: "restaurant", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ lang: "de", title: "Gasthaus zum Löwen | Bayerische Küche in München", description: "Traditionelle bayerische Küche. Speisekarte ansehen und Tisch online reservieren.", h1: ["Gasthaus zum Löwen"],
        nav: [["/speisekarte", "Speisekarte"], ["/reservierung", "Tisch reservieren"]], body: para("Schweinebraten 18,50 €") }),
    },
  },
  "restaurantketen.test": {
    group: "restaurant", expect: { sector: ["hospitality"], notSector: ["ecommerce", "unknown"] },
    pages: {
      "/": doc({ title: "Burgerrestaurant | Bestel online of reserveer | Grillhuis", description: "De lekkerste burgers in 25 restaurants. Bestel online voor bezorging of afhalen, of reserveer een tafel.", h1: ["Burgers met liefde gemaakt"],
        nav: [["/menu", "Menu"], ["/restaurants", "Restaurants"], ["/bestellen", "Bestellen"]],
        body: productCards([["Classic burger", "12,50"], ["Veggie burger", "11,50"], ["Friet", "3,95"]], "Toevoegen") },),
      "/restaurants": doc({ title: "Onze restaurants | Grillhuis", description: "Vind een Grillhuis restaurant bij jou in de buurt.", h1: ["Restaurants"] }),
    },
  },
  // Negative control: kitchen equipment webshop for restaurants stays retail.
  "horecagroothandel.test": {
    group: "restaurant_negative", expect: { sector: ["ecommerce"], notSector: ["hospitality"] },
    pages: {
      "/": doc({ title: "Horeca-apparatuur online kopen | Keukenshop", description: "Professionele keukenapparatuur voor restaurants en cafés online bestellen. Snelle levering.", h1: ["Horeca-apparatuur"], schema: ["OnlineStore"],
        body: productCards([["Friteuse", "499,00"], ["Combisteamer", "2999,00"], ["Koelkast", "899,00"]]) },),
      "/shop/p-1": productPage({ name: "Friteuse", price: "499,00" }), "/shop/p-2": productPage({ name: "Combisteamer", price: "2999,00" }),
    },
  },

  // ───────── Other local trades (multilingual breadth) ─────────
  ...Object.fromEntries([
    ["zahnarzt.test", "dentist", ["health_wellness"], { lang: "de", title: "Zahnarztpraxis Dr. Weber | Zahnarzt in Köln", description: "Ihre Zahnarztpraxis in Köln: Prophylaxe, Implantate und Zahnersatz. Termin online vereinbaren.", h1: ["Zahnarztpraxis Dr. Weber"] }],
    ["dentiste.test", "dentist", ["health_wellness"], { lang: "fr", title: "Cabinet dentaire du Parc | Dentiste à Lyon", description: "Votre dentiste à Lyon : soins dentaires, implants et orthodontie. Prenez rendez-vous en ligne.", h1: ["Cabinet dentaire du Parc"] }],
    ["clinicadental.test", "dentist", ["health_wellness"], { lang: "es", title: "Clínica Dental Sonrisa | Dentista en Valencia", description: "Clínica dental en Valencia: implantes, ortodoncia y blanqueamiento. Pide tu cita.", h1: ["Clínica Dental Sonrisa"] }],
    ["studiodentistico.test", "dentist", ["health_wellness"], { lang: "it", title: "Studio Dentistico Rossi | Dentista a Torino", description: "Studio dentistico a Torino: igiene, implantologia e ortodonzia. Prenota una visita.", h1: ["Studio Dentistico Rossi"] }],
    ["werkstatt.test", "car_repair", ["automotive"], { lang: "de", title: "Kfz-Werkstatt Müller | Autowerkstatt in Hamburg", description: "Ihre Autowerkstatt für Inspektion, Reparatur, Reifenwechsel und HU. Jetzt Termin buchen.", h1: ["Kfz-Werkstatt Müller"] }],
    ["garage-auto.test", "car_repair", ["automotive"], { lang: "fr", title: "Garage Martin | Entretien et réparation automobile à Nantes", description: "Garage automobile : vidange, pneus, freins et contrôle technique. Prenez rendez-vous.", h1: ["Garage Martin"] }],
    ["taller.test", "car_repair", ["automotive"], { lang: "es", title: "Taller Mecánico López | Reparación de coches en Sevilla", description: "Taller mecánico: mantenimiento, neumáticos, frenos y ITV. Pide cita previa.", h1: ["Taller Mecánico López"] }],
    ["officina.test", "car_repair", ["automotive"], { lang: "it", title: "Officina Bianchi | Autofficina e gommista a Bologna", description: "Officina meccanica: tagliando, revisione, pneumatici e riparazioni auto. Prenota online.", h1: ["Officina Bianchi"] }],
    ["fitnessstudio.test", "gym", ["fitness_sports"], { lang: "de", title: "Fitnessstudio FitWerk | Training in Leipzig", description: "Dein Fitnessstudio in Leipzig: Gerätetraining, Kurse und Personal Training. Jetzt Probetraining buchen.", h1: ["FitWerk Fitnessstudio"] }],
    ["gimnasio.test", "gym", ["fitness_sports"], { lang: "es", title: "Gimnasio Fuerza | Gimnasio en Bilbao", description: "Gimnasio con sala de musculación, clases dirigidas y entrenador personal. Prueba gratis.", h1: ["Gimnasio Fuerza"] }],
    ["palestra.test", "gym", ["fitness_sports"], { lang: "it", title: "Palestra Energia | Fitness a Firenze", description: "Palestra con sala pesi, corsi fitness e personal trainer. Prova gratuita.", h1: ["Palestra Energia"] }],
    ["immobilier.test", "real_estate", ["real_estate"], { lang: "fr", title: "Agence immobilière Dupont | Achat, vente et location à Bordeaux", description: "Agence immobilière à Bordeaux : appartements et maisons à vendre et à louer. Estimation gratuite.", h1: ["Agence immobilière Dupont"] }],
    ["inmobiliaria.test", "real_estate", ["real_estate"], { lang: "es", title: "Inmobiliaria Costa | Pisos en venta y alquiler en Málaga", description: "Inmobiliaria en Málaga: pisos y casas en venta y alquiler. Tasación gratuita.", h1: ["Inmobiliaria Costa"] }],
    ["immobiliare.test", "real_estate", ["real_estate"], { lang: "it", title: "Agenzia Immobiliare Verdi | Case in vendita e in affitto a Roma", description: "Agenzia immobiliare a Roma: appartamenti in vendita e in affitto. Valutazione gratuita.", h1: ["Agenzia Immobiliare Verdi"] }],
    ["boulangerie.test", "bakery", ["food_local_retail"], { lang: "fr", title: "Boulangerie Pâtisserie Leroy | Pain et viennoiseries à Lille", description: "Boulangerie artisanale : pain au levain, croissants et gâteaux faits maison.", h1: ["Boulangerie Leroy"] }],
    ["baeckerei.test", "bakery", ["food_local_retail"], { lang: "de", title: "Bäckerei Schmidt | Brot und Brötchen aus Meisterhand", description: "Ihre Bäckerei in Stuttgart: frisches Brot, Brötchen und Kuchen jeden Tag.", h1: ["Bäckerei Schmidt"] }],
    ["apotheke.test", "pharmacy", ["health_wellness"], { lang: "de", title: "Stadt-Apotheke | Ihre Apotheke in Bremen", description: "Ihre Apotheke vor Ort: Arzneimittel, Rezepte und Beratung. Medikamente vorbestellen.", h1: ["Stadt-Apotheke"] }],
    ["farmacia.test", "pharmacy", ["health_wellness"], { lang: "it", title: "Farmacia Centrale | Farmacia a Genova", description: "Farmacia a Genova: farmaci, ricette e consulenza del farmacista. Prenota i tuoi medicinali.", h1: ["Farmacia Centrale"] }],
    ["fisio.test", "physio", ["health_wellness"], { lang: "es", title: "Clínica de Fisioterapia Movimiento | Fisioterapeutas en Zaragoza", description: "Fisioterapia deportiva, rehabilitación y osteopatía. Pide tu cita.", h1: ["Fisioterapia Movimiento"] }],
    ["kine.test", "physio", ["health_wellness"], { lang: "fr", title: "Cabinet de kinésithérapie | Kinésithérapeute à Rennes", description: "Kinésithérapie, rééducation et massages. Prenez rendez-vous avec votre kiné.", h1: ["Cabinet de kinésithérapie"] }],
  ].map(([host, group, sector, home]) => [host, { group, expect: { sector, notSector: ["unknown", "ecommerce"] }, pages: { "/": doc({ ...home, body: para("Kontakt · Contact · Contatti") }) } }])),

  // ───────── Abstention ─────────
  "welkom-leeg.test": {
    group: "abstain", expect: { sector: ["unknown", "general_business"], maxConfidence: 60 },
    pages: { "/": doc({ title: "Welkom | Home", description: "Welkom op onze website.", h1: ["Welkom"], body: para("Neem contact met ons op.") }) },
  },
  // Abstain: homepage is a country selector; no activity is declared.
  "landkeuze.test": {
    group: "abstain", expect: { sector: ["unknown", "general_business"], maxConfidence: 60 },
    pages: { "/": doc({ lang: "en", title: "Select your country | Group", description: "Choose your country and language.", h1: ["Welcome"], nav: [["/nl", "Nederland"], ["/de", "Deutschland"], ["/fr", "France"]] }) },
  },
};
