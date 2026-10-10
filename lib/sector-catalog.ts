import type { ScanEvidence } from "./scan-evidence";

export type SectorKey =
  | "ecommerce" | "marketplace" | "automotive" | "real_estate" | "dentist" | "healthcare"
  | "restaurant" | "cafe_bar" | "hotel" | "travel" | "beauty_salon" | "hair_salon"
  | "fitness" | "saas_b2b" | "professional_services" | "home_services" | "construction"
  | "legal" | "accounting" | "finance" | "insurance" | "education" | "course_training"
  | "recruitment" | "news_media" | "publisher_blog" | "events" | "nonprofit"
  | "government" | "association" | "manufacturer" | "wholesale" | "logistics"
  | "food_delivery" | "telecom" | "energy" | "software_app" | "agency"
  | "photography" | "medical_clinic" | "pharmacy" | "veterinary" | "childcare"
  | "senior_care" | "car_rental" | "car_repair" | "parking" | "property_rental"
  | "bed_breakfast" | "holiday_rental" | "holiday_park" | "camping" | "coworking" | "entertainment" | "museum_culture" | "sports_club" | "general_business";

export type SectorDefinition = {
  key: SectorKey;
  label: string;
  keywords: RegExp;
  schemaTypes?: string[];
  evidenceFlags?: string[];
  expectedCapabilities: string[];
  optionalCapabilities?: string[];
  forbiddenAssumptions?: string[];
};

export const SECTOR_CATALOG: SectorDefinition[] = [
  {key:"ecommerce",label:"Webshop / e-commerce",keywords:/\b(webshop|online shop|shop online|winkelwagen|add to cart|warenkorb|panier|carrello|online[- ]shop|onlineshop|online kaufen|online bestellen|jetzt kaufen|in den warenkorb|ajouter au panier|acheter en ligne|comprar online|añadir al carrito|aggiungi al carrello)\b/i,schemaTypes:["Product","Offer","OnlineStore","Store","FurnitureStore"],evidenceFlags:["commerce.products","commerce.cart","commerce.checkout"],expectedCapabilities:["products","pricing","cart","checkout","merchant","consumer_rights"],optionalCapabilities:["appointments"]},
  {key:"marketplace",label:"Marketplace",keywords:/\b(marketplace|verkopers|sellers|sell on|aanbieders|multiple sellers)\b/i,schemaTypes:["Product","Offer"],evidenceFlags:["commerce.products"],expectedCapabilities:["listings","pricing","seller_identity","consumer_rights"],optionalCapabilities:["cart","checkout"]},
  {key:"automotive",label:"Autodealer / automotive",keywords:/\b(autodealer|auto dealer|occasions?|proefrit|test drive|nieuwe auto's|used cars|fahrzeuge|autoverkoop|auto(?:'s)? te koop|voorraad auto's)\b/i,schemaTypes:["AutoDealer","AutomotiveBusiness","Vehicle","Car"],evidenceFlags:["inventory.vehicles"],expectedCapabilities:["vehicles","vehicle_details","pricing","test_drive","contact"],optionalCapabilities:["finance","appointments","parts_shop"],forbiddenAssumptions:["cart","checkout"]},
  {key:"car_rental",label:"Autoverhuur",keywords:/\b(autoverhuur|car rental|rent a car|mietwagen|location de voiture)\b/i,schemaTypes:["AutoRental"],expectedCapabilities:["vehicles","availability","booking","pricing"],forbiddenAssumptions:["cart"]},
  {key:"car_repair",label:"Garage / autoservice",keywords:/\b(garage|autoservice|car repair|autowerkplaats|werkplaats|apk|onderhoud(?: auto)?|bandenservice|banden|tyres?|uitlijnen|reparatie)\b/i,schemaTypes:["AutoRepair"],expectedCapabilities:["services","appointment","contact","local"]},
  {key:"real_estate",label:"Makelaar / vastgoed",keywords:/\b(makelaar|vastgoed|real estate|woningaanbod|huizen te koop|woningen te koop|woning(?:en)? te huur|te koop|te huur|koopwoning(?:en)?|huurwoning(?:en)?|properties? for sale|properties? for rent|immobilien)\b/i,schemaTypes:["RealEstateAgent","Residence","House","Apartment"],evidenceFlags:["inventory.properties"],expectedCapabilities:["properties","property_details","pricing","viewing_request","contact"],forbiddenAssumptions:["stock","cart","checkout"]},
  {key:"property_rental",label:"Woningverhuur",keywords:/\b(woning huren|appartement huren|property rental|rent apartment|huurwoningen)\b/i,schemaTypes:["Apartment","Residence"],expectedCapabilities:["properties","availability","pricing","contact"],forbiddenAssumptions:["cart"]},
  {key:"dentist",label:"Tandarts",keywords:/\b(tandarts|dentist|dental clinic|zahnarzt|dentiste)\b/i,schemaTypes:["Dentist"],expectedCapabilities:["treatments","appointment","contact","local"],forbiddenAssumptions:["cart","stock"]},
  {key:"medical_clinic",label:"Medische kliniek",keywords:/\b(kliniek|clinic|medical clinic|polikliniek)\b/i,schemaTypes:["MedicalClinic"],expectedCapabilities:["treatments","appointment","contact","local"]},
  {key:"healthcare",label:"Zorg / healthcare",keywords:/\b(zorg|healthcare|health care|gezondheidszorg|medical care)\b/i,schemaTypes:["MedicalOrganization"],expectedCapabilities:["services","contact","trust","accessibility"]},
  {key:"pharmacy",label:"Apotheek",keywords:/\b(apotheek|pharmacy|apotheke|pharmacie)\b/i,schemaTypes:["Pharmacy"],expectedCapabilities:["products_or_prescriptions","contact","local","trust"],optionalCapabilities:["commerce"]},
  {key:"veterinary",label:"Dierenarts",keywords:/\b(dierenarts|veterinary|vet clinic|tierarzt)\b/i,schemaTypes:["VeterinaryCare"],expectedCapabilities:["services","appointment","contact","local"]},
  {key:"restaurant",label:"Restaurant",keywords:/\b(restaurant|menukaart|menu kaart|food menu|dinerkaart|lunchkaart|reserveer tafel|table reservation|speisekarte)\b/i,schemaTypes:["Restaurant","FoodEstablishment"],evidenceFlags:["inventory.menu","appointments.reservation"],expectedCapabilities:["menu","reservation","opening_hours","local","contact"],optionalCapabilities:["delivery","gift_cards"],forbiddenAssumptions:["product_stock"]},
  {key:"cafe_bar",label:"Café / bar",keywords:/\b(café|cafe|bar|pub|coffee shop|koffiebar)\b/i,schemaTypes:["CafeOrCoffeeShop","BarOrPub"],expectedCapabilities:["menu","opening_hours","local","contact"],optionalCapabilities:["reservation"]},
  {key:"food_delivery",label:"Maaltijdbezorging",keywords:/\b(bezorgen|food delivery|delivery food|bestel eten|order food)\b/i,schemaTypes:["FoodEstablishment"],expectedCapabilities:["menu","ordering","delivery_area","pricing"],optionalCapabilities:["checkout"]},
  {key:"hotel",label:"Hotel / accommodatie",keywords:/\b(hotel|kamers|rooms|overnachting|accommodation)\b/i,schemaTypes:["Hotel","HotelRoom","LodgingBusiness"],evidenceFlags:["inventory.rooms","appointments.booking"],expectedCapabilities:["rooms","availability","booking","pricing","local"],forbiddenAssumptions:["product_stock"]},
  {key:"bed_breakfast",label:"B&B / guesthouse",keywords:/\b(b&b|bed and breakfast|bed & breakfast|guesthouse|guest house|pension)\b/i,schemaTypes:["BedAndBreakfast"],evidenceFlags:["inventory.rooms","appointments.booking"],expectedCapabilities:["rooms","availability","booking","pricing","local"],forbiddenAssumptions:["property_sale","long_term_rental","product_stock"]},
  {key:"holiday_rental",label:"Vakantiehuis / vakantieverhuur",keywords:/\b(vakantiehuis|vakantiewoning|holiday home|holiday rental|vacation rental|ferienhaus|ferienwohnung|short[- ]term rental)\b/i,schemaTypes:["VacationRental"],evidenceFlags:["appointments.booking"],expectedCapabilities:["accommodation","availability","booking","pricing","guests","stay_dates"],forbiddenAssumptions:["property_sale","long_term_rental","product_stock"]},
  {key:"holiday_park",label:"Vakantiepark / resort",keywords:/\b(vakantiepark|holiday park|ferienpark|resort|bungalowpark|recreatiepark)\b/i,schemaTypes:["Resort"],evidenceFlags:["appointments.booking"],expectedCapabilities:["accommodations","availability","booking","pricing","facilities","local"],forbiddenAssumptions:["property_sale","product_stock"]},
  {key:"camping",label:"Camping / chaletpark",keywords:/\b(camping|campingplatz|campground|camperplaats|chaletpark|caravan park|glamping)\b/i,schemaTypes:["Campground"],evidenceFlags:["appointments.booking"],expectedCapabilities:["pitches_or_accommodation","availability","booking","pricing","facilities","local"],forbiddenAssumptions:["property_sale","product_stock"]},
  {key:"travel",label:"Reizen / toerisme",keywords:/\b(reisbureau|reisorganisatie|travel agency|tour operator|voyagiste|reiseveranstalter|excursies boeken|book a tour)\b/i,schemaTypes:["TravelAgency","TouristTrip"],expectedCapabilities:["destinations_or_trips","availability","booking","pricing"]},
  {key:"beauty_salon",label:"Beautysalon",keywords:/\b(beautysalon|beauty salon|schoonheidssalon|facial|beauty treatment)\b/i,schemaTypes:["BeautySalon"],expectedCapabilities:["services","pricing","appointment","local"],optionalCapabilities:["products"]},
  {key:"hair_salon",label:"Kapper / hair salon",keywords:/\b(kapper|hair salon|hairdresser|coiffeur|friseur)\b/i,schemaTypes:["HairSalon"],expectedCapabilities:["services","pricing","appointment","local"],optionalCapabilities:["products"]},
  {key:"fitness",label:"Fitness / sportschool",keywords:/\b(fitness|sportschool|gym|personal training|fitnessstudio)\b/i,schemaTypes:["HealthClub","ExerciseGym"],expectedCapabilities:["services","memberships","schedule","local"],optionalCapabilities:["booking"]},
  {key:"sports_club",label:"Sport / club / competitie",keywords:/\b(sportclub|football club|voetbalclub|tennis club|vereniging sport|wedstrijd|match|fixtures?|uitslagen?|competitie|league|team|speler|player|stadion|stadium)\b/i,schemaTypes:["SportsOrganization","SportsTeam","SportsEvent"],expectedCapabilities:["activities","schedule","results","teams_or_players","membership","contact"]},
  {key:"saas_b2b",label:"SaaS / B2B software",keywords:/\b(saas|software as a service|platform|business software|b2b software)\b/i,schemaTypes:["SoftwareApplication","WebApplication"],expectedCapabilities:["features","pricing_or_demo","signup","target_audience","support"],forbiddenAssumptions:["physical_stock","shipping"]},
  {key:"software_app",label:"Software / app",keywords:/\b(app|software|download|mobile app|desktop app)\b/i,schemaTypes:["SoftwareApplication","MobileApplication"],expectedCapabilities:["features","download_or_signup","support"]},
  {key:"agency",label:"Bureau / agency",keywords:/\b(marketingbureau|agency|digital agency|reclamebureau|webbureau)\b/i,schemaTypes:["ProfessionalService"],expectedCapabilities:["services","cases","contact","quote_request"]},
  {key:"professional_services",label:"Zakelijke dienstverlening",keywords:/\b(consultancy|consultant|adviesbureau|professional services|business services)\b/i,schemaTypes:["ProfessionalService"],expectedCapabilities:["services","expertise","contact","quote_request"]},
  {key:"home_services",label:"Lokale vakdienst",keywords:/\b(loodgieter|plumber|elektricien|electrician|schilder|cleaning service|schoonmaak)\b/i,schemaTypes:["HomeAndConstructionBusiness"],expectedCapabilities:["services","service_area","contact","quote_request","local"]},
  {key:"construction",label:"Bouw / aannemer",keywords:/\b(aannemer|construction|bouwbedrijf|contractor|renovatie)\b/i,schemaTypes:["GeneralContractor","HomeAndConstructionBusiness"],expectedCapabilities:["services","projects","contact","quote_request"]},
  {key:"legal",label:"Advocaat / juridisch",keywords:/\b(advocaat|law firm|lawyer|juridisch|rechtsanwalt)\b/i,schemaTypes:["LegalService","Attorney"],expectedCapabilities:["services","expertise","contact","trust"]},
  {key:"accounting",label:"Accountancy / boekhouding",keywords:/\b(accountant|accountancy|boekhouder|bookkeeping|steuerberater)\b/i,schemaTypes:["AccountingService"],expectedCapabilities:["services","expertise","contact","trust"]},
  {key:"finance",label:"Financiële dienstverlening",keywords:/\b(financieel advies|financial services|banking|hypotheek|mortgage|lening)\b/i,schemaTypes:["FinancialService","BankOrCreditUnion"],expectedCapabilities:["services","rates_or_terms","contact","trust"]},
  {key:"insurance",label:"Verzekeringen",keywords:/\b(verzekering|insurance|verzekeren|assurance|versicherung)\b/i,schemaTypes:["InsuranceAgency"],expectedCapabilities:["products_or_policies","quote_request","contact","trust"]},
  {key:"education",label:"Onderwijs",keywords:/\b(school|universiteit|university|college|onderwijs|opleiding)\b/i,schemaTypes:["EducationalOrganization","School","CollegeOrUniversity"],expectedCapabilities:["programs","admissions","contact","accessibility"]},
  {key:"course_training",label:"Cursus / training",keywords:/\b(cursus|course|training|workshop|opleiding volgen)\b/i,schemaTypes:["Course"],expectedCapabilities:["courses","schedule","enrollment","pricing"],optionalCapabilities:["booking"]},
  {key:"recruitment",label:"Recruitment / vacatures",keywords:/\b(recruitment|uitzendbureau|uitzendorganisatie|employment agency|staffing agency|staffing|werving en selectie|recruitmentbureau|recruitment agency)\b/i,schemaTypes:["EmploymentAgency"],evidenceFlags:["inventory.jobs"],expectedCapabilities:["jobs","job_details","application","organization"]},
  {key:"news_media",label:"Nieuws / media",keywords:/\b(nieuws|news|breaking news|journalistiek|newspaper|redactie|journalist|verslaggever|headline|liveblog)\b/i,schemaTypes:["NewsMediaOrganization","NewsArticle","Article"],expectedCapabilities:["articles","authors","dates","publisher","sources"],forbiddenAssumptions:["commerce"]},
  {key:"publisher_blog",label:"Blog / publisher",keywords:/\b(blog|magazine|artikelen|articles|editorial)\b/i,schemaTypes:["Blog","BlogPosting","Article"],expectedCapabilities:["articles","authors","dates","publisher"]},
  {key:"events",label:"Events / tickets",keywords:/\b(events?|evenementen|tickets|concert|festival)\b/i,schemaTypes:["Event"],expectedCapabilities:["events","dates","venue","tickets_or_registration"]},
  {key:"entertainment",label:"Entertainment / leisure",keywords:/\b(bioscoop|cinema|theater|amusement|leisure|escape room)\b/i,schemaTypes:["EntertainmentBusiness"],expectedCapabilities:["activities_or_program","schedule","pricing"],optionalCapabilities:["booking","tickets"]},
  {key:"museum_culture",label:"Museum / cultuur",keywords:/\b(museum|gallery|galerie|cultureel|cultural)\b/i,schemaTypes:["Museum"],expectedCapabilities:["collection_or_program","opening_hours","tickets","local"]},
  {key:"nonprofit",label:"Stichting / non-profit",keywords:/\b(stichting|nonprofit|non-profit|charity|goed doel)\b/i,schemaTypes:["NGO"],expectedCapabilities:["mission","organization","contact"],optionalCapabilities:["donations"]},
  {key:"government",label:"Overheid / publieke dienst",keywords:/\b(gemeente|government|overheid|ministerie|municipality)\b/i,schemaTypes:["GovernmentOrganization"],expectedCapabilities:["public_services","contact","accessibility","trust"]},
  {key:"association",label:"Vereniging / brancheorganisatie",keywords:/\b(vereniging|association|brancheorganisatie|federation)\b/i,schemaTypes:["Organization"],expectedCapabilities:["mission","membership","contact"]},
  {key:"manufacturer",label:"Fabrikant / producent",keywords:/\b(fabrikant|manufacturer|producent|manufacturing|factory)\b/i,schemaTypes:["Organization"],expectedCapabilities:["products","company","distributors_or_contact"],optionalCapabilities:["commerce"]},
  {key:"wholesale",label:"Groothandel / B2B handel",keywords:/\b(groothandel|wholesale|distributor|b2b supplier)\b/i,schemaTypes:["Organization"],expectedCapabilities:["catalog","business_customers","quote_or_order"],optionalCapabilities:["commerce"]},
  {key:"logistics",label:"Logistiek / transport",keywords:/\b(logistiek|logistics|transport|freight|koerier|courier)\b/i,schemaTypes:["Organization"],expectedCapabilities:["services","service_area","quote_request","contact"]},
  {key:"telecom",label:"Telecom",keywords:/\b(telecom|mobiel abonnement|mobile plan|internet provider|broadband)\b/i,schemaTypes:["Organization"],expectedCapabilities:["plans","pricing","coverage","signup"]},
  {key:"energy",label:"Energie / nutsbedrijf",keywords:/\b(energie|energy supplier|energieleverancier|gas en stroom|electricity supplier)\b/i,schemaTypes:["Organization"],expectedCapabilities:["plans_or_rates","service_area","signup","support"]},
  {key:"photography",label:"Fotografie",keywords:/\b(fotograaf|photographer|photography|fotoshoot)\b/i,schemaTypes:["ProfessionalService"],expectedCapabilities:["portfolio","services","booking_or_contact","pricing"]},
  {key:"childcare",label:"Kinderopvang",keywords:/\b(kinderopvang|daycare|childcare|kinderdagverblijf)\b/i,schemaTypes:["ChildCare"],expectedCapabilities:["services","locations","availability_or_registration","contact"]},
  {key:"senior_care",label:"Ouderenzorg",keywords:/\b(ouderenzorg|senior care|verpleeghuis|nursing home)\b/i,schemaTypes:["MedicalOrganization"],expectedCapabilities:["care_services","locations","contact","trust"]},
  {key:"parking",label:"Parkeren",keywords:/\b(parking|parkeren|parkeergarage|car park)\b/i,schemaTypes:["ParkingFacility"],expectedCapabilities:["locations","availability_or_hours","pricing"]},
  {key:"coworking",label:"Coworking / flexwerk",keywords:/\b(coworking|flexwerk|flex office|workspace)\b/i,schemaTypes:["LocalBusiness"],expectedCapabilities:["spaces","availability","pricing","booking_or_contact"]},
  {key:"general_business",label:"Algemene bedrijfswebsite",keywords:/\b(over ons|about us|onze diensten|our services|bedrijf|company)\b/i,schemaTypes:["Organization","LocalBusiness"],expectedCapabilities:["organization","services_or_offer","contact"]}
];

export function sectorCatalogSummary() {
  return SECTOR_CATALOG.map(({key,label,expectedCapabilities,optionalCapabilities,forbiddenAssumptions})=>({key,label,expectedCapabilities,optionalCapabilities:optionalCapabilities||[],forbiddenAssumptions:forbiddenAssumptions||[]}));
}

export function rankSectorCandidates(evidence: ScanEvidence, searchableText: string) {
  const schema = new Set(evidence.schema.types.map(x=>x.toLowerCase()));
  const high = (item: { value: unknown; confidence: string }) => Boolean(item.value) && item.confidence === "high";
  // Sector evidence must be independent of the same plain-text keyword that
  // already contributes keywordHit below. Only high-confidence evidence gets
  // the extra evidence score; medium text hints remain useful context but are
  // never double-counted into a "strong" sector by themselves.
  const flags: Record<string,boolean> = {
    "commerce.products": high(evidence.commerce.products),
    "commerce.cart": high(evidence.commerce.cart),
    "commerce.checkout": high(evidence.commerce.checkout),
    "inventory.vehicles": high(evidence.inventory.vehicles),
    "inventory.properties": high(evidence.inventory.properties),
    "inventory.jobs": high(evidence.inventory.jobs),
    "inventory.rooms": high(evidence.inventory.rooms),
    "inventory.menu": high(evidence.inventory.menu),
    "appointments.appointment": high(evidence.appointments.appointment),
    "appointments.reservation": high(evidence.appointments.reservation),
    "appointments.booking": high(evidence.appointments.booking),
  };
  return SECTOR_CATALOG.map(def=>{
    const keywordHit = def.keywords.test(searchableText);
    const schemaHits = (def.schemaTypes||[]).filter(x=>schema.has(x.toLowerCase()));
    let evidenceHits = (def.evidenceFlags||[]).filter(x=>flags[x]);
    // A vacancy is a capability of many businesses, not proof that recruitment is
    // their primary activity. Jobs may support proven staffing/employment identity,
    // but may never create recruitment identity by themselves.
    if (def.key === "recruitment" && !keywordHit && !schemaHits.some(x=>/^EmploymentAgency$/i.test(x))) {
      evidenceHits = evidenceHits.filter(x=>x!=="inventory.jobs");
    }
    // Motor v2.1: inventory.menu can also mean a navigation menu. It is only
    // restaurant identity evidence when an independent food/hospitality signal exists.
    if (def.key === "restaurant" && evidenceHits.includes("inventory.menu")) {
      const foodIdentity = keywordHit ||
        schemaHits.some(x=>/^(?:Restaurant|FoodEstablishment)$/i.test(x)) ||
        flags["appointments.reservation"] ||
        /\b(?:gerechten|diner|lunch|ontbijt|eten|food|cuisine|chef|tafel reserveren|restaurant)\b/i.test(searchableText);
      if (!foodIdentity) evidenceHits = evidenceHits.filter(x=>x!=="inventory.menu");
    }
    // Sector Motor 3.0: structured identity and independently verified capabilities
    // outweigh isolated words. Shared generic schema (Product/Offer/Store) must
    // not establish a marketplace or specialist identity on its own.
    const genericSchema = new Set(["product","offer","store","organization","professionalservice","foodestablishment"]);
    const specificSchemaHits = schemaHits.filter(x=>!genericSchema.has(x.toLowerCase()));
    const genericSchemaHits = schemaHits.filter(x=>genericSchema.has(x.toLowerCase()));
    const schemaScore = specificSchemaHits.length * 5 + Math.min(genericSchemaHits.length, 1) * 2;
    const evidenceScore = evidenceHits.length * 4;
    const score = (keywordHit ? 1 : 0) + schemaScore + evidenceScore;
    // A catalog alone is not proof of a multi-seller marketplace.
    if (def.key === "marketplace" && !keywordHit && specificSchemaHits.length === 0) {
      return {key:def.key,label:def.label,score:0,evidence:[],
        expectedCapabilities:def.expectedCapabilities,optionalCapabilities:def.optionalCapabilities||[],
        forbiddenAssumptions:def.forbiddenAssumptions||[]};
    }
    return {key:def.key,label:def.label,score,evidence:[
      ...(keywordHit?["Sectorspecifieke content gevonden"]:[]),
      ...schemaHits.map(x=>`Schema: ${x}`),
      ...evidenceHits.map(x=>`Evidence: ${x}`)
    ],expectedCapabilities:def.expectedCapabilities,optionalCapabilities:def.optionalCapabilities||[],forbiddenAssumptions:def.forbiddenAssumptions||[]};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
}


/** Sector Motor 3.0 advisory confidence: no unsupported certainty from a single clue. */
export function assessSectorConflict(candidates: ReturnType<typeof rankSectorCandidates>) {
  const [first, second] = candidates;
  if (!first) return { status: "unknown" as const, confidence: 0, sector: null, reason: "Geen sectorspecifiek bewijs" };
  const schema = first.evidence.some(item => item.startsWith("Schema:"));
  const verified = first.evidence.some(item => item.startsWith("Evidence:"));
  const text = first.evidence.some(item => item === "Sectorspecifieke content gevonden");
  const independentGroups = Number(schema) + Number(verified) + Number(text);
  // A near tie or a conflicting independently supported identity is not
  // evidence of a reliable primary sector.
  const secondVerified = Boolean(second?.evidence.some(item => item.startsWith("Schema:") || item.startsWith("Evidence:")));
  const close = Boolean(second && second.score > 0 &&
    (secondVerified && (first.score - second.score <= 2 || second.score >= first.score * 0.8)));
  const strong = schema && verified && !close;
  const confidence = close ? 55 : strong ? 95 : independentGroups >= 2 ? 75 : 50;
  return {
    status: close ? "ambiguous" as const : confidence < 60 ? "uncertain" as const : "supported" as const,
    confidence,
    sector: close || confidence < 60 ? null : first.key,
    reason: close ? "Concurrerende sectoren hebben vergelijkbaar bewijs" :
      confidence < 60 ? "Onvoldoende onafhankelijke bewijsbronnen" : "Sector ondersteund door onafhankelijk bewijs",
  };
}


// Capabilities are facts, not sectors. Only generic cross-sector capabilities map
// directly to modules here. Sector-defining modules (recruitment, hospitality,
// real estate, automotive, marketplace) are activated by the primary-sector
// decision, never by a single incidental word/link.
export const CAPABILITY_MODULE_MAP: Record<string,string[]> = {
  products:["product","ecommerce"], pricing:["pricing_currency"], cart:["ecommerce"], add_to_cart:["ecommerce"],
  checkout:["checkout","ecommerce"], merchant:["merchant"], consumer_rights:["eu_consumer"],
  vehicles:[], vehicle_details:[], test_drive:["lead_conversion"],
  properties:[], property_details:[], viewing_request:["lead_conversion"],
  jobs:[], application:["lead_conversion"],
  rooms:[], menu:[], availability:["booking"],
  appointment:["lead_conversion"], appointments:["lead_conversion"], reservation:["lead_conversion"],
  booking:["booking","lead_conversion"], quote_request:["lead_conversion"],
  contact:["business_identity"], local:["local"], opening_hours:["local"], reviews:["quality_trust"],
  services:["business_identity"], treatments:["business_identity"], trust:["quality_trust"],
  accessibility:["accessibility"], listings:[], seller_identity:[],
};

export function modulesForCapabilities(capabilities: Iterable<string>) {
  const modules = new Set<string>();
  for (const capability of capabilities) {
    for (const module of CAPABILITY_MODULE_MAP[capability] || []) modules.add(module);
  }
  return [...modules];
}
