// QA 144-site test (24 Oct 2026): sector failure CLASSES, reproduced on
// neutral `.test` hosts. Never a real brand, domain or site rule.
//   - hospitality group whose identity mentions spa/wellness → was "Beauty 95%"
//   - hair-salon chain (PT) with its own product shop → was "E-commerce 94%"
//   - employer careers site, entered on a logistics vacancy → was "Transport 92%"
//   - supermarket chains (IT/ES/SE) → were "unknown"
//   - bank whose brand name is a compound ("<x>bank") with banking products
// Expectations: sector (allowed list), notSector (never), maxConfidence for
// abstentions, startPath (the page the customer entered).
import { doc } from "./local-business-profiles.mjs";
const filler = (text, n = 10) => `<p>${(text + " ").repeat(n)}</p>`;
const products = (items, cart, cur = "€") => items.map(([n, p], i) => `<div class="product-card"><a href="/loja/p-${i + 1}">${n}</a><span class="price">${cur} ${p}</span><form action="/cart/add" method="post"><button>${cart}</button></form></div>`).join("");

export const QA144_SITES = {
  // ───── Hospitality group: spa/wellness is a facility, never the sector ─────
  "hotelgroep.test": {
    group: "hospitality_group", expect: { sector: ["hospitality", "unknown"], notSector: ["beauty"] },
    pages: {
      "/": doc({ lang: "en", title: "Hotelgroep | Hotels, resorts and residences worldwide", description: "Hotelgroep is a world-leading hospitality group with 5,000 hotels, resorts and residences, from luxury to economy, including spa and wellness destinations.", h1: ["Augmented hospitality"],
        nav: [["/brands", "Our brands"], ["/hotels", "Find a hotel"], ["/wellness", "Spa & wellness"], ["/careers", "Careers"], ["/investors", "Investors"]],
        body: filler("Our hotels welcome guests in 110 countries. Book your stay, discover our loyalty programme and our spa and wellness experiences.") }),
      "/brands": doc({ lang: "en", title: "Our hotel brands | Hotelgroep", description: "Discover the hotel brands of Hotelgroep, from luxury resorts to budget hotels.", h1: ["Our brands"] }),
      "/wellness": doc({ lang: "en", title: "Spa & wellness in our hotels | Hotelgroep", description: "Relax in the spa of one of our hotels and resorts: massages, facials and wellness rituals during your stay.", h1: ["Spa & wellness"] }),
      "/careers": doc({ lang: "en", title: "Careers | Hotelgroep", description: "Join the hospitality teams of Hotelgroep hotels worldwide.", h1: ["Careers"] }),
    },
  },
  "groupe-hotelier.test": {
    group: "hospitality_group", expect: { sector: ["hospitality", "unknown"], notSector: ["beauty"] },
    pages: {
      "/": doc({ lang: "en", title: "Groupe Hotelier Group | Augmented hospitality", description: "World leader in hospitality: lifestyle, wellness and premium experiences across 45 brands.", h1: ["Feel welcome"],
        nav: [["/group", "Group"], ["/brands", "Brands"], ["/commitment", "Commitment"], ["/finance", "Finance"], ["/talents", "Talents"]],
        body: filler("A global hospitality group with hotels, resorts, residences, spa and wellness, dining and entertainment venues.") }),
      "/brands": doc({ lang: "en", title: "Brands | Groupe Hotelier", description: "Luxury, premium, midscale and economy hotel brands.", h1: ["Brands"] }),
      "/group": doc({ lang: "en", title: "The group | Groupe Hotelier", description: "Groupe Hotelier is a hospitality group operating hotels in 110 countries.", h1: ["The group"] }),
    },
  },
  "kusthotel-spa.test": {
    group: "hotel_with_spa", expect: { sector: ["hospitality"], notSector: ["beauty"] },
    pages: {
      "/": doc({ title: "Hotel aan zee met wellness en spa | Kusthotel", description: "Kusthotel is een viersterrenhotel aan zee met 80 kamers, restaurant, wellness en spa. Boek je overnachting direct.", h1: ["Kusthotel aan zee"],
        nav: [["/kamers", "Kamers"], ["/wellness", "Wellness"], ["/restaurant", "Restaurant"], ["/arrangementen", "Arrangementen"], ["/boeken", "Boeken"]],
        body: filler("Overnachten met ontbijt, wellness en spa. Kamers met zeezicht, inchecken vanaf 15:00.") }),
      "/kamers": doc({ title: "Kamers | Kusthotel", description: "Bekijk onze hotelkamers en suites met zeezicht.", h1: ["Kamers"] }),
      "/wellness": doc({ title: "Wellness & spa | Kusthotel", description: "Sauna, massages en gezichtsbehandelingen voor hotelgasten.", h1: ["Wellness"] }),
    },
  },
  // Negative control: a real beauty salon must stay beauty.
  "schoonheidssalon-lief.test": {
    group: "beauty_control", expect: { sector: ["beauty"], key: ["beauty_salon"] },
    pages: {
      "/": doc({ title: "Schoonheidssalon Lief | Gezichtsbehandelingen, manicure en pedicure", description: "Schoonheidssalon Lief in Utrecht: gezichtsbehandelingen, manicure, pedicure en wellness. Maak online een afspraak.", h1: ["Schoonheidssalon Lief"],
        nav: [["/behandelingen", "Behandelingen"], ["/tarieven", "Tarieven"], ["/afspraak", "Afspraak maken"]], schema: ["BeautySalon"],
        body: filler("Ontspannende gezichtsbehandelingen en huidverbetering in onze salon.") }),
      "/behandelingen": doc({ title: "Behandelingen | Schoonheidssalon Lief", description: "Alle behandelingen van onze schoonheidssalon.", h1: ["Behandelingen"] }),
    },
  },
  // ───── Hair-salon chain (PT) with its own product shop ─────
  "cabelo-chic.test": {
    group: "hair_salon", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce"] },
    pages: {
      "/": doc({ lang: "pt", title: "Cabeleireiro e salões de beleza | Cabelo Chic", description: "Marque o seu corte, coloração ou madeixas num dos nossos 80 salões de cabeleireiro em Portugal e compre produtos profissionais para o cabelo na loja online.", h1: ["O seu cabeleireiro"],
        nav: [["/saloes", "Salões"], ["/servicos", "Serviços"], ["/marcacao", "Marcação"], ["/loja", "Loja online"], ["/sobre-nos", "Sobre nós"]],
        body: products([["Champô reparador", "14,90"], ["Máscara nutritiva", "19,90"], ["Óleo de cabelo", "24,90"]], "Adicionar ao carrinho") + filler("Cortes, coloração, madeixas e penteados nos nossos salões. Marcação online.") }),
      "/saloes": doc({ lang: "pt", title: "Encontre o seu salão | Cabelo Chic", description: "Mais de 80 salões de cabeleireiro em Portugal. Horários e marcação.", h1: ["Os nossos salões"] }),
      "/marcacao": doc({ lang: "pt", title: "Marcação online | Cabelo Chic", description: "Marque o seu corte ou coloração no salão de cabeleireiro mais próximo.", h1: ["Marcação"] }),
      "/sobre-nos": doc({ lang: "pt", title: "Sobre nós | Cabelo Chic", description: "Cabelo Chic é uma cadeia de salões de cabeleireiro fundada em Lisboa.", h1: ["Sobre nós"] }),
      "/loja": doc({ lang: "pt", title: "Loja online de produtos para o cabelo | Cabelo Chic", description: "Compre champôs, máscaras e produtos de styling profissionais.", h1: ["Loja"], body: products([["Champô reparador", "14,90"], ["Máscara nutritiva", "19,90"]], "Adicionar ao carrinho") }),
    },
  },
  // ───── Employer careers site, entered on a logistics vacancy ─────
  "werkenbij-sportwinkel.test": {
    group: "careers_site", startPath: "/teams/teamleider-logistiek", expect: { sector: ["recruitment", "unknown"], notSector: ["transport_travel"] },
    pages: {
      "/": doc({ title: "Werken bij Sportwinkel | Vacatures in winkels, logistiek en op kantoor", description: "Bekijk alle vacatures bij Sportwinkel en solliciteer direct. Werk in onze winkels, in het distributiecentrum of op het hoofdkantoor.", h1: ["Werken bij Sportwinkel"],
        nav: [["/vacatures", "Vacatures"], ["/teams/winkel", "Winkel"], ["/teams/teamleider-logistiek", "Logistiek"], ["/sollicitatieproces", "Sollicitatieproces"], ["/over-werken-bij", "Over werken bij Sportwinkel"]],
        body: filler("Kom werken bij Sportwinkel. Solliciteer op een vacature in de winkel, de logistiek of op kantoor.") }),
      "/teams/teamleider-logistiek": doc({ title: "Teamleider logistiek | Werken bij Sportwinkel", description: "Als teamleider logistiek in ons distributiecentrum stuur je een team aan dat zorgt voor transport, warehousing en de bevoorrading van onze winkels. Solliciteer direct.", h1: ["Teamleider logistiek"],
        nav: [["/vacatures", "Vacatures"], ["/sollicitatieproces", "Sollicitatieproces"], ["/", "Werken bij Sportwinkel"]],
        body: filler("Logistiek, transport en warehouse: jij zorgt dat goederen op tijd in de winkels liggen. Solliciteer en word onderdeel van ons logistieke team.") }),
      "/vacatures": doc({ title: "Alle vacatures | Werken bij Sportwinkel", description: "Bekijk alle openstaande vacatures en solliciteer direct online.", h1: ["Vacatures"] }),
      "/sollicitatieproces": doc({ title: "Sollicitatieproces | Werken bij Sportwinkel", description: "Zo verloopt solliciteren bij Sportwinkel: van sollicitatie tot eerste werkdag.", h1: ["Sollicitatieproces"] }),
      "/over-werken-bij": doc({ title: "Over werken bij Sportwinkel | Werken bij Sportwinkel", description: "Ontdek hoe het is om te werken bij Sportwinkel en welke carrièremogelijkheden er zijn.", h1: ["Over werken bij"] }),
    },
  },
  // ───── Supermarket chains ─────
  "supermercati-marca.test": {
    group: "supermarket", expect: { sector: ["ecommerce"], notSector: ["unknown"] },
    pages: {
      "/": doc({ lang: "it", title: "Supermercati, promozioni e servizi | Marca", description: "Scopri i supermercati Marca, le promozioni e i servizi ogni giorno a disposizione per te.", h1: ["Benvenuto nel mondo Marca"],
        nav: [["/negozi", "Negozi"], ["/promozioni", "Promozioni"], ["/spesa-online", "Spesa online"], ["/ricette", "Ricette"], ["/chi-siamo", "Chi siamo"]],
        body: filler("La spesa nei nostri supermercati e online, con offerte ogni settimana.") }),
      "/negozi": doc({ lang: "it", title: "Trova il supermercato più vicino | Marca", description: "Orari e servizi dei supermercati Marca.", h1: ["Negozi"] }),
      "/chi-siamo": doc({ lang: "it", title: "Chi siamo | Marca", description: "Marca è una catena italiana di supermercati.", h1: ["Chi siamo"] }),
    },
  },
  "supermercados-marca.test": {
    group: "supermarket", expect: { sector: ["ecommerce"], notSector: ["unknown"] },
    pages: {
      "/": doc({ lang: "es", title: "Supermercados Marca - Compra online", description: "Haz tu compra online en Supermercados Marca y recíbela en casa, o encuentra tu supermercado más cercano.", h1: ["Supermercados Marca"],
        nav: [["/tiendas", "Tiendas"], ["/compra-online", "Compra online"], ["/ofertas", "Ofertas"], ["/empresa", "Empresa"]],
        body: filler("Productos frescos, alimentación y droguería en nuestros supermercados.") }),
      "/tiendas": doc({ lang: "es", title: "Nuestros supermercados | Marca", description: "Encuentra tu supermercado Marca más cercano.", h1: ["Tiendas"] }),
    },
  },
  "matbutik-marka.test": {
    group: "supermarket", expect: { sector: ["ecommerce"], notSector: ["unknown"] },
    pages: {
      "/": doc({ lang: "sv", title: "Marka – Recept, erbjudanden och matbutiker", description: "Handla mat online eller i någon av våra matbutiker. Veckans erbjudanden, recept och dagligvaror.", h1: ["Välkommen till Marka"],
        nav: [["/butiker", "Butiker"], ["/erbjudanden", "Erbjudanden"], ["/handla", "Handla online"], ["/recept", "Recept"]],
        body: filler("Dagligvaror och färsk mat i våra butiker och online.") }),
      "/butiker": doc({ lang: "sv", title: "Hitta din matbutik | Marka", description: "Öppettider och adresser till alla Marka-butiker.", h1: ["Butiker"] }),
    },
  },
  // ───── Bank with compound brand name ─────
  "spaarbank.test": {
    group: "bank", expect: { sector: ["financial_services"] },
    pages: {
      "/": doc({ title: "Particulieren | Spaarbank", description: "Betalen, sparen, lenen en hypotheek bij Spaarbank. Regel je bankzaken online of in de app.", h1: ["Welkom bij Spaarbank"],
        nav: [["/betalen", "Betalen"], ["/sparen", "Sparen"], ["/lenen", "Lenen"], ["/hypotheek", "Hypotheek"], ["/verzekeren", "Verzekeren"]],
        body: filler("Open een betaalrekening of spaarrekening.") }),
    },
  },
  // Negative control: a food bank is a charity, never a bank.
  "voedselbank-stad.test": {
    group: "foodbank_control", expect: { notSector: ["financial_services"] },
    pages: {
      "/": doc({ title: "Voedselbank Stad | Samen tegen voedselverspilling en armoede", description: "Voedselbank Stad is een stichting die voedselpakketten verstrekt aan huishoudens. Doneer of word vrijwilliger.", h1: ["Voedselbank Stad"],
        nav: [["/doneren", "Doneren"], ["/vrijwilliger", "Vrijwilliger worden"], ["/aanvragen", "Hulp aanvragen"]],
        body: filler("Steun ons met een donatie of word vrijwilliger.") }),
    },
  },

  // ───── Round 2 (TestLab 144 @ 290f692c, 25 Oct) — neutral reproductions ─────
  // Hair-salon chain (PT) whose title says "salons and hair products" and whose
  // description invites a visit AND online purchase: the salon trade stays primary.
  "salao-capilar.test": {
    group: "hair_salon_r2", expect: { sector: ["beauty"], key: ["hair_salon"], notSector: ["ecommerce"], channel: ["omnichannel", "service_location", "physical_store"] },
    pages: {
      "/": doc({ lang: "pt", title: "Marca Capilar Portugal | Salões e Produtos Capilares", description: "Encontra os melhores cabeleireiros e produtos capilares na loja Marca Capilar Portugal. Marca a tua visita ou compra online os teus essenciais de cabelo.", h1: ["Marca Capilar"],
        nav: [["/saloes", "Salões"], ["/loja", "Loja"], ["/servicos", "Serviços"], ["/marcacao", "Marcar visita"]], schema: ["Organization", "WebSite"],
        body: products([["Champô nutritivo", "12,90"], ["Máscara reparadora", "18,90"], ["Sérum", "22,90"], ["Laca", "9,90"]], "Adicionar ao carrinho") + `<a href="/checkout">Finalizar compra</a>` + filler("Produtos capilares profissionais e marcação nos nossos salões.") }),
      "/saloes": doc({ lang: "pt", title: "Os nossos salões | Marca Capilar", description: "Encontra o salão de cabeleireiro mais próximo e marca a tua visita.", h1: ["Salões"] }),
      "/loja": doc({ lang: "pt", title: "Loja online de produtos capilares | Marca Capilar", description: "Compra online champôs, máscaras e produtos de styling.", h1: ["Loja"], body: products([["Champô nutritivo", "12,90"], ["Máscara reparadora", "18,90"]], "Adicionar ao carrinho") }),
    },
  },
  // Service marketplace (PT) with a consent-banner H1.
  "contrata-pro.test": {
    group: "service_marketplace_r2", expect: { sector: ["service_marketplace"], notSector: ["unknown"] },
    pages: {
      "/": doc({ lang: "pt", title: "Contrate Profissionais Avaliados - ContrataPro", description: "Não adie os seus projectos, faça-os acontecer. Na ContrataPro encontrará profissionais com disponibilidade, interesse e avaliações para realizar qualquer serviço.", h1: ["Utilizamos cookies", "Se é para fazer, é para ContrataPro!"],
        nav: [["/servicos", "Serviços"], ["/como-funciona", "Como funciona"], ["/profissionais", "Sou profissional"], ["/pedir-orcamento", "Pedir orçamento"]], schema: ["WebSite", "Organization"],
        body: filler("Peça orçamentos grátis a profissionais verificados perto de si.") }),
      "/como-funciona": doc({ lang: "pt", title: "Como funciona | ContrataPro", description: "Descreva o seu pedido e receba orçamentos de profissionais avaliados na sua zona.", h1: ["Como funciona"] }),
    },
  },
  // Negative control: recruitment agency that "finds professionals".
  "recruta-ti.test": {
    group: "recruitment_control", expect: { notSector: ["service_marketplace"] },
    pages: {
      "/": doc({ lang: "pt", title: "Encontre profissionais de TI | RecrutaTI", description: "Agência de recrutamento: encontramos profissionais de TI para a sua empresa. Veja as nossas vagas de emprego.", h1: ["Recrutamento de TI"],
        nav: [["/vagas", "Vagas"], ["/empresas", "Empresas"], ["/candidatos", "Candidatos"]], body: filler("Recrutamento e seleção de talento tecnológico.") }),
    },
  },
  // Hospitality group naming hotels AND restaurants (one sector, two activities).
  "hospitality-group.test": {
    group: "hospitality_group_r2", expect: { sector: ["hospitality"], notSector: ["beauty", "unknown"] },
    pages: {
      "/": doc({ lang: "en", title: "Hospitality Group", description: "Hospitality Group is a world-leading hospitality group offering stays and experiences across more than 110 countries with over 5,800 hotels and resorts, 10,000 bars & restaurants, wellness facilities and flexible workspaces.", h1: ["The Power of Human Creativity in Hospitality"],
        nav: [["/brands", "Brands"], ["/group", "Group"], ["/commitment", "Commitment"], ["/finance", "Finance"], ["/talent", "Talent"]], body: filler("Our hotels and restaurants welcome guests every day.") }),
      "/brands": doc({ lang: "en", title: "Brands | Hospitality Group", description: "From luxury to economy, discover our hotel brands.", h1: ["Brands"] }),
    },
  },
  // Manufacturer whose category pages say "Bekijk en vergelijk …-producten … lees reviews en bestel online".
  "elektromerk.test": {
    group: "manufacturer_r2", expect: { notSector: ["news_media"] },
    pages: {
      "/": doc({ title: "Elektromerk - Nederland | Elektromerk", description: "Lees meer over Elektromerk en hoe wij helpen het leven van mensen te verbeteren met belangrijke innovaties op het gebied van gezondheidszorg, consumer lifestyle en verlichting.", h1: ["Meld je nu aan"],
        nav: [["/c/frisdrankmakers/latest", "Frisdrankmakers"], ["/c/accessoires/latest", "Accessoires"], ["/c/verzorging/latest", "Verzorging"], ["/cart", "Winkelwagen"]],
        body: products([["Frisdrankmaker", "99,99"], ["Scheerapparaat", "79,99"]], "In winkelwagen") + filler("Innovaties voor gezondheid en welzijn.") }),
      "/c/frisdrankmakers/latest": doc({ title: "Bekijk en vergelijk Frisdrankmakers-producten | Elektromerk", description: "Ontdek de Frisdrankmakers. Lees waarom deze Frisdrankmakers bij uw behoeften passen. Vergelijk, lees reviews en bestel online.", h1: ["Frisdrankmakers"], body: products([["Frisdrankmaker A", "99,99"], ["Frisdrankmaker B", "129,99"]], "In winkelwagen") }),
      "/c/accessoires/latest": doc({ title: "Bekijk en vergelijk Accessoires en vervangingen-producten | Elektromerk", description: "Ontdek de Accessoires en vervangingen. Vergelijk, lees reviews en bestel online.", h1: ["Accessoires"], body: products([["Opzetstuk", "19,99"], ["Filter", "14,99"]], "In winkelwagen") }),
      "/c/verzorging/latest": doc({ title: "Bekijk en vergelijk Verzorging-producten | Elektromerk", description: "Ontdek de Verzorging. Vergelijk, lees reviews en bestel online.", h1: ["Verzorging"], body: products([["Trimmer", "49,99"], ["Epilator", "69,99"]], "In winkelwagen") }),
    },
  },
  // Negative control: a real comparison site stays a publication.
  "vergelijkwijzer.test": {
    group: "comparison_control", expect: { sector: ["news_media", "unknown", "service_marketplace"] },
    pages: {
      "/": doc({ title: "Vergelijkwijzer | Vergelijk energie, internet en verzekeringen", description: "Onafhankelijk vergelijken: wij vergelijken aanbieders van energie, internet en verzekeringen en schrijven reviews.", h1: ["Vergelijk en bespaar"],
        nav: [["/energie", "Energie vergelijken"], ["/internet", "Internet vergelijken"], ["/reviews", "Reviews"]], body: filler("Onafhankelijke vergelijkingen en reviews van aanbieders.") }),
    },
  },
  // Optician chain with Product/Offer category pages and shop mentions: retail channel visible.
  "opticien-keten.test": {
    group: "optician_r2", expect: { sector: ["health_wellness"], key: ["optician"], channel: ["omnichannel"] },
    pages: {
      "/": doc({ title: "Keten Opticiens - Beste Opticien van Nederland | Keten Opticiens", description: "Een breed assortiment brillen, zonnebrillen en contactlenzen. Onze Opticiens staan garant voor deskundig advies en uitstekende kwaliteit tegen scherpe prijzen.", h1: [],
        nav: [["/brillen/op-sterkte", "Brillen"], ["/zonnebrillen/outlet", "Zonnebrillen"], ["/maak-afspraak", "Afspraak maken"], ["/winkels", "Winkels"], ["/over-ons", "Over ons"]],
        schema: [{ "@type": "OnlineStore", name: "Keten Opticiens", url: "https://__HOST__/" }], body: filler("Brillen, zonnebrillen en contactlenzen bij jouw opticien.") }),
      "/brillen/op-sterkte": doc({ title: "Bril op sterkte kopen? Bestel online bij | Keten Opticiens", description: "Met een bril op sterkte zie je alles weer scherp! Bestel online of kom langs in de winkel ✓ Gratis verzending v.a. €25 ✓ Gratis retour", h1: ["Brillen op sterkte"],
        schema: [{ "@type": "ItemList", itemListElement: [1, 2, 3].map((i) => ({ "@type": "ListItem", position: i, item: { "@type": "Product", name: `Montuur ${i}`, image: "https://__HOST__/m.jpg", offers: { "@type": "Offer", price: `${89 + i}.00`, priceCurrency: "EUR" } } })) }],
        body: [1, 2, 3, 4, 5, 6].map((i) => `<div class="product-card"><a href="/brillen/montuur-${i}-10${i}">Montuur ${i}</a><span class="price">€ ${89 + i},00</span></div>`).join("") }),
      "/zonnebrillen/outlet": doc({ title: "Zonnebrillen outlet | Shop jouw zonnebril met korting bij | Keten Opticiens", description: "Koop je zonnebril met flinke korting online of in onze winkels ✓ Gratis verzending v.a. €25", h1: ["Zonnebrillen outlet"],
        schema: [{ "@type": "ItemList", itemListElement: [1, 2, 3].map((i) => ({ "@type": "ListItem", position: i, item: { "@type": "Product", name: `Zonnebril ${i}`, image: "https://__HOST__/z.jpg", offers: { "@type": "Offer", price: `${49 + i}.00`, priceCurrency: "EUR" } } })) }],
        body: [1, 2, 3, 4, 5, 6].map((i) => `<div class="product-card"><a href="/zonnebrillen/zonnebril-${i}-20${i}">Zonnebril ${i}</a><span class="price">€ ${49 + i},00</span></div>`).join("") }),
      "/winkels": doc({ title: "Vind een winkel bij jou in de buurt | Keten Opticiens", description: "Meer dan 150 winkels in Nederland. Bekijk openingstijden en maak een afspraak.", h1: ["Winkels"] }),
      "/maak-afspraak": doc({ title: "Maak een afspraak voor een oogmeting | Keten Opticiens", description: "Zoek de dichtstbijzijnde winkel bij jou in de buurt en boek je afspraak online.", h1: ["Afspraak"] }),
      "/over-ons": doc({ title: "Over ons | Keten Opticiens", description: "Keten Opticiens is een opticienketen met winkels in heel Nederland.", h1: ["Over ons"] }),
    },
  },

  // Manufacturer that sells direct, rebuilt from the real page titles of the
  // field case (brand neutralised): own product categories with "Bekijk en
  // vergelijk", product registration, repair/exchange by model number,
  // professional/healthcare pages with MedicalDevice schema, own webshop.
  "huismerk-tech.test": {
    group: "manufacturer_r3", expect: { sector: ["manufacturing_industrial"], key: ["brand_manufacturer"], notSector: ["news_media"] },
    pages: {
      "/": doc({ title: "Huismerk - Nederland | Huismerk", description: "Lees meer over Huismerk en hoe wij helpen het leven van mensen te verbeteren met belangrijke innovaties op het gebied van gezondheidszorg, consumer lifestyle en verlichting.", h1: ["Meld je nu aan"],
        nav: [["/c-m-pe/scheerapparaten", "Scheerapparaten"], ["/c-m-ho/frisdrankmakers/latest", "Frisdrankmakers"], ["/c-m-pe/accessoires/latest", "Accessoires"], ["/c-s/support", "Ondersteuning"], ["/c-s/support/registreer-je-product", "Registreer je product"], ["/c-s/support/reparatie-en-ruilen", "Reparatie en ruilen"], ["/healthcare/beeldgeleide-therapie", "Healthcare"], ["/c-e/shop/best-sellers", "Bestsellers"], ["/cart", "Winkelwagen"]],
        body: products([["OneBlade", "39,99"], ["Frisdrankmaker", "99,99"]], "In winkelwagen") + `<a href="/checkout">Afrekenen</a>` + filler("Innovaties voor gezondheid, persoonlijke verzorging en het huishouden.") }),
      "/c-m-pe/scheerapparaten": doc({ title: "Scheerapparaten | Huismerk", description: "Vind veelgestelde vragen, gebruikershandleidingen en tips voor je scheerapparaat.", h1: ["Scheerapparaten"] }),
      "/c-m-ho/frisdrankmakers/latest": doc({ title: "Bekijk en vergelijk Frisdrankmakers-producten | Huismerk", description: "Ontdek de Frisdrankmakers. Lees waarom deze Frisdrankmakers bij uw behoeften passen. Vergelijk, lees reviews en bestel online.", h1: ["Frisdrankmakers"], body: products([["Frisdrankmaker A", "99,99"], ["Frisdrankmaker B", "129,99"]], "In winkelwagen") }),
      "/c-m-pe/accessoires/latest": doc({ title: "Bekijk en vergelijk Accessoires en vervangingen-producten | Huismerk", description: "Ontdek de Accessoires en vervangingen. Vergelijk, lees reviews en bestel online.", h1: ["Accessoires"], body: products([["Opzetstuk", "19,99"], ["Filter", "14,99"]], "In winkelwagen") }),
      "/c-s/support": doc({ title: "Huismerk klantenservice ondersteuning | Huismerk", description: "Zoek Huismerk-ondersteuningsartikelen op onderwerp of product en krijg de hulp die u nodig heeft.", h1: ["Ondersteuning"] }),
      "/c-s/support/registreer-je-product": doc({ title: "Productregistratie | Huismerk", description: "Als u een nieuwe aankoop wilt registreren, houd dan het product bij de hand en log in op uw account.", h1: ["Registreer je product"] }),
      "/c-s/support/reparatie-en-ruilen": doc({ title: "Reparatie of omruiling | Huismerk", description: "Voer het modelnummer of de productnaam in om oplossingen voor productproblemen te vinden.", h1: ["Reparatie of omruiling"] }),
      "/healthcare/beeldgeleide-therapie": doc({ title: "Beeldgeleide therapie - Huismerk", description: "Een geïntegreerd portfolio van interventionele beeldvormingssystemen, smart-apparaten en software.", h1: ["Beeldgeleide therapie"], schema: ["MedicalDevice"] }),
      "/c-e/shop/best-sellers": doc({ title: "Huismerk Bestsellers | Huismerk", description: "Huismerk best verkopende producten voor een gezondere levensstijl", h1: ["Bestsellers"], body: products([["OneBlade", "39,99"], ["Tandenborstel", "89,99"]], "In winkelwagen") }),
    },
  },
  // Negative control: a retailer that names itself a webshop and also offers
  // product registration for the brands it sells stays a retailer.
  "elektrowinkel.test": {
    group: "retailer_control_r3", expect: { sector: ["ecommerce"], notSector: ["manufacturing_industrial"] },
    pages: {
      "/": doc({ title: "Elektrowinkel | Dé webshop voor elektronica en witgoed", description: "Elektrowinkel is dé online winkel voor televisies, laptops en witgoed van alle grote merken. Voor 23:59 besteld, morgen in huis.", h1: ["Elektronica online kopen"],
        nav: [["/televisies", "Televisies"], ["/laptops", "Laptops"], ["/service/productregistratie", "Productregistratie"], ["/cart", "Winkelwagen"]],
        schema: [{ "@type": "OnlineStore", name: "Elektrowinkel", url: "https://__HOST__/" }],
        body: products([["Televisie 55 inch", "599,00"], ["Laptop 15 inch", "799,00"], ["Wasmachine", "549,00"]], "In winkelwagen") + `<a href="/checkout">Afrekenen</a>` }),
      "/televisies": doc({ title: "Televisies kopen | Elektrowinkel", description: "Bekijk ons assortiment televisies van alle merken.", h1: ["Televisies"], body: products([["TV A", "599,00"], ["TV B", "699,00"]], "In winkelwagen") }),
      "/service/productregistratie": doc({ title: "Productregistratie | Elektrowinkel", description: "Registreer je product voor de garantie van de fabrikant.", h1: ["Productregistratie"] }),
    },
  },

  // Same manufacturer pattern WITHOUT a registration page in the sample:
  // repair/exchange by model number + user manuals on own pages.
  "huismerk-zonder-registratie.test": {
    group: "manufacturer_r3", expect: { sector: ["manufacturing_industrial"], key: ["brand_manufacturer"] },
    pages: {
      "/": doc({ title: "Huismerk Twee - Nederland | Huismerk Twee", description: "Huismerk Twee ontwikkelt innovaties voor persoonlijke verzorging en het huishouden.", h1: ["Meld je nu aan"],
        nav: [["/c-m-ho/frisdrankmakers/latest", "Frisdrankmakers"], ["/c-s/support/reparatie-en-ruilen", "Reparatie en ruilen"], ["/c-m-pe/scheerapparaten", "Scheerapparaten"], ["/cart", "Winkelwagen"]],
        body: products([["Scheerapparaat", "79,99"], ["Frisdrankmaker", "99,99"]], "In winkelwagen") + `<a href="/checkout">Afrekenen</a>` }),
      "/c-m-ho/frisdrankmakers/latest": doc({ title: "Bekijk en vergelijk Frisdrankmakers-producten | Huismerk Twee", description: "Vergelijk, lees reviews en bestel online.", h1: ["Frisdrankmakers"], body: products([["A", "99,99"], ["B", "129,99"]], "In winkelwagen") }),
      "/c-s/support/reparatie-en-ruilen": doc({ title: "Reparatie of omruiling | Huismerk Twee", description: "Voer het modelnummer of de productnaam in om oplossingen voor productproblemen te vinden.", h1: ["Reparatie of omruiling"] }),
      "/c-m-pe/scheerapparaten": doc({ title: "Scheerapparaten | Huismerk Twee", description: "Vind veelgestelde vragen, gebruikershandleidingen en tips voor je scheerapparaat.", h1: ["Scheerapparaten"] }),
    },
  },
  // Negative control: a retailer with a manuals page and a repair page, which
  // calls itself a webshop, stays a retailer.
  "witgoedshop.test": {
    group: "retailer_control_r3", expect: { sector: ["ecommerce"], notSector: ["manufacturing_industrial"] },
    pages: {
      "/": doc({ title: "Witgoedshop | Webshop voor wasmachines en koelkasten", description: "Witgoedshop is een webshop voor witgoed van alle merken. Online bestellen, gratis bezorgd.", h1: ["Witgoed online kopen"],
        nav: [["/wasmachines", "Wasmachines"], ["/service/handleidingen", "Handleidingen"], ["/service/reparatie", "Reparatie"], ["/cart", "Winkelwagen"]],
        body: products([["Wasmachine", "549,00"], ["Koelkast", "699,00"]], "In winkelwagen") + `<a href="/checkout">Afrekenen</a>` }),
      "/wasmachines": doc({ title: "Wasmachines kopen | Witgoedshop", description: "Wasmachines van alle merken.", h1: ["Wasmachines"], body: products([["W1", "549,00"], ["W2", "649,00"]], "In winkelwagen") }),
      "/service/handleidingen": doc({ title: "Handleidingen | Witgoedshop", description: "Download gebruikershandleidingen van alle merken op modelnummer.", h1: ["Handleidingen"] }),
      "/service/reparatie": doc({ title: "Reparatie of omruiling | Witgoedshop", description: "Laat je apparaat repareren via onze reparatieservice.", h1: ["Reparatie"] }),
    },
  },

  // DIY store chain (field titles of run 7a2155c, brand neutralised), NL and FR.
  "klusmarkt.test": {
    group: "diy_store_r4", expect: { sector: ["ecommerce"], notSector: ["unknown"] },
    pages: {
      "/": doc({ title: "Klusmarkt.be | De grootste doe-het-zelf winkels van België", description: "Alles voor je klus: gereedschap, bouwmaterialen, tuin en verf. Bestel online of haal af in een van onze winkels.", h1: [],
        nav: [["/gereedschap", "Gereedschap"], ["/bouwmaterialen", "Bouwmaterialen"], ["/tuin", "Tuin"], ["/verf", "Verf"], ["/winkels", "Winkels"], ["/cart", "Winkelmandje"]],
        body: products([["Boormachine", "79,99"], ["Verfroller", "6,99"], ["Tuinslang", "24,99"]], "In winkelmandje") + `<a href="/checkout">Afrekenen</a>` }),
      "/gereedschap": doc({ title: "Gereedschap kopen | Klusmarkt.be", description: "Boormachines, zagen en handgereedschap.", h1: ["Gereedschap"], body: products([["Boormachine", "79,99"], ["Zaag", "19,99"]], "In winkelmandje") }),
      "/winkels": doc({ title: "Onze winkels | Klusmarkt.be", description: "Vind een Klusmarkt-winkel bij jou in de buurt.", h1: ["Winkels"] }),
    },
  },
  "bricomarche-fr.test": {
    group: "diy_store_r4", expect: { sector: ["ecommerce"], notSector: ["unknown"] },
    pages: {
      "/": doc({ lang: "fr", title: "Bricomarque.be | Plus grands magasins de bricolage en Belgique", description: "Outillage, matériaux, jardin et peinture. Commandez en ligne ou retirez dans l'un de nos magasins.", h1: [],
        nav: [["/outillage", "Outillage"], ["/materiaux", "Matériaux"], ["/jardin", "Jardin"], ["/magasins", "Magasins"], ["/panier", "Panier"]],
        body: products([["Perceuse", "79,99"], ["Rouleau", "6,99"], ["Tuyau", "24,99"]], "Ajouter au panier") + `<a href="/checkout">Commander</a>` }),
      "/outillage": doc({ lang: "fr", title: "Outillage | Bricomarque.be", description: "Perceuses, scies et outils à main.", h1: ["Outillage"], body: products([["Perceuse", "79,99"], ["Scie", "19,99"]], "Ajouter au panier") }),
    },
  },
  // Negative control: software FOR DIY stores is not a DIY store.
  "kassasoft-diy.test": {
    group: "saas_control_r4", expect: { notSector: ["ecommerce"] },
    pages: {
      "/": doc({ title: "KassaSoft | Kassasoftware voor bouwmarkten en doe-het-zelf winkels", description: "Kassasysteem en voorraadbeheer voor doe-het-zelf winkels en bouwmarkten. Vraag een demo aan.", h1: ["Software voor bouwmarkten"],
        nav: [["/functies", "Functies"], ["/prijzen", "Prijzen"], ["/demo", "Demo aanvragen"]], body: filler("Kassasoftware, voorraadbeheer en rapportages voor retailers.") }),
    },
  },

  // ───── QA international-28 (TestLab @ 3d9239aa, 25 Oct): own self-description in
  // the site's language was not recognised → "unknown" with 88–99 scores. Neutral
  // invented texts per class; never a real site text, brand or domain rule.
  "maeglerhus.test": {
    group: "intl28_real_estate_da", expect: { sector: ["real_estate"] },
    pages: {
      "/": doc({ lang: "da", title: "Mæglerhus | Ejendomsmægler i hele Danmark", description: "Vi er ejendomsmæglere og hjælper dig med at sælge din bolig. Find boliger til salg nær dig.", h1: ["Find din næste bolig"],
        nav: [["/boliger-til-salg", "Boliger til salg"], ["/salgsvurdering", "Gratis salgsvurdering"], ["/butikker", "Find butik"]], body: filler("Boliger til salg, salgsvurdering og rådgivning om køb og salg af bolig.") }),
      "/boliger-til-salg": doc({ lang: "da", title: "Boliger til salg | Mæglerhus", description: "Se alle boliger til salg hos vores ejendomsmæglere.", h1: ["Boliger til salg"] }),
    },
  },
  "valitys.test": {
    group: "intl28_real_estate_fi", expect: { sector: ["real_estate"] },
    pages: {
      "/": doc({ lang: "fi", title: "Välitys | Kiinteistönvälitys ja asunnot myynnissä", description: "Olemme kiinteistönvälittäjä. Löydä myytävät asunnot ja myy asuntosi kanssamme.", h1: ["Myytävät asunnot"],
        nav: [["/asunnot", "Asunnot"], ["/myy", "Myy asuntosi"], ["/toimistot", "Toimistot"]], body: filler("Myytävät asunnot, arvio ja asuntokauppa.") }),
    },
  },
  "agenzia-casa.test": {
    group: "intl28_real_estate_it", expect: { sector: ["real_estate"] },
    pages: {
      "/": doc({ lang: "it", title: "Agenzia Casa | Agenzia immobiliare: case in vendita e in affitto", description: "Siamo una rete di agenzie immobiliari: compra, vendi o affitta casa con noi.", h1: ["Case in vendita"],
        nav: [["/vendita", "Vendita"], ["/affitto", "Affitto"], ["/agenzie", "Agenzie"]], body: filler("Case in vendita e in affitto, valutazione gratuita della tua casa.") }),
    },
  },
  "hypotheek-advies.test": {
    group: "intl28_mortgage_nl", expect: { sector: ["financial_services"], notSector: ["unknown"] },
    pages: {
      "/": doc({ title: "Hypotheekadvies | Onafhankelijk hypotheekadvies bij jou in de buurt", description: "Wij zijn hypotheekadviseurs en vergelijken hypotheken van meer dan 30 geldverstrekkers voor jouw woning.", h1: ["Jouw hypotheek, goed geregeld"],
        nav: [["/hypotheek-berekenen", "Hypotheek berekenen"], ["/rente", "Actuele rente"], ["/vestigingen", "Vestigingen"]], body: filler("Bereken je maximale hypotheek, bekijk de actuele rente en maak een afspraak met een adviseur.") }),
    },
  },
  "rede-saude.test": {
    group: "intl28_hospital_pt", expect: { sector: ["health_wellness"] },
    pages: {
      "/": doc({ lang: "pt", title: "Rede Saúde | Hospitais e clínicas privadas", description: "Somos uma rede de hospitais e clínicas privadas em Portugal. Marque a sua consulta online.", h1: ["Marque a sua consulta"],
        nav: [["/especialidades", "Especialidades"], ["/medicos", "Médicos"], ["/hospitais", "Hospitais e clínicas"], ["/urgencia", "Urgência"]], body: filler("Especialidades, médicos, exames e urgência em todos os nossos hospitais.") }),
    },
  },
  "hosting-dominio.test": {
    group: "intl28_hosting_it", expect: { sector: ["saas_b2b"] },
    pages: {
      "/": doc({ lang: "it", title: "Hosting Dominio | Hosting, domini e server cloud", description: "Siamo un provider di hosting: registra il tuo dominio, hosting web, PEC, server e cloud.", h1: ["Il tuo sito online"],
        nav: [["/domini", "Domini"], ["/hosting", "Hosting"], ["/cloud", "Cloud"], ["/pec", "PEC"]], body: filler("Registrazione domini, hosting WordPress, server dedicati e cloud.") }),
    },
  },
  "baugruppe.test": {
    group: "intl28_construction_ch", expect: { sector: ["manufacturing_industrial"], notSector: ["home_services"] },
    pages: {
      "/": doc({ lang: "de", title: "Baugruppe | Bau- und Immobiliendienstleister", description: "Wir sind ein Baukonzern und planen, bauen und modernisieren Gebäude, Tunnel, Brücken und Infrastruktur.", h1: ["Wir bauen Lebensräume"],
        nav: [["/hochbau", "Hochbau"], ["/tiefbau", "Tiefbau"], ["/projekte", "Projekte"], ["/investoren", "Investoren"]], body: filler("Infrastrukturprojekte, Tunnelbau und Großprojekte in der Schweiz und Deutschland.") }),
    },
  },
  "faa-tilbud.test": {
    group: "intl28_marketplace_no", expect: { sector: ["service_marketplace"] },
    pages: {
      "/": doc({ lang: "nb", title: "Få Tilbud | Få tilbud fra håndverkere", description: "Legg ut jobben gratis og få tilbud fra kvalifiserte håndverkere i hele Norge.", h1: ["Hva skal du få gjort?"],
        nav: [["/legg-ut", "Legg ut jobb"], ["/handverkere", "Finn håndverkere"], ["/slik-fungerer-det", "Slik fungerer det"]], body: filler("Beskriv jobben, motta tilbud og sammenlign anmeldelser av håndverkere.") }),
    },
  },
  // Negative controls for the new classes.
  "bauunternehmen-meier.test": {
    group: "intl28_control_local_builder", expect: { notSector: ["manufacturing_industrial"] },
    pages: {
      "/": doc({ lang: "de", title: "Bauunternehmen Meier | Hausbau in der Region", description: "Wir sind ein Bauunternehmen für Einfamilienhäuser, Umbau und Renovierung.", h1: ["Ihr Haus aus einer Hand"],
        nav: [["/leistungen", "Leistungen"], ["/referenzen", "Referenzen"], ["/kontakt", "Kontakt"]], body: filler("Neubau, Umbau und Renovierung von Einfamilienhäusern.") }),
    },
  },
  "webbureau-pixel.test": {
    group: "intl28_control_agency_hosting", expect: { notSector: ["saas_b2b"] },
    pages: {
      "/": doc({ title: "Webbureau Pixel | Webdesign en hosting", description: "Wij maken websites en verzorgen hosting, domeinnamen en e-mail voor ondernemers.", h1: ["Websites die werken"],
        nav: [["/webdesign", "Webdesign"], ["/hosting", "Hosting"], ["/portfolio", "Portfolio"]], body: filler("Webdesign, webshops en onderhoud voor mkb.") }),
    },
  },
  "timmer-hansen.test": {
    group: "intl28_control_contractor_no", expect: { notSector: ["service_marketplace"] },
    pages: {
      "/": doc({ lang: "nb", title: "Tømrer Hansen | Få tilbud", description: "Få et gratis tilbud fra våre håndverkere i Oslo.", h1: ["Tømrer i Oslo"],
        nav: [["/tjenester", "Tjenester"], ["/kontakt", "Kontakt"]], body: filler("Vi bygger terrasser, kjøkken og bad.") }),
    },
  },
  "epd-zorg.test": {
    group: "intl28_control_hospital_software", expect: { notSector: ["health_wellness"] },
    pages: {
      "/": doc({ title: "EPD Zorg | Ziekenhuissoftware", description: "Software voor ziekenhuizen en klinieken: afspraken, patiëntendossier en planning.", h1: ["Het EPD voor de zorg"],
        nav: [["/functies", "Functies"], ["/demo", "Demo aanvragen"], ["/prijzen", "Prijzen"]], body: filler("Planning, dossier en koppelingen voor zorginstellingen.") }),
    },
  },

  // ───── QA international-28 round 2 (TestLab @ f6ebd201, laptop page check, 25 Oct):
  // the six remaining "unknown" classes, neutral invented texts.
  // Streaming SSR: title in head, meta description emitted in the body.
  "reformas-hogar.test": {
    group: "intl28b_marketplace_body_meta", expect: { sector: ["service_marketplace"] },
    pages: {
      "/": doc({ lang: "es", title: "Reformas Hogar - Reformas y Servicios para el Hogar", h1: ["Encuentra profesionales recomendados cerca de ti"],
        nav: [["/directorio", "Directorio de profesionales"], ["/reformas", "Reformas"], ["/precios", "Guía de precios"]],
        body: `<meta name="description" content="Contrata profesionales de confianza para reformar tu hogar y pide presupuesto gratis."/>` + filler("Cuéntanos qué necesitas y contacta gratis con pintores, carpinteros y empresas de reformas.") }),
    },
  },
  // Hosting provider whose title is only "Home | brand" and that has no description or H1.
  "hostitalia.test": {
    group: "intl28b_hosting_nav_only", expect: { sector: ["saas_b2b"] },
    pages: {
      "/": doc({ lang: "it", title: "Home | Hostitalia.it", h2: ["HOSTING e DOMINI", "PEC e TRUST SERVICES", "CLOUD E SERVER DEDICATI", "CERTIFICATI SSL"],
        nav: [["/hosting", "Hosting"], ["/domini", "Domini"], ["/server", "Server"], ["/cloud", "Cloud"], ["/ssl", "SSL"], ["/supporto", "Supporto"]], body: filler("Soluzioni digitali per la tua attività.") }),
    },
  },
  "annunci-casa.test": {
    group: "intl28b_listing_portal_it", expect: { sector: ["real_estate"] },
    pages: {
      "/": doc({ lang: "it", title: "Annunci case e appartamenti in vendita e in affitto - Casaportale.it", description: "Oltre 100.000 annunci di appartamenti, case e immobili in vendita e in affitto.", body: filler("Cerca tra migliaia di annunci di case e appartamenti.") }),
    },
  },
  "rdv-sante.test": {
    group: "intl28b_booking_fr", expect: { sector: ["health_wellness"] },
    pages: {
      "/": doc({ lang: "fr", title: "RdvSanté : Prenez rendez-vous en ligne chez un soignant", description: "Trouvez rapidement un spécialiste près de chez vous et prenez rendez-vous gratuitement en ligne.", body: filler("Médecins, dentistes et kinés disponibles en ligne.") }),
    },
  },
  "bauholding.test": {
    group: "intl28b_construction_noun_forms", expect: { sector: ["manufacturing_industrial"] },
    pages: {
      "/": doc({ lang: "de", title: "Bauholding – Bauunternehmer & Immobiliendienstleisterin", description: "Als führende Bau- und Immobiliendienstleisterin entwickelt und realisiert Bauholding Lebensräume, Arbeitswelten und Infrastruktur.", h1: ["Bauholding — Schweiz"], body: filler("Hochbau, Tiefbau und Infrastrukturprojekte.") }),
    },
  },
  "finn-fagfolk.test": {
    group: "intl28b_marketplace_no", expect: { sector: ["service_marketplace"] },
    pages: {
      "/": doc({ lang: "nb", title: "Fagportal - Den enkleste måten å finne fagfolk på", description: "Har du en jobb du vil få utført? Legg ut jobben og bli kontaktet av flere håndverkere i ditt nærområde!", h1: ["Hva trenger du hjelp med?"], body: filler("Slik fungerer det: legg ut jobben, få svar og velg håndverker.") }),
    },
  },
  // Control: a web agency whose navigation lists hosting, domains and servers.
  "webstudio-nav.test": {
    group: "intl28b_control_agency_nav", expect: { notSector: ["saas_b2b"] },
    pages: {
      "/": doc({ title: "Home | Webstudio", h2: ["Webdesign", "Hosting en domeinen", "Servers en onderhoud"],
        nav: [["/webdesign", "Webdesign"], ["/hosting", "Hosting"], ["/domeinen", "Domeinen"], ["/server", "Server"]], body: filler("Wij maken websites voor ondernemers.") }),
    },
  },

  // ───── Car body / collision repair (owner report 25 Oct: NL body-repair chain "unknown").
  "schadeketen.test": {
    group: "car_body_repair_nl", expect: { sector: ["automotive"], key: ["car_repair"] },
    pages: {
      "/": doc({ title: "Schadeketen Autoherstel. Eind goed. Al goed.", description: "Schadeketen Autoherstel is een van de grootste schadeherstelketens van Nederland, en altijd een vestiging bij u in de buurt!", h1: ["Schadeketen Autoherstel. Eind goed. Al goed."],
        nav: [["/schadeherstel/autoschade", "Autoschade"], ["/schadeherstel/ruitschade", "Ruitschade"], ["/specialisme/uitdeuken", "Uitdeuken"], ["/vestigingen", "Vestigingen"]], body: filler("Autoschade, ruitschade en lakschade vakkundig hersteld, met garantie.") }),
      "/schadeherstel/autoschade": doc({ title: "Autoschade snel en vakkundig laten herstellen – Schadeketen", description: "Laat uw autoschade herstellen door onze schadeherstelbedrijven, met garantie.", h1: ["Autoschade herstellen"] }),
      "/schadeherstel/ruitschade": doc({ title: "Autoruitschade snel en goed laten herstellen – Schadeketen", description: "Autoruitschade? Wij herstellen of vervangen uw autoruit.", h1: ["Ruitschade"] }),
    },
  },
  "karosserie-beispiel.test": {
    group: "car_body_repair_de", expect: { sector: ["automotive"] },
    pages: { "/": doc({ lang: "de", title: "Karosseriewerkstatt Beispiel | Unfallinstandsetzung und Lackierung", description: "Wir sind Ihr Karosseriefachbetrieb: Unfallschäden, Lackierung, Dellen und Versicherungsabwicklung.", h1: ["Karosserie & Lack"], body: filler("Unfallinstandsetzung, Smart Repair und Lackierung.") }) },
  },
  // Control: property damage repair ("schadeherstel" without vehicles) is not automotive.
  "woningherstel.test": {
    group: "control_property_damage", expect: { notSector: ["automotive"] },
    pages: { "/": doc({ title: "Woningherstel | Schadeherstel na brand en water", description: "Wij zijn specialist in schadeherstel na brand- en waterschade in uw woning of bedrijfspand.", h1: ["Schadeherstel"], body: filler("Brandschade, waterschade en inbraakschade herstellen.") }) },
  },
};
