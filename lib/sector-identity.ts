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

export function hasOrganizationSchema(schemaTypes: Iterable<string>): boolean {
  return [...schemaTypes].some((type) => ORGANIZATION_SCHEMA_TYPES.has(String(type).toLowerCase()));
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

// Page identity outranks incidental references in testimonials, customer cases and
// payment checkout copy. These checks are generic; no domain or brand allowlist.
export function paymentProviderPrimaryIdentity(identityText: string): boolean {
  const identity = identityText.replace(/\s+/g, " ").slice(0, 3500);
  // Strong role declarations distinguish a payment processor from a shop that
  // simply accepts cards or advertises a payment integration.
  return /\b(?:payment service provider|payment provider|payment gateway|payment processing|payment solutions?|payments? platform|platform for (?:online|in.person|every|all|your) payments?|electronic.money institution|e.money institution|betaalprovider|betaalplatform|betalingsplatform|betaaloplossingen|betaaldienstverlener|betaalinstelling|elektronischgeldinstelling|zahlungsanbieter|prestataire de paiement)\b/i.test(identity)
    || /\b(?:platform|provider|gateway)\b.{0,85}\b(?:online (?:and|&|or) in.person payments|online en fysieke betalingen|betalingen ontvangen|accept payments|payment methods?)\b/i.test(identity)
    || /\b(?:online (?:and|&|or) in.person payments|online en fysieke betalingen|payments? processing)\b.{0,85}\b(?:platform|provider|gateway)\b/i.test(identity);
}

export function primaryLodgingIdentity(identityText: string, schemaTypes: Iterable<string>): boolean {
  const types = [...schemaTypes].map(type => String(type).toLowerCase());
  if (types.some(type => ["hotel","hotelroom","lodgingbusiness","bedandbreakfast","vacationrental","resort","campground"].includes(type))) return true;
  // Generic body text such as guest, arrival, departure, checkout, booking
  // and a case study about hotels does NOT establish accommodation identity.
  const source = identityText.replace(/\s+/g, " ").slice(0, 3500);
  return /\b(?:hotel|hotels|hotelkamers?|hotelsuites?|accommodation|lodging|guesthouse|guest house|bed (?:and|&) breakfast|overnachten|overnachting|vakantiehuis|vakantiewoning|holiday (?:home|rental|park)|vacation rental|resort|camping|glamping|chambres d.hôtes|ferienhaus|ferienwohnung)\b/i.test(source)
    || /\b(?:book|reserve|reserveer|boek) (?:a |your |een |je )?(?:room|hotelkamer|kamer|overnight stay|overnachting)\b/i.test(source);
}
