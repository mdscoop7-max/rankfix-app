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

// Retail self-description in the page identity (title, description, h1, URL).
const RETAIL_ASSORTMENT = /\b(?:kleding|schoenen|accessoires|accessories|woonaccessoires|mode|fashion|elektronica|home.elektronica|apparaten|witgoed|wasmachines|televisies|laptops|meubels|meubelen|furniture|interieur|woonartikelen|bouwmaterialen|dierenbenodigdheden|sportartikelen|speelgoed|producten|products)\b/i;
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
