/**
 * Multilingual primary-identity evidence for the Sector Motor (RankFix 3.1).
 *
 * Why this exists (QA issue #151, EU-81 round): the older identity rules were
 * written in Dutch and English with a few German/French words. Broadcasters,
 * banks, universities, carriers and public portals in the other EU languages
 * therefore had NO recognised identity, and the engine filled the gap with
 * whatever capability it did see (ticket sales, a voucher shop, a "transport"
 * subpage) at 88-96% confidence.
 *
 * Rules here are generic and language-based. There are no brand, domain or
 * country exceptions; a hostname is only read for its structural government
 * label (gov., gouv., gob., gv. ...), never for a brand.
 *
 * Evidence tiers
 *  - "high":   the organisation names itself in title / description / H1 /
 *              og:site_name, or declares a matching schema.org type, with at
 *              least two independent sources (or a typed schema).
 *  - "medium": only the navigation and section headings describe one activity
 *              repeatedly (for homepages that say little more than the brand).
 *  Anything weaker returns null: the caller must abstain ("niet bevestigd").
 */

export type EuSector =
  | "news_media" | "financial_services" | "transport_travel" | "government"
  | "education" | "health_wellness" | "telecom_technology" | "energy_utilities" | "events_culture";

export type EuIdentity = {
  sector: EuSector;
  key: string;
  label: string;
  confidence: "high" | "medium";
  confidenceScore: number;
  evidence: string[];
};

export type EuIdentityInput = {
  title?: string;
  description?: string;
  h1s?: string[];
  h2s?: string[];
  ogSiteName?: string;
  navLabels?: string[];
  schemaTypes?: string[];
  hostname?: string;
  homepage?: boolean;
};

// Unicode-aware word boundaries: \b does not work for "Notícias" or "Zprávy".
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}])";
/** Whole words (any inflection is listed explicitly). */
function words(list: string[]): RegExp {
  return new RegExp(`${B}(?:${list.join("|")})${E}`, "iu");
}
/** Word stems: must start a word, may continue with letters ("univerzit" → univerzita, univerzity). */
function stems(list: string[]): RegExp {
  return new RegExp(`${B}(?:${list.join("|")})\\p{L}*`, "iu");
}
function any(...res: RegExp[]) {
  return (text: string) => res.some((re) => re.test(text));
}

// ---------------------------------------------------------------- news/media
// "news" in the EU languages (plus Luxembourgish, Irish, Maltese).
const NEWS = stems([
  "nieuws", "news", "nachricht", "actualit", "notizi", "notici", "notíci", "nyhet", "nyhed",
  "uutis", "uudis", "ziņ", "naujien", "wiadomoś", "zpráv", "správ", "hírek", "hírad", "știr",
  "ειδήσ", "новин", "vijest", "novic", "aħbar", "noriicht", "nuacht", "infos", "tagesschau",
]);
// Self-described publishers, broadcasters and editorial offices.
const PUBLISHER = stems([
  "omroep", "broadcast", "rundfunk", "journal", "dagblad", "krant", "newspaper", "zeitung", "giornal",
  "periódic", "periodic", "jornal", "tidning", "dagblad", "sanomaleh", "ajaleh", "laikrakst", "laikraš",
  "gazet", "noviny", "noviny", "újság", "ziar", "εφημερίδ", "вестник", "novine", "časopis", "redaktion",
  "rédaction", "redazion", "redacci", "redakcj", "redakc", "redaktioun", "toimitu", "medielandschaft",
  "infoportal", "nachrichtenportal", "noriichteportal", "nyhetsportal", "persbureau", "presseagentur", "agence de presse",
]);
// Broadcaster = television AND radio named together (any language, any order).
const TELEVISION = stems(["televis", "televiz", "televíz", "televīz", "telewiz", "télévis", "fernseh", "τηλεόρασ", "телевиз", "tv"]);
const RADIO = stems(["radio", "rádio", "rádió", "rozhlas", "radij", "ράδιο", "радио", "rundfunk", "raadio", "radijas"]);

// ---------------------------------------------------------------- finance
// Distinct banking concepts. A bank's own identity names several of them; a
// shop that offers "financing" or "gift cards" names one at most.
const BANK_CONCEPTS: Array<[string, RegExp]> = [
  ["accounts", stems(["bankrekening", "betaalrekening", "spaarrekening", "girokonto", "sparkonto", "bankkonto", "konto", "compte bancaire", "compte courant", "conto corrente", "conti corrent", "cuenta corriente", "cuentas", "conta corrente", "cont curent", "cont online", "conturi", "rachun", "pankkitili", "účet", "účt", "számla", "λογαριασμ", "сметк", "račun", "bank account", "current account", "savings account"])],
  ["loans", stems(["mutuo", "mutui", "hypothe", "hypoth", "ipotec", "mortgage", "kredit", "credit", "crédit", "crédito", "credite", "crediti", "lening", "darlehen", "prestit", "préstam", "empréstim", "lån", "laina", "laen", "aizdev", "paskol", "kredyt", "pożycz", "úvěr", "úver", "hitel", "kölcsön", "δάνει", "кредит", "zajam", "posojil", "imobiliar"])],
  ["cards", stems(["creditcard", "credit card", "debit card", "carte bancaire", "carta di credito", "tarjeta", "cartão", "carduri", "card de credit", "kreditkarte", "debitkarte", "kreditkort", "luottokort", "pangakaart", "kredītkart", "kredito kortel", "pankkikort", "karta kredyt", "platební kart", "platobn", "bankkártya", "κάρτ", "карт"])],
  ["savings", stems(["sparen", "spaar", "epargne", "épargne", "risparm", "ahorro", "poupan", "economii", "säästö", "hoius", "sparande", "opsparing", "uzkrāj", "taupym", "oszczędz", "spoř", "megtakar", "αποταμίευσ", "спестяв", "štednj", "varčev", "depozit", "deposit", "termijndeposito", "festgeld"])],
  ["investing", stems(["beleggen", "beleggingen", "investment", "investiț", "investiti", "investimen", "inversi", "sijoit", "investeer", "investēš", "investic", "befektet", "επενδύσ", "инвестиц", "ulaganj", "naložb", "vermogensbeheer", "wealth management", "private banking"])],
  ["banking", stems(["bankieren", "banking", "bancar", "bancair", "bancari", "bancária", "bankowoś", "bankovn", "banki szolg", "τραπεζ", "банков", "bankovn", "bančn", "pankkipalvel", "pangateenus", "banku pakalpoj", "bankininkyst", "bankowość", "operatiuni bancare", "operațiuni bancare"])],
];
// The institution names itself a bank (any EU language). Counts as one concept;
// a bank still needs two more (accounts, loans, cards...). Dutch "bank" = sofa,
// which the retail veto and the 3-concept rule keep out.
BANK_CONCEPTS.push(["institution", words(["bank", "banka", "bankas", "banca", "banco", "banque", "banken", "pankki", "pank", "sparkasse", "sparbanken", "sparekasse", "sparebank", "raiffeisenbank", "volksbank", "τράπεζα", "банка"])]);
const INSURANCE = stems([
  "verzeker", "versicher", "assuranc", "assicura", "seguro", "forsikr", "försäkr", "vakuut", "kindlust",
  "apdrošin", "draudim", "ubezpiecz", "pojišť", "pojist", "poisten", "poistn", "biztosít", "asigur", "ασφαλισ", "ασφάλισ",
  "застрахов", "osiguran", "zavarovan", "insurance", "insurer",
]);
const FINANCE_SCHEMA = new Set(["bankorcreditunion", "financialservice", "financialproduct", "loanorcredit", "bankaccount", "depositaccount", "mortgageloan", "paymentcard", "creditcard", "investmentorDeposit".toLowerCase()]);

// ---------------------------------------------------------------- transport
const AIR_WORDS = words(["loty", "lotów", "lety", "letenky", "lennud", "lidojumi", "skrydžiai", "flyrejser", "flyg", "lentoja"]);
const AIR_STEMS = stems(["flight", "flug", "vols ", "voli ", "vuelo", "voos", "vlucht", "lentoliput", "lennot", "lennu", "lidojum", "skrydž", "skryd", "loty ", "letenk", "repülőj", "zbor", "πτήσ", "полет", "airline", "luchtvaart", "fluggesellschaft", "compagnie aérienne", "compagnia aerea", "aerolínea", "companhia aérea", "flygbolag", "lentoyhti", "aviokompan", "linie lotnicze", "letecká", "légitársas"]);
const AIR = { test: (s: string) => AIR_STEMS.test(s) || AIR_WORDS.test(s) };
const RAIL_STEMS = stems(["junaliput", "junien", "railway", "rail ", "spoorweg", "trein", "bahn", "treno", "trenitalia", "comboio", "vilcien", "traukin", "pociąg", "koleje", "vonat", "vasút", "τρέν", "σιδηρόδρομ", "влак", "железниц", "željezn", "železn", "dráhy", "ferrovi", "chemin de fer", "nightjet", "intercity"]);
const RAIL_WORDS = words(["rail", "rails", "zug", "züge", "train", "trains", "tren", "trenes", "trenuri", "tåg", "tog", "juna", "junat", "rong", "rongid", "vlak", "vlaky", "vlakov", "sncf", "cfr"]);
const RAIL = { test: (s: string) => RAIL_STEMS.test(s) || RAIL_WORDS.test(s) };
const BUS = words(["bus", "buses", "autobus", "autobuses", "autocarro", "linja-auto", "buss", "bussid", "autobusai", "autobusy", "busz", "λεωφορεί", "автобус", "public transport", "openbaar vervoer", "joukkoliikenne", "bussit", "bussien", "öffentlicher verkehr", "nahverkehr", "trasporto pubblico", "transporte público", "kollektivtrafik", "julkinen liikenne", "ühistransport", "sabiedriskais transports", "viešasis transportas", "transport publiczny", "veřejná doprava", "tömegközlekedés", "transport public", "ferry", "ferries", "fähre", "veerboot"]);
const FERRY = stems(["traghett", "ferri", "ferry", "fähr", "veerdienst", "färj", "færge", "ferje", "lautta", "praam", "keltuv", "trajekt", "ferribot", "πλοί", "фериб"]);
const TICKETS = stems(["liput", "lipun", "ticket", "billet", "bigliett", "billete", "bilhete", "biljett", "biljet", "lippu", "lipu", "pilet", "biļet", "bilieta", "bilet", "jízdenk", "lístok", "lístk", "jegy", "εισιτήρ", "билет", "karta", "karte", "fahrkart", "vozovnic", "vozni"]);
const TIMETABLE = stems(["fahrplan", "timetable", "dienstregeling", "orari", "horario", "horário", "tidtabell", "køreplan", "aikataul", "sõiduplaan", "kustības saraksts", "tvarkarašt", "rozkład jazdy", "jízdní řád", "cestovný poriadok", "menetrend", "mersul", "δρομολόγ", "разписание", "vozni red", "departures", "abfahrt", "vertrek"]);
const JOURNEY = stems(["reise", "reiz", "travel", "voyage", "viaggi", "viaje", "viagem", "resa", "rejse", "reise", "matka", "reis", "ceļojum", "kelion", "podróż", "cest", "utaz", "călători", "ταξίδ", "пътуван", "putovan", "potovan", "fahrt", "journey", "trips ", "check in", "check-in", "boarding", "destinations", "destinazioni", "destinos"]);
const FARES = stems(["ermäßig", "fares", "fare ", "tarif", "sparschien", "vorteilscard", "railcard", "season ticket", "zeitkart", "abonnement de transport", "klimaticket", "verbund"]);
// Postal operators: postal-specific concepts plus parcel/shipping concepts.
const POSTAL_SPECIFIC = any(
  stems(["postzegel", "briefmarke", "timbre", "francobol", "sello", "selo", "frimærk", "frimerk", "frimärk", "postimerk", "postmark", "pastmark", "pašto ženkl", "znaczk", "známk", "bélyeg", "timbr", "γραμματόσ", "пощенск", "poštansk", "znamk"]),
  stems(["aangeteken", "einschreib", "recommandé", "raccomandat", "certificad", "registered mail", "rekommend", "kirjatt", "tähitud", "ierakstīt", "registruot", "polecon", "doporučen", "ajánlott", "recomandat"]),
  stems(["postcode", "postleitzahl", "code postal", "codice postale", "código postal", "postnummer", "postinumer", "sihtnumb", "pasta indeks", "pašto kod", "kod pocztow", "psč", "irányítószám", "cod poștal", "ταχυδρομικός κώδικ"]),
  stems(["postkantoor", "postamt", "postfiliale", "bureau de poste", "ufficio postale", "oficina de correos", "estação de correios", "postkontor", "posti", "postkontor", "pasta nodaļ", "pašto skyr", "urząd pocztow", "pošt", "posta ", "postă", "ταχυδρομ", "поща", "pošta", "poczt", "correos", "correios", "poste ", "post- en", "post- und", "post en pak"]),
);
const PARCEL = stems(["pakje", "pakket", "paket", "parcel", "colis", "pacco", "pacchi", "paquet", "encomenda", "pakk", "sūtīj", "siunt", "paczk", "balík", "balík", "csomag", "colet", "δέμα", "колет", "verzend", "versand", "envoi", "spedizion", "envío", "envio", "forsendels", "försänd", "lähety", "saadetis", "sūtīšan", "wysyłk", "zásilk", "küldemény", "expedier", "αποστολ", "пратк", "pošiljk", "brief versturen", "brief verzenden", "lettre", "letters"]);

// Freight transport and logistics companies.
const FREIGHT = stems([
  "transportbedrijf", "transportonderneming", "vervoer", "vrachtvervoer", "goederenvervoer", "wegtransport", "logistiek", "logistics", "logistik", "logistique", "logistica", "logística",
  "freight", "spedition", "fracht", "güterverkehr", "transport de marchandises", "fret", "trasporto merci", "trasporti", "autotrasport", "transporte de mercancías", "transporte por carretera", "transporte de mercadorias",
  "godstransport", "vognmand", "åkeri", "kuljetus", "rahtiliikenne", "veod", "kaubaveo", "kravu pārvadāj", "krovinių", "spedycj", "transport drogow", "přeprav", "nákladní doprav", "preprav", "szállítmányoz", "fuvaroz",
  "transport rutier", "transport marfă", "μεταφορ", "превоз на товари", "prijevoz robe", "prevoz blaga", "road haulage", "haulage", "forwarding", "expeditie",
]);
const FREIGHT_SUPPORT = stems(["groupage", "volle vracht", "vrachten", "full truck", "ftl", "ltl", "pallet", "palett", "warehous", "opslag", "lager", "entrepôt", "magazzin", "almacén", "armazém", "lagerhotel", "varasto", "ladu", "noliktav", "sandėl", "magazyn", "sklad", "raktár", "depozit", "αποθήκ", "склад", "douane", "zoll", "customs", "dogan", "aduana", "alfândega", "distributie", "distribution", "supply chain", "geconditioneerd", "koel", "gekoeld", "refrigerated", "kühl", "frigo", "container"]);

// ---------------------------------------------------------------- government
const GOV_HOST_LABEL = /^(?:gov|gouv|gob|gv|govern|government|overheid|rijksoverheid|bund|admin|vlada|valdzia|kormany|gobierno|governo|regeringen|regeringen|stjornarradid)$/i;
const GOV_TERMS = stems([
  "veřejné správ", "verejnej správ", "public administration", "administration publique", "pubblica amministrazion", "administración pública", "administração pública",
  "offentlig forvaltning", "offentlig förvaltning", "julkishallin", "avaliku halduse", "valsts pārvald", "viešojo administr", "administracji publicznej", "administracja publiczna",
  "közigazgat", "administrație publică", "δημόσια διοίκηση", "държавна администрация", "javna uprava", "javne uprave",
  "ministerie", "ministerium", "ministère", "ministero", "ministerio", "ministério", "ministeriet", "ministeriö", "ministeerium", "ministrij", "ministerij", "ministerstw", "ministerstv", "minisztérium", "ministerul", "υπουργεί", "министерств",
  "gemeente", "municipality", "gemeinde", "commune de", "comune di", "ayuntamiento", "câmara municipal", "kommune ", "kommunen", "kunta", "pašvaldīb", "savivaldyb", "gmina", "urząd miasta", "magistrát", "önkormányzat", "primăria", "δήμος", "община", "općina", "občina",
  "myndighet", "myndigheten", "behörde", "bundesamt", "landesamt", "virasto", "úřad", "urząd", "úrad", "hivatal", "e-tjänster", "e-government", "rathaus", "stadhuis", "town hall", "hôtel de ville", "municipio", "site officiel", "offizielle website", "sito ufficiale", "sitio oficial",
  "portál občana", "portal obywatela", "citizen portal", "bürgerservice", "services publics", "service public", "servizi pubblici", "servicios públicos", "serviços públicos", "e-government", "rijksoverheid", "overheid", "government", "regierung", "gouvernement", "governo", "gobierno", "vláda", "rząd", "kormány", "guvernul", "κυβέρνησ", "правителств", "vlada",
]);
const CITIZEN_SERVICES = stems(["služby občan", "služby podnikat", "životní událost", "občan", "citizen", "bürger", "citoyen", "cittadin", "ciudadan", "cidadão", "medborgar", "borger", "kansalai", "kodanik", "pilsoņ", "piliet", "obywatel", "občan", "állampolgár", "cetățe", "πολίτ", "гражд", "građan", "državljan", "inwoner", "loket", "digid"]);

// ---------------------------------------------------------------- education
const UNIVERSITY = stems([
  "universit", "univerzit", "univerza", "universidad", "universidade", "università", "université", "uniwersytet", "yliopist", "ülikool", "egyetem",
  "πανεπιστήμ", "университет", "sveučiliš", "hogeschool", "hochschule", "fachhochschule", "politecnic", "polytechn", "technische universität", "academy of", "akademi",
]);
const EDU_SUPPORT = stems(["fakult", "faculty", "facoltà", "facultad", "faculdade", "faculté", "studium", "študij", "štúdi", "studi", "students", "studenten", "studenti", "estudiant", "étudiant", "estudant", "studerend", "opiskelij", "üliõpilas", "studentai", "studenci", "hallgató", "φοιτητ", "студент", "opleiding", "studiengang", "corsi di laurea", "grado", "licenciatur", "bachelor", "master", "výskum", "výzkum", "research", "forschung", "recherche", "ricerca", "investigación"]);

// ---------------------------------------------------------------- health
const HEALTH_CONCEPTS: Array<[string, RegExp]> = [
  ["health", stems(["gezondheid", "health", "gesundheit", "santé", "salute", "salud", "saúde", "hälsa", "sundhed", "helse", "terveys", "tervis", "veselīb", "sveikat", "zdrow", "zdraví", "zdravie", "egészség", "sănătat", "υγεί", "здрав", "zdravlj", "zdravj"])],
  ["care", stems(["zorgverlen", "zorgaanbied", "gezondheidszorg", "thuiszorg", "ouderenzorg", "jeugdzorg", "vård", "pleje", "hoito", "ravi ", "ravile", "medical care", "healthcare", "gesundheitsversorg", "soins", "cure mediche", "atención sanitaria", "cuidados de saúde", "opieka zdrowotn", "péče", "starostliv", "ellátás", "îngrijir", "περίθαλψ"])],
  ["disease", stems(["ziekte", "krankheit", "maladie", "malatti", "enfermedad", "doença", "sjukdom", "sygdom", "sairau", "haigus", "slimīb", "ligos", "chorob", "nemoc", "choroby", "betegség", "boal", "ασθέν", "болест", "bolest", "symptom", "symptôm", "sintom", "síntoma", "besvär"])],
  ["clinic", stems(["ziekenhuis", "krankenhaus", "hôpital", "ospedal", "hospital", "sjukhus", "sygehus", "sairaal", "haigla", "slimnīc", "ligonin", "szpital", "nemocnic", "kórház", "spital", "νοσοκομ", "болниц", "bolnic", "kliniek", "klinik", "clinic", "huisarts", "hausarzt", "médecin", "medico di base", "vårdcentral", "lægen", "lääkär", "arst", "ārst", "gydytoj", "lekar", "lékař", "orvos", "medic"])],
  ["emergency", stems(["notaufnahme", "pronto soccorso", "urgences", "urgencias", "urgência", "serviço de urgência", "spoedeisende", "spoedeisende hulp", "spoedpost", "emergency department", "akutmottagning", "päivystys", "erakorralise", "neatliekamās", "skubios pagalbos", "szpitalny oddział ratunkowy", "pohotovost", "sürgősségi", "urgență", "επειγόντων"])],
  ["prescription", stems(["förnya recept", "receptförny", "e-recept", "rezeptpflicht", "e-rezept", "ordonnance", "ricetta medica", "receta médica", "receita médica", "resept", "prescription", "vaccin", "impf", "rokot", "vakcin"])],
  ["appointment", stems(["boka tid", "afspraak bij de huisarts", "arzttermin", "rendez-vous médical", "visita medica", "cita médica"])],
];

// ---------------------------------------------------------------- telecom / energy
const TELECOM_ACCESS = stems(["glasvezel", "glasfaser", "fibre", "fiber", "fibra", "valokuitu", "kiudopti", "optisk", "optik", "šviesolaid", "światłowod", "światłowód", "optick", "optikai", "optică", "οπτικ", "оптич", "broadband", "breedband", "breitband", "haut débit", "banda larga", "banda ancha", "banda larga", "bredbånd", "bredband", "laajakaista", "lairiba", "platjosla", "plačiajuost", "szerokopasm", "širokopásm", "szélessáv", "bandă largă", "ευρυζων", "широколент"]);
const TELECOM_MOBILE = stems(["mobiel abonnement", "mobilfunk", "handytarif", "forfait mobile", "forfait", "offerte mobile", "tarifa móvil", "tarifário", "mobilabonnement", "mobilabonnemang", "liittymä", "mobiilside", "mobilais", "mobilus ryšys", "abonament", "tarif", "mobilní tarif", "mobilný", "mobilnet", "abonament mobil", "κινητ", "мобилен", "sim only", "sim-only", "sim ", "5g", "4g", "esim"]);
const TELECOM_TV = stems(["tv", "televis", "internet"]);
const ENERGY = stems(["energieleverancier", "stroom", "strom", "électricité", "elettricit", "electricidad", "eletricidade", "elektricitet", "sähkö", "elekter", "elektroenerģ", "elektros energ", "prąd", "elektřin", "elektrin", "áram", "energie electr", "ηλεκτρικ ρεύμ", "struj", "energy supplier", "energiaszolg", "energia elétrica"]);
const POWER_AND_GAS = stems(["luce e gas", "gas e luce", "luz y gas", "luz e gás", "luz e gas", "strom und gas", "gas und strom", "stroom en gas", "gas en stroom", "électricité et gaz", "gaz et électricité", "el og gas", "el och gas", "sähkö ja kaasu", "prąd i gaz", "elektřina a plyn", "áram és gáz", "energie electrică și gaz"]);
const GAS = words(["gas", "gás", "erdgas", "gaz", "gaz naturel", "kaasu", "maagaas", "gāze", "dujos", "plyn", "φυσικό αέριο", "газ", "plin"]);

// ---------------------------------------------------------------- retail veto
// Retail self-description in the main EU languages. When a page's own identity
// says it sells goods online, ambiguous words (credit, tickets, travel, health)
// describe the assortment and never the company.
const RETAIL_SELF = stems([
  "webshop", "webwinkel", "online winkel", "onlineshop", "online shop", "online-shop", "online store", "shop online", "online kopen", "online bestellen", "online kaufen", "online bestellen",
  "negozio online", "negozio di", "vendita online", "acquista online", "boutique en ligne", "achat en ligne", "achetez", "tienda online", "tienda en línea", "compra online", "loja online", "compras online",
  "nettbutikk", "nettbutik", "webbutik", "webbshop", "verkkokaup", "e-pood", "interneta veikal", "internetinė parduotuv", "el. parduotuv", "sklep internetow", "sklep online", "internetový obchod", "internetový obchod", "e-shop", "webáruház", "online áruház", "magazin online", "ηλεκτρονικό κατάστημ", "онлайн магазин", "internetska trgovin", "spletna trgovin", "lebensmittel online", "supermarkt online", "supermercato online", "supermarché en ligne",
]);

// ---------------------------------------------------------------- culture
const CULTURE = stems([
  "museum", "musée", "museo", "museu", "muzeum", "múzeum", "muzej", "muusem", "muziej", "μουσεί", "музей", "museet", "museo",
  "theater", "theatre", "théâtre", "teatro", "teatr", "divadl", "színház", "teater", "teatteri", "θέατρ", "театър", "kazalište", "gledališ",
  "schouwburg", "concertgebouw", "philharmon", "filharmon", "opéra", "opera", "konzerthaus", "festival", "galerie", "galleria", "galería", "kunsthal",
]);
const CULTURE_SUPPORT = stems(["exposit", "exhibit", "ausstellung", "mostr", "exposici", "exposiç", "utställning", "udstilling", "näyttely", "näitus", "izstād", "paroda", "wystaw", "výstav", "kiállítás", "expoziț", "έκθεσ", "изложб", "izložb", "razstav", "tentoonstel", "billetterie", "biglietteria", "taquilla", "bilheteira", "programma", "programme", "spielplan", "agenda", "voorstelling", "concert", "konzert", "collectie", "collection", "sammlung", "collezione"]);

// Audience clauses name customers, not the organisation: "marketing para
// hoteles, aerolíneas y bancos", "software for banks", "advies voor ziekenhuizen".
const ORG_PLURAL = "(?:versicherungen|versicherer|insurance companies|assurances|assicurazioni|aseguradoras|seguradoras|hotels|hoteles|hôtels|alberghi|aerolíneas|airlines|compagnies aériennes|compagnie aeree|fluggesellschaften|luchtvaartmaatschappijen|banks|banken|bancos|banques|banche|ziekenhuizen|hospitals|hôpitaux|ospedali|hospitales|krankenhäuser|universities|universiteiten|universités|universidades|scholen|schools|gemeenten|municipalities|overheden|governments|webshops|retailers|winkels|tiendas|negozi|bedrijven|companies|empresas|entreprises|aziende|unternehmen|klanten|clients|kunden|clientes|clienti|vervoerders|carriers|verzekeraars|insurers|media|uitgevers|publishers)";
const AUDIENCE = new RegExp(`(?<![\\p{L}])(?:for|voor|für|pour|per|para|dla|pro|för|til|για|за)\\s+[^.|–—:;!?]{0,40}?(?<![\\p{L}])${ORG_PLURAL}(?![\\p{L}])[^.|–—:;!?]{0,60}`, "giu");
export function stripAudience(text: string): string {
  return String(text || "").replace(AUDIENCE, " ");
}

export function retailSelfDescription(text: string): boolean {
  return RETAIL_SELF.test(text || "");
}

function distinct(text: string, concepts: Array<[string, RegExp]>): string[] {
  return concepts.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/** Structural government hostname: a label such as gov., gouv., gob. or gv. before the TLD. */
export function governmentHostname(hostname = ""): boolean {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  // Ignore the TLD itself (".gov" in the US is fine too, but never a brand label).
  // Only the label directly before the top-level domain counts (gov.cz, gouv.fr,
  // gv.at, admin.ch), so a subdomain such as admin.shop.com never matches.
  return (labels.length >= 2 && GOV_HOST_LABEL.test(labels[labels.length - 2])) || labels[labels.length - 1] === "gov";
}

export function detectEuPrimaryIdentity(input: EuIdentityInput): EuIdentity | null {
  const title = stripAudience((input.title || "").slice(0, 300));
  const description = stripAudience((input.description || "").slice(0, 700));
  const h1 = stripAudience((input.h1s || []).slice(0, 4).join(" · ").slice(0, 500));
  const site = (input.ogSiteName || "").slice(0, 120);
  const h2 = (input.h2s || []).slice(0, 12).join(" · ").slice(0, 800);
  const nav = (input.navLabels || []).slice(0, 80).join(" · ").slice(0, 3000);
  const schema = new Set((input.schemaTypes || []).map((t) => String(t).toLowerCase()));
  const own = [title, description, h1, site].join(" · ");
  const sources = { title, description, h1, site };
  const countSources = (test: (s: string) => boolean) => Object.values(sources).filter((s) => s && test(s)).length;
  // A blog, magazine, guide or comparison site writes ABOUT trains, banks or
  // hospitals; it is not the operator. Operator sectors then abstain.
  const publication = /(?<![\p{L}])(?:blog|reisblog|vlog|magazine|magazin|tijdschrift|revista|rivista|zeitschrift|reisgids|travel guide|guide de voyage|vergelijk|vergleich|comparateur|comparador|review|reviews)(?![\p{L}])/iu.test(title + " " + site) || ["blog", "blogposting"].some((t) => schema.has(t));
  const retailer = retailSelfDescription(own) || [...schema].some((t) => /store$|^store$|^onlinestore$/.test(t));
  const evidence = (lines: Array<string | false>) => lines.filter(Boolean) as string[];

  // 1. Government: structural host label or typed schema, plus own wording.
  const govHost = governmentHostname(input.hostname);
  const govSchema = schema.has("governmentorganization") || schema.has("governmentoffice") || schema.has("governmentservice");
  const govOwn = GOV_TERMS.test(own);
  if (!retailer && ((govHost && (govOwn || CITIZEN_SERVICES.test(own + " " + nav + " " + h2))) || (govSchema && (govOwn || govHost)) || countSources((s) => GOV_TERMS.test(s)) >= 2)) {
    return { sector: "government", key: "government", label: "Overheid & Publieke sector", confidence: "high", confidenceScore: govHost && govOwn ? 94 : 90,
      evidence: evidence([govHost && "Domeinstructuur: overheidslabel in de hostnaam", govOwn && "Eigen identiteit noemt een overheids-/publieke dienst", govSchema && "Structured data: GovernmentOrganization"]) };
  }

  // 2. News / media / broadcasting.
  const newsSchema = schema.has("newsmediaorganization") || schema.has("broadcastservice") || schema.has("televisionstation") || schema.has("radiostation");
  const broadcaster = TELEVISION.test(own) && RADIO.test(own);
  const newsSources = countSources((s) => NEWS.test(s));
  const publisherOwn = PUBLISHER.test(own);
  // "Nieuws van <bedrijf>", "news from <company>": the organisation's own news, not a publisher.
  const companyNews = /(?<![\p{L}])(?:nieuws van|news from|news of|nachrichten von|nachrichten der|actualités de|notizie di|noticias de|nyheter från|nyheder fra|aktualności|novinky z)\s+(?:het |de |the |der |die |la |le |il |el )?\p{Lu}/u.test(own);
  const newsHigh = !retailer && (newsSchema || broadcaster || publisherOwn && newsSources >= 1 || (input.homepage !== false && newsSources >= 2 && !companyNews));
  if (newsHigh) {
    return { sector: "news_media", key: "news_media", label: "Nieuws & Media", confidence: "high", confidenceScore: newsSchema || broadcaster ? 94 : 90,
      evidence: evidence([newsSchema && "Structured data: nieuws-/omroeporganisatie", broadcaster && "Eigen identiteit: televisie- en radio-omroep", publisherOwn && "Eigen identiteit: uitgever/redactie", newsSources >= 1 && `Nieuws in ${newsSources} identiteitsbron(nen) (titel/omschrijving/H1/sitenaam)`]) };
  }

  if (publication) return null;

  // 3. Financial services (banks, insurers). Payments stay in primary-business-identity.ts.
  const bankConcepts = distinct(own, BANK_CONCEPTS);
  const financeSchema = [...schema].some((t) => FINANCE_SCHEMA.has(t));
  if (!retailer && (bankConcepts.length >= 3 || (bankConcepts.length >= 2 && (financeSchema || schema.has("bankorcreditunion"))) || schema.has("bankorcreditunion"))) {
    return { sector: "financial_services", key: "financial_banking", label: "Bank & financiële producten", confidence: "high", confidenceScore: financeSchema ? 95 : 91,
      evidence: [`Eigen identiteit noemt ${bankConcepts.length} bankconcepten (${bankConcepts.join(", ")})`, ...(financeSchema ? ["Structured data: financieel product of bank"] : [])] };
  }
  if (!retailer && (schema.has("insuranceagency") || INSURANCE.test(title) || countSources((s) => INSURANCE.test(s)) >= 2)) {
    return { sector: "financial_services", key: "financial_insurance", label: "Verzekeringen", confidence: "high", confidenceScore: 91, evidence: ["Eigen identiteit: verzekeringen"] };
  }

  // 4. Education: a university/college names itself.
  const eduSchema = schema.has("collegeoruniversity") || schema.has("educationalorganization") || schema.has("school");
  if (!retailer && (eduSchema || UNIVERSITY.test(title) || (UNIVERSITY.test(own) && EDU_SUPPORT.test(own)))) {
    return { sector: "education", key: "education", label: "Onderwijs & Opleiding", confidence: "high", confidenceScore: eduSchema || UNIVERSITY.test(title) ? 93 : 90,
      evidence: evidence([UNIVERSITY.test(title) && "Titel noemt universiteit/hogeschool", eduSchema && "Structured data: onderwijsinstelling", EDU_SUPPORT.test(own) && "Omschrijving noemt studie/faculteiten/onderzoek"]) };
  }

  // 5. Passenger transport and postal/parcel operators.
  const airlineSchema = schema.has("airline") || schema.has("busorcoachstop") || schema.has("trainstation") || schema.has("airport");
  const modes = [AIR.test(own) && "luchtvaart", RAIL.test(own) && "spoor", (BUS.test(own) || FERRY.test(own)) && "openbaar vervoer/veer"].filter(Boolean) as string[];
  const travelOwn = [TICKETS.test(own) && "vervoersbewijzen", TIMETABLE.test(own) && "dienstregeling", JOURNEY.test(own) && "reis/boeking"].filter(Boolean) as string[];
  if (!retailer && (airlineSchema || (modes.length >= 1 && (travelOwn.length >= 1 || countSources((s) => AIR.test(s) || RAIL.test(s) || BUS.test(s) || FERRY.test(s)) >= 2)))) {
    return { sector: "transport_travel", key: "passenger_transport", label: "Personenvervoer (spoor, luchtvaart, openbaar vervoer)", confidence: "high", confidenceScore: airlineSchema ? 95 : 90,
      evidence: evidence([airlineSchema && "Structured data: vervoerder (Airline/station)", modes.length > 0 && `Eigen identiteit noemt vervoerswijze: ${modes.join(", ")}`, travelOwn.length > 0 && `Eigen identiteit noemt ${travelOwn.join(", ")}`]) };
  }
  const freightSources = countSources((s) => FREIGHT.test(s));
  if (!retailer && freightSources >= 1 && (freightSources >= 2 || FREIGHT_SUPPORT.test(own))) {
    return { sector: "transport_travel", key: "transport_travel", label: "Transport & Logistiek", confidence: "high", confidenceScore: freightSources >= 2 ? 92 : 90,
      evidence: ["Eigen identiteit noemt goederenvervoer/logistiek", ...(FREIGHT_SUPPORT.test(own) ? ["Eigen identiteit noemt logistieke diensten (groupage, opslag, pallets, douane of distributie)"] : [])] };
  }
  const postalOwn = POSTAL_SPECIFIC(own);
  const postalAll = POSTAL_SPECIFIC(own + " " + h2);
  const parcelOwn = PARCEL.test(own);
  if (!retailer && ((postalOwn && parcelOwn) || (postalAll && parcelOwn && PARCEL.test(h2)))) {
    return { sector: "transport_travel", key: "postal_logistics", label: "Post- & pakketvervoer", confidence: "high", confidenceScore: 90,
      evidence: ["Eigen identiteit noemt postdiensten (post, postzegels, aangetekend of postcodes)", "Eigen identiteit noemt pakket-/verzenddiensten"] };
  }

  // 6. Health information and care portals (not shops, not insurers).
  const healthConcepts = distinct(own, HEALTH_CONCEPTS);
  const healthSchema = ["hospital", "medicalorganization", "medicalclinic", "physician"].some((t) => schema.has(t));
  const hospitalTitle = (HEALTH_CONCEPTS.find(([n]) => n === "clinic")?.[1] as RegExp).test(title) && healthConcepts.length >= 2;
  if (!retailer && (healthSchema || hospitalTitle || healthConcepts.length >= 3 || (healthConcepts.length >= 2 && countSources((s) => distinct(s, HEALTH_CONCEPTS).length > 0) >= 2))) {
    return { sector: "health_wellness", key: "healthcare", label: "Zorg & Gezondheid", confidence: "high", confidenceScore: healthSchema ? 94 : 90,
      evidence: [`Eigen identiteit noemt ${healthConcepts.length} zorgconcepten (${healthConcepts.join(", ")})`, ...(healthSchema ? ["Structured data: zorgorganisatie"] : [])] };
  }

  // 7. Telecom and energy suppliers.
  if (!retailer && TELECOM_ACCESS.test(own) && (TELECOM_MOBILE.test(own) || TELECOM_TV.test(own))) {
    return { sector: "telecom_technology", key: "telecom_technology", label: "Telecom & Technologie", confidence: "high", confidenceScore: 90, evidence: ["Eigen identiteit noemt netwerktoegang (glasvezel/breedband) en abonnementen"] };
  }
  if (!retailer && (POWER_AND_GAS.test(own) || ENERGY.test(own) && (GAS.test(own) || /\b(?:tarie|tarif|contract|vertrag|contrat|contratt|contrat|leverancier|supplier|anbieter|fournisseur|fornitor|proveedor|fornecedor)/i.test(own)))) {
    return { sector: "energy_utilities", key: "energy_utilities", label: "Energie & Nutsvoorzieningen", confidence: "high", confidenceScore: 90, evidence: ["Eigen identiteit noemt stroom/gas en leveringsvoorwaarden"] };
  }

  // 7b. Museums, theatres, concert halls and festivals.
  const cultureSchema = ["museum", "performingartstheater", "eventvenue", "musicvenue", "artgallery", "theaterevent", "festival"].some((t) => schema.has(t));
  if (!retailer && (cultureSchema && (CULTURE.test(own) || CULTURE_SUPPORT.test(own)) || (CULTURE.test(title) && CULTURE_SUPPORT.test(own)) || countSources((s) => CULTURE.test(s)) >= 2)) {
    return { sector: "events_culture", key: "events_culture", label: "Evenementen & Cultuur", confidence: "high", confidenceScore: cultureSchema ? 93 : 90,
      evidence: evidence([CULTURE.test(own) && "Eigen identiteit: museum, theater, concertzaal of festival", CULTURE_SUPPORT.test(own) && "Eigen identiteit noemt tentoonstellingen, programma of tickets", cultureSchema && "Structured data: museum/podium"]) };
  }

  // 8. Medium tier: the homepage names only its brand, but navigation and section
  //    headings describe one activity again and again. Never for retailers.
  if (retailer) return null;
  const structure = [nav, h2].join(" · ");
  const transportStructure = [
    TICKETS.test(structure) && "vervoersbewijzen", TIMETABLE.test(structure) && "dienstregeling",
    (AIR.test(structure) || RAIL.test(structure) || BUS.test(structure) || FERRY.test(structure)) && "vervoerswijze",
    FARES.test(structure) && "tarieven/kortingskaarten", JOURNEY.test(structure + " " + site) && "reizen",
  ].filter(Boolean) as string[];
  if (transportStructure.length >= 3 && (transportStructure.includes("vervoersbewijzen") || transportStructure.includes("vervoerswijze"))) {
    return { sector: "transport_travel", key: "passenger_transport", label: "Personenvervoer (spoor, luchtvaart, openbaar vervoer)", confidence: "medium", confidenceScore: 74,
      evidence: [`Navigatie en koppen beschrijven personenvervoer (${transportStructure.join(", ")}); de titel en omschrijving noemen dit niet zelf`] };
  }
  const structureNews = NEWS.test(structure) && (PUBLISHER.test(structure) || (TELEVISION.test(structure) && RADIO.test(structure)));
  if (structureNews) {
    return { sector: "news_media", key: "news_media", label: "Nieuws & Media", confidence: "medium", confidenceScore: 72,
      evidence: ["Navigatie en koppen beschrijven nieuws en omroep/redactie; de titel en omschrijving noemen dit niet zelf"] };
  }
  if (POSTAL_SPECIFIC(structure) && PARCEL.test(structure) && PARCEL.test(own)) {
    return { sector: "transport_travel", key: "postal_logistics", label: "Post- & pakketvervoer", confidence: "medium", confidenceScore: 74,
      evidence: ["Navigatie en koppen beschrijven post- en pakketdiensten"] };
  }
  return null;
}

// Cookie/consent dialogs often carry the first H1/H2 of a page ("Maacht äre
// Choix", "Den här webbplatsen använder kakor"). They say nothing about the
// organisation and must never count as identity evidence.
const CONSENT_HEADING = stems([
  "cookie", "kakor", "kaka", "consent", "toestemming", "privacy", "privée", "privacidad", "privacy settings", "datenschutz", "zustimmung", "einwilligung",
  "souhlas", "súhlas", "ochrany osobných", "ochrana osobních", "zgod", "prywatnoś", "evästee", "küpsis", "sīkdatn", "slapuk", "sütik", "adatvédelm",
  "cookie-uri", "confidențialit", "απόρρητ", "бисквитк", "kolačić", "piškotk", "your choice", "uw keuze", "votre choix", "ihre auswahl", "maacht äre choix",
  "manage your preferences", "hantera dina inställningar", "nastavenia ochrany", "nastavení souhlas",
]);
export function isConsentHeading(text: string): boolean {
  return CONSENT_HEADING.test(String(text || "").slice(0, 200));
}
