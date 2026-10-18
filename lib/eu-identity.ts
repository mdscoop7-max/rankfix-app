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
  | "education" | "health_wellness" | "telecom_technology" | "energy_utilities" | "events_culture" | "professional_services" | "saas_b2b" | "fitness_sports" | "tourism_recreation" | "manufacturing_industrial"
  | "real_estate" | "nonprofit" | "hospitality";

export type EuIdentity = {
  sector: EuSector;
  key: string;
  label: string;
  confidence: "high" | "medium";
  confidenceScore: number;
  evidence: string[];
  /** Important activities that do not define the organisation (a university hospital also teaches). */
  secondary?: Array<{ sector: EuSector; label: string; evidence: string[] }>;
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
/** The distinct words of one lexicon that occur in a text (for evidence lines). */
function distinct2(text: string, re: RegExp): string[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return [...new Set([...text.matchAll(g)].map((m) => m[0].toLowerCase()))];
}
function any(...res: RegExp[]) {
  return (text: string) => res.some((re) => re.test(text));
}
/** Like any(), but usable wherever a RegExp-like { test } is expected. */
function either(...res: Array<{ test: (text: string) => boolean }>) {
  return { test: (text: string) => res.some((re) => re.test(text)) };
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
  "tagblatt", "tageblatt", "rundschau", "anzeiger", "dagblad", "avisen", "lehti", "noviny",
  "omroep", "broadcast", "rundfunk", "journal", "dagblad", "krant", "newspaper", "zeitung", "giornal",
  "periódic", "periodic", "jornal", "tidning", "dagblad", "sanomaleh", "ajaleh", "laikrakst", "laikraš",
  "gazet", "noviny", "noviny", "újság", "ziar", "εφημερίδ", "вестник", "novine", "časopis", "redaktion",
  "rédaction", "redazion", "redacci", "redakcj", "redakc", "redaktioun", "toimitu", "medielandschaft",
  "infoportal", "nachrichtenportal", "noriichteportal", "nyhetsportal", "persbureau", "presseagentur", "agence de presse",
]);
// Broadcaster = television AND radio named together (any language, any order).
const TELEVISION = stems(["televis", "televiz", "televíz", "televīz", "telewiz", "télévis", "fernseh", "τηλεόρασ", "телевиз", "tv"]);
const RADIO = stems(["radio", "rádio", "rádió", "rozhlas", "radij", "ράδιο", "радио", "rundfunk", "raadio", "radijas"]);

// Newspaper section names. A homepage whose navigation runs politics + world +
// economy/sport/culture is laid out as a news publication, whatever its title.
const NEWS_SECTIONS: Array<[string, RegExp]> = [
  ["politics", stems(["politiek", "politik", "politique", "politica", "política", "polityka", "politika", "politiikka", "poliitika", "politică", "πολιτική", "политика", "inland", "binnenland", "domácí", "domov", "kraj", "polska", "österreich"])],
  ["world", stems(["buitenland", "ausland", "welt", "monde", "international", "esteri", "mondo", "mundo", "internacional", "świat", "svět", "svet", "zahraničí", "världen", "verden", "ulkomaat", "maailm", "pasaul", "pasaulyje", "világ", "lume", "κόσμος", "свят"])],
  ["economy", stems(["economie", "wirtschaft", "économie", "economia", "economía", "gospodarka", "biznes", "business", "ekonomika", "ekonomi", "talous", "majandus", "ekonomika", "gazdaság", "economie", "οικονομία", "икономика", "verslas", "finanzen"])],
  ["sport", stems(["sport", "sports", "deportes", "desporto", "sportas", "šport", "urheilu", "αθλητισμ", "спорт", "spordi"])],
  ["culture", stems(["cultuur", "kultur", "culture", "cultura", "kultura", "kulttuuri", "kultuur", "kultūra", "kultúra", "πολιτισμ", "култура"])],
  ["local", stems(["regio", "region", "région", "cronaca", "lokaal", "lokales", "local", "comarca", "lokalt", "lokalne", "regionální"])],
  ["opinion", stems(["opinie", "meinung", "opinion", "opinioni", "opinión", "opinia", "názory", "åsikt", "debatt", "mielipide", "arvamus"])],
  ["edition", stems(["epaper", "e-paper", "abo", "abonneren", "abonnement", "abbonati", "abbonamento", "suscríbete", "prenumerata", "předplatné", "prenumerera", "tilaa", "liveblog", "live"])],
];

// Municipality/government structure: residents, governance, documents, waste, permits, counter.
const CIVIC_SECTIONS: Array<[string, RegExp]> = [
  ["residents", stems(["inwoners", "bewoners", "bürger", "einwohner", "citoyens", "habitants", "cittadini", "ciudadanos", "vecinos", "munícipes", "mieszkańcy", "občané", "obyvatelia", "lakosok", "locuitori", "asukkaat", "elanikud", "iedzīvotāj", "gyventoj", "invånare", "borgere", "δημότες", "граждани", "residents", "citizens"])],
  ["governance", stems(["bestuur", "gemeenteraad", "gemeinderat", "stadtrat", "conseil municipal", "consiglio comunale", "pleno", "rada miasta", "zastupitelstvo", "zastupiteľstvo", "képviselő-testület", "consiliul local", "valtuusto", "volikogu", "dome", "taryba", "kommunfullmäktige", "byråd", "δημοτικό συμβούλιο", "общински съвет", "council"])],
  ["documents", stems(["paspoort", "id-kaart", "identiteitskaart", "reisepass", "personalausweis", "passeport", "carte d'identité", "passaporto", "carta d'identità", "pasaporte", "dni", "passaporte", "paszport", "dowód osobisty", "cestovní pas", "občanský průkaz", "útlevél", "személyi igazolvány", "pașaport", "carte de identitate", "passport", "id card"])],
  ["waste", stems(["afval", "abfall", "müll", "déchets", "rifiuti", "residuos", "resíduos", "odpady", "odpad", "hulladék", "deșeuri", "jäte", "jäätme", "atkritum", "atliek", "avfall", "affald", "απορρίμματ", "отпадъц", "waste"])],
  ["permits", stems(["vergunning", "genehmigung", "baugenehmigung", "permis", "permesso", "licencia", "licença", "pozwolen", "povolení", "povolen", "engedély", "autorizați", "lupa", "luba", "atļauj", "leidim", "bygglov", "tilladelse", "άδει", "разрешени", "permit"])],
  ["counter", stems(["loket", "bürgerbüro", "bürgerservice", "guichet", "sportello", "ventanilla", "balcão", "okienko", "podatelna", "ügyfélszolgálat", "ghișeu", "asiointi", "teenindus", "medborgarservice", "borgerservice", "κεπ", "e-loket", "digid"])],
];

// Agencies, consultancies and service firms.
const AGENCY = stems(["dienstleister", "dienstverlener", "service provider", "prestataire", "fornitore di servizi", "proveedor de servicios", "webagentur", "agentur", "werbeagentur", "digitalagentur", "agency", "agence", "agenzia", "agencia", "agência", "bureau", "adviesbureau", "byrå", "toimisto", "agentuur", "aģentūra", "agentūra", "agencja", "agentura", "ügynökség", "agenție", "consultancy", "beratung", "unternehmensberatung", "conseil", "consulenza", "consultoría", "consultoria", "advies", "rådgivning", "konsult"]);
const AGENCY_SERVICE = stems(["webdesign", "website", "websites", "apps", "marketing", "seo", "branding", "software", "it-dienst", "it services", "kommunikation", "communicatie", "communication", "comunicazione", "comunicación", "strategie", "strategy", "leistungen", "services", "diensten", "servizi", "servicios", "referenzen", "cases"]);

const TRAVEL_AGENCY = stems(["reisebüro", "reisbureau", "reisorganisatie", "agence de voyage", "agenzia viaggi", "agenzia di viaggi", "agencia de viajes", "agência de viagens", "biuro podróży", "cestovní kancelář", "cestovná kancelária", "utazási iroda", "agenție de turism", "matkatoimisto", "reisibüroo", "ceļojumu aģentūra", "kelionių agentūra", "resebyrå", "rejsebureau", "ταξιδιωτικό γραφείο", "туристическа агенция", "pauschalreise", "package holiday", "last minute", "kreuzfahrt", "cruises", "tour operator", "touroperator"]);
const COURIER = stems(["mensajería", "mensajeria", "koerier", "kurier", "courier", "coursier", "corriere espresso", "kurýr", "futárszolgálat", "curierat", "kuriiri", "kullerteenus", "kurjer", "kurjerių", "pakketdienst", "paketdienst", "express delivery", "pakkebud"]);
// ---------------------------------------------------------------- industry / manufacturing
// Who makes or supplies industrial goods: a maker/supplier word plus an industrial
// object, in the organisation's own title, description, H1 or site name.
const MAKER = stems(["manufactur", "fabrikant", "fabricant", "fabricage", "producent", "productiebedrijf", "hersteller", "herstellung", "fertigung", "fabrication", "produttor", "produzion", "fabbricant", "fabricante", "fabricación", "fabricação", "producător", "valmistaja", "valmista", "tillverk", "fabrikant", "výrobc", "výrob", "gyárt", "κατασκευαστ", "производител", "proizvođač", "proizvajal", "tootja", "ražotāj", "gamintoj", "wytwórc", "producent", "maker of", "makers of", "we make", "we build", "builder of", "engineering group", "engineering company", "engineering firm", "industrial group", "maschinenbauunternehmen", "machinefabriek", "fabriek", "fabrik", "usine", "fabbrica", "fábrica", "tehdas", "fabryk", "továrn", "wij bouwen", "we bouwen", "ontwerpen en bouwen", "entwickeln und bauen", "concevons et fabriquons", "progettiamo e costruiamo"]);
const SUPPLIER = stems(["supplier", "leverancier", "zulieferer", "ausrüster", "fournisseur", "équipementier", "fornitor", "proveedor", "fornecedor", "dostawc", "toimittaj", "leverantör", "dodavatel", "beszállító", "furnizor", "доставчик", "dobavitelj", "dobavljač", "tarnija", "piegādātāj", "tiekėj"]);
const INDUSTRIAL = stems([
  "semiconductor", "halfgeleider", "halbleiter", "semi-conducteur", "semiconducteur", "semicondutt", "semiconductor", "półprzewodnik", "puolijohde", "halvledar", "polovodič", "félvezető",
  "lithograph", "lithografi", "litograf", "chipmaker", "chip industry", "wafer",
  "machinebouw", "maschinenbau", "werktuigbouw", "machine builder", "machinery", "machines", "maschinen", "machine tools", "werkzeugmaschin", "machines-outils", "macchine", "maquinaria", "máquinas", "maszyn", "koneet", "maskiner", "stroj", "gépgyárt",
  "industrial equipment", "industriële", "industrial", "industry", "industries", "industrie", "industriel", "industriale", "industria", "industrial", "przemysł", "teollisuu", "industri", "průmysl", "ipari",
  "automation", "automatiser", "automatisierung", "automazione", "automatización", "robotics", "robotica", "robotik",
  "components", "componenten", "komponenten", "composants", "componenti", "componentes", "bearings", "lager", "pumps", "pompen", "pumpen", "valves", "kleppen", "ventile", "compressors", "turbines", "turbinen", "generators", "generatoren", "engines", "motoren", "verpakkingsmachine", "voedingsindustrie", "lasers", "laser",
  "steel", "staal", "stahl", "acier", "acciaio", "acero", "chemicals", "chemie", "chimie", "chimica", "química", "plastics", "kunststof", "kunststoff", "packaging machines", "verpakkingsmachines", "electronics manufactur", "precision", "precisie", "präzision",
  "aerospace", "lucht- en ruimtevaart", "luft- und raumfahrt", "aéronautique", "aerospaziale", "aeroespacial",
  // 3.6: mining and metal-working equipment.
  "mining", "mijnbouw", "bergbau", "minería", "mineração", "rock excavation", "rock processing", "metal cutting", "metal-cutting", "metaalbewerking", "metallbearbeitung", "zerspanung", "usinage",
  // Engineered vehicle components (what component makers name in their own title).
  "braking", "brake", "bremssystem", "bremsanlage", "bremsscheib", "freinage", "freins", "impianti frenanti", "sistemi frenanti", "sistema frenante", "frenado", "sistemas de travagem", "remsystem", "remschijv", "hamulc", "układy hamulcowe", "brzdov", "fékrendszer", "sisteme de frânare", "jarrujärjestelm", "bromssystem", "φρένων",
  "gearbox", "transmissions", "getriebe", "powertrain", "drivetrain", "antriebsstrang", "shock absorbers", "stoßdämpfer", "ammortizzatori", "amortisseurs", "schokdempers", "axles", "achsen",
]);
// Supplying vehicle or machine makers (B2B): "original equipment", "Erstausrüstung", "première monte".
// Only the phrases, never bare "OEM" (aftermarket parts shops say "OEM-kwaliteit").
const OEM_SUPPLY = stems(["original equipment", "first equipment", "erstausrüst", "erstausstatt", "première monte", "premiere monte", "primo equipaggiamento", "primo impianto", "equipo original", "equipamento original", "eerste montage", "pierwszy montaż", "pierwsze wyposażenie", "prvovýbav", "ensiasennus", "originalutrustning"]);
const HARDWARE = stems(["hardware", "systems", "systemen", "systeme", "systèmes", "sistemi", "sistemas", "equipment", "apparatuur", "anlagen", "équipements", "attrezzature", "equipos", "equipamentos", "installations", "installaties", "products", "producten", "produkte", "produits", "prodotti", "productos"]);

const SOFTWARE = stems(["software", "saas", "platform", "plattform", "plateforme", "piattaforma", "plataforma", "logiciel", "app for", "regtech", "fintech platform"]);
const SOFTWARE_FUNNEL = stems(["book a demo", "free trial", "start trial", "request a demo", "demo aanvragen", "demo anfragen", "gratis proberen", "kostenlos testen", "essai gratuit", "prova gratuita", "prueba gratis", "pricing", "prijzen", "preise", "tarifs", "features", "functies", "funktionen", "integrations", "integraties", "login", "inloggen", "anmelden"]);
const FITNESS = stems(["sportschool", "fitnessstudio", "fitness-studio", "fitnesscenter", "gimnasio", "ginásio", "palestra", "salle de sport", "siłownia", "posilovna", "posilňovňa", "edzőterem", "sală de fitness", "kuntosali", "jõusaal", "sporto klubas", "trenažieru zāle", "γυμναστήριο", "фитнес", "gym", "crossfit", "yoga studio", "pilates"]);
const PHARMACY = stems(["apotheke", "apotheek", "pharmacie", "farmacia", "farmácia", "apteka", "lékárna", "lekáreň", "gyógyszertár", "farmacie", "apteekki", "apteek", "aptieka", "vaistinė", "apotek", "φαρμακείο", "аптека", "ljekarna", "lekarna", "pharmacy"]);

// ---------------------------------------------------------------- finance
// Distinct banking concepts. A bank's own identity names several of them; a
// shop that offers "financing" or "gift cards" names one at most.
const BANK_CONCEPTS: Array<[string, RegExp]> = [
  ["accounts", stems(["bankrekening", "betaalrekening", "spaarrekening", "girokonto", "sparkonto", "bankkonto", "konto", "konten", "comptes", "conti", "cuentas corrientes", "konta", "compte bancaire", "compte courant", "conto corrente", "conti corrent", "cuenta corriente", "cuentas", "conta corrente", "cont curent", "cont online", "conturi", "rachun", "pankkitili", "účet", "účt", "számla", "λογαριασμ", "сметк", "račun", "bank account", "current account", "savings account"])],
  ["loans", stems(["baufinanzierung", "immobilienfinanzierung", "prêt immobilier", "mutuo", "mutui", "hypothe", "hypoth", "ipotec", "mortgage", "kredit", "credit", "crédit", "crédito", "credite", "crediti", "lening", "darlehen", "prestit", "préstam", "empréstim", "lån", "laina", "laen", "aizdev", "paskol", "kredyt", "pożycz", "úvěr", "úver", "hitel", "kölcsön", "δάνει", "кредит", "zajam", "posojil", "imobiliar"])],
  ["cards", stems(["creditcard", "credit card", "debit card", "carte bancaire", "carta di credito", "tarjeta", "cartão", "carduri", "card de credit", "kreditkarte", "debitkarte", "kreditkort", "luottokort", "pangakaart", "kredītkart", "kredito kortel", "pankkikort", "karta kredyt", "platební kart", "platobn", "bankkártya", "κάρτ", "карт"])],
  ["savings", stems(["sparen", "spaar", "epargne", "épargne", "risparm", "ahorro", "poupan", "economii", "säästö", "hoius", "sparande", "opsparing", "uzkrāj", "taupym", "oszczędz", "spoř", "megtakar", "αποταμίευσ", "спестяв", "štednj", "varčev", "depozit", "deposit", "termijndeposito", "festgeld"])],
  ["investing", stems(["beleggen", "beleggingen", "investment", "investiț", "investiti", "investimen", "inversi", "sijoit", "investeer", "investēš", "investic", "befektet", "επενδύσ", "инвестиц", "ulaganj", "naložb", "vermogensbeheer", "wealth management", "private banking"])],
  ["banking", stems(["bankieren", "banking", "bancar", "bancair", "bancari", "bancária", "bankowoś", "bankovn", "banki szolg", "τραπεζ", "банков", "bankovn", "bančn", "pankkipalvel", "pangateenus", "banku pakalpoj", "bankininkyst", "bankowość", "operatiuni bancare", "operațiuni bancare"])],
];
// The institution names itself a bank (any EU language). Counts as one concept;
// a bank still needs two more (accounts, loans, cards...). Dutch "bank" = sofa,
// which the retail veto and the 3-concept rule keep out.
BANK_CONCEPTS.push(["institution", words(["bank", "banka", "bankas", "banca", "banco", "banque", "banken", "pankki", "pank", "sparkasse", "sparbanken", "sparekasse", "sparebank", "raiffeisenbank", "volksbank", "τράπεζα", "банка"])]);
// Germanic compounds put the insurance noun last ("reisverzekering",
// "Krankenversicherung", "hemförsäkring"); a word-start stem misses them.
const INSURANCE_COMPOUND = /\p{L}+(?:verzekering(?:en)?|versicherung(?:en)?|försäkring(?:ar|en)?|forsikring(?:er|en)?|vakuutus)(?![\p{L}])/iu;
const INSURANCE_STEMS = stems([
  "verzeker", "versicher", "assuranc", "assicura", "seguro", "forsikr", "försäkr", "vakuut", "kindlust",
  "apdrošin", "draudim", "ubezpiecz", "pojišť", "pojist", "poisten", "poistn", "biztosít", "asigur", "ασφαλισ", "ασφάλισ",
  "застрахов", "osiguran", "zavarovan", "insurance", "insurer",
]);
const INSURANCE = { test: (value: string) => INSURANCE_STEMS.test(value) || INSURANCE_COMPOUND.test(value) };
const FINANCE_SCHEMA = new Set(["bankorcreditunion", "financialservice", "financialproduct", "loanorcredit", "bankaccount", "depositaccount", "mortgageloan", "paymentcard", "creditcard", "investmentorDeposit".toLowerCase()]);

// ---------------------------------------------------------------- transport
const AIR_WORDS = words(["loty", "lotów", "lety", "letenky", "lennud", "lidojumi", "skrydžiai", "flyrejser", "flyg", "lentoja"]);
const AIR_STEMS = stems(["flight", "flug", "flüg", "vols", "voli", "vuelo", "voos", "vlucht", "lentoliput", "lennot", "lennu", "lidojum", "skrydž", "skryd", "loty ", "letenk", "repülőj", "zbor", "πτήσ", "полет", "airline", "luchtvaart", "fluggesellschaft", "compagnie aérienne", "compagnia aerea", "aerolínea", "companhia aérea", "flygbolag", "lentoyhti", "aviokompan", "linie lotnicze", "letecká", "légitársas"]);
const AIR = { test: (s: string) => AIR_STEMS.test(s) || AIR_WORDS.test(s) };
const RAIL_STEMS = stems(["junaliput", "junien", "railway", "rail ", "spoorweg", "trein", "bahn", "treno", "trenitalia", "comboio", "vilcien", "traukin", "pociąg", "koleje", "vonat", "vasút", "τρέν", "σιδηρόδρομ", "влак", "железниц", "željezn", "železn", "dráhy", "ferrovi", "chemin de fer", "nightjet", "intercity"]);
const RAIL_WORDS = words(["rail", "rails", "zug", "züge", "train", "trains", "tren", "trenes", "trenuri", "tåg", "tog", "juna", "junat", "rong", "rongid", "vlak", "vlaky", "vlakov", "sncf", "cfr"]);
const RAIL = { test: (s: string) => RAIL_STEMS.test(s) || RAIL_WORDS.test(s) };
const BUS = words(["bus", "buses", "autobus", "autobuses", "autocarro", "linja-auto", "buss", "bussid", "autobusai", "autobusy", "busz", "λεωφορεί", "автобус", "public transport", "openbaar vervoer", "joukkoliikenne", "bussit", "bussien", "öffentlicher verkehr", "nahverkehr", "trasporto pubblico", "transporte público", "kollektivtrafik", "julkinen liikenne", "ühistransport", "sabiedriskais transports", "viešasis transportas", "transport publiczny", "veřejná doprava", "tömegközlekedés", "transport public", "ferry", "ferries", "fähre", "veerboot"]);
const FERRY = stems(["traghett", "ferri", "ferry", "fähr", "veerdienst", "färj", "færge", "ferje", "lautta", "praam", "keltuv", "trajekt", "ferribot", "πλοί", "фериб"]);
const TICKETS = stems(["kaartje", "ov-chipkaart", "liput", "lipun", "ticket", "billet", "bigliett", "billete", "bilhete", "biljett", "biljet", "lippu", "lipu", "pilet", "biļet", "bilieta", "bilet", "jízdenk", "lístok", "lístk", "jegy", "εισιτήρ", "билет", "karta", "karte", "fahrkart", "vozovnic", "vozni"]);
const TIMETABLE = stems(["horaire", "reisplanner", "journey planner", "fahrplanauskunft", "red plovidbe", "kustības sarakst", "fahrplan", "timetable", "dienstregeling", "orari", "horario", "horário", "tidtabell", "køreplan", "aikataul", "sõiduplaan", "kustības saraksts", "tvarkarašt", "rozkład jazdy", "jízdní řád", "cestovný poriadok", "menetrend", "mersul", "δρομολόγ", "разписание", "vozni red", "departures", "abfahrt", "vertrek"]);
const JOURNEY = stems(["flight search", "find flights", "book a flight", "book flights", "vluchten zoeken", "vlucht zoeken", "flüge suchen", "flug suchen", "rechercher des vols", "recherche de vols", "cerca voli", "cercare voli", "buscar vuelos", "pesquisar voos", "wyszukaj loty", "szukaj lotów", "reise", "reiz", "travel", "voyage", "viaggi", "viaje", "viagem", "resa", "rejse", "reise", "matka", "reis", "ceļojum", "kelion", "podróż", "cest", "utaz", "călători", "ταξίδ", "пътуван", "putovan", "potovan", "fahrt", "journey", "trips ", "check in", "check-in", "boarding", "destinations", "destinazioni", "destinos"]);
const STATIONS = stems(["gare", "gares", "bahnhof", "bahnhöfe", "station", "stations", "estación", "estaciones", "stazione", "stazioni", "stacja", "nádraží", "stanica", "pályaudvar", "gară", "σταθμ", "гара", "kolodvor", "postaj", "asema", "jaam", "stotis", "airport", "aéroport", "flughafen", "aeroporto", "aeropuerto", "luchthaven"]);
const DISRUPTIONS = stems(["info trafic", "verkeersinformatie", "reisinformatie", "storingen", "störungen", "verkehrsinformation", "infomobilità", "estado del servicio", "service status", "travel updates", "häiriöt", "liikennetiedote", "výluky", "utasinformáció", "info trafic"]);
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
  "myndighet", "myndigheten", "behörde", "bundesamt", "landesamt", "virasto", "úřad", "urząd", "úrad", "hivatal", "e-tjänster", "e-government", "rathaus", "stadhuis", "town hall", "hôtel de ville", "municipio",
  // 3.6 (G6): "site officiel", "sito ufficiale", "sitio oficial", "offizielle website" were removed:
  // every museum, brand or club calls its own website "official"; it says nothing about government.
  "portál občana", "portal obywatela", "citizen portal", "bürgerservice", "services publics", "service public", "servizi pubblici", "servicios públicos", "serviços públicos", "e-government", "rijksoverheid", "overheid", "government", "regierung", "gouvernement", "governo", "gobierno", "vláda", "rząd", "kormány", "guvernul", "κυβέρνησ", "правителств", "vlada",
]);
const CITIZEN_SERVICES = stems(["služby občan", "služby podnikat", "životní událost", "občan", "citizen", "bürger", "citoyen", "cittadin", "ciudadan", "cidadão", "medborgar", "borger", "kansalai", "kodanik", "pilsoņ", "piliet", "obywatel", "občan", "állampolgár", "cetățe", "πολίτ", "гражд", "građan", "državljan", "inwoner", "loket", "digid"]);

// ---------------------------------------------------------------- education
const UNIVERSITY = stems([
  "universit", "univerzit", "univerza", "universidad", "universidade", "università", "université", "uniwersytet", "yliopist", "ülikool", "egyetem",
  "πανεπιστήμ", "университет", "sveučiliš", "hogeschool", "hochschule", "fachhochschule", "politecnic", "polytechn", "technische universität", "academy of", "akademi",
]);
const EDU_SUPPORT = stems(["fakult", "faculty", "facoltà", "facultad", "faculdade", "faculté", "studium", "študij", "štúdi", "studi", "students", "studenten", "studenti", "estudiant", "étudiant", "estudant", "studerend", "opiskelij", "üliõpilas", "studentai", "studenci", "hallgató", "φοιτητ", "студент", "opleiding", "onderwijs", "onderzoek", "studiengang", "corsi di laurea", "grado", "licenciatur", "bachelor", "master", "výskum", "výzkum", "research", "forschung", "recherche", "ricerca", "investigación"]);

// ---------------------------------------------------------------- health
// Academic medical centres name themselves as hospitals, often inside a
// university name ("Universitätsmedizin", "UMC", "CHU"). Care is their primary
// activity; teaching and research are secondary.
const MEDICAL_CENTRE = words([
  "universitätsmedizin", "hochschulmedizin", "universitätsklinikum", "universitätsklinik\\p{L}*", "uniklinik\\p{L}*", "klinikum",
  "university hospitals?", "university medical cent(?:er|re)", "academic medical cent(?:er|re)", "university clinic",
  "medisch centrum", "academisch ziekenhuis", "universitair ziekenhuis", "universitair medisch centrum", "universitaire ziekenhuizen",
  "centre hospitalier(?: universitaire| régional)?", "hôpital universitaire", "hôpitaux universitaires", "cliniques universitaires",
  "azienda ospedaliera(?: universitaria)?", "policlinico", "ospedale universitario",
  "hospital universitari[oa]?", "hospital clínic", "complejo hospitalario", "centro hospitalar(?: universitário)?",
  "universitetssjukhus\\p{L}*", "universitetshospital\\p{L}*", "universitetssygehus\\p{L}*", "yliopistollinen sairaala", "yliopistosairaala",
  "fakultní nemocnice", "fakultná nemocnica", "szpital uniwersytecki", "szpital kliniczny", "uniwersytecki szpital kliniczny",
  "klinički bolnički centar", "univerzitetni klinični center", "spitalul clinic", "egyetemi klinik\\p{L}*", "ülikooli kliinikum", "πανεπιστημιακό νοσοκομείο",
]);
/** Acronyms are only medical names next to a care concept ("UMC Utrecht", "CHU de Lille"). */
const MEDICAL_CENTRE_ACRONYM = words(["umc", "mc", "chu", "chru", "aphp", "ap-hp", "uz", "ukm", "uke"]);
const HEALTH_CONCEPTS: Array<[string, RegExp]> = [
  ["health", stems(["gezondheid", "gezond", "health", "gesundheit", "santé", "salute", "salud", "saúde", "hälsa", "sundhed", "helse", "terveys", "tervis", "veselīb", "sveikat", "zdrow", "zdraví", "zdravie", "egészség", "sănătat", "υγεί", "здрав", "zdravlj", "zdravj"])],
  ["care", stems(["patiëntenzorg", "patiëntzorg", "patientenzorg", "patient care", "patientenversorgung", "soins aux patients", "assistenza ai pazienti", "atención al paciente", "excellente zorg", "zorg voor patiënten", "zorgverlen", "zorgaanbied", "gezondheidszorg", "thuiszorg", "ouderenzorg", "jeugdzorg", "vård", "pleje", "hoito", "ravi ", "ravile", "medical care", "healthcare", "gesundheitsversorg", "soins", "cure mediche", "atención sanitaria", "cuidados de saúde", "opieka zdrowotn", "péče", "starostliv", "ellátás", "îngrijir", "περίθαλψ"])],
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


// ---------------------------------------------------------------- 3.6 lexicons
// Telecom operators describe several service families at once: mobile, home
// internet, TV, calling, plans/tariffs and their own network. An electronics
// shop names devices ("smartphones, TV"), a web agency names "internet"; neither
// names three families including plans, an operator or calling (G2).
const TEL_MOBILE = either(
  stems(["mobilfunk", "handytarif", "mobilabonnement", "mobilabonnemang", "mobiilili", "mobiel abonnement", "mobiele telefonie", "mobile plan", "mobile phone plan", "forfait mobile", "forfaits mobile", "offerte mobile", "tarifa móvil", "tarifas móvil", "telefonia mobile", "telefonía móvil", "telefonia móvel", "komórkow", "sim only", "sim-only", "esim"]),
  words(["mobilt", "mobilní", "mobilný", "mobilné", "5g", "4g", "lte"]),
);
const TEL_INTERNET = either(TELECOM_ACCESS, words(["internet", "wifi", "wi-fi", "dsl", "vdsl", "internetu", "internetem", "internetin", "box internet", "fibernet"]));
const TEL_TV = either(words(["tv"]), stems(["televis", "televiz", "telewiz", "televíz", "fernseh", "télévis", "tv-pakket", "tv-pakete", "streaming"]));
const TEL_CALLING = stems(["bellen", "vaste telefonie", "telefonie", "telefonía", "telefonia", "festnetz", "volání", "rozmow", "appels illimités", "appels", "chiamate", "llamadas", "anrufe", "telefonieren", "unlimited calls", "calling", "puhelut", "samtal"]);
// Germanic compounds ("familieabonnementer", "Mobilfunkabonnement") carry the
// plan word inside the word, so that one stem may also match mid-word.
const TEL_PLANS_COMPOUND = /\p{L}(?:abonnement|abonnemang|abonament)/iu;
const TEL_PLANS_BASE = stems(["abonnement","abonament", "abbonament", "tarif", "tarief", "forfait", "liittymä", "abonnemang", "předplatn", "plány", "pakket", "pakete", "tv-pakket", "plans", "bundles", "bundel"]);
const TEL_PLANS = either(TEL_PLANS_BASE, TEL_PLANS_COMPOUND);
const TEL_OPERATOR = stems(["operátor", "operator", "opérateur", "operatore", "operador", "operaattori", "provider", "anbieter", "netzanbieter", "netz", "netwerk", "network", "réseau", "rete mobile", "red móvil", "sieć", "síť", "teleselskab", "teleoperatør", "teleföretag", "telekom", "telecom"]);
const TELECOM_FAMILIES: Array<[string, { test: (s: string) => boolean }]> = [
  ["mobiel", TEL_MOBILE], ["internet", TEL_INTERNET], ["tv", TEL_TV], ["bellen", TEL_CALLING], ["abonnementen/tarieven", TEL_PLANS], ["netwerk/operator", TEL_OPERATOR],
];
// An energy or electricity company that names itself as such (G3).
const ENERGY_COMPANY = stems([
  "energiayhtiö", "sähköyhtiö", "energieversorger", "stromanbieter", "stromversorger", "energiebedrijf", "energieleverancier", "energy company", "energy supplier",
  "utility company", "electricity supplier", "electricity company", "elbolag", "elselskab", "energiselskab", "strømleverandør", "kraftselskap", "energibolag",
  "compañía de luz", "compañía eléctrica", "comercializadora de luz", "comercializadora eléctrica", "fournisseur d'énergie", "fournisseur d'électricité", "fournisseur d’énergie", "fournisseur d’électricité",
  "fornitore di energia", "fornitore di luce", "fornecedor de energia", "comercializador de energia", "dostawca energii", "spółka energetyczn", "dodavatel energie", "energetická společnost",
  "áramszolgáltató", "energiaszolgáltató", "furnizor de energie", "furnizor de electricitate", "energiaettevõte", "energoapgād",
]);
// Real-estate portals and agencies name homes for sale/rent (G4).
const REAL_ESTATE = stems([
  "inmobiliari", "portal inmobiliario", "pisos en venta", "pisos en alquiler", "alquiler de pisos", "venta de pisos", "casas en venta", "pisos y casas",
  "immobilien", "immobilienangebot", "immobilienportal", "wohnungen mieten", "wohnungen kaufen", "häuser kaufen", "häuser mieten", "makler",
  "immobilier", "immobilière", "annonces immobili", "appartements à louer", "appartements à vendre", "maisons à vendre", "maisons à louer",
  "immobiliar", "annunci immobiliari", "case in vendita", "appartamenti in vendita", "appartamenti in affitto", "case in affitto",
  "imóveis", "imobiliári", "apartamentos à venda", "casas à venda", "nieruchomości", "mieszkania na sprzedaż", "mieszkania na wynajem",
  "nemovitost", "byty k pronájmu", "byty na prodej", "ingatlan", "imobiliare", "asunnot", "myytävät asunnot", "vuokra-asunnot", "kiinteistö",
  "bostäder", "lägenheter till salu", "villor till salu", "bostadspriser", "boliger til salg", "boliger til leje", "woningaanbod", "huurwoningen", "koopwoningen", "makelaar",
  "real estate", "homes for sale", "property for sale", "properties for sale", "property portal", "houses for sale", "flats to rent", "apartments for rent",
]);
const SALE_OR_RENT = stems(["en venta", "en alquiler", "kaufen", "mieten", "à louer", "à vendre", "in vendita", "in affitto", "à venda", "para alugar", "na sprzedaż", "na wynajem", "na prodej", "k pronájmu", "till salu", "uthyres", "til salg", "til leje", "te koop", "te huur", "for sale", "for rent", "to rent", "myytävät", "vuokra"]);
// Non-profit organisations (G4). Strong terms name the organisation type or
// its cause; a need + support call is the humanitarian pattern.
const NGO_STRONG = either(
  words(["ngo", "ngos", "ong", "ongs", "onlus", "ngo's"]),
  stems(["non-profit", "nonprofit", "non profit", "goede doel", "goed doel", "liefdadig", "charity", "charitable", "wohltätig", "gemeinnützig", "hilfsorganisation", "hulporganisatie",
    "association humanitaire", "organisation humanitaire", "organizzazione umanitaria", "organización humanitaria", "organização humanitária", "humanitarian organi", "humanitaire organisatie",
    "human rights", "mensenrechten", "menschenrechte", "droits humains", "droits de l'homme", "droits de l’homme", "diritti umani", "derechos humanos", "direitos humanos", "prawa człowieka",
    "naturschutz", "artenschutz", "umweltschutz", "tierschutz", "natuurbescherming", "nature conservation", "wildlife conservation", "protection de la nature", "tutela della natura"]),
);
const NGO_NEED = stems(["mensen in nood", "people in need", "menschen in not", "personnes dans le besoin", "persone in difficoltà", "personas necesitadas", "noodhulp", "disaster relief", "katastrophenhilfe", "aide humanitaire", "aiuti umanitari", "ayuda humanitaria", "humanit", "umanitari"]);
const NGO_SUPPORT_CALL = stems(["doneer", "doneren", "donate", "donation", "spenden", "spende", "faire un don", "faites un don", "dona ora", "donare", "haz un donativo", "hazte socio", "help je mee", "help mee", "hilf mit", "aidez-nous", "aiutaci", "ayúdanos", "become a member", "word lid", "word donateur"]);
// Hotels name themselves in the title and describe rooms or booking a stay (G5).
const HOTEL_TITLE = words(["hotel", "hotels", "hôtel", "hôtels", "albergo", "alberghi", "hostal", "hostales", "hostel", "hostels", "pousada", "boutique hotel", "boutique hotels"]);
const HOTEL_STAY = stems(["rooms", "kamers", "zimmer", "chambres", "camere", "habitaciones", "quartos", "pokoje", "huoneet", "rum ", "book your stay", "boek je verblijf", "jetzt buchen", "buchen", "réservez", "prenota", "reserva", "overnacht", "overnight", "stay", "beds", "nights"]);
// Amusement and theme parks (tourism & recreation).
const AMUSEMENT = stems([
  "forlystelse", "pretpark", "attractiepark", "amusement park", "theme park", "freizeitpark", "vergnügungspark", "erlebnispark", "parc d'attractions", "parc d’attractions", "parc à thème",
  "parco divertimenti", "parco a tema", "parque de atracciones", "parque temático", "nöjespark", "fornøyelsespark", "huvipuisto", "lunapark", "zábavní park", "vidámpark", "park rozrywki",
  "achterbahn", "achtbaan", "roller coaster", "rutsjebane", "berg-och-dalbana",
]);
// SaaS products named by their category, not by the word "software" (G9).
const SAAS_PRODUCT = stems([
  "crm", "erp", "invoicing", "facturatie", "facturation", "fatturazione", "facturación", "faturação", "rechnungsprogramm", "buchhaltungssoftware", "boekhoudsoftware", "boekhoudprogramma",
  "accounting software", "hr-software", "hr software", "personalsoftware", "payroll", "salarisadministratie", "lohnabrechnung", "project management software", "projectmanagement",
  "business software", "bedrijfssoftware", "unternehmenssoftware", "logiciel de gestion", "gestionale", "helpdesk software", "ticketing software", "marketing automation", "in one tool", "all-in-one software", "cloud software",
]);
// A first title part that only says "home" carries no organisation name (G8).
const GENERIC_TITLE_PART = /^(?:home|home ?page|homepage|start|startseite|startsida|startside|accueil|inicio|início|welkom|welcome|willkommen|bienvenue|benvenuti|bienvenido|etusivu|strona główna|úvod|kezdőlap|forside|pagina iniziale|página principal)$/i;

// ---------------------------------------------------------------- retail veto
// Retail self-description in the main EU languages. When a page's own identity
// says it sells goods online, ambiguous words (credit, tickets, travel, health)
// describe the assortment and never the company.
const RETAIL_SELF = stems([
  "webshop", "webwinkel", "online winkel", "onlineshop", "online shop", "online-shop", "online store", "shop online", "online kopen", "online bestellen", "online kaufen", "online bestellen",
  "negozio online", "negozio di", "vendita online", "acquista online", "boutique en ligne", "achat en ligne", "tienda online", "tienda en línea", "compra online", "loja online", "compras online",
  "nettbutikk", "nettbutik", "webbutik", "webbshop", "verkkokaup", "e-pood", "interneta veikal", "internetinė parduotuv", "el. parduotuv", "sklep internetow", "sklep online", "internetový obchod", "internetový obchod", "e-shop", "webáruház", "online áruház", "magazin online", "ηλεκτρονικό κατάστημ", "онлайн магазин", "internetska trgovin", "spletna trgovin", "lebensmittel online", "supermarkt online", "supermercato online", "supermarché en ligne",
]);

// ---------------------------------------------------------------- culture
const CULTURE = stems([
  "museum", "musée", "museo", "museu", "muzeum", "múzeum", "muzej", "muusem", "muziej", "μουσεί", "музей", "museet", "museo",
  "theater", "theatre", "théâtre", "teatro", "teatr", "divadl", "színház", "teater", "teatteri", "θέατρ", "театър", "kazalište", "gledališ",
  "schouwburg", "concertgebouw", "philharmon", "filharmon", "opéra", "opera", "konzerthaus", "festival", "galerie", "galleria", "galería", "kunsthal",
  // 3.6: plural/other forms (Gallerie, gallerier, musei, muzea).
  "gallerie", "galleri", "musei", "muzea", "museos", "museus",
]);
const CULTURE_SUPPORT = stems(["exposit", "exhibit", "ausstellung", "mostr", "exposici", "exposiç", "utställning", "udstilling", "näyttely", "näitus", "izstād", "paroda", "wystaw", "výstav", "kiállítás", "expoziț", "έκθεσ", "изложб", "izložb", "razstav", "tentoonstel", "billetterie", "biglietteria", "taquilla", "bilheteira", "programma", "programme", "spielplan", "agenda", "voorstelling", "concert", "konzert", "collectie", "collection", "sammlung", "collezione",
  // 3.6: visitor information that museums and venues name in their own description.
  "biglietti", "orari", "mostre", "opening hours", "openingstijden", "öffnungszeiten", "horaires", "horarios", "entradas", "tickets"]);

// Audience clauses name customers, not the organisation: "marketing para
// hoteles, aerolíneas y bancos", "software for banks", "advies voor ziekenhuizen".
const ORG_PLURAL = "(?:versicherungen|versicherer|insurance companies|assurances|assicurazioni|aseguradoras|seguradoras|hotels|hoteles|hôtels|alberghi|aerolíneas|airlines|compagnies aériennes|compagnie aeree|fluggesellschaften|luchtvaartmaatschappijen|banks|banken|bancos|banques|banche|ziekenhuizen|hospitals|hôpitaux|ospedali|hospitales|krankenhäuser|universities|universiteiten|universités|universidades|scholen|schools|gemeenten|municipalities|overheden|governments|webshops|retailers|winkels|tiendas|negozi|bedrijven|companies|empresas|entreprises|aziende|unternehmen|klanten|clients|kunden|clientes|clienti|vervoerders|carriers|verzekeraars|insurers|media|uitgevers|publishers|nonprofits|non-profits|charities|ngos|ngo's|goede doelen|stichtingen|vereine|associations|makelaars|real estate agents|estate agents|realtors|energy companies|utilities|energiebedrijven|telecom operators|operators)";
const AUDIENCE = new RegExp(`(?<![\\p{L}])(?:for|voor|für|pour|per|para|dla|pro|för|til|για|за)\\s+[^.|–—:;!?]{0,40}?(?<![\\p{L}])${ORG_PLURAL}(?![\\p{L}])[^.|–—:;!?]{0,60}`, "giu");
export function stripAudience(text: string): string {
  return String(text || "").replace(AUDIENCE, " ");
}

/** Blogs, magazines, guides and comparison sites write ABOUT a sector. */
export function isPublication(identity: string, schemaTypes: string[] = []): boolean {
  return /(?<![\p{L}])\p{L}*(?:blog|vlog)(?![\p{L}])|(?<![\p{L}])(?:magazine|magazin|tijdschrift|revista|rivista|zeitschrift|reisgids|travel guide|guide de voyage|vergelijk|vergleich|comparateur|comparador|review|reviews)(?![\p{L}])/iu.test(identity)
    || schemaTypes.some((t) => ["blog", "blogposting"].includes(String(t).toLowerCase()));
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

const TITLE_FAMILIES: Array<{ sector: EuSector; key: string; label: string; primaryLabel: string; re: RegExp }> = [
  { sector: "transport_travel", key: "postal_logistics", label: "Post & logistiek", primaryLabel: "Post- & pakketvervoer", re: stems(["postal", "postali", "postale", "postaux", "postales", "postais", "post- en", "postdienst", "postdienste", "pocztow", "poštov", "postipalvel", "logistic", "logistiek", "logistik", "logistique", "logistica"]) },
  { sector: "financial_services", key: "financial_services", label: "Financiële diensten", primaryLabel: "Financiële diensten", re: stems(["financial services", "finanziari", "finanzdienst", "services financiers", "servicios financieros", "serviços financeiros", "financiële diensten", "banking", "bancari", "bancaires", "bancarios", "bankdienst"]) },
  { sector: "financial_services", key: "financial_insurance", label: "Verzekeringen", primaryLabel: "Verzekeringen", re: stems(["insurance", "assicurativ", "versicherung", "assurances", "seguros", "verzekering"]) },
  { sector: "telecom_technology", key: "telecom_technology", label: "Telecom", primaryLabel: "Telecom & Technologie", re: stems(["telecom", "telecomunicazion", "telekommunikation", "télécommunications", "telecomunicaciones", "mobile and broadband", "fibra e mobile"]) },
  { sector: "energy_utilities", key: "energy_utilities", label: "Energie", primaryLabel: "Energie & Nutsvoorzieningen", re: stems(["energy", "energia", "energie", "énergie", "energía"]) },
];

/**
 * Conglomerates name several primary activities in their own title
 * ("Poste Italiane - Servizi postali, finanziari e assicurativi"). An
 * organisation lists its core activity first, so the FIRST named activity is
 * the primary sector; the others are secondary, and certainty is capped
 * because the site legitimately serves several sectors.
 */
export function detectEuPrimaryIdentity(input: EuIdentityInput): EuIdentity | null {
  const result = detectEuPrimaryIdentityCore(input);
  const title = stripAudience((input.title || "").slice(0, 300));
  const named = TITLE_FAMILIES
    .map((f) => ({ ...f, at: title.search(new RegExp(f.re.source, f.re.flags.replace("g", ""))) }))
    .filter((f) => f.at >= 0)
    .sort((a, b) => a.at - b.at);
  const sectors = [...new Set(named.map((f) => f.sector))];
  if (sectors.length >= 2 && !(result && ["government", "news_media", "education", "health_wellness"].includes(result.sector))) {
    const first = named[0];
    const sameSector = named.filter((f) => f.sector === first.sector);
    const secondary = sectors.slice(1).map((sector) => {
      const items = named.filter((f) => f.sector === sector);
      return { sector, label: items.map((f) => f.label).join(" & "), evidence: ["Genoemd in de eigen titel"] };
    });
    return {
      sector: first.sector,
      key: sameSector.length > 1 ? first.sector : first.key,
      label: sameSector.length > 1 ? sameSector.map((f) => f.label).join(" & ") : first.primaryLabel,
      confidence: "medium",
      confidenceScore: 72,
      // Evidence names only the primary activity; the others are listed as
      // secondary activities (the report self-check rejects foreign-sector words).
      evidence: [`Titel noemt ${sectors.length} hoofdactiviteiten; de eerstgenoemde (${first.label}) is de hoofdsector, de overige staan als nevenactiviteit; zekerheid begrensd`],
      secondary: [...secondary, ...((result?.secondary || []).filter((x) => !sectors.includes(x.sector)))],
    };
  }
  if (result && named.length >= 2 && sectors.length === 1 && sectors[0] === result.sector && result.key === "financial_insurance") {
    return { ...result, key: "financial_services", label: named.map((f) => f.label).join(" & ") };
  }
  return result;
}

function detectEuPrimaryIdentityCore(input: EuIdentityInput): EuIdentity | null {
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
  const publication = isPublication(title + " " + site, [...schema]);
  // Search widgets, reviews and meta-search content are not evidence of operating a carrier.
  const transportIntermediary = /(?:compare|comparison|comparateur|comparador|vergleich|vergelijk|porównyw|confronta|metasearch|aggregator|flight reviews?|airline reviews?|travel blog|reisblog)/iu.test(title);
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

  // 3.6: a structural government host label (gov.xx, gouv.xx, gob.xx) is reserved
  // for public bodies. Alone it gives a probable government identity, never 85+.
  if (!retailer && govHost) {
    return { sector: "government", key: "government", label: "Overheid & Publieke sector", confidence: "medium", confidenceScore: 80,
      evidence: ["Domeinstructuur: overheidslabel in de hostnaam; de titel en omschrijving noemen geen overheidsdienst"] };
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

  if (publication) {
    return { sector: "news_media", key: "publisher_blog", label: "Blog & publicaties", confidence: "medium", confidenceScore: 76,
      evidence: ["Eigen identiteit: blog, magazine, gids of vergelijkingssite (schrijft over een onderwerp, is geen aanbieder ervan)"] };
  }

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

  // 4a. An academic medical centre is primarily care, even inside a university name.
  const careConcepts = distinct(own, HEALTH_CONCEPTS);
  const hospitalSchema = ["hospital", "medicalorganization", "medicalclinic"].some((t) => schema.has(t));
  const medicalName = MEDICAL_CENTRE.test(own) || (MEDICAL_CENTRE_ACRONYM.test(own) && careConcepts.length >= 1);
  if (!retailer && (medicalName || (hospitalSchema && (eduSchema || UNIVERSITY.test(own))))) {
    const teaches = eduSchema || UNIVERSITY.test(own) || EDU_SUPPORT.test(own);
    return { sector: "health_wellness", key: "healthcare_academic", label: "Zorg & Gezondheid · universitair medisch centrum", confidence: "high", confidenceScore: hospitalSchema ? 95 : 92,
      evidence: evidence([medicalName && "Eigen identiteit noemt een (universitair) ziekenhuis of medisch centrum", hospitalSchema && "Structured data: ziekenhuis/zorgorganisatie", careConcepts.length > 0 && `Eigen identiteit noemt zorgconcepten (${careConcepts.join(", ")})`]),
      ...(teaches ? { secondary: [{ sector: "education" as EuSector, label: "Onderwijs & onderzoek", evidence: evidence([UNIVERSITY.test(own) && "Naam of omschrijving noemt universiteit", EDU_SUPPORT.test(own) && "Omschrijving noemt studie/onderzoek", eduSchema && "Structured data: onderwijsinstelling"]) }] } : {}) };
  }
  if (!retailer && (eduSchema || UNIVERSITY.test(title) || (UNIVERSITY.test(own) && EDU_SUPPORT.test(own)))) {
    return { sector: "education", key: "education", label: "Onderwijs & Opleiding", confidence: "high", confidenceScore: eduSchema || UNIVERSITY.test(title) ? 93 : 90,
      evidence: evidence([UNIVERSITY.test(title) && "Titel noemt universiteit/hogeschool", eduSchema && "Structured data: onderwijsinstelling", EDU_SUPPORT.test(own) && "Omschrijving noemt studie/faculteiten/onderzoek"]) };
  }

  // 5. Passenger transport and postal/parcel operators.
  const airlineSchema = schema.has("airline") || schema.has("busorcoachstop") || schema.has("trainstation") || schema.has("airport");
  const modes = [AIR.test(own) && "luchtvaart", RAIL.test(own) && "spoor", (BUS.test(own) || FERRY.test(own)) && "openbaar vervoer/veer"].filter(Boolean) as string[];
  const travelOwn = [TICKETS.test(own) && "vervoersbewijzen", TIMETABLE.test(own) && "dienstregeling", JOURNEY.test(own) && "reis/boeking"].filter(Boolean) as string[];
  if (!retailer && !publication && !transportIntermediary && (airlineSchema || (modes.length >= 1 && (travelOwn.length >= 1 || countSources((s) => AIR.test(s) || RAIL.test(s) || BUS.test(s) || FERRY.test(s)) >= 2)))) {
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
    return { sector: "health_wellness", key: "health_wellness", label: "Zorg & Gezondheid", confidence: "high", confidenceScore: healthSchema ? 94 : 90,
      evidence: [`Eigen identiteit noemt ${healthConcepts.length} zorgconcepten (${healthConcepts.join(", ")})`, ...(healthSchema ? ["Structured data: zorgorganisatie"] : [])] };
  }

  // 7. Telecom and energy suppliers.
  if (!retailer && TELECOM_ACCESS.test(own) && (TELECOM_MOBILE.test(own) || TELECOM_TV.test(own))) {
    return { sector: "telecom_technology", key: "telecom_technology", label: "Telecom & Technologie", confidence: "high", confidenceScore: 90, evidence: ["Eigen identiteit noemt netwerktoegang (glasvezel/breedband) en abonnementen"] };
  }
  // 3.6 (G2): three or more telecom service families, home internet among them,
  // plus plans, an operator/network or calling.
  const telecomFamilies = TELECOM_FAMILIES.filter(([, re]) => re.test(own)).map(([name]) => name);
  if (!retailer && !publication && telecomFamilies.length >= 3 && telecomFamilies.includes("internet")
      && (telecomFamilies.includes("abonnementen/tarieven") || telecomFamilies.includes("netwerk/operator") || telecomFamilies.includes("bellen"))) {
    return { sector: "telecom_technology", key: "telecom_technology", label: "Telecom & Technologie", confidence: "high", confidenceScore: telecomFamilies.length >= 4 ? 90 : 86,
      evidence: [`Eigen identiteit noemt ${telecomFamilies.length} telecomdiensten (${telecomFamilies.join(", ")})`] };
  }
  // 3.6 (G3): the organisation calls itself an energy/electricity company.
  if (!retailer && !publication && ENERGY_COMPANY.test(own)) {
    return { sector: "energy_utilities", key: "energy_utilities", label: "Energie & Nutsvoorzieningen", confidence: "high", confidenceScore: countSources((s) => ENERGY_COMPANY.test(s) || ENERGY.test(s)) >= 2 ? 92 : 88,
      evidence: ["Eigen identiteit: energie- of stroombedrijf"] };
  }
  if (!retailer && (POWER_AND_GAS.test(own) || ENERGY.test(own) && (GAS.test(own) || /\b(?:tarie|tarif|contract|vertrag|contrat|contratt|contrat|leverancier|supplier|anbieter|fournisseur|fornitor|proveedor|fornecedor)/i.test(own)))) {
    return { sector: "energy_utilities", key: "energy_utilities", label: "Energie & Nutsvoorzieningen", confidence: "high", confidenceScore: 90, evidence: ["Eigen identiteit noemt stroom/gas en leveringsvoorwaarden"] };
  }

  // 7b. Manufacturers and industrial suppliers (B2B). A software company that serves
  // industry stays software: it needs a maker word, or a supplier word with hardware.
  const industrial = distinct2(own, INDUSTRIAL);
  const makes = MAKER.test(own);
  const supplies = SUPPLIER.test(own) && (HARDWARE.test(own) || industrial.length >= 2 || /semicond|halfgeleid|halbleit|lithograph|chip/i.test(own));
  const softwareOnly = SOFTWARE.test(own) && !HARDWARE.test(own);
  if (!retailer && !softwareOnly && industrial.length >= 3 && !makes && !supplies && !SOFTWARE.test(own)) {
    return { sector: "manufacturing_industrial", key: "manufacturing_industrial", label: "Industrie & Productie (B2B)", confidence: "medium", confidenceScore: 78,
      evidence: [`Eigen identiteit noemt ${industrial.length} industriële producten/systemen (${industrial.slice(0, 3).join(", ")})`] };
  }
  if (!retailer && !softwareOnly && industrial.length >= 1 && (makes || supplies)) {
    return { sector: "manufacturing_industrial", key: "manufacturing_industrial", label: "Industrie & Productie (B2B)", confidence: "high", confidenceScore: makes && industrial.length >= 2 ? 90 : 86,
      evidence: evidence([makes && "Eigen identiteit: fabrikant/producent", supplies && "Eigen identiteit: leverancier van industriële systemen of componenten", `Industriële sector/producten: ${industrial.slice(0, 3).join(", ")}`]) };
  }

  // 7c. Component makers that name the systems they build, without a maker word
  //     ("Braking systems for cars and bikes"). The title names an industrial object
  //     together with systems/products, and a second own source names it again, or
  //     the site supplies original equipment to vehicle/machine makers.
  //     Medium certainty: no maker word, so the evidence is weaker than 7b.
  const titleIndustrial = distinct2(title, INDUSTRIAL);
  const oemSupply = OEM_SUPPLY.test([own, nav, h2].join(" · "));
  const repeated = distinct2([description, h1, site].join(" · "), INDUSTRIAL).length >= 1;
  // German/Dutch compounds carry the system word inside ("Bremssysteme", "remsystemen").
  const namesSystems = HARDWARE.test(own) || titleIndustrial.some((w) => /syst[eé]m|anlag|rendszer|järjestelm|układ/i.test(w));
  // Buyer guides and tests write about components; they do not make them.
  const aboutComponents = /(?<![\p{L}])(?:best|top \d+|beste|besten|meilleurs?|migliori|mejores|najlepsze|test|tests|tested|reviewed|review|guide|gids|ratgeber|kaufberatung|vergelijk\p{L}*|vergleich\p{L}*|how to|hoe )(?![\p{L}])/iu.test(title);
  if (!retailer && !softwareOnly && !aboutComponents && !SOFTWARE.test(own) && titleIndustrial.length >= 1 && namesSystems && (repeated || oemSupply)) {
    return { sector: "manufacturing_industrial", key: "manufacturing_industrial", label: "Industrie & Productie (B2B)", confidence: "medium", confidenceScore: oemSupply && repeated ? 82 : 78,
      evidence: evidence([`Titel noemt industriële systemen/producten (${titleIndustrial.slice(0, 3).join(", ")})`, repeated && "Omschrijving of H1 noemt deze producten opnieuw", oemSupply && "Navigatie of identiteit noemt levering als eerste montage (original equipment) aan fabrikanten"]) };
  }

  // 7a. Pharmacies, gyms, travel agencies, couriers, software companies.
  if (!retailer && (schema.has("pharmacy") || PHARMACY.test(title) || countSources((s) => PHARMACY.test(s)) >= 2)) {
    return { sector: "health_wellness", key: "pharmacy", label: "Zorg & Gezondheid · apotheek", confidence: "high", confidenceScore: schema.has("pharmacy") ? 93 : 90, evidence: ["Eigen identiteit: apotheek"] };
  }
  if (!retailer && (schema.has("exercisegym") || schema.has("healthclub") || FITNESS.test(title) || countSources((s) => FITNESS.test(s)) >= 2)) {
    return { sector: "fitness_sports", key: "fitness_sports", label: "Sport & Fitness", confidence: "high", confidenceScore: 90, evidence: ["Eigen identiteit: sportschool/fitness"] };
  }
  if (!retailer && (schema.has("travelagency") || TRAVEL_AGENCY.test(title) || countSources((s) => TRAVEL_AGENCY.test(s)) >= 2)) {
    return { sector: "tourism_recreation", key: "travel_agency", label: "Toerisme & Recreatie · reisorganisatie", confidence: "high", confidenceScore: 88, evidence: ["Eigen identiteit: toeristische reisorganisatie (vakanties, pakketreizen)"] };
  }
  if (!retailer && COURIER.test(own) && PARCEL.test(own)) {
    return { sector: "transport_travel", key: "postal_logistics", label: "Post- & pakketvervoer", confidence: "high", confidenceScore: 88, evidence: ["Eigen identiteit: koerier- of pakketdienst"] };
  }
  // 3.6 (G9): a software product named by its category ("CRM", "HR-Software",
  // "invoicing in one tool") together with software wording in its own identity.
  if (!retailer && !publication && ((SAAS_PRODUCT.test(title) && (SOFTWARE.test(own) || SAAS_PRODUCT.test(description) || SOFTWARE_FUNNEL.test(nav + " " + h2)))
      || (SOFTWARE.test(title) && SAAS_PRODUCT.test(own)))) {
    return { sector: "saas_b2b", key: "saas_b2b", label: "SaaS / B2B software", confidence: "high", confidenceScore: 86,
      evidence: ["Eigen identiteit: softwareproduct, benoemd naar productcategorie (bijv. CRM, facturatie, HR-software)"] };
  }
  if (!retailer && SOFTWARE.test(title) && (SOFTWARE_FUNNEL.test(nav + " " + h2 + " " + own) || schema.has("softwareapplication") || schema.has("webapplication"))) {
    return { sector: "saas_b2b", key: "saas_b2b", label: "SaaS / B2B software", confidence: "medium", confidenceScore: 78, evidence: ["Eigen identiteit: softwareproduct met demo-, prijs- of loginfunnel"] };
  }

  // 7b. Museums, theatres, concert halls and festivals.
  const cultureSchema = ["museum", "performingartstheater", "eventvenue", "musicvenue", "artgallery", "theaterevent", "festival"].some((t) => schema.has(t));
  if (!retailer && (cultureSchema && (CULTURE.test(own) || CULTURE_SUPPORT.test(own)) || (CULTURE.test(title) && CULTURE_SUPPORT.test(own)) || countSources((s) => CULTURE.test(s)) >= 2)) {
    return { sector: "events_culture", key: "events_culture", label: "Evenementen & Cultuur", confidence: "high", confidenceScore: cultureSchema ? 93 : 90,
      evidence: evidence([CULTURE.test(own) && "Eigen identiteit: museum, theater, concertzaal of festival", CULTURE_SUPPORT.test(own) && "Eigen identiteit noemt tentoonstellingen, programma of tickets", cultureSchema && "Structured data: museum/podium"]) };
  }

  // 3.6 (G4): real-estate portals and agencies.
  const reSources = countSources((s) => REAL_ESTATE.test(s));
  if (!retailer && !publication && (reSources >= 2 || (REAL_ESTATE.test(title) && SALE_OR_RENT.test(own)) || schema.has("realestateagent"))) {
    return { sector: "real_estate", key: "real_estate", label: "Vastgoed & Makelaardij", confidence: "high", confidenceScore: reSources >= 2 ? 90 : 86,
      evidence: [`Eigen identiteit noemt woningen/vastgoed te koop of te huur (${reSources} identiteitsbron(nen))`] };
  }
  // 3.6 (G4): non-profit organisations (NGO, charity, cause) or a humanitarian
  // need together with a call to donate or help.
  const ngoSchema = schema.has("ngo") || schema.has("nonprofitorganization") || schema.has("charity");
  // A charity that also runs a (gift/fundraising) web shop is still a charity:
  // when the title or schema names the NGO and the shop is only mentioned in the
  // description, the shop is a secondary activity and certainty is lowered.
  const ngoAnchored = ngoSchema || NGO_STRONG.test(title) || (NGO_NEED.test(title) && NGO_SUPPORT_CALL.test(own + " " + nav));
  const shopIsSecondary = retailer && ngoAnchored && !retailSelfDescription(title);
  if ((!retailer || shopIsSecondary) && !publication && (ngoSchema || NGO_STRONG.test(own) || (NGO_NEED.test(own) && NGO_SUPPORT_CALL.test(own + " " + nav)))) {
    return { sector: "nonprofit", key: "nonprofit", label: "Goede doelen & Non-profit", confidence: "high",
      confidenceScore: shopIsSecondary ? 86 : ngoSchema || countSources((s) => NGO_STRONG.test(s)) >= 2 ? 92 : 86,
      evidence: evidence([NGO_STRONG.test(own) && "Eigen identiteit: NGO, goed doel of maatschappelijke missie", NGO_NEED.test(own) && "Eigen identiteit noemt hulp aan mensen in nood", NGO_SUPPORT_CALL.test(own + " " + nav) && "Oproep tot doneren of steunen", ngoSchema && "Structured data: NGO/non-profit", shopIsSecondary && "Nevenactiviteit in de omschrijving; titel of structured data bepaalt de hoofdidentiteit"]) };
  }
  // 3.6 (G5): hotels name themselves in the title and describe rooms or booking.
  const lodgingSchema = ["hotel", "lodgingbusiness", "hostel", "resort", "motel", "bedandbreakfast"].some((t) => schema.has(t));
  if (!retailer && !publication && !transportIntermediary && (lodgingSchema || (HOTEL_TITLE.test(title) && HOTEL_STAY.test(own)))) {
    return { sector: "hospitality", key: "hotel", label: "Hotel / accommodatie", confidence: "high", confidenceScore: lodgingSchema ? 92 : 88,
      evidence: evidence([HOTEL_TITLE.test(title) && "Titel noemt hotel(s)", HOTEL_STAY.test(own) && "Eigen identiteit noemt kamers of boeken van een verblijf", lodgingSchema && "Structured data: hotel/accommodatie"]) };
  }
  // Amusement and theme parks.
  const parkSources = countSources((s) => AMUSEMENT.test(s));
  if (!retailer && !publication && (parkSources >= 1 || schema.has("amusementpark"))) {
    return { sector: "tourism_recreation", key: "amusement_park", label: "Toerisme & Recreatie · attractiepark", confidence: parkSources >= 2 || schema.has("amusementpark") ? "high" : "medium", confidenceScore: parkSources >= 2 || schema.has("amusementpark") ? 88 : 80,
      evidence: [`Eigen identiteit noemt een attractie-/pretpark (${parkSources} identiteitsbron(nen))`] };
  }

  // 8. Medium tier: the homepage names only its brand, but navigation and section
  //    headings describe one activity again and again. Never for retailers.
  if (retailer) return null;
  const structure = [nav, h2].join(" · ");
  const transportStructure = [
    TICKETS.test(structure) && "vervoersbewijzen", TIMETABLE.test(structure) && "dienstregeling",
    (AIR.test(structure) || RAIL.test(structure) || BUS.test(structure) || FERRY.test(structure)) && "vervoerswijze",
    FARES.test(structure) && "tarieven/kortingskaarten", JOURNEY.test(structure + " " + site + " " + h1) && "reizen",
    STATIONS.test(structure) && "stations", DISRUPTIONS.test(structure) && "reisinformatie/storingen",
    (AIR.test(title) || RAIL.test(title) || BUS.test(title) || FERRY.test(title)) && "vervoerswijze in titel",
  ].filter(Boolean) as string[];
  if (!publication && !transportIntermediary && transportStructure.length >= 3 && (transportStructure.includes("vervoersbewijzen") || transportStructure.includes("vervoerswijze") || transportStructure.includes("vervoerswijze in titel"))) {
    return { sector: "transport_travel", key: "passenger_transport", label: "Personenvervoer (spoor, luchtvaart, openbaar vervoer)", confidence: "medium", confidenceScore: 74,
      evidence: [`Navigatie en koppen beschrijven personenvervoer (${transportStructure.join(", ")}); de titel en omschrijving noemen dit niet zelf`] };
  }
  const newsSections = distinct(structure, NEWS_SECTIONS);
  const sectionNews = newsSections.includes("politics") && newsSections.length >= 4 && (NEWS.test(structure + " " + own) || newsSections.includes("world") || newsSections.includes("edition"));
  const structureNews = sectionNews || (NEWS.test(structure) && (PUBLISHER.test(structure) || (TELEVISION.test(structure) && RADIO.test(structure))));
  if (structureNews) {
    return { sector: "news_media", key: "news_media", label: "Nieuws & Media", confidence: "medium", confidenceScore: 72,
      evidence: [sectionNews ? `Navigatie volgt een nieuwsindeling (${newsSections.join(", ")}); de titel noemt dit niet zelf` : "Navigatie en koppen beschrijven nieuws en omroep/redactie; de titel en omschrijving noemen dit niet zelf"] };
  }
  const bankStructure = distinct(structure + " " + own, BANK_CONCEPTS);
  if (bankStructure.length >= 3 && (bankStructure.includes("banking") || bankStructure.includes("accounts") || bankStructure.includes("institution"))) {
    return { sector: "financial_services", key: "financial_banking", label: "Bank & financiële producten", confidence: "medium", confidenceScore: 75,
      evidence: [`Navigatie en koppen beschrijven bankproducten (${bankStructure.join(", ")}); de titel noemt dit niet zelf`] };
  }
  const civic = distinct(structure + " " + own, CIVIC_SECTIONS);
  if (civic.length >= 3 && (civic.includes("documents") || civic.includes("governance") || civic.includes("counter"))) {
    return { sector: "government", key: "government", label: "Overheid & Publieke sector", confidence: "medium", confidenceScore: 74,
      evidence: [`Navigatie en koppen beschrijven gemeentelijke/publieke dienstverlening (${civic.join(", ")})`] };
  }
  if (UNIVERSITY.test(structure + " " + site) && EDU_SUPPORT.test(structure + " " + own)) {
    return { sector: "education", key: "education", label: "Onderwijs & Opleiding", confidence: "medium", confidenceScore: 74,
      evidence: ["Navigatie en koppen beschrijven studie en onderzoek aan een onderwijsinstelling"] };
  }
  if (AGENCY.test(title + " " + h1) && AGENCY_SERVICE.test(own + " " + structure)) {
    return { sector: "professional_services", key: "professional_services", label: "Zakelijke dienstverlening", confidence: "medium", confidenceScore: 76,
      evidence: ["Eigen identiteit: bureau/agentschap met zakelijke diensten"] };
  }
  if (POSTAL_SPECIFIC(structure) && PARCEL.test(structure) && PARCEL.test(own)) {
    return { sector: "transport_travel", key: "postal_logistics", label: "Post- & pakketvervoer", confidence: "medium", confidenceScore: 74,
      evidence: ["Navigatie en koppen beschrijven post- en pakketdiensten"] };
  }
  // Last tier: the organisation's NAME states its trade ("X Airlines", "Y Bank",
  // "Hotel Z"). A brand-only title, the og:site_name and the hostname are read for a
  // company-type noun; two independent sources give a confirmed sector, one source a
  // probable one. Never on retailers or publications (checked above).
  const trade = brandTradeNoun(title, site, input.hostname || "");
  if (trade && !retailer && !transportIntermediary && !publication) {
    const confirmed = trade.sources.length >= 2;
    return { sector: trade.sector, key: trade.key, label: trade.label, confidence: confirmed ? "high" : "medium", confidenceScore: confirmed ? 82 : 72,
      evidence: [`${trade.label}: de organisatienaam noemt het soort organisatie ("${trade.noun}") in ${trade.sources.join(" en ")}; de pagina beschrijft het aanbod zelf niet`] };
  }
  return null;
}

// Company-type nouns that only occur in an organisation's own name: carriers,
// banks, railways, telecom operators (lodging has its own stay-evidence rules). Listed per EU language; no brands.
const TRADE_NOUNS: Array<{ re: RegExp; host: RegExp; sector: EuSector; key: string; label: string }> = [
  { re: words(["airlines", "airline", "airways", "aerolíneas", "aerolineas", "linhas aéreas", "linee aeree", "fluggesellschaft", "luchtvaartmaatschappij", "compagnie aérienne", "linie lotnicze"]), host: /(?:airlines?|airways)$/, sector: "transport_travel", key: "passenger_transport", label: "Personenvervoer (spoor, luchtvaart, openbaar vervoer)" },
  { re: words(["railways", "railway", "spoorwegen", "eisenbahn", "ferrovie", "ferrocarriles", "chemins de fer", "koleje"]), host: /(?:railways?|spoorwegen|bahn)$/, sector: "transport_travel", key: "passenger_transport", label: "Personenvervoer (spoor, luchtvaart, openbaar vervoer)" },
  { re: words(["bank", "banque", "banca", "banco", "bancă", "banka", "pankki", "sparkasse", "sparbank", "sparebank", "bankas"]), host: /bank$|^bank|sparkasse$/, sector: "financial_services", key: "financial_banking", label: "Bank & financiële producten" },
  { re: words(["telecom", "telekom", "telecomunicazioni", "telecomunicaciones", "télécom"]), host: /telecom$|telekom$/, sector: "telecom_technology", key: "telecom_technology", label: "Telecom & Technologie" },
  { re: words(["ziekenhuis", "hospital", "krankenhaus", "klinikum", "hôpital", "ospedale", "szpital", "sjukhus", "sygehus", "sairaala", "nemocnice"]), host: /(?:ziekenhuis|hospital|klinikum|krankenhaus)$/, sector: "health_wellness", key: "health_wellness", label: "Zorg & Gezondheid" },
  { re: words(["energie", "énergie", "energia", "energía", "stadtwerke", "elektriciteit"]), host: /(?:energie|energia|stadtwerke)$/, sector: "energy_utilities", key: "energy_utilities", label: "Energie & nutsvoorzieningen" },
  { re: words(["zeitung", "krant", "dagblad", "gazzetta", "gazeta", "tidning", "tidende", "sanomat", "noviny", "dagbladet"]), host: /(?:zeitung|krant|dagblad|gazzetta|gazeta|tidning)$/, sector: "news_media", key: "news_media", label: "Nieuws & Media" },
  { re: words(["ferries", "ferry", "veerdienst", "fähre", "traghetti", "färjor", "busreisen", "autocares"]), host: /(?:ferries|ferry|traghetti)$/, sector: "transport_travel", key: "passenger_transport", label: "Personenvervoer (spoor, luchtvaart, openbaar vervoer)" },
];

/** The trade noun in a short brand name (title or site name) and/or the hostname. */
export function brandTradeNoun(title: string, siteName: string, hostname: string): { sector: EuSector; key: string; label: string; noun: string; sources: string[] } | null {
  // Only short, name-like strings: a long title describes topics, not the company type.
  const nameLike = (value: string) => value && value.split(/\s+/).filter(Boolean).length <= 5 ? value : "";
  // 3.6 (G8): skip a first part that only says "Home"/"Startseite" and read the name after it.
  const titleName = nameLike((title || "").split(/\s*[|–—:]\s*|\s+-\s+/).map((part) => part.trim()).filter(Boolean).find((part) => !GENERIC_TITLE_PART.test(part)) || "");
  const site = nameLike(siteName || "");
  const label = (hostname || "").toLowerCase().replace(/^www\./, "").split(".")[0] || "";
  for (const noun of TRADE_NOUNS) {
    const sources: string[] = [];
    const hit = noun.re.exec(titleName) || noun.re.exec(site);
    if (noun.re.test(titleName)) sources.push("de titel");
    else if (noun.re.test(site)) sources.push("de sitenaam");
    if (label.split("-").some((part) => noun.host.test(part) && part.length >= 4)) sources.push("de domeinnaam");
    // The hostname only corroborates: a domain label alone ("voedselbank", "databank")
    // never establishes a sector.
    if (sources.length && sources[0] !== "de domeinnaam") return { sector: noun.sector, key: noun.key, label: noun.label, noun: hit?.[0] || label, sources };
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
