// Shared identity rules for the Sector Motor. These helpers decide what counts as
// primary-identity evidence. They are deliberately generic: no brand, domain or
// customer-specific rules. Generic marketing verbs ("ontdek", "visit our") and
// secondary facilities ("restaurant" in a store) are never identity evidence.

// schema.org Store and its subtypes. Any of these is structured, self-declared
// retail identity, unlike a keyword found somewhere in the body text.
const RETAIL_STORE_SCHEMA_TYPES = new Set([
  "store", "onlinestore", "autopartsstore", "bikestore", "bookstore", "clothingstore",
  "computerstore", "conveniencestore", "departmentstore", "electronicsstore", "florist",
  "furniturestore", "gardenstore", "grocerystore", "hardwarestore", "hobbyshop",
  "homegoodsstore", "jewelrystore", "liquorstore", "mensclothingstore", "mobilephonestore",
  "movierentalstore", "musicstore", "officeequipmentstore", "outletstore", "pawnshop",
  "petstore", "shoestore", "sportinggoodsstore", "tireshop", "toystore", "wholesalestore",
]);

export function retailStoreSchemaTypes(schemaTypes: Iterable<string>): string[] {
  return [...new Set([...schemaTypes].filter((type) => RETAIL_STORE_SCHEMA_TYPES.has(String(type).toLowerCase())))];
}

export function hasRetailStoreSchema(schemaTypes: Iterable<string>): boolean {
  return retailStoreSchemaTypes(schemaTypes).length > 0;
}

// schema.org Organization and its common subtypes. OnlineStore, LocalBusiness,
// Dentist, Restaurant etc. are Organizations; requiring the literal type
// "Organization" would flag correct identity markup as missing.
const ORGANIZATION_SCHEMA_TYPES = new Set([
  "organization", "corporation", "onlinebusiness", "localbusiness", "ngo", "educationalorganization",
  "collegeoruniversity", "school", "governmentorganization", "medicalorganization", "newsmediaorganization",
  "sportsorganization", "sportsteam", "airline", "performinggroup", "researchorganization", "workersunion",
  "politicalparty", "cooperative", "consortium", "fundingscheme", "librarysystem",
  // Common LocalBusiness subtypes used by the Sector Motor.
  "automotivebusiness", "autodealer", "autorepair", "autorental", "dentist", "physician", "medicalclinic",
  "pharmacy", "veterinarycare", "restaurant", "foodestablishment", "cafeorcoffeeshop", "barorpub", "bakery",
  "lodgingbusiness", "hotel", "bedandbreakfast", "resort", "campground", "realestateagent", "beautysalon",
  "hairsalon", "dayspa", "healthclub", "exercisegym", "homeandconstructionbusiness", "generalcontractor",
  "plumber", "electrician", "professionalservice", "legalservice", "attorney", "accountingservice",
  "financialservice", "bankorcreditunion", "insuranceagency", "employmentagency", "travelagency",
  "entertainmentbusiness", "childcare", "movingcompany", "parkingfacility",
  ...RETAIL_STORE_SCHEMA_TYPES,
]);

// Organization types that are not a typed local entity: plain/umbrella parents.
const GENERIC_ORGANIZATION_TYPES = new Set([
  "organization", "corporation", "onlinebusiness", "ngo", "consortium", "cooperative", "fundingscheme",
  "politicalparty", "workersunion", "researchorganization", "librarysystem", "performinggroup",
  "sportsteam", "sportsorganization", "airline", "newsmediaorganization", "governmentorganization",
  "educationalorganization", "collegeoruniversity", "onlinestore",
]);
/**
 * A declared LocalBusiness subtype (Dentist, Restaurant, Store…) or a medical
 * organization (MedicalOrganization, Hospital) is a typed local entity: it
 * satisfies "local business schema present" even when it is not the exact
 * subtype RankFix would recommend.
 */
export function hasTypedLocalEntitySchema(schemaTypes: Iterable<string>): boolean {
  return [...schemaTypes].some((type) => {
    const t = String(type).toLowerCase();
    return t === "localbusiness" || t === "hospital" || t === "medicalorganization" || (ORGANIZATION_SCHEMA_TYPES.has(t) && !GENERIC_ORGANIZATION_TYPES.has(t));
  });
}

export function hasOrganizationSchema(schemaTypes: Iterable<string>): boolean {
  return [...schemaTypes].some((type) => ORGANIZATION_SCHEMA_TYPES.has(String(type).toLowerCase()));
}

// Retail self-description in the page identity (title, description, h1, URL).
const RETAIL_ASSORTMENT = /\b(?:kleding|schoenen|accessoires|accessories|woonaccessoires|mode|fashion|elektronica|home.elektronica|apparaten|witgoed|wasmachines|televisies|laptops|meubels|meubelen|furniture|interieur|woonartikelen|bouwmaterialen|dierenbenodigdheden|sportartikelen|speelgoed|boodschappen|supermarkt|supermarch\w*|supermarket|groceries|lebensmittel|producten|products)\b/i;
// Both word orders: "online bestellen" and "bestel online".
const ONLINE_SALES = /\b(?:online (?:kopen|bestellen|shoppen|shopping)|bestel(?:len)? (?:direct |eenvoudig |snel )?online|koop (?:direct )?online|webshop|webwinkel|online winkel|shop online|buy online|order online|online store)\b/i;
// Compounds such as "woonwinkels" or "webwinkel" count; "winkelwagen" does not.
const STORE_IDENTITY = /(?:\p{L}*winkels?|\bretailer|\bwinkelketen|\bfilialen|\bshop|\bstores?)\b/iu;

export function retailIdentityLanguage(identitySource: string) {
  return {
    assortment: RETAIL_ASSORTMENT.test(identitySource),
    onlineSales: ONLINE_SALES.test(identitySource),
    store: STORE_IDENTITY.test(identitySource),
  };
}

// Tourism identity must name tourism itself. "visit our store", "ontdek onze
// meubels" or a restaurant on the premises are not tourism evidence. Tourist
// boards that brand themselves as "visit<place>" are recognised by hostname.
export const TOURISM_IDENTITY_PATTERN = /\b(?:toerisme|tourism|toeristisch(?:e)?|toeristische informatie|tourist information|tourist board|vvv|citymarketing|city marketing|stadspromotie|bezoekerscentrum|visitor (?:centre|center)|bezienswaardigheden|things to do|sightseeing)\b/i;
export const TOURISM_ACTIVITY_PATTERN = /\b(?:agenda|evenementen|events|overnachten|activiteiten|uitjes|attracties|attractions|bezienswaardigheden|things to do|musea|museums)\b/i;

export function isTourismBoardHost(hostname: string): boolean {
  return /^(?:www\.)?visit[a-z-]{3,}\.[a-z.]+$/i.test(hostname);
}

/**
 * Independent subscription/provider identity evidence. A generic "internet"
 * or incidental product price alone is not enough to classify a company as
 * telecom. This operates on title, description, heading and URL identity, not
 * the full navigation/footer text; retail schema is checked by the caller.
 */
const TELECOM_PLAN_IDENTITY = /\b(?:sim[ -]?only|data[ -]?only|mobiele? abonnementen?|mobiel(?:e)? abonnement(?:en)?|internetabonnement(?:en)?|mobile plans?|mobile subscriptions?|broadband plans?|subscription plans?)\b/i;
const TELECOM_NETWORK_IDENTITY = /\b(?:glasvezel|fiber|fibre|network coverage|netwerk(?:dekking)?|dekkingskaart|dekking|5g|4g|broadband|mobiel netwerk|mobile network|internetverbinding)\b/i;
const TELECOM_OPERATOR_IDENTITY = /\b(?:telecom(?:provider)?|telecommunications?|telefoonprovider|internetprovider|mobiele? provider|mobile operator|network operator|broadband provider)\b/i;
export function telecomOperatorIdentity(identitySource: string) {
  const subscription = TELECOM_PLAN_IDENTITY.test(identitySource);
  const network = TELECOM_NETWORK_IDENTITY.test(identitySource);
  const provider = TELECOM_OPERATOR_IDENTITY.test(identitySource);
  return { subscription, network, provider, primary: (subscription && network) || (provider && (subscription || network)) };
}

// A news publisher or broadcaster names itself as such. Strong publisher terms
// (omroep, broadcaster, krant, newspaper...) are enough on their own; a plain
// "nieuws/news" only counts on a homepage where both title and description use
// it, so a company's own /nieuws page never turns the company into a publisher.
// Listing channels like "Radio, TV en Internet" describes distribution, not a
// telecom subscription business.
const NEWS_PUBLISHER_STRONG = /\b(?:omroep(?:vereniging|stichting)?|publieke omroep|broadcast(?:er|ing)|public broadcaster|journaal|journalistiek|journalism|dagblad|krant|newspaper|news ?agency|persbureau|nieuwssite|news ?site|zeitung|rundfunk|periódico|giornale|quotidiano)\b/i;
const NEWS_WEAK = /\b(?:nieuws|news|breaking news|latest news|het laatste nieuws|nachrichten|actualités|noticias|notizie)\b/i;
// "Nieuws van <bedrijf>", "news from <company>": a company's own news, not a publisher.
const COMPANY_NEWS = /\b(?:nieuws van|news from|news of|nachrichten von|nachrichten der|actualités de|notizie di|noticias de)\s+(?:het |de |the |der |die |la |le |il |el )?\p{Lu}/u;

export function newsMediaIdentity(input: { title: string; description: string; h1: string; homepage: boolean }) {
  const own = [input.title, input.description, input.h1].join(" ");
  if (NEWS_PUBLISHER_STRONG.test(own)) return true;
  return input.homepage && NEWS_WEAK.test(input.title) && NEWS_WEAK.test(input.description) && !COMPANY_NEWS.test(`${input.title} ${input.description}`);
}
