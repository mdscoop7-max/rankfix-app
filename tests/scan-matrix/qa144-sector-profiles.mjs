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
};
