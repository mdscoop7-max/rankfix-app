// Sales channel of the primary activity: physical shop, service on location,
// webshop, or both. Evidence-first and multilingual (NL, EN, DE, FR, ES, IT):
// a channel is only stated when the site itself shows it (store finder,
// branch pages, address + opening hours, in-store wording, a confirmed online
// purchase flow). It never changes the primary sector; it describes HOW that
// activity reaches customers.

export type SalesChannel = "physical_store" | "service_location" | "online_store" | "omnichannel" | "unknown";

export type SalesChannelInput = {
  sector: string;
  key: string;
  navLabels: string[];
  internalPaths: string[];
  identityText: string; // title, description, H1 of the scanned page
  schemaTypes: string[];
  hasAddress: boolean;
  hasOpeningHours: boolean;
  onlineSalesConfirmed: boolean;
  onlineSalesEvidence?: string[];
};

export type SalesChannelDecision = {
  channel: SalesChannel;
  label: string;
  labelEn: string;
  physicalPresence: { value: boolean; evidence: string[] };
  onlineSales: { value: boolean; evidence: string[] };
};

// Store finders and branch overviews in navigation.
const STORE_FINDER_LABEL = /(?<![\p{L}])(?:onze winkels|winkels|winkelzoeker|vind (?:een|je|jouw|uw) (?:winkel|salon|vestiging|filiaal|restaurant|kapper|opticien|apotheek)|filialen|vestigingen|onze salons|salons|our (?:stores|shops|salons|branches|restaurants|hotels|locations)|find (?:a|your|my|the nearest) (?:store|shop|salon|branch|restaurant|hotel|location)|store ?(?:finder|locator)|stores|branches|locations|filial(?:en|finder|suche)|filiale finden|standorte|salonfinder|unsere (?:filialen|salons|restaurants)|nos magasins|magasins|trouver un (?:magasin|salon|restaurant|opticien)|nos salons|nos restaurants|nuestras (?:tiendas|ópticas|peluquerías|clínicas)|tiendas|buscador de (?:tiendas|ópticas|peluquerías|restaurantes)|peluquerías|i nostri (?:negozi|saloni|ristoranti)|negozi|trova (?:il |un )?(?:negozio|salone|ristorante)|saloni|ristoranti|restaurantes|alle hotels|all hotels|unsere hotels|nos hôtels|nuestros hoteles|i nostri hotel)(?![\p{L}])/iu;
// Store-finder and branch paths (same vocabulary as lib/product-links STORE_PAGE,
// without the franchise/partner pages, which recruit entrepreneurs).
const LOCATION_PATH = /\/(?:winkels|winkelzoeker|winkel-zoeken|winkels-zoeken|filialen|filiale|filialfinder|vestiging(?:en)?|stores|store-?locator|storefinder|shops?-?finder|magasins?|negozi|tiendas|lojas|salons?|saloni|salonfinder|peluquerias|peluquerías|ristoranti|restaurants|restaurantes|hotels|hoteles|standorte|locations?|branches)(?:\/|$)/iu;
// The site says customers come to a location.
const IN_STORE = /(?<![\p{L}])(?:in (?:de|onze|een) winkel|in onze winkels|in de salon|in-?store|in (?:our|your local|a) (?:store|shop|salon)|in der filiale|in (?:ihrer|unserer|einer) filiale|in ihrer nähe|en magasin|dans nos magasins|près de chez vous|en tienda|en nuestras? (?:tiendas?|ópticas?)|cerca de ti|in negozio|nei nostri negozi|vicino a te|bij jou in de buurt|bij u in de buurt|near you|near me)(?![\p{L}])/iu;
const LOCAL_SCHEMA = new Set(["localbusiness", "store", "optician", "hairsalon", "beautysalon", "dayspa", "nailsalon", "restaurant", "foodestablishment", "barorcafe", "bakery", "pharmacy", "hotel", "lodgingbusiness", "resort", "hostel", "motel", "bedandbreakfast", "medicalclinic", "dentist", "physician", "autorepair", "healthclub", "exercisegym"]);
// Trades that by definition serve customers on their own premises.
const ON_PREMISES_KEYS = new Set(["hotel", "restaurant", "hair_salon", "beauty_salon", "holiday_park", "camping", "bed_breakfast"]);
// Trades whose physical outlet is a shop (goods change hands at a counter).
const RETAIL_KEYS = new Set(["optician", "pharmacy", "bakery"]);
const RETAIL_SECTORS = new Set(["ecommerce", "food_local_retail"]);

export function decideSalesChannel(input: SalesChannelInput): SalesChannelDecision {
  const physical: string[] = [];
  const finderLabel = input.navLabels.find((label) => STORE_FINDER_LABEL.test(label));
  if (finderLabel) physical.push(`Navigatie naar vestigingen/winkels: "${finderLabel.slice(0, 40)}"`);
  const finderPath = input.internalPaths.find((path) => LOCATION_PATH.test(path));
  if (finderPath && !finderLabel) physical.push(`Vestigings-/winkelpagina: ${finderPath.slice(0, 60)}`);
  const inStore = IN_STORE.exec(input.identityText);
  if (inStore) physical.push(`Eigen omschrijving noemt een fysieke locatie: "${inStore[0]}"`);
  const localSchema = input.schemaTypes.map((t) => String(t).toLowerCase()).find((t) => LOCAL_SCHEMA.has(t));
  if (localSchema && input.hasAddress) physical.push(`Structured data: ${localSchema} met adres`);
  else if (input.hasAddress && input.hasOpeningHours) physical.push("Adres en openingstijden gevonden");
  // The trade itself implies premises, but only as supporting evidence: it is
  // listed, yet a channel is never stated on this line alone for retail trades.
  const onPremisesTrade = ON_PREMISES_KEYS.has(input.key);
  if (onPremisesTrade) physical.push("Activiteit vindt plaats op de eigen locatie (salon, restaurant of accommodatie)");
  const physicalValue = physical.length > 0;
  const online = input.onlineSalesConfirmed;
  const onlineEvidence = online ? (input.onlineSalesEvidence?.length ? input.onlineSalesEvidence : ["Online aankoopproces (product, prijs, winkelwagen of afrekenen) bevestigd"]) : [];
  const retail = RETAIL_KEYS.has(input.key) || RETAIL_SECTORS.has(input.sector);
  let channel: SalesChannel = "unknown";
  if (physicalValue && online) channel = "omnichannel";
  else if (online && (retail || input.sector === "ecommerce")) channel = "online_store";
  else if (physicalValue && !(onPremisesTrade && physical.length === 1 && retail)) channel = retail ? "physical_store" : "service_location";
  const labels: Record<SalesChannel, [string, string]> = {
    physical_store: ["Fysieke winkel", "Physical shop"],
    service_location: ["Dienstverlening op locatie", "Service on location"],
    online_store: ["Webshop (alleen online)", "Online shop (online only)"],
    omnichannel: [retail ? "Fysieke winkel + webshop" : "Locatie + online verkoop", retail ? "Physical shop + online shop" : "Location + online sales"],
    unknown: ["Verkoopkanaal niet vastgesteld", "Sales channel not determined"],
  };
  return {
    channel,
    label: labels[channel][0],
    labelEn: labels[channel][1],
    physicalPresence: { value: physicalValue, evidence: physical.slice(0, 4) },
    onlineSales: { value: online, evidence: onlineEvidence.slice(0, 3) },
  };
}
