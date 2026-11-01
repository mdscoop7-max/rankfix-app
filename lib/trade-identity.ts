// General, multilingual vocabulary for construction, installation and trade
// businesses (local service providers). Shared by the scan route's sector
// signals and the sector catalog so both recognise the same professions.
//
// The identity pattern names the PROFESSION or the kind of firm (who the
// organisation is). The activity pattern names what such firms typically do
// for a customer (quote, service area, installation, maintenance, repair).
// A profession word alone never decides the sector: the route still requires
// it in the organisation's own title/description/H1 or schema.
//
// Unicode-aware boundaries are used instead of \b because \b treats accented
// letters (é, ä, ñ) as non-word characters.

const START = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
// A stem may continue into a compound (Dutch/German: "tegelzetter" →
// "tegelzettersbedrijf", "Heizung" → "Heizungsbau").
const STEM_TAIL = "\\p{L}*";

const tradeStems = [
  // NL
  "aannemer", "aannemings", "bouwbedrijf", "bouwonderneming", "bouwservice", "bouwgroep", "renovatiebedrijf", "renovatiespecialist", "verbouwbedrijf", "verbouwspecialist",
  "loodgieter", "installateur", "installatiebedrijf", "installatietechniek", "installatieservice", "cv-?monteur", "cv-?installateur", "cv-?specialist",
  "elektricien", "elektrotechniek", "elektrotechnisch", "dakdekker", "dakdekkers", "dakwerk", "schilders", "schilderwerk", "stukadoor", "stucadoor", "stucwerk",
  "tegelzetter", "tegelwerk", "metselaar", "metselbedrijf", "metselwerk", "voegbedrijf", "voegwerk", "timmerman", "timmerbedrijf", "timmerwerk",
  "glaszetter", "glasservice", "isolatiebedrijf", "isolatiespecialist", "isolatiewerk", "isoleerder", "spouwmuurisolatie",
  "vloerenlegger", "vloerlegger", "parketteur", "keukenmonteur", "badkamerspecialist", "badkamerrenovatie", "badkamerverbouw",
  "grondwerk", "grondverzet", "sloopbedrijf", "sloopwerk", "wegenbouw", "infrabedrijf", "hovenier", "tuinaanleg", "tuinonderhoud",
  "aircomonteur", "airco-?installateur", "aircospecialist", "aircoservice", "aircobedrijf", "warmtepompinstallateur", "warmtepompspecialist", "warmtepompcentrum",
  "zonnepaneleninstallateur", "beveiligingsinstallateur", "alarminstallateur", "klusbedrijf", "klussenbedrijf", "glazenwasser",
  // EN
  "plumber", "plumbing", "electrician", "roofer", "roofing", "plasterer", "plastering", "tiler", "bricklayer", "brickwork",
  "carpentry", "joinery", "glazier", "remodel", "handyman", "landscaper", "landscaping", "groundwork",
  "heating engineer", "hvac", "locksmith",
  // DE
  "bauunternehm", "baufirma", "baugeschäft", "handwerksbetrieb", "fachbetrieb", "sanitär", "heizungsbau", "klempner", "elektriker", "elektroinstallat",
  "dachdecker", "malerbetrieb", "malermeister", "stuckateur", "verputzer", "fliesenleger", "maurerbetrieb", "maurermeister", "zimmerei", "tischlerei",
  "schreinerei", "glaserei", "bodenleger", "parkettleger", "galabau", "landschaftsgärtner", "abbruchunternehm", "tiefbau", "straßenbau",
  // FR
  "plombier", "plomberie", "chauffagiste", "électricien", "couvreur", "plâtrier", "plaquiste", "carreleur", "maçon", "menuisier", "menuiserie",
  "charpentier", "vitrier", "miroitier", "parqueteur", "terrassement", "paysagiste", "jardinier",
  // ES
  "fontanero", "fontanería", "electricista", "albañil", "carpintero", "carpintería", "cristalero", "solador", "techador", "constructora",
  "jardinero", "jardinería", "paisajismo", "excavaciones", "demoliciones", "reformas",
  // IT
  "idraulic", "elettricista", "imbianchino", "muratore", "impresa edile", "carpentiere", "falegname", "piastrellista", "vetraio", "giardiniere",
  "lattoniere", "termoidraulic", "edilizia",
];

// Fixed multi-word phrases (no compound tail).
const tradePhrases = [
  "schilder", "carpenters", "general contractor", "building contractor", "electrical contractor", "roofing contractor", "contractor", "contractors",
  "painter and decorator", "painters and decorators", "painting contractor", "kitchen fitter", "bathroom fitter", "flooring contractor",
  "flooring fitter", "landscape gardeners?", "demolition contractor", "civil engineering contractor", "air conditioning installer",
  "heat pump installer", "solar installer", "solar panel installer", "insulation installer", "security installer", "alarm installer",
  "garten- und landschaftsbau", "entreprise de (?:bâtiment|construction|rénovation|maçonnerie|plomberie|peinture|travaux|couverture|menuiserie)",
  "peintre en bâtiment", "pintor(?:es)? de (?:interiores|casas|pisos|fachadas)", "empresa de pintura", "travaux publics", "empresa de (?:construcción|reformas|fontanería)",
  "impresa (?:di costruzioni|edile)", "ristrutturazioni",
  // Renovation named as the firm's own service to a home (not a DIY topic).
  "(?:woning|huis|keuken|badkamer)renovatie", "renovatie (?:en verbouwing )?van (?:woningen|huizen|panden|badkamers|keukens)",
  // A service to have work done at the customer's premises ("kozijnen laten
  // plaatsen", "Fenster einbauen lassen"): general for professions not listed.
  "laten (?:plaatsen|installeren|aanleggen|vervangen|repareren|renoveren|leggen|zetten|monteren)", "(?:einbauen|montieren|installieren|verlegen|sanieren) lassen",
  "(?:home|house|property) renovations?", "rénovation de (?:maisons?|logements?|appartements?)", "reformas (?:integrales|de (?:viviendas|pisos|casas))",
];

export const TRADE_IDENTITY_PATTERN = new RegExp(
  `${START}(?:(?:${tradeStems.join("|")})${STEM_TAIL}|(?:${tradePhrases.join("|")})${END})`,
  "iu",
);

export const TRADE_ACTIVITY_PATTERN = new RegExp(
  `${START}(?:${[
    // NL
    "offerte", "vrijblijvend", "werkgebied", "servicegebied", "installatie", "installeren", "laten (?:plaatsen|installeren|aanleggen|renoveren)",
    "plaatsen", "onderhoud", "reparatie", "renovatie", "verbouwing", "storing", "spoedservice", "lekkage", "ontstopping", "verstopping", "riolering",
    // EN
    "free quotes?", "quotes?", "areas we cover", "service areas?", "repairs?", "maintenance", "installation", "emergency call-?outs?", "fully insured",
    // DE
    "angebot", "einzugsgebiet", "wartung", "notdienst", "reparatur", "montage", "sanierung",
    // FR
    "devis", "dépannage", "zone d'intervention", "entretien", "rénovation", "installation",
    // ES
    "presupuesto", "reparación", "mantenimiento", "urgencias", "reformas",
    // IT
    "preventivo", "manutenzione", "riparazion[ei]", "ristrutturazion[ei]", "pronto intervento",
    // generic cleaning/sewer activities already handled as local services
    "schoonmaak", "cleaning", "bouw",
  ].join("|")})${END}`,
  "iu",
);

// The organisation presents itself as a maker, wholesaler or online shop of
// the products a trade installs. Such sites can mention installers ("find an
// installer") without being a local service provider themselves.
// No start boundary: suppliers often name themselves in a compound
// ("Sanitairgroothandel", "Dachziegelhersteller").
export const PRODUCT_SUPPLIER_IDENTITY_PATTERN = new RegExp(
  `(?:${[
    "fabrikant", "producent", "manufacturer", "manufacturing", "hersteller", "fabricant", "fabricante", "produttore",
    "groothandel", "wholesale", "wholesaler", "großhandel", "grossiste", "mayorista", "ingrosso", "distributeur", "distributor",
    "webshop", "online shop", "onlineshop", "online kopen", "online bestellen", "online winkel", "bouwmarkt", "baumarkt",
  ].join("|")})${STEM_TAIL}`,
  "iu",
);

const AUDIENCE_PHRASE = new RegExp(
  `${START}(?:voor|for|für|pour|para|per)\\s+(?:de\\s+|the\\s+|den\\s+|les\\s+|los\\s+|gli\\s+)?(?:\\p{L}+[\\s,-]+){0,3}?(?:${tradeStems.join("|")})${STEM_TAIL}`,
  "giu",
);

/**
 * True when the organisation's own title/H1 present it as a product supplier
 * (manufacturer, wholesaler, shop) and NOT as a trade. A trade that also sells
 * materials keeps its trade identity as long as its title or H1 names the trade.
 */
export function productSupplierOverridesTrade(input: { title: string; h1: string; description: string }): boolean {
  // "Groothandel voor installateurs" names the audience, not the trade itself.
  const head = `${input.title} | ${input.h1}`.replace(AUDIENCE_PHRASE, " ");
  const supplierInHead = PRODUCT_SUPPLIER_IDENTITY_PATTERN.test(head);
  const supplierInDescription = PRODUCT_SUPPLIER_IDENTITY_PATTERN.test(input.description);
  if (!supplierInHead && !supplierInDescription) return false;
  return !TRADE_IDENTITY_PATTERN.test(head);
}
