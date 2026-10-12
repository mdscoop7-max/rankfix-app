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


/**
 * A primary financial service is not a consumer retail shop merely because it
 * uses prices, checkout vocabulary or card/reward offers. Require independent
 * signals in primary page identity (title/description/H1) and financial schema,
 * or an explicit provider role. No brand or domain special cases.
 */
export function financialServicePrimaryIdentity(input: {
  title: string;
  description: string;
  headings: string[];
  schemaTypes: Iterable<string>;
}): { identified: boolean; provider: boolean; evidence: string[] } {
  const identity = [input.title, input.description, ...input.headings].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 3500);
  const provider = paymentProviderPrimaryIdentity(identity);
  const financeTypes = new Set(["financialproduct","financialservice","paymentcard","creditcard","loanorcredit","bankaccount","depositaccount","bankorcreditunion","insuranceagency"]);
  const financialSchemas = [...new Set([...input.schemaTypes].map(type=>String(type).toLowerCase()))].filter(type=>financeTypes.has(type));
  const moneyActivity = /\b(?:send(?:ing)?(?:\s+(?:and|&)\s+(?:save|receive|transfer))?\s+money|(?:receive|request|transfer|move|save|manage)\s+(?:your\s+)?money|money transfers?|digital wallet|payment accounts?|savings? accounts?|banking services?|betalingen (?:versturen|ontvangen)|geld (?:versturen|overmaken|ontvangen|sparen|beheren)|digitale portemonnee|geld overmaken)\b/i.test(identity);
  const explicitFinancialRole = /\b(?:financial (?:technology|services?|platform)|fintech|digital wallet|money transfer (?:service|app|platform)|payment (?:service provider|provider|platform|processor)|banking (?:services?|platform|app)|financial app|payment app|betaalplatform|financieel platform|bankdiensten|financi[eë]le dienstverlening)\b/i.test(identity);
  const identified = provider || (moneyActivity && (financialSchemas.length > 0 || explicitFinancialRole));
  return { identified, provider, evidence: [
    ...(provider ? ["Primair betalingsplatform of betaaldienstverlener in titel/description/H1"] : []),
    ...(moneyActivity && !provider ? ["Primair aanbod voor geldbeheer/betalingen/wallet in titel/description/H1"] : []),
    ...(financialSchemas.length ? ["Financieel schema: "+financialSchemas.slice(0,4).join(", ")] : []),
    ...(explicitFinancialRole ? ["Expliciete financiële platform- of dienstverlenersidentiteit"] : []),
  ]};
}

// Locale/market-prefixed root routes such as /us/home and /en-gb/home.
// Deep pages never qualify; arbitrary short path segments are insufficient.
const MARKET_REGIONS = new Set(["us","uk","gb","ca","au","nz","in","ie","br","mx","ar","cl","co","pe","nl","be","de","at","ch","fr","es","pt","it","dk","se","no","fi","pl","cz","sk","hu","ro","bg","hr","gr","ee","lv","lt","si","lu","mt","cy","tr","il","ae","sa","za","sg","hk","jp","kr","tw","my","th","id","ph"]);
const MARKET_LANGUAGES = new Set(["en","nl","de","fr","es","it","pt","da","sv","no","fi","pl","cs","sk","hu","ro","bg","el","hr","et","lv","lt","sl","tr","ar","he","ja","ko","zh"]);
export function isLocalizedHomePath(pathname: string): boolean {
  const parts = pathname.toLowerCase().split("/").filter(Boolean);
  if (parts.length !== 2 || !/^(?:home|homepage|index)$/.test(parts[1])) return false;
  const locale = parts[0].replace("_", "-");
  const codes = locale.split("-");
  return codes.length === 1
    ? MARKET_REGIONS.has(locale) || MARKET_LANGUAGES.has(locale)
    : codes.length === 2 && MARKET_LANGUAGES.has(codes[0]) && MARKET_REGIONS.has(codes[1]);
}


/** Generic primary non-retail role evidence from page identity and corroboration. */
export function primaryNonRetailRole(input:{
  title:string;description:string;headings:string[];schemaTypes:Iterable<string>;
}):{key:"lodging"|"restaurant"|"healthcare"|"public_sector"|"software"|null;evidence:string[]}{
  const main=[input.title,...input.headings].filter(Boolean).join(" ").slice(0,1500);
  const identity=[main,input.description].join(" ").slice(0,3000);
  const schema=new Set([...input.schemaTypes].map(type=>String(type).toLowerCase()));
  // A retailer advertising hotel-room furniture or restaurant equipment is not
  // itself a hotel/restaurant. Evidence is about the primary business model.
  const retail=retailIdentityLanguage(identity);
  if((retail.assortment&&retail.onlineSales) || (hasRetailStoreSchema(schema) && /\b(?:buy|shop|add to cart|purchase|bestel|kopen|winkelwagen|webshop|online store)\b/i.test(identity)))return {key:null,evidence:[]};
  const rules=[
    {key:"lodging" as const,primary:/\b(?:hotel|hostel|guesthouse|guest house|bed and breakfast|resort|vakantiehuis|vacation rental|ferienhaus|pension|camping|campground)\b/i,
      support:/\b(?:rooms?|kamers?|suites?|stay|overnight|accommodation|lodging|book (?:a |your )?room|overnachten|overnachting|gasten|guests?)\b/i,
      schemas:["hotel","lodgingbusiness","bedandbreakfast","hostel","resort","vacationrental","campground"]},
    {key:"restaurant" as const,primary:/\b(?:restaurant|bistro|brasserie|cafe|café|pizzeria|eetcafé|dining room)\b/i,
      support:/\b(?:menu|menukaart|cuisine|dining|dinner|lunch|reserve a table|tafel reserveren|food|keuken|gerechten)\b/i,
      schemas:["restaurant","foodestablishment","cafeorcoffeeshop"]},
    {key:"healthcare" as const,primary:/\b(?:dentist|dental (?:clinic|practice)|tandarts|medical clinic|medical practice|healthcare clinic|huisartsenpraktijk|fysiotherapie|orthodontist)\b/i,
      support:/\b(?:patient|patiënt|appointment|afspraak|treatment|behandeling|zorg|medical|healthcare|mondzorg|praktijk)\b/i,
      schemas:["dentist","medicalclinic","physician","hospital"]},
    {key:"public_sector" as const,primary:/\b(?:government|municipality|ministry|minist[eè]re|gemeente|rijksoverheid|city council|public authority|public services)\b/i,
      support:/\b(?:permits?|vergunning|citizens?|inwoners?|public service|burgerzaken|overheid|beleid|policy|paspoort)\b/i,
      schemas:["governmentorganization","governmentoffice"]},
    {key:"software" as const,primary:/\b(?:software|saas|software platform|business software|software-as-a-service|project management platform|crm platform)\b/i,
      support:/\b(?:features?|integrations?|dashboard|workflow|subscription|software|saas|developers?|api|automatisering|applicatie)\b/i,
      schemas:["softwareapplication","webapplication"]}
  ];
  for(const rule of rules){
    if(!rule.primary.test(main))continue;
    const structured=rule.schemas.some(type=>schema.has(type));
    if(!structured&&!rule.support.test(identity))continue;
    return {key:rule.key,evidence:["Primaire "+rule.key+"-identiteit in title/H1",structured?"Passend structured data-type":"Passende activiteit in paginametadata"]};
  }
  return {key:null,evidence:[]};
}
