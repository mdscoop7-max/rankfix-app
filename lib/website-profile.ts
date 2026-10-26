/**
 * Website profile: three separate dimensions, each with its own status,
 * confidence and evidence (QA #203/#204).
 *
 *   websiteType       what the site IS for a visitor: a webshop, a service
 *                     provider, a publisher, an organisation, or unknown.
 *   commercePlatform  the shop software (WooCommerce, Shopify, Magento, ...).
 *                     A platform is never a branch, and an installed plugin
 *                     without a working shop is never a webshop.
 *   industryVertical  for a webshop: WHAT it sells (beauty, fashion, tools, ...),
 *                     read from its own product and category pages, never from
 *                     the CMS, the word "shop" or a market it serves.
 *
 * An unknown vertical never hides a confirmed webshop: the report then says
 * "Webshop (branche niet bevestigd)" and the webshop checks still run.
 * Pure and deterministic: no network, no site or domain rules.
 */

export type DimensionStatus = "confirmed" | "probable" | "unknown" | "not_applicable" | "installed_no_shop";
export type Dimension = { value: string | null; label: string; status: DimensionStatus; confidence: number; evidence: string[] };
export type WebsiteProfile = {
  websiteType: Dimension;
  commercePlatform: Dimension;
  cms: Dimension;
  frontendFramework: Dimension;
  industryVertical: Dimension;
  /** One line for the report header, e.g. "Webshop · Beauty & huidverzorging · WooCommerce". */
  summary: string;
};

export type CatalogSource = { url: string; kind: "product" | "category" | "homepage"; text: string };

type Vertical = { key: string; label: string; re: RegExp };
const B = "(?<![\\p{L}])";
const stems = (list: string[]) => new RegExp(`${B}(?:${list.join("|")})\\p{L}*`, "iu");

// Catalogue vocabulary per vertical, main EU languages. Product nouns only:
// a market ("voor de luchtvaart") or a service ("behandeling") is not a vertical.
export const VERTICALS: Vertical[] = [
  { key: "beauty_personal_care", label: "Beauty & huidverzorging", re: stems(["skin ?care", "skincare", "huidverzorg", "hautpflege", "soin du visage", "soins visage", "cuidado facial", "cura del viso", "serum", "sérum", "siero", "gezichtsolie", "facial oil", "face oil", "huile visage", "gesichtsöl", "dagcr[eè]me", "nachtcr[eè]me", "day cream", "night cream", "moisturi", "hydraterende", "reiniger", "cleanser", "toner", "zonnebrand", "zonnecr[eè]me", "sunscreen", "sun cream", "spf ?\\d", "cosmetic", "cosmetica", "kosmetik", "cosmétique", "make-?up", "mascara", "lipstick", "lippenstift", "foundation", "parfum", "perfume", "eau de", "shampoo", "conditioner", "deodorant", "nagellak", "nail polish", "oogcr[eè]me", "eye cream", "anti-?aging", "retinol", "body lotion", "bodylotion", "douchegel", "shower gel"]) },
  { key: "fashion_apparel", label: "Mode, kleding & schoenen", re: stems(["kleding", "clothing", "kleidung", "vêtement", "ropa ", "abbigliamento", "jurk", "dress", "kleid", "robe", "t-?shirt", "shirt", "blouse", "jeans", "broek", "trousers", "pants", "hose", "pantalon", "jas ", "jassen", "jacket", "jacke", "veste", "trui", "sweater", "hoodie", "pullover", "legging", "sneaker", "schoen", "shoes", "schuhe", "chaussure", "zapato", "scarpe", "laars", "laarzen", "boots", "stiefel", "derby", "loafer", "sandal", "sokken", "socks", "lingerie", "ondergoed", "underwear", "badmode", "swimwear", "mode ", "fashion"]) },
  { key: "electronics", label: "Elektronica", re: stems(["laptop", "notebook", "smartphone", "telefoon", "televisie", "tv ", "televisions?", "fernseher", "koptelefoon", "headphone", "kopfhörer", "oordop", "earbud", "camera", "kamera", "monitor", "tablet", "oplader", "charger", "powerbank", "elektronica", "electronics", "elektronik", "électronique", "wasmachine", "washing machine", "waschmaschine", "koelkast", "fridge", "kühlschrank", "stofzuiger", "vacuum cleaner", "staubsauger", "speaker", "lautsprecher", "printer", "drucker", "router", "console", "spelcomputer"]) },
  { key: "home_furniture", label: "Wonen & meubels", re: stems(["meubel", "furniture", "möbel", "meuble", "mueble", "mobili", "bank ", "banken", "sofa", "fauteuil", "armchair", "sessel", "eettafel", "dining table", "esstisch", "stoel", "chair", "stuhl", "chaise", "kast ", "kasten", "wardrobe", "schrank", "matras", "mattress", "matratze", "boxspring", "verlichting", "lighting", "leuchte", "hanglamp", "vloerkleed", "rug ", "teppich", "woonaccessoire", "home decor", "wohnaccessoire", "dekbed", "duvet", "beddengoed", "bedding", "gordijn", "curtain"]) },
  { key: "tools_diy", label: "Gereedschap & doe-het-zelf", re: stems(["gereedschap", "werkzeug", "outillage", "herramienta", "utensili", "tools?(?![\\p{L}])", "boormachine", "bohrmaschine", "drill", "akkuschrauber", "accuboor", "schroevendraaier", "schraubendreher", "screwdriver", "zaag", "säge", "saw ", "schuurmachine", "schleifer", "sander", "slijptol", "winkelhaak", "bouwmateria", "baustoff", "ijzerwaren", "hardware store", "doe-het-zelf", "heimwerk", "bricolage"]) },
  { key: "sports_outdoor", label: "Sport & outdoor", re: stems(["fiets", "bicycle", "bike", "fahrrad", "vélo", "bicicleta", "e-bike", "racefiets", "mountainbike", "hardloop", "running shoe", "laufschuh", "fitnessapparat", "fitness equipment", "halter", "dumbbell", "yogamat", "yoga mat", "tent", "zelt", "slaapzak", "sleeping bag", "schlafsack", "wandelschoen", "hiking", "wanderschuh", "kampeer", "camping gear", "ski ", "skischoen", "snowboard", "voetbalschoen", "football boots", "tennisracket", "golfclub"]) },
  { key: "food_beverage", label: "Eten & drinken", re: stems(["koffiebon", "coffee beans", "kaffeebohnen", "koffie", "coffee", "kaffee", "café en grains", "thee", "tea ", "tee ", "wijn", "wine", "wein", "vin ", "vino", "bier", "beer", "chocola", "chocolate", "schokolade", "kaas", "cheese", "käse", "fromage", "levensmiddel", "groceries", "lebensmittel", "épicerie", "delicates", "olijfolie", "olive oil", "pasta", "snoep", "candy", "süßigkeit", "noten", "nuts"]) },
  { key: "toys_kids", label: "Speelgoed & kinderen", re: stems(["speelgoed", "toys?(?![\\p{L}])", "spielzeug", "jouet", "juguete", "giocattol", "knuffel", "plush", "puzzel", "puzzle", "bordspel", "board game", "brettspiel", "kinderwagen", "stroller", "kinderwagen", "babykleding", "baby clothes", "luier", "diaper", "windel"]) },
  { key: "luggage_cases", label: "Koffers, tassen & opbergkisten", re: stems(["koffer", "koffers", "suitcase", "valise", "maleta", "valigi", "trolley", "handbagage", "carry-?on", "flightcase", "flight case", "transportkoffer", "opbergkoffer", "kist", "kisten", "case ", "cases", "rugzak", "backpack", "rucksack", "sac à dos", "tas ", "tassen", "bags?(?![\\p{L}])", "taschen", "handtas", "handbag", "laptoptas", "toilettas", "beauty case"]) },
  { key: "automotive_parts", label: "Auto-onderdelen & accessoires", re: stems(["auto-?onderde", "car parts", "autoteile", "pièces auto", "recambios", "ricambi auto", "banden", "tyres", "tires", "reifen", "pneus", "neumáticos", "velgen", "rims", "felgen", "remblok", "brake pad", "bremsbel", "accu ", "car battery", "autobatterie", "ruitenwisser", "wiper", "motorolie", "engine oil", "motoröl"]) },
  { key: "pets", label: "Dierbenodigdheden", re: stems(["hondenvoer", "dog food", "hundefutter", "kattenvoer", "cat food", "katzenfutter", "dierbenodigd", "dierenwinkel", "pet supplies", "tierbedarf", "croquette", "kattenbak", "litter box", "hondenmand", "dog bed", "krabpaal", "scratching post", "aquarium", "vogelvoer"]) },
  { key: "jewelry_watches", label: "Sieraden & horloges", re: stems(["sieraad", "sieraden", "jewel", "schmuck", "bijou", "joya", "gioiell", "ring ", "ringen", "ketting", "necklace", "halskette", "collier", "armband", "bracelet", "oorbel", "earring", "ohrring", "horloge", "watch(?:es)?(?![\\p{L}])", "armbanduhr", "montre", "reloj", "orologi"]) },
  { key: "books_media", label: "Boeken & media", re: stems(["boek ", "boeken", "books?(?![\\p{L}])", "bücher", "buch ", "livre", "libro", "e-?book", "luisterboek", "audiobook", "hörbuch", "strip", "comic", "vinyl", "lp ", "blu-?ray", "dvd"]) },
  { key: "health_pharmacy", label: "Gezondheid & drogisterij", re: stems(["vitamine", "vitamin", "supplement", "nahrungsergänz", "complément alimentaire", "drogisterij", "drugstore", "drogerie", "pijnstill", "painkiller", "zelfzorg", "self-care", "multivitamine", "probiotic", "probiotica", "omega-?3", "eiwitpoeder", "protein powder"]) },
  { key: "garden", label: "Tuin & buitenleven", re: stems(["tuinmeubel", "garden furniture", "gartenmöbel", "tuingereedschap", "garden tools", "gartengerät", "tuinplant", "kamerplant", "houseplant", "zimmerpflanze", "zaden", "seeds", "saatgut", "bloembol", "bulbs", "grasmaaier", "lawn mower", "rasenmäher", "barbecue", "bbq", "parasol", "vijver", "pond", "potgrond", "potting soil"]) },
  { key: "office_supplies", label: "Kantoor & papier", re: stems(["kantoorartikel", "office supplies", "bürobedarf", "fournitures de bureau", "printpapier", "printer paper", "inktcartridge", "ink cartridge", "toner ", "pennen", "pens ", "notitieboek", "notebook paper", "agenda's", "nietmachine", "stapler"]) },
];

const PLATFORM_LABEL: Record<string, string> = {
  "WooCommerce": "WooCommerce", "WooCommerce (headless)": "WooCommerce (headless)", "Shopify": "Shopify", "Shopify (headless)": "Shopify (headless)",
  "Magento / Adobe Commerce": "Magento / Adobe Commerce", "PrestaShop": "PrestaShop", "OpenCart": "OpenCart", "BigCommerce": "BigCommerce",
  "Lightspeed eCom": "Lightspeed eCom", "Shopware": "Shopware", "Wix Stores": "Wix Stores", "Squarespace Commerce": "Squarespace Commerce", "CCV Shop": "CCV Shop",
};

export type WebsiteProfileInput = {
  commerceState: string;
  commerceEvidence?: string[];
  sector: string;
  sectorLabel: string;
  sectorConfidence: number;
  technologies: Array<{ name: string; role: string; confidence: number; evidence: string[] }>;
  commercePlatform: string | null;
  cms: string | null;
  framework: string | null;
  catalog: CatalogSource[];
};

const vote = (sources: CatalogSource[]) => {
  const hits = new Map<string, { sources: CatalogSource[]; catalogSources: number }>();
  for (const source of sources) {
    const text = ` ${String(source.text || "").toLowerCase().replace(/\s+/g, " ")} `;
    for (const v of VERTICALS) {
      if (!v.re.test(text)) continue;
      const h = hits.get(v.key) || { sources: [], catalogSources: 0 };
      h.sources.push(source);
      if (source.kind !== "homepage") h.catalogSources++;
      hits.set(v.key, h);
    }
  }
  // Product and category pages decide; the homepage only breaks ties.
  return [...hits.entries()].map(([key, h]) => ({ key, ...h, score: h.sources.length })).sort((a, b) => b.catalogSources - a.catalogSources || b.score - a.score);
};

/** What a webshop sells, from its own product/category pages (and homepage). */
export function detectIndustryVertical(catalog: CatalogSource[]): Dimension {
  const unique = [...new Map(catalog.filter((s) => s.text && s.url).map((s) => [s.url + "|" + s.kind, s])).values()];
  const ranked = vote(unique);
  const top = ranked[0];
  if (!top) return { value: null, label: "Branche niet bevestigd", status: "unknown", confidence: 0, evidence: ["Geen product- of categorienamen gevonden waaruit het assortiment blijkt"] };
  const runnerUp = ranked[1];
  const label = VERTICALS.find((v) => v.key === top.key)!.label;
  const urls = [...new Set(top.sources.map((s) => s.url))];
  const clearLead = !runnerUp || runnerUp.catalogSources === 0 || top.catalogSources >= runnerUp.catalogSources * 2;
  if (top.catalogSources >= 2 && top.score >= 2 && clearLead) {
    return { value: top.key, label, status: "confirmed", confidence: top.catalogSources >= 3 ? 90 : 84, evidence: [`Assortiment op ${top.catalogSources} eigen product-/categoriepagina's: ${label.toLowerCase()}`, ...urls.slice(0, 3)] };
  }
  if (top.catalogSources >= 1 && clearLead) {
    return { value: top.key, label, status: "probable", confidence: 70, evidence: [`Assortiment op ${top.catalogSources} eigen product-/categoriepagina; nog niet onafhankelijk bevestigd`, ...urls.slice(0, 2)] };
  }
  return { value: null, label: "Branche niet bevestigd", status: "unknown", confidence: 0, evidence: [runnerUp && !clearLead ? `Assortiment niet eenduidig (${label} en ${VERTICALS.find((v) => v.key === runnerUp.key)!.label})` : "Assortiment alleen op de homepage genoemd, niet op product- of categoriepagina's"] };
}

const NON_COMMERCE_TYPES: Record<string, { value: string; label: string }> = {
  news_media: { value: "publisher", label: "Publicatie / nieuws & content" },
  government: { value: "organisation", label: "Overheid / publieke organisatie" },
  nonprofit: { value: "organisation", label: "Non-profitorganisatie" },
  education: { value: "organisation", label: "Onderwijsinstelling" },
  sports_organizations: { value: "organisation", label: "Organisatie / vereniging" },
};

export function buildWebsiteProfile(input: WebsiteProfileInput): WebsiteProfile {
  const shop = input.commerceState === "confirmed";
  const platformTech = input.technologies.find((t) => t.role === "commerce_platform");
  const cmsTech = input.technologies.find((t) => t.role === "cms");
  const fwTech = input.technologies.find((t) => t.role === "framework");

  const websiteType: Dimension = shop
    ? { value: "ecommerce_store", label: "Webshop", status: "confirmed", confidence: Math.min(97, Math.max(84, input.sectorConfidence || 0)), evidence: (input.commerceEvidence || []).slice(0, 4) }
    : input.sector === "unknown"
      ? { value: "unknown", label: "Websitetype niet vastgesteld", status: "unknown", confidence: 0, evidence: ["Geen bevestigde webshop en geen vastgestelde hoofdactiviteit"] }
      : NON_COMMERCE_TYPES[input.sector]
        ? { ...NON_COMMERCE_TYPES[input.sector], status: input.sectorConfidence >= 80 ? "confirmed" : "probable", confidence: input.sectorConfidence, evidence: [`Hoofdactiviteit: ${input.sectorLabel}`] }
        : { value: "services", label: input.sector === "ecommerce" ? "Retail (webshop niet bevestigd)" : "Dienstverlener / organisatie", status: input.sectorConfidence >= 80 ? "confirmed" : "probable", confidence: input.sectorConfidence, evidence: [`Hoofdactiviteit: ${input.sectorLabel}; geen bevestigde webshop`] };

  const platformName = platformTech?.name || (input.commercePlatform && input.commercePlatform !== "Custom / niet bevestigd" && !/bevestigd/.test(input.commercePlatform) ? input.commercePlatform : null);
  const commercePlatform: Dimension = platformName
    ? shop
      ? { value: platformName, label: PLATFORM_LABEL[platformName] || platformName, status: (platformTech?.confidence || 0) >= 80 ? "confirmed" : "probable", confidence: platformTech?.confidence || 70, evidence: platformTech?.evidence || [] }
      // A shop plugin or theme without a working shop: software, not a webshop.
      : { value: platformName, label: `${PLATFORM_LABEL[platformName] || platformName} aanwezig, geen webshop bevestigd`, status: "installed_no_shop", confidence: platformTech?.confidence || 60, evidence: [...(platformTech?.evidence || []), "Geen product-, winkelwagen- of afrekenketen bevestigd"] }
    : shop
      ? { value: "custom", label: "Eigen of onbekend platform", status: "unknown", confidence: 0, evidence: ["Webshop bevestigd, maar geen eenduidige platformsporen (maatwerk of headless)"] }
      : { value: null, label: "Geen webshopplatform", status: "not_applicable", confidence: 0, evidence: [] };

  const cms: Dimension = input.cms
    ? { value: input.cms, label: input.cms, status: (cmsTech?.confidence || 0) >= 80 ? "confirmed" : "probable", confidence: cmsTech?.confidence || 72, evidence: cmsTech?.evidence || [] }
    : { value: null, label: "Niet vastgesteld", status: "unknown", confidence: 0, evidence: [] };
  const frontendFramework: Dimension = input.framework
    ? { value: input.framework, label: input.framework, status: (fwTech?.confidence || 0) >= 80 ? "confirmed" : "probable", confidence: fwTech?.confidence || 72, evidence: fwTech?.evidence || [] }
    : { value: null, label: "Niet vastgesteld", status: "unknown", confidence: 0, evidence: [] };

  const industryVertical: Dimension = shop
    ? detectIndustryVertical(input.catalog)
    : { value: null, label: "Zie hoofdactiviteit", status: "not_applicable", confidence: 0, evidence: ["Branche wordt alleen apart bepaald voor een bevestigde webshop"] };

  const summary = shop
    ? [industryVertical.status === "unknown" ? "Webshop (branche niet bevestigd)" : `Webshop · ${industryVertical.label}${industryVertical.status === "probable" ? " (indicatief)" : ""}`, commercePlatform.status === "unknown" ? null : commercePlatform.label].filter(Boolean).join(" · ")
    : websiteType.label;
  return { websiteType, commercePlatform, cms, frontendFramework, industryVertical, summary };
}
