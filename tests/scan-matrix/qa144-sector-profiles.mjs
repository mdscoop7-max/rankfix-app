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
};
