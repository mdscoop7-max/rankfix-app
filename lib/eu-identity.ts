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
  | "education" | "health_wellness" | "telecom_technology" | "energy_utilities" | "events_culture" | "professional_services" | "saas_b2b" | "fitness_sports" | "tourism_recreation" | "manufacturing_industrial" | "automotive";

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

// ---------------------------------------------------------------- news/media
// "news" in the EU languages (plus Luxembourgish, Irish, Maltese).
const NEWS = stems([
  "nieuws", "news", "nachricht", "actualit", "notizi", "notici", "notíci", "nyhet", "nyhed",
  "uutis", "uudis", "ziņ", "naujien", "wiadomoś", "zpráv", "správ", "hírek", "hírad", "știr",
  "ειδήσ", "новин", "vijest", "novic", "aħbar", "noriicht", "nuacht", "infos", "tagesschau",
  // French editorial phrases ("toute l'info en continu", "l'info à la une").
  "info en continu", "toute l'info", "toute l’info", "l'info", "l’info", "à la une", "dernières infos", "flash info",
]);
// Editorial news wording without the generic "infos" ("plus d'infos" is a CTA).
const NEWS_EDITORIAL = stems([
  "nieuws", "news", "nachricht", "actualit", "notizi", "notici", "notíci", "nyhet", "nyhed", "uutis", "uudis", "naujien", "wiadomoś", "zpráv", "hírek", "știr", "ειδήσ", "новин", "vijest",
  "info en continu", "toute l'info", "toute l’info", "l'info", "l’info", "à la une", "dernières infos", "flash info",
]);
// Publisher names built on a news word: "<x>info", "<x>news", "<x>nieuws".
// Only counted together with news wording in another own source, on a homepage.
const NEWS_BRAND = /(?<![\p{L}])\p{L}{3,}(?:info|news|nieuws|actu|nachrichten|notizie|noticias)(?![\p{L}])/iu;
// Self-described publishers, broadcasters and editorial offices.
const PUBLISHER = stems([
  "tagblatt", "tageblatt", "rundschau", "anzeiger", "dagblad", "avisen", "lehti", "noviny",
  "omroep", "broadcast", "rundfunk", "journal", "dagblad", "krant", "newspaper", "zeitung", "giornal",
  "periódic", "periodic", "jornal", "tidning", "dagblad", "sanomaleh", "ajaleh", "laikrakst", "laikraš",
  "gazet", "noviny", "noviny", "újság", "ziar", "εφημερίδ", "вестник", "novine", "časopis", "redaktion",
  "rédaction", "redazion", "redacci", "redakcj", "redakc", "redaktioun", "toimitu", "medielandschaft",
  "infoportal", "nachrichtenportal", "noriichteportal", "nyhetsportal", "persbureau", "presseagentur", "agence de presse",
  "mediabedrijf", "media company", "medienunternehmen", "entreprise de médias", "groupe de médias", "public service media", "openbare omroep", "service public audiovisuel",
]);
// Press relations sections of any organisation (navigation labels, any EU language).
const PRESS_ROOM = new RegExp(`${B}(?:espaces? (?:journalistes|presse|médias)|(?:pour les |for |für |voor )?journalist\\p{L}*|press(?:e)?(?:\\s?(?:room|releases?|office|area|centre|center|kit|contact|bereich|mitteilungen|kontakt|stelle|zentrum))?|presse\\p{L}*|pers(?:berichten|bericht|ruimte|centrum|kamer|contact|zaken)?|newsroom|news ?room|media ?(?:centre|center|room|relations|contact|kit|library)|médias|sala (?:stampa|de prensa|de imprensa)|comunicati stampa|communiqués? de presse|notas de prensa|medienzentrum|medien)${E}`, "giu");
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
const MAKER = stems(["manufactur", "fabrikant", "fabricant", "fabricage", "producent", "productiebedrijf", "hersteller", "herstellung", "fertigung", "fabrication", "produttor", "produzion", "fabbricant", "fabricante", "fabricación", "fabricação", "producător", "valmistaja", "valmista", "tillverk", "fabrikant", "výrobc", "výrob", "gyárt", "κατασκευαστ", "производител", "proizvođač", "proizvajal", "tootja", "ražotāj", "gamintoj", "wytwórc", "producent", "maker of", "makers of", "we make", "we build", "builder of", "machinefabriek", "fabriek", "fabrik", "usine", "fabbrica", "fábrica", "tehdas", "fabryk", "továrn", "wij bouwen", "we bouwen", "ontwerpen en bouwen", "entwickeln und bauen", "concevons et fabriquons", "progettiamo e costruiamo"]);
const SUPPLIER = stems(["supplier", "leverancier", "zulieferer", "ausrüster", "fournisseur", "équipementier", "fornitor", "proveedor", "fornecedor", "dostawc", "toimittaj", "leverantör", "dodavatel", "beszállító", "furnizor", "доставчик", "dobavitelj", "dobavljač", "tarnija", "piegādātāj", "tiekėj"]);
const INDUSTRIAL = stems([
  "semiconductor", "halfgeleider", "halbleiter", "semi-conducteur", "semiconducteur", "semicondutt", "semiconductor", "półprzewodnik", "puolijohde", "halvledar", "polovodič", "félvezető",
  "lithograph", "lithografi", "litograf", "chipmaker", "chip industry", "wafer",
  "machinebouw", "maschinenbau", "werktuigbouw", "machine builder", "machinery", "machines", "maschinen", "machine tools", "werkzeugmaschin", "machines-outils", "macchine", "maquinaria", "máquinas", "maszyn", "koneet", "maskiner", "stroj", "gépgyárt",
  "industrial equipment", "industriële", "industrial", "industry", "industries", "industrie", "industriel", "industriale", "industria", "industrial", "przemysł", "teollisuu", "industri", "průmysl", "ipari",
  "automation", "automatiser", "automatisierung", "automazione", "automatización", "robotics", "robotica", "robotik",
  "components", "componenten", "komponenten", "composants", "componenti", "componentes", "bearings", "lager", "pumps", "pompen", "pumpen", "valves", "kleppen", "ventile", "compressors", "turbines", "turbinen", "generators", "generatoren", "engines", "motoren", "verpakkingsmachine", "voedingsindustrie", "lasers", "laser",
  "steel", "staal", "stahl", "acier", "acciaio", "acero", "chemicals", "chemie", "chimie", "chimica", "química", "plastics", "kunststof", "kunststoff", "packaging machines", "verpakkingsmachines", "electronics manufactur", "precision", "precisie", "präzision",
  "advanced materials", "battery materials", "catalysts", "katalysatoren", "catalyseurs", "specialty chemicals", "spezialchemie",
  "aerospace", "lucht- en ruimtevaart", "luft- und raumfahrt", "aéronautique", "aerospaziale", "aeroespacial",
  // Engineered vehicle components (what component makers name in their own title).
  "braking", "brake", "bremssystem", "bremsanlage", "bremsscheib", "freinage", "freins", "impianti frenanti", "sistemi frenanti", "sistema frenante", "frenado", "sistemas de travagem", "remsystem", "remschijv", "hamulc", "układy hamulcowe", "brzdov", "fékrendszer", "sisteme de frânare", "jarrujärjestelm", "bromssystem", "φρένων",
  "gearbox", "transmissions", "getriebe", "powertrain", "drivetrain", "antriebsstrang", "shock absorbers", "stoßdämpfer", "ammortizzatori", "amortisseurs", "schokdempers", "axles", "achsen",
]);
// Supplying vehicle or machine makers (B2B): "original equipment", "Erstausrüstung", "première monte".
// Only the phrases, never bare "OEM" (aftermarket parts shops say "OEM-kwaliteit").
const OEM_SUPPLY = stems(["original equipment", "first equipment", "erstausrüst", "erstausstatt", "première monte", "premiere monte", "primo equipaggiamento", "primo impianto", "equipo original", "equipamento original", "eerste montage", "pierwszy montaż", "pierwsze wyposażenie", "prvovýbav", "ensiasennus", "originalutrustning"]);
const HARDWARE = stems(["hardware", "systems", "systemen", "systeme", "systèmes", "sistemi", "sistemas", "equipment", "apparatuur", "anlagen", "équipements", "attrezzature", "equipos", "equipamentos", "installations", "installaties", "products", "producten", "produkte", "produits", "prodotti", "productos"]);

// Technology groups that make physical products describe themselves as a
// "(health/energy/materials) technology company". Software firms use the same
// words, so a physical product/material/device word and no software word is required.
const TECH_COMPANY = stems([
  "technology company", "technology companies", "technology group", "technology leader", "technologieleider", "technologieführer", "leader technologique", "leader tecnologico", "líder tecnológico", "materials technology", "materials company", "health technology", "healthtech company", "energy technology", "materials technology", "imaging technology",
  "technologiebedrijf", "technologieconcern", "technologieunternehmen", "technologiekonzern", "technologiegruppe",
  "entreprise technologique", "groupe technologique", "société technologique", "société de technologie", "azienda tecnologica", "gruppo tecnologico", "empresa tecnológica", "grupo tecnológico",
]);
const PHYSICAL_GOODS = stems(["devices", "apparaten", "geräte", "appareils", "dispositivi", "dispositivos", "materials", "materialen", "materiaal", "werkstoff", "matériaux", "materiali", "materiales", "batter", "catalys", "katalys", "imaging", "beeldvorming", "lighting", "verlichting", "monitoring systems", "medical equipment", "medische apparatuur", "products", "producten", "produkte", "produits", "prodotti", "productos"]);
const SOFTWARE = stems(["software", "saas", "platform", "plattform", "plateforme", "piattaforma", "plataforma", "logiciel", "app for", "regtech", "fintech platform"]);
const SOFTWARE_FUNNEL = stems(["book a demo", "free trial", "start trial", "request a demo", "demo aanvragen", "demo anfragen", "gratis proberen", "kostenlos testen", "essai gratuit", "prova gratuita", "prueba gratis", "pricing", "prijzen", "preise", "tarifs", "features", "functies", "funktionen", "integrations", "integraties", "login", "inloggen", "anmelden"]);
// What a business-software vendor says it does for its customers.
const SOFTWARE_ACTION = stems(["automatiseert", "automatiseer", "automates", "automate your", "automatisiert", "automatisieren sie", "automatise", "automatizza", "automatiza", "erp", "crm", "hrm", "payroll", "boekhoudsoftware", "bedrijfssoftware", "business software", "unternehmenssoftware", "logiciel de gestion", "cloudsoftware", "cloud software", "demo aanvragen", "brochure", "proefperiode", "probeer gratis"]);
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
// A bank group describes its own banking business lines and itself as a
// financial-services provider ("banque de détail", "financiële dienstverlener").
BANK_CONCEPTS.push(["business_lines", stems(["banque de détail", "banque privée", "banque de financement", "banque d'investissement", "retail banking", "private banking", "investment banking", "corporate banking", "corporate and investment banking", "privatkundengeschäft", "firmenkundengeschäft", "banca retail", "banca privata", "banca d'investimento", "banca minorista", "banca privada", "banca de inversión", "particuliere bank", "zakelijk bankieren"])]);
const FINANCIAL_GROUP = stems(["services financiers", "financial services", "finanzdienstleist", "servizi finanziari", "servicios financieros", "serviços financeiros", "financiële dienstverlen", "financiële diensten", "financiële instelling", "financial institution", "établissement financier", "groupe bancaire", "banking group", "bankgruppe", "gruppo bancario", "grupo bancario"]);
BANK_CONCEPTS.push(["financial_group", FINANCIAL_GROUP]);
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
// Insurer/pension products: a second concept for an insurer named in one source only.
const INSURANCE_PRODUCTS = stems(["pensioen", "schadeverzeker", "schade melden", "polis", "premie", "pension", "vorsorge", "altersvorsorge", "schaden melden", "prämie", "sinistre", "prévoyance", "previdenza", "sinistro", "siniestro", "jubilación"]);
const FINANCE_SCHEMA = new Set(["bankorcreditunion", "financialservice", "financialproduct", "loanorcredit", "bankaccount", "depositaccount", "mortgageloan", "paymentcard", "creditcard", "investmentorDeposit".toLowerCase()]);

// ---------------------------------------------------------------- transport
const AIR_WORDS = words(["loty", "lotów", "lety", "letenky", "lennud", "lidojumi", "skrydžiai", "flyrejser", "flyg", "lentoja"]);
// German "Flug" as a whole word or in flight compounds only: "Flugblatt" is a leaflet.
const AIR_DE = new RegExp(`${B}(?:flug|flüge|flügen|flugs)${E}|${B}flug(?:ticket|tickets|suche|buchung|plan|zeiten|gesellschaft|hafen|reise|reisen|verbindung|verbindungen|angebote)`, "iu");
const AIR_STEMS = stems(["flight", "vols", "voli", "vuelo", "voos", "vlucht", "lentoliput", "lennot", "lennu", "lidojum", "skrydž", "skryd", "loty ", "letenk", "repülőj", "zbor", "πτήσ", "полет", "airline", "luchtvaart", "fluggesellschaft", "compagnie aérienne", "compagnia aerea", "aerolínea", "companhia aérea", "flygbolag", "lentoyhti", "aviokompan", "linie lotnicze", "letecká", "légitársas"]);
const AIR = { test: (s: string) => AIR_STEMS.test(s) || AIR_WORDS.test(s) || AIR_DE.test(s) };
const RAIL_STEMS = stems(["junaliput", "junien", "railway", "rail ", "spoorweg", "trein", "bahn", "treno", "trenitalia", "comboio", "vilcien", "traukin", "pociąg", "koleje", "vonat", "vasút", "τρέν", "σιδηρόδρομ", "влак", "железниц", "željezn", "železn", "dráhy", "ferrovi", "chemin de fer", "nightjet", "intercity"]);
const RAIL_WORDS = words(["rail", "rails", "zug", "züge", "train", "trains", "tren", "trenes", "trenuri", "tåg", "tog", "juna", "junat", "rong", "rongid", "vlaky", "vlakov", "vlakem", "sncf", "cfr"]);
// "vlak" (Czech/Slovak/Slovene "train") is omitted: in Dutch it means "flat" / "right next to".
const RAIL = { test: (s: string) => RAIL_STEMS.test(s) || RAIL_WORDS.test(s) };
const BUS = words(["bus", "buses", "autobus", "autobuses", "autocarro", "linja-auto", "buss", "bussid", "autobusai", "autobusy", "busz", "λεωφορεί", "автобус", "public transport", "openbaar vervoer", "joukkoliikenne", "bussit", "bussien", "öffentlicher verkehr", "nahverkehr", "trasporto pubblico", "transporte público", "kollektivtrafik", "julkinen liikenne", "ühistransport", "sabiedriskais transports", "viešasis transportas", "transport publiczny", "veřejná doprava", "tömegközlekedés", "transport public", "ferry", "ferries", "fähre", "veerboot"]);
const FERRY = stems(["traghett", "ferri", "ferry", "fähr", "veerdienst", "färj", "færge", "ferje", "lautta", "praam", "keltuv", "trajekt", "ferribot", "πλοί", "фериб"]);
const TICKETS = stems(["kaartje", "ov-chipkaart", "liput", "lipun", "ticket", "billet", "bigliett", "billete", "bilhete", "biljett", "biljet", "lippu", "lipu", "pilet", "biļet", "bilieta", "bilet", "jízdenk", "lístok", "lístk", "jegy", "εισιτήρ", "билет", "fahrkart", "vozovnic", "vozni"]);
// "karta"/"Karte" were removed above: they also mean card ("Kartenzahlung", "Landkarte").
const TIMETABLE = stems(["horaire", "reisplanner", "journey planner", "fahrplanauskunft", "red plovidbe", "kustības sarakst", "fahrplan", "timetable", "dienstregeling", "orari", "horario", "horário", "tidtabell", "køreplan", "aikataul", "sõiduplaan", "kustības saraksts", "tvarkarašt", "rozkład jazdy", "jízdní řád", "cestovný poriadok", "menetrend", "mersul", "δρομολόγ", "разписание", "vozni red", "departures", "abfahrt", "vertrek"]);
const JOURNEY = stems(["flight search", "find flights", "book a flight", "book flights", "vluchten zoeken", "vlucht zoeken", "flüge suchen", "flug suchen", "rechercher des vols", "recherche de vols", "cerca voli", "cercare voli", "buscar vuelos", "pesquisar voos", "wyszukaj loty", "szukaj lotów", "reise", "reiz", "travel", "voyage", "viaggi", "viaje", "viagem", "resa", "rejse", "reise", "matka", "reis", "ceļojum", "kelion", "podróż", "cest", "utaz", "călători", "ταξίδ", "пътуван", "putovan", "potovan", "fahrt", "journey", "trips ", "check in", "check-in", "boarding", "destinations", "destinazioni", "destinos"]);
// "station" is a whole word: as a stem it matched "stationär" (in-store payments).
const STATION_WORDS = words(["station", "stations"]);
const STATION_STEMS = stems(["gare", "gares", "bahnhof", "bahnhöfe", "estación", "estaciones", "stazione", "stazioni", "stacja", "nádraží", "stanica", "pályaudvar", "gară", "σταθμ", "гара", "kolodvor", "postaj", "asema", "jaam", "stotis", "airport", "aéroport", "flughafen", "aeroporto", "aeropuerto", "luchthaven"]);
const STATIONS = { test: (value: string) => STATION_WORDS.test(value) || STATION_STEMS.test(value) };
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
  "portál občana", "portal obywatela", "citizen portal", "bürgerservice", "services publics", "service public", "servizi pubblici", "servicios públicos", "serviços públicos", "e-government", "rijksoverheid", "overheid", "government", "regierung", "gouvernement", "governo", "gobierno", "vláda", "rząd", "kormány", "guvernul", "κυβέρνησ", "правителств", "vlada",
]);
// "Site officiel", "offizielle Website" and the like are used by every brand
// ("Renault France | Site officiel"). They only support a government identity
// that a structural host label or typed schema already establishes.
const GOV_WEAK = words(["site officiel", "site internet officiel", "offizielle website", "offizielle webseite", "offizielle seite", "sito ufficiale", "sitio oficial", "sítio oficial", "site oficial", "officiële website", "official website", "official site", "amt", "digitales amt", "behördenweg\\p{L}*"]);
const ORG_GOVERNANCE = new RegExp(`${B}(?:consejo de gobierno|órganos de gobierno|equipo de gobierno|gobierno corporativo|governo societario|corporate governance|board of governors|governing (?:board|body|council)|gouvernement d'entreprise|gouvernance|governance|raad van bestuur|raad van toezicht|aufsichtsrat|vorstand)${E}`, "giu");
const CITIZEN_SERVICES = stems(["služby občan", "služby podnikat", "životní událost", "občan", "citizen", "bürger", "citoyen", "cittadin", "ciudadan", "cidadão", "medborgar", "borger", "kansalai", "kodanik", "pilsoņ", "piliet", "obywatel", "občan", "állampolgár", "cetățe", "πολίτ", "гражд", "građan", "državljan", "inwoner", "loket", "digid"]);

// ---------------------------------------------------------------- education
const UNIVERSITY = stems([
  "universit", "univerzit", "univerza", "universidad", "universidade", "università", "université", "uniwersytet", "yliopist", "ülikool", "egyetem",
  "πανεπιστήμ", "университет", "sveučiliš", "hogeschool", "hochschule", "fachhochschule", "politecnic", "polytechn", "technische universität", "academy of", "akademi",
]);
const EDU_SUPPORT = stems(["fakult", "faculty", "facoltà", "facultad", "faculdade", "faculté", "studium", "študij", "štúdi", "studi", "students", "studenten", "studenti", "estudiant", "étudiant", "estudant", "studerend", "opiskelij", "üliõpilas", "studentai", "studenci", "hallgató", "φοιτητ", "студент", "opleiding", "studiengang", "corsi di laurea", "grado", "licenciatur", "bachelor", "master", "výskum", "výzkum", "research", "forschung", "recherche", "ricerca", "investigación"]);

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
// "MC" ("Erasmus MC") and "-umc" compounds ("Radboudumc") are medical names only
// next to a care concept, like the other acronyms.
const MEDICAL_CENTRE_ACRONYM = words(["umc", "chu", "chru", "aphp", "ap-hp", "uz", "ukm", "uke", "mc", "\\p{L}{3,}umc\\+?"]);
// Hospitals by name only: "medical"/"clinical" (faculties, clinical research) are not care delivery.
const HOSPITAL = { test: any(
  stems(["ziekenhuis", "krankenhaus", "hôpita", "ospedal", "sjukhus", "sygehus", "sairaal", "haigla", "slimnīc", "ligonin", "szpital", "nemocnic", "kórház", "νοσοκομ", "болниц", "bolnic"]),
  words(["hospital", "hospitals", "hospitales", "hospitais", "spital", "spitalul", "clinic", "clinics", "kliniek", "klinieken", "klinik", "kliniken", "klinikum", "clinique", "cliniques", "clinica", "clínica"]),
) };
const CARE_STEMS = stems(["zorgverlen", "zorgaanbied", "gezondheidszorg", "thuiszorg", "ouderenzorg", "jeugdzorg", "vård", "pleje", "hoito", "ravi ", "ravile", "medical care", "healthcare", "gesundheitsversorg", "soins", "cure mediche", "atención sanitaria", "cuidados de saúde", "opieka zdrowotn", "péče", "starostliv", "ellátás", "îngrijir", "περίθαλψ"]);
const HEALTH_CONCEPTS: Array<[string, Tester]> = [
  // Hospital pages often describe their patients rather than diseases or
  // emergencies. This remains one concept: a patient mention alone cannot
  // establish healthcare, and publication/retail/insurance guards still apply.
  ["patients", stems(["patiënt", "patient", "pazient", "pacient", "pazjent", "potila", "patsient", "pacjen", "paciens", "ασθεν", "пациент"])],
  ["health", stems(["gezondheid", "health", "gesundheit", "santé", "salute", "salud", "saúde", "hälsa", "sundhed", "helse", "terveys", "tervis", "veselīb", "sveikat", "zdrow", "zdraví", "zdravie", "egészség", "sănătat", "υγεί", "здрав", "zdravlj", "zdravj"])],
  // Dutch "zorg" as a word or compound tail ("patiëntenzorg", "topklinische
  // zorg"); "zorgen" (to worry/ensure) and "zorgeloos" do not end in "zorg".
  ["care", { test: (value: string) => /(?<![\p{L}])\p{L}*zorg(?![\p{L}])/iu.test(value) || CARE_STEMS.test(value) }],
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
// Consumer telecom bundles: an operator names internet together with mobile or
// TV AND a fixed line or a plan/subscription ("Internet, TV, mobiel en vaste
// lijn", "forfaits mobile et internet"). Shops list devices ("smartphones, tv's"),
// not lines and plans; broadcasters (radio + TV) are caught earlier.
const TELECOM_INTERNET = words(["internet", "internetabonnement\\p{L}*", "wifi", "wi-fi", "box internet"]);
const TELECOM_MOBILE_PLAIN = words(["mobiel", "mobile", "mobiele", "gsm", "handy", "mobilfunk", "mobil", "móvil", "movil", "telemóvel", "cellulare", "mobilní", "komórk\\p{L}*"]);
const TELECOM_TV_PLAIN = words(["tv", "televisie", "télévision", "fernsehen", "televisione", "televisión", "télé"]);
const TELECOM_FIXED_OR_PLAN = words([
  "vaste lijn", "vaste telefonie", "telefonie", "téléphonie", "téléphone fixe", "ligne fixe", "festnetz", "telefonia fissa", "telefonía fija", "telefone fixo", "fixed line", "landline",
  // In a bundle with internet and mobile/TV, "phone" is the fixed line.
  "phone", "telephone", "téléphone", "telefoon", "telefon", "telefono", "teléfono",
  "network coverage", "mobile coverage", "netwerkdekking", "netzabdeckung", "couverture réseau", "copertura di rete", "cobertura de red", "best network", "beste netwerk",
  "abonnement", "abonnementen", "abonnements", "forfait", "forfaits", "tarif", "tarife", "abo", "abos", "tariffe", "tarifas", "subscription", "subscriptions", "plans", "packs?", "pakket", "pakketten", "offres?",
]);
const MOBILE_PLAN = stems(["sim only", "sim-only", "mobiele abonnement", "mobiel abonnement", "mobile plan", "mobile subscription", "handytarif", "mobilfunktarif", "forfait mobile", "forfaits mobile", "offerte mobile", "tarifa móvil", "tarifas móviles", "piano mobile", "abonnement mobile", "esim"]);
const OWN_NETWORK = stems(["netwerk met dekking", "dekking in", "netwerkdekking", "network coverage", "mobile coverage", "coverage across", "our network", "ons netwerk", "ons 5g", "unser netz", "netzabdeckung", "notre réseau", "couverture réseau", "nostra rete", "copertura", "nuestra red", "cobertura"]);
const ENERGY = stems(["energieleverancier", "energiebedrijf", "energy company", "energy supplier", "energy provider", "electricity", "power producer", "power company", "utility company", "energieunternehmen", "energieanbieter", "energieversorger", "stromerzeuger", "stromanbieter", "fournisseur d'électricité", "fournisseur d’électricité", "producteur d'électricité", "fornitore di energia", "proveedor de energía", "stroom", "strom", "électricité", "elettricit", "electricidad", "eletricidade", "elektricitet", "sähkö", "elekter", "elektroenerģ", "elektros energ", "prąd", "elektřin", "elektrin", "áram", "energie electr", "ηλεκτρικ ρεύμ", "struj", "energy supplier", "energiaszolg", "energia elétrica"]);
const POWER_AND_GAS = stems(["luce e gas", "gas e luce", "luz y gas", "luz e gás", "luz e gas", "strom und gas", "gas und strom", "stroom en gas", "gas en stroom", "électricité et gaz", "gaz et électricité", "el og gas", "el och gas", "sähkö ja kaasu", "prąd i gaz", "elektřina a plyn", "áram és gáz", "energie electrică și gaz"]);
// Power generation: utilities that produce rather than only supply electricity.
const POWER_GENERATION = stems(["renewable energ", "producers of electricity", "producer of electricity", "electricity generat", "electricity produc", "power generation", "stromerzeugung", "production d'électricité", "nucléaire", "nuclear power", "kernenergie", "kernkraft", "hydroelectric", "wasserkraft", "waterkracht", "hydropower", "hydroélectri", "idroelettri", "hidroeléctri", "erneuerbare energie", "renewable energy", "hernieuwbare energie", "duurzame energie", "énergies renouvelables", "energia rinnovabile", "energías renovables", "windkraft", "windenergie", "wind power", "éolien", "kraftwerk", "power plant", "centrale électrique", "kernenergie", "nucléaire", "photovolta", "ökostrom", "groene stroom"]);

// ---------------------------------------------------------------- automotive
// Car makers and dealers name vehicles together with how they are chosen or
// bought (new/electric models, configurator, test drive, dealer network).
const VEHICLES = words(["voiture", "voitures", "véhicule", "véhicules", "auto", "auto's", "autos", "automobile", "automobiles", "car", "cars", "vehicle", "vehicles", "fahrzeug", "fahrzeuge", "pkw", "neuwagen", "veicolo", "veicoli", "coche", "coches", "carro", "carros", "vehículo", "vehículos", "samochód", "samochody", "bil", "bilar", "biler", "automobil", "automobily", "personenauto's", "bedrijfswagens", "utilitaires", "nutzfahrzeuge", "suv"]);
const VEHICLE_OFFER = words([
  "neuve", "neuves", "neuf", "nieuwe", "nieuw", "new", "neue", "neu", "nuove", "nuovi", "nuevo", "nuevos", "novos", "nowe",
  "électrique", "électriques", "hybride", "hybrides", "elektrisch", "elektrische", "electric", "elektro", "elettrica", "elettriche", "eléctrico", "eléctricos", "hybrid",
  "configurateur", "configurator", "konfigurator", "configuratore", "configurador", "essai", "essayer", "proefrit", "probefahrt", "test drive", "prova su strada", "prueba de conducción",
  "concessionnaire", "concessionnaires", "dealer", "dealers", "händler", "concessionari", "concesionario", "concesionarios",
  "gamme", "modèles", "modellen", "modelle", "models", "modelli", "modelos", "occasion", "occasions", "gebrauchtwagen", "leasing", "lease", "privé lease",
]);

// ---------------------------------------------------------------- retail veto
// Retail self-description in the main EU languages. When a page's own identity
// says it sells goods online, ambiguous words (credit, tickets, travel, health)
// describe the assortment and never the company.
const RETAIL_SELF = stems([
  // A shop that names itself the brand's "official store" sells the products itself.
  "official store", "official online store", "official shop", "official online shop", "officiële webshop", "officiële winkel", "offizieller shop", "offizieller online-shop", "boutique officielle", "tienda oficial", "negozio ufficiale", "loja oficial",
  "webshop", "webwinkel", "online winkel", "onlineshop", "online shop", "online-shop", "online store", "shop online", "online kopen", "online bestellen", "online kaufen", "online bestellen",
  "negozio online", "negozio di", "vendita online", "acquista online", "boutique en ligne", "achat en ligne", "tienda online", "tienda en línea", "compra online", "loja online", "compras online",
  "nettbutikk", "nettbutik", "webbutik", "webbshop", "verkkokaup", "e-pood", "interneta veikal", "internetinė parduotuv", "el. parduotuv", "sklep internetow", "sklep online", "internetový obchod", "internetový obchod", "e-shop", "webáruház", "online áruház", "magazin online", "ηλεκτρονικό κατάστημ", "онлайн магазин", "internetska trgovin", "spletna trgovin", "lebensmittel online", "supermarkt online", "supermercato online", "supermarché en ligne",
]);

// ---------------------------------------------------------------- culture
const CULTURE = stems([
  "museum", "musée", "museo", "museu", "muzeum", "múzeum", "muzej", "muusem", "muziej", "μουσεί", "музей", "museet", "museo",
  "theater", "theatre", "théâtre", "teatro", "teatr", "divadl", "színház", "teater", "teatteri", "θέατρ", "театър", "kazalište", "gledališ",
  "schouwburg", "concertgebouw", "philharmon", "filharmon", "konzerthaus", "festival", "galerie", "galleria", "galería", "kunsthal",
]);
// Whole words only: as a stem "opera" matched "operaties" (surgery) and "operations".
const CULTURE_WORDS = words(["opera", "opéra", "operas", "opernhaus", "staatsoper", "oper"]);
const CULTURE_SUPPORT = stems(["exposit", "exhibit", "ausstellung", "mostr", "exposici", "exposiç", "utställning", "udstilling", "näyttely", "näitus", "izstād", "paroda", "wystaw", "výstav", "kiállítás", "expoziț", "έκθεσ", "изложб", "izložb", "razstav", "tentoonstel", "billetterie", "biglietteria", "taquilla", "bilheteira", "programma", "programme", "spielplan", "agenda", "voorstelling", "concert", "konzert", "collectie", "collection", "sammlung", "collezione"]);

// Audience clauses name customers, not the organisation: "marketing para
// hoteles, aerolíneas y bancos", "software for banks", "advies voor ziekenhuizen".
const ORG_PLURAL = "(?:versicherungen|versicherer|insurance companies|assurances|assicurazioni|aseguradoras|seguradoras|hotels|hoteles|hôtels|alberghi|aerolíneas|airlines|compagnies aériennes|compagnie aeree|fluggesellschaften|luchtvaartmaatschappijen|banks|banken|bancos|banques|banche|ziekenhuizen|hospitals|hôpitaux|ospedali|hospitales|krankenhäuser|universities|universiteiten|universités|universidades|scholen|schools|gemeenten|municipalities|overheden|governments|webshops|retailers|winkels|tiendas|negozi|bedrijven|companies|empresas|entreprises|aziende|unternehmen|klanten|clients|kunden|clientes|clienti|vervoerders|carriers|verzekeraars|insurers|media|uitgevers|publishers|financial services|financial institutions|financiële instellingen|finanzinstitute|institutions financières"
  + "|apotheken|apotheke|pharmacies|farmacie|farmacias|studi medici|arztpraxen|artsenpraktijken|cabinets médicaux|consultorios|restaurants|ristoranti|restaurantes|hotellerie|gastronomie|negozi|commercianti|händler|merchants|commerçants|comerciantes|professionisti|professionals|freiberufler|freelancers|zzp'ers|artisans|handwerker|ambachtslieden|dienstleister|dienstverleners|prestataires|liberi professionisti|e-commerce-händler|onlinehändler"
  // Local trades as customers: "software for salons", "voor kappers", "pour les opticiens".
  + "|salons|kapsalons|kappers|hairdressers|barbers|friseure|friseursalons|coiffeurs|salons de coiffure|peluquerías|peluquerias|parrucchieri|opticiens|opticians|optiker|ópticas|opticas|ottici|bakkerijen|bakeries|bäckereien|boulangeries|panaderías|cafés|cafes|bars|beauty salons|schoonheidssalons|horecaondernemers|hoteliers|restaurateurs"
  // Industries served: "Payment für Handel und Mobilität", "software voor de zorg",
  // "solutions pour le transport". The provider names its customers' industry.
  + "|transport|transportbranche|logistik|logistics|logistiek|logistique|logistica|mobilität|mobility|mobiliteit|mobilité|mobilità|handel|einzelhandel|retail|detailhandel|commerce|hotellerie|hospitality|gastronomie|horeca|healthcare|gesundheitswesen|zorg|santé|industrie|industry|industries|tourismus|tourism|toerisme|tourisme|travel|reisebranche|e-commerce|ecommerce|onlinehandel|automotive|autohandel|bouw|construction)";
const AUDIENCE = new RegExp(`(?<![\\p{L}])(?:for|voor|für|pour|per|para|dla|pro|för|til|για|за)\\s+[^.|–—:;!?]{0,40}?(?<![\\p{L}])${ORG_PLURAL}(?![\\p{L}])[^.|–—:;!?]{0,60}`, "giu");
export function stripAudience(text: string): string {
  return String(text || "").replace(AUDIENCE, " ");
}

// A product named after its market ("hotel booking engine", "salon software",
// "restaurant equipment", "kappersbenodigdheden") is made FOR that market; the
// market word is not the organisation's own trade.
const MARKET_PRODUCT = /(?<![\p{L}])[\p{L}-]+\s+(?:booking engine|channel manager|software|platform|pms|pos|crm|kassa\p{L}*|apparatuur|equipment|supplies|benodigdheden|groothandel|wholesale|marketing|websites?|furniture|meubilair)(?![\p{L}])/giu;
// "For your hotel", "voor jouw salon", "pour votre restaurant": the reader's
// business, i.e. the customer, never the writer's own trade.
const YOUR_BUSINESS = /(?<![\p{L}])(?:for|voor|für|pour|para|per)\s+(?:your|je|jouw|uw|ihr(?:en|em|e)?|dein(?:en|em|e)?|votre|vos|ton|ta|tes|tu|tus|su|sus|il tuo|la tua|i tuoi|le tue|il vostro|la vostra)\s+[\p{L}-]+/giu;
export function stripMarketMentions(text: string): string {
  return stripAudience(text).replace(MARKET_PRODUCT, " ").replace(YOUR_BUSINESS, " ");
}

/** Blogs, magazines, guides and comparison sites write ABOUT a sector. */
export function isPublication(identity: string, schemaTypes: string[] = []): boolean {
  return /(?<![\p{L}])\p{L}*(?:blog|vlog)(?![\p{L}])|(?<![\p{L}])(?:magazine|magazin|tijdschrift|revista|rivista|zeitschrift|reisgids|travel guide|guide de voyage|vergelijk|vergleich|comparateur|comparador|review|reviews)(?![\p{L}])/iu.test(identity)
    || schemaTypes.some((t) => ["blog", "blogposting"].includes(String(t).toLowerCase()));
}

export function retailSelfDescription(text: string): boolean {
  return RETAIL_SELF.test(text || "");
}

type Tester = { test: (value: string) => boolean };
function distinct(text: string, concepts: Array<[string, Tester]>): string[] {
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
 * Whether a text names the family of a sector ("energie", "insurance",
 * "telecom", "logistics", "financial services"). Only used as CORROBORATION of
 * an explicit identity found elsewhere, never as identity on its own.
 */
export function sectorFamilyMentioned(sector: string, text: string): boolean {
  const value = stripAudience(String(text || "").slice(0, 600));
  return TITLE_FAMILIES.some((family) => family.sector === sector && family.re.test(value));
}

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
  // An organisation's own governing bodies ("Consejo de Gobierno", "corporate
  // governance", "Raad van Bestuur") are not a public authority.
  const ownWithoutGovernance = own.replace(ORG_GOVERNANCE, " ");
  const govOwn = GOV_TERMS.test(ownWithoutGovernance);
  const govSupported = govOwn || GOV_WEAK.test(own);
  if (!retailer && ((govHost && (govSupported || CITIZEN_SERVICES.test(own + " " + nav + " " + h2))) || (govSchema && (govSupported || govHost)) || countSources((s) => GOV_TERMS.test(s.replace(ORG_GOVERNANCE, " "))) >= 2)) {
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
  const brandName = (title.split(/\s*[|–—:]\s*|\s+-\s+/)[0] || "") + " " + site;
  const newsBrand = NEWS_BRAND.test(brandName) && !publication && !transportIntermediary;
  const newsHigh = !retailer && (newsSchema || broadcaster || publisherOwn && newsSources >= 1
    || (input.homepage !== false && !companyNews && (newsSources >= 2 || (newsBrand && countSources((s) => NEWS_EDITORIAL.test(s)) >= 1))));
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
  if (!retailer && !publication && countSources((s) => INSURANCE.test(s)) === 1 && INSURANCE_PRODUCTS.test(own)) {
    return { sector: "financial_services", key: "financial_insurance", label: "Verzekeringen", confidence: "medium", confidenceScore: 76, evidence: ["Eigen identiteit: verzekeringen in één bron, ondersteund door pensioen-/polis-/schadebegrippen"] };
  }

  // 3b. A financial group that calls itself a financial-services provider
  //     ("coöperatieve financiële dienstverlener", "leader des services financiers").
  //     Customer clauses ("software for financial services") were stripped above.
  const financialGroupSources = countSources((s) => FINANCIAL_GROUP.test(s));
  if (!retailer && !publication && financialGroupSources >= 1) {
    const corroborated = INSURANCE.test(own) || bankConcepts.some((c) => c !== "financial_group") || financialGroupSources >= 2;
    return { sector: "financial_services", key: INSURANCE.test(own) && !bankConcepts.some((c) => c !== "financial_group") ? "financial_insurance" : "financial_services", label: "Financiële diensten",
      confidence: corroborated ? "high" : "medium", confidenceScore: corroborated ? 88 : 77,
      evidence: [`Eigen identiteit noemt de organisatie een financiële dienstverlener${corroborated ? ", met bank- of verzekeringsactiviteiten" : ""}`] };
  }

  // 4. Education: a university/college names itself.
  const eduSchema = schema.has("collegeoruniversity") || schema.has("educationalorganization") || schema.has("school");

  // 4a. An academic medical centre is primarily care, even inside a university name.
  const careConcepts = distinct(own, HEALTH_CONCEPTS);
  const hospitalSchema = ["hospital", "medicalorganization", "medicalclinic"].some((t) => schema.has(t));
  const medicalName = MEDICAL_CENTRE.test(own) || (MEDICAL_CENTRE_ACRONYM.test(own) && careConcepts.length >= 1);
  // A university-named organisation that names a hospital, emergency care or its
  // patients in its OWN identity delivers care ("universitair ... patiëntenzorg,
  // onderzoek en onderwijs"). Research or health topics alone stay education.
  const universityTreatsPatients = (eduSchema || UNIVERSITY.test(own))
    && (HOSPITAL.test(own) || careConcepts.includes("emergency") || (careConcepts.includes("patients") && careConcepts.includes("care")));
  if (!retailer && (medicalName || universityTreatsPatients || (hospitalSchema && (eduSchema || UNIVERSITY.test(own))))) {
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
  const hospitalTitle = (HEALTH_CONCEPTS.find(([n]) => n === "clinic")?.[1] as Tester).test(title) && healthConcepts.length >= 2;
  if (!retailer && (healthSchema || hospitalTitle || healthConcepts.length >= 3 || (healthConcepts.length >= 2 && countSources((s) => distinct(s, HEALTH_CONCEPTS).length > 0) >= 2))) {
    return { sector: "health_wellness", key: "health_wellness", label: "Zorg & Gezondheid", confidence: "high", confidenceScore: healthSchema ? 94 : 90,
      evidence: [`Eigen identiteit noemt ${healthConcepts.length} zorgconcepten (${healthConcepts.join(", ")})`, ...(healthSchema ? ["Structured data: zorgorganisatie"] : [])] };
  }

  // 7. Telecom and energy suppliers.
  if (!retailer && TELECOM_ACCESS.test(own) && (TELECOM_MOBILE.test(own) || TELECOM_TV.test(own))) {
    return { sector: "telecom_technology", key: "telecom_technology", label: "Telecom & Technologie", confidence: "high", confidenceScore: 90, evidence: ["Eigen identiteit noemt netwerktoegang (glasvezel/breedband) en abonnementen"] };
  }
  // A mobile operator: mobile plans together with its own network and coverage
  // ("mobiele abonnementen op ons 5G netwerk met dekking", "forfaits sur notre réseau").
  if (!retailer && !publication && MOBILE_PLAN.test(own) && OWN_NETWORK.test(own)) {
    return { sector: "telecom_technology", key: "telecom_technology", label: "Telecom & Technologie", confidence: countSources((s) => MOBILE_PLAN.test(s)) >= 2 ? "high" : "medium", confidenceScore: countSources((s) => MOBILE_PLAN.test(s)) >= 2 ? 88 : 78,
      evidence: ["Eigen identiteit noemt mobiele abonnementen op een eigen netwerk met dekking"] };
  }
  const bundleSources = countSources((s) => TELECOM_INTERNET.test(s) && (TELECOM_MOBILE_PLAIN.test(s) || TELECOM_TV_PLAIN.test(s)));
  if (!retailer && !publication && !broadcaster && bundleSources >= 1 && TELECOM_FIXED_OR_PLAN.test(own)) {
    return { sector: "telecom_technology", key: "telecom_technology", label: "Telecom & Technologie", confidence: bundleSources >= 2 ? "high" : "medium", confidenceScore: bundleSources >= 2 ? 88 : 78,
      evidence: [`Eigen identiteit noemt een telecombundel (internet met mobiel/tv) in ${bundleSources} identiteitsbron(nen)`, "Eigen identiteit noemt vaste lijn, abonnementen of pakketten"] };
  }
  // Mentioning electricity and gas is not supplying them: an energy-monitoring
  // device, an installer or a comparison app names both too. A supplier names the
  // supply itself (tariff, contract, supplier, delivery) or produces the power.
  const ENERGY_SUPPLY = /\b(?:tarie|tarif|contract|vertrag|contrat|contratt|leverancier|levering|supplier|supply|anbieter|versorger|fournisseur|fourniture|fornitor|fornitura|proveedor|suministro|fornecedor|klant worden|overstappen|switch to|offre|offerta|oferta)/i;
  if (!retailer && (POWER_AND_GAS.test(own) && (ENERGY_SUPPLY.test(own) || POWER_GENERATION.test(own) || countSources((s) => POWER_AND_GAS.test(s)) >= 2 || POWER_AND_GAS.test(title)) || ENERGY.test(own) && (POWER_GENERATION.test(own) || ENERGY_SUPPLY.test(own)))) {
    return { sector: "energy_utilities", key: "energy_utilities", label: "Energie & Nutsvoorzieningen", confidence: "high", confidenceScore: 90, evidence: ["Eigen identiteit noemt stroom/gas en leveringsvoorwaarden"] };
  }

  // 7a'. Vehicle makers and dealers. Car magazines, comparison sites and parts
  // shops are excluded by the publication and retail checks.
  const vehicleSources = countSources((s) => VEHICLES.test(s) && VEHICLE_OFFER.test(s));
  // One source suffices when it names vehicles in two independent ways
  // ("voitures neuves, électriques et hybrides"); otherwise vehicles must recur.
  const richVehicleSource = countSources((s) => VEHICLES.test(s) && distinct2(s, VEHICLE_OFFER).length >= 2) >= 1;
  // Car news, tests and buyer guides write ABOUT vehicles.
  const aboutVehicles = NEWS.test(own) || /(?<![\p{L}])(?:tests?|getest|review\p{L}*|vergelijk\p{L}*|vergleich\p{L}*|comparatif|essais? comparatifs?|kaufberatung|autotest\p{L}*|\p{L}*nieuws|\p{L}*news|ratgeber)(?![\p{L}])/iu.test(own);
  if (!retailer && !publication && !transportIntermediary && !aboutVehicles && vehicleSources >= 1 && (richVehicleSource || countSources((s) => VEHICLES.test(s)) >= 2)) {
    return { sector: "automotive", key: "automotive", label: "Automotive", confidence: vehicleSources >= 2 ? "high" : "medium", confidenceScore: vehicleSources >= 2 ? 88 : 76,
      evidence: [`Eigen identiteit noemt voertuigen met nieuwe/elektrische modellen, configurator, proefrit of dealers in ${vehicleSources} identiteitsbron(nen)`] };
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

  // 7b'. Product-making technology groups ("a leading health technology company").
  if (!retailer && !publication && !SOFTWARE.test(own) && TECH_COMPANY.test(own) && (PHYSICAL_GOODS.test(own) || HARDWARE.test(own) || industrial.length >= 1 || makes)) {
    return { sector: "manufacturing_industrial", key: "manufacturing_technology", label: "Industrie & technologie (fabrikant)", confidence: "medium", confidenceScore: 76,
      evidence: ["Eigen identiteit: technologieconcern dat fysieke producten, apparaten of materialen ontwikkelt (industrie/productie)"] };
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
  // "Gym clothes", "gym bag", "workout gear": the activity word describes a
  // product, not a gym the organisation runs.
  const gymProduct = (value: string) => value.replace(/\b(?:gym|fitness|yoga|pilates|crossfit|sport|workout|training)[- ]?(?:clothes|clothing|wear|apparel|gear|shorts|leggings|tops?|bags?|shoes|equipment|accessories|supplements?|kleding|schoenen|tassen)\b/gi, " ");
  if (!retailer && (schema.has("exercisegym") || schema.has("healthclub") || FITNESS.test(gymProduct(title)) || countSources((s) => FITNESS.test(gymProduct(s))) >= 2)) {
    return { sector: "fitness_sports", key: "fitness_sports", label: "Sport & Fitness", confidence: "high", confidenceScore: 90, evidence: ["Eigen identiteit: sportschool/fitness"] };
  }
  if (!retailer && (schema.has("travelagency") || TRAVEL_AGENCY.test(title) || countSources((s) => TRAVEL_AGENCY.test(s)) >= 2)) {
    return { sector: "tourism_recreation", key: "travel_agency", label: "Toerisme & Recreatie · reisorganisatie", confidence: "high", confidenceScore: 88, evidence: ["Eigen identiteit: toeristische reisorganisatie (vakanties, pakketreizen)"] };
  }
  if (!retailer && COURIER.test(own) && PARCEL.test(own)) {
    return { sector: "transport_travel", key: "postal_logistics", label: "Post- & pakketvervoer", confidence: "high", confidenceScore: 88, evidence: ["Eigen identiteit: koerier- of pakketdienst"] };
  }
  if (!retailer && !publication && SOFTWARE.test(title) && (SOFTWARE_FUNNEL.test(nav + " " + h2 + " " + own) || SOFTWARE_ACTION.test(own) || schema.has("softwareapplication") || schema.has("webapplication"))) {
    return { sector: "saas_b2b", key: "saas_b2b", label: "SaaS / B2B software", confidence: "medium", confidenceScore: 78, evidence: ["Eigen identiteit: softwareproduct met demo-, prijs- of loginfunnel"] };
  }

  // 7b. Museums, theatres, concert halls and festivals.
  const cultureSchema = ["museum", "performingartstheater", "eventvenue", "musicvenue", "artgallery", "theaterevent", "festival"].some((t) => schema.has(t));
  const culture = (value: string) => CULTURE.test(value) || CULTURE_WORDS.test(value);
  if (!retailer && (cultureSchema && (culture(own) || CULTURE_SUPPORT.test(own)) || (culture(title) && CULTURE_SUPPORT.test(own)) || countSources((s) => culture(s)) >= 2)) {
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
    FARES.test(structure) && "tarieven/kortingskaarten", JOURNEY.test(structure + " " + site + " " + h1) && "reizen",
    STATIONS.test(structure) && "stations", DISRUPTIONS.test(structure) && "reisinformatie/storingen",
    (AIR.test(title) || RAIL.test(title) || BUS.test(title) || FERRY.test(title)) && "vervoerswijze in titel",
  ].filter(Boolean) as string[];
  if (!publication && !transportIntermediary && transportStructure.length >= 3 && (transportStructure.includes("vervoersbewijzen") || transportStructure.includes("vervoerswijze") || transportStructure.includes("vervoerswijze in titel"))) {
    return { sector: "transport_travel", key: "passenger_transport", label: "Personenvervoer (spoor, luchtvaart, openbaar vervoer)", confidence: "medium", confidenceScore: 74,
      evidence: [`Navigatie en koppen beschrijven personenvervoer (${transportStructure.join(", ")}); de titel en omschrijving noemen dit niet zelf`] };
  }
  // A press room ("Espace journalistes", "Presse", "Newsroom", "Media centre") serves
  // journalists; it is press relations, not a publication.
  const editorialStructure = structure.replace(PRESS_ROOM, " ");
  const newsSections = distinct(editorialStructure, NEWS_SECTIONS);
  const sectionNews = newsSections.includes("politics") && newsSections.length >= 4 && (NEWS.test(editorialStructure + " " + own) || newsSections.includes("world") || newsSections.includes("edition"));
  const structureNews = sectionNews || (NEWS.test(editorialStructure) && (PUBLISHER.test(editorialStructure) || (TELEVISION.test(editorialStructure) && RADIO.test(editorialStructure))));
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
  // A structural government hostname (gv.at, gouv.fr, gov.uk, gob.es ...) is
  // reserved for public bodies by the registry. Without own wording it is a
  // probable, not a confirmed, government identity.
  if (governmentHostname(input.hostname) && !publication) {
    return { sector: "government", key: "government", label: "Overheid & Publieke sector", confidence: "medium", confidenceScore: 76,
      evidence: ["Domeinstructuur: overheidslabel in de hostnaam (voorbehouden aan publieke instellingen); de pagina beschrijft dit niet zelf"] };
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
  const titleName = nameLike((title || "").split(/\s*[|–—:]\s*|\s+-\s+/).map((part) => part.trim()).filter(Boolean)[0] || "");
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
