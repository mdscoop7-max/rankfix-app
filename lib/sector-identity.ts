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

// Financial services (payment providers, banks, insurers). Generic language
// only: a webshop that offers "achteraf betalen" or "veilig betalen" is still a
// webshop, so checkout/payment wording on a store never creates this identity.
const FINANCIAL_SCHEMA_TYPES = new Set([
  "financialservice", "bankorcreditunion", "paymentservice", "paymentcard", "loanorcredit",
  "financialproduct", "bankaccount", "depositaccount", "mortgageloan", "creditcard",
  "currencyconversionservice", "investmentorinvestmentfund", "insuranceagency",
]);
const PAYMENTS_IDENTITY = /\b(?:payments? (?:platform|provider|service provider|services|solutions?|gateway|processing|processor|infrastructure|terminals?|links?)|platform for (?:online|in-person|global|digital)(?: and in-person)? payments|(?:online|in-person|digital|mobile|contactless|global) payments|accept(?:ing)? payments|get paid|merchant accounts?|digital wallet|e-?wallet|payment service provider|(?:send|receive|transfer)(?:,? (?:and )?(?:send|receive|save|spend))* money|money transfers?|betaal(?:provider|platform|dienstverlener|oplossing(?:en)?|terminals?|verwerking)|online betalingen|betalingen (?:accepteren|ontvangen|verwerken)|geld (?:overmaken|versturen|sturen)|zahlungs(?:anbieter|dienstleister|lösung(?:en)?|plattform)|paiements? en ligne|solutions? de paiement|pagos (?:online|en línea)|pagamenti (?:online|digitali))\b/i;
const BANKING_IDENTITY = /\b(?:bankieren|online banking|mobiel bankieren|bankrekening|betaalrekening|spaarrekening|bank account|savings accounts?|current accounts?|hypothe(?:ek|ken|cair)|mortgages?|persoonlijke lening|personal loans?|business loans?|zakelijke financiering|credit cards?|creditcards?|beleggen|vermogensbeheer|wealth management|girokonto|sparkonto|baufinanzierung|compte bancaire|conto corrente|cuenta bancaria)\b/i;
const INSURANCE_IDENTITY = /\b(?:verzekering(?:en)?|verzekeraar|zorgverzekering|autoverzekering|insurance|insurer|versicherung(?:en)?|assurances?|assicurazion[ei]|seguros?)\b/i;

export type FinancialIdentity = { kind: "payments" | "banking" | "insurance"; schema: boolean; evidence: string[] } | null;

export function financialSchemaTypes(schemaTypes: Iterable<string>): string[] {
  return [...new Set([...schemaTypes].filter((type) => FINANCIAL_SCHEMA_TYPES.has(String(type).toLowerCase())))];
}

// identitySource = title, meta description, H1s, hostname and path (not body text).
export function financialServicesIdentity(identitySource: string, schemaTypes: Iterable<string>): FinancialIdentity {
  const schema = financialSchemaTypes(schemaTypes);
  const hasSchema = schema.length > 0;
  const schemaEvidence = hasSchema ? [`Schema: ${schema.join(", ")}`] : [];
  if (PAYMENTS_IDENTITY.test(identitySource)) {
    return { kind: "payments", schema: hasSchema, evidence: ["Primaire identiteit: betaaldienstverlener / payment provider", ...schemaEvidence] };
  }
  const insuranceSchema = schema.some((type) => type.toLowerCase() === "insuranceagency");
  if (INSURANCE_IDENTITY.test(identitySource) && (insuranceSchema || !BANKING_IDENTITY.test(identitySource))) {
    return { kind: "insurance", schema: hasSchema, evidence: ["Primaire identiteit: verzekeringen", ...schemaEvidence] };
  }
  const bankingTerms = new Set((identitySource.match(new RegExp(BANKING_IDENTITY.source, "gi")) || []).map((term) => term.toLowerCase()));
  if (bankingTerms.size >= 2 || (bankingTerms.size >= 1 && hasSchema)) {
    return { kind: "banking", schema: hasSchema, evidence: ["Primaire identiteit: bank / financiële producten", ...schemaEvidence] };
  }
  // Self-declared financial organisation schema plus any financial wording.
  if (schema.some((type) => /^(?:financialservice|bankorcreditunion|paymentservice)$/i.test(type)) && (bankingTerms.size > 0 || INSURANCE_IDENTITY.test(identitySource))) {
    return { kind: "banking", schema: true, evidence: ["Primaire identiteit: financiële dienstverlening", ...schemaEvidence] };
  }
  return null;
}

// Short-stay accommodation must be named in the page identity (or declared in
// schema). "checkout", "arrival", "guests" or "pension" in body text are also
// used by payment providers, airlines, events and pension funds.
const LODGING_SCHEMA_TYPES = new Set(["hotel", "hotelroom", "lodgingbusiness", "bedandbreakfast", "vacationrental", "resort", "campground", "hostel", "motel"]);
const LODGING_IDENTITY = /\b(?:hotels?|hostels?|motels?|aparthotel|accommodat(?:ie|ies|ion|ions)|logies|overnacht(?:en|ing(?:en)?)|verblijf(?:sopties)?|per nacht|per night|nightly rates?|kamers? (?:boeken|reserveren)|book (?:a |your )?room|rooms? (?:&|and) suites|bed (?:and|&) breakfast|b&b|guest ?house|gastenkamers?|vakantiehuis(?:en)?|vakantiewoning(?:en)?|vakantiepark|bungalowpark|recreatiepark|holiday (?:homes?|rentals?|parks?)|vacation rentals?|ferienhaus|ferienwohnung(?:en)?|ferienpark|camping|campground|glamping|chaletpark|resort|unterkunft|hébergement|alloggio|alojamiento)\b/i;

export function lodgingIdentity(identitySource: string, schemaTypes: Iterable<string>): boolean {
  return [...schemaTypes].some((type) => LODGING_SCHEMA_TYPES.has(String(type).toLowerCase())) || LODGING_IDENTITY.test(identitySource);
}

// Path such as /us/home, /nl/nl/home or /en-gb/index is a localized homepage.
const COUNTRY_SEGMENTS = new Set(["us", "uk", "gb", "be", "at", "ch", "au", "ca", "ie", "nz", "lu", "mx", "br", "ar", "in", "jp", "kr", "cn", "hk", "sg", "za", "ae", "int", "global", "intl", "eu"]);
const LANGUAGE_SEGMENTS = new Set(["nl", "en", "de", "fr", "es", "it", "pt", "pl", "sv", "no", "da", "fi", "cs", "sk", "hu", "ro", "bg", "el", "tr", "hr", "sl", "et", "lv", "lt", "ja", "zh", "ko", "ar", "ru", "uk"]);
const HOME_ALIAS_SEGMENTS = new Set(["home", "homepage", "index", "index.html", "index.php", "startseite", "accueil", "inicio"]);

export function isLocalizedHomepagePath(segments: string[]): boolean {
  if (!segments.length || segments.length > 3) return false;
  const parts = HOME_ALIAS_SEGMENTS.has(segments[segments.length - 1]) ? segments.slice(0, -1) : segments;
  if (!parts.length) return segments.length === 1;
  if (parts.length > 2) return false;
  return parts.every((segment) => {
    if (!/^[a-z]{2,6}(?:[-_][a-z]{2})?$/i.test(segment)) return false;
    const [head, tail] = segment.toLowerCase().split(/[-_]/);
    return (LANGUAGE_SEGMENTS.has(head) || COUNTRY_SEGMENTS.has(head)) && (!tail || /^[a-z]{2}$/.test(tail));
  });
}
