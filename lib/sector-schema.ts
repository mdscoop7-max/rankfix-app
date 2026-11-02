// 31 Oct 2026 (PDF P9 "sectorspecifieke structured data"): schema.org advice
// follows the recognised sector, not the domain. A hospital, hair salon, garage
// or airline got the generic "Organization + WebSite" advice. This table maps
// the Sector Motor's sector/key (plus multilingual identity wording for the
// broad keys) to the most specific schema.org type. Advice only: it never
// changes points, and a page that already carries the type counts as relevant.

type Input = { sector?: string | null; key?: string | null; identityText: string; schemaTypes?: Iterable<string> };

const BY_KEY: Record<string, string> = {
  hair_salon: "HairSalon", beauty_salon: "BeautySalon", dentist: "Dentist", medical_clinic: "MedicalClinic",
  healthcare_academic: "Hospital", pharmacy: "Pharmacy", veterinary: "VeterinaryCare", car_repair: "AutoRepair",
  car_rental: "AutoRental", bakery: "Bakery", restaurant: "Restaurant", hotel: "Hotel", bed_breakfast: "BedAndBreakfast",
  camping: "Campground", financial_payments: "FinancialService", legal: "LegalService", accounting: "AccountingService",
  fitness: "ExerciseGym", childcare: "ChildCare", museum_culture: "Museum", recruitment: "EmploymentAgency",
  travel: "TravelAgency", sports_club: "SportsClub", banking: "BankOrCreditUnion", bank: "BankOrCreditUnion",
};

// Broad keys need the page's own identity wording (title/description/H1/schema).
const BY_WORDING: { keys: RegExp; type: string; pattern: RegExp }[] = [
  { keys: /^(health_wellness|healthcare)$/, type: "Hospital", pattern: /(ziekenhuis|medisch centrum|\bumc\b|hospital|krankenhaus|klinikum|universitätsklinik|hôpital|\bchu\b|ospedale|policlinico|hospital universitario|szpital|sairaala|sjukhus)/iu },
  { keys: /^passenger_transport$|^transport_travel$/, type: "Airline", pattern: /(luchtvaartmaatschappij|\bairlines?\b|\bairways\b|fluggesellschaft|compagnie aérienne|compagnia aerea|aerol[ií]nea|companhia aérea|flygbolag|linie lotnicze)/iu },
  // A passenger carrier that sells its own flights is an airline (travel agencies get key "travel").
  { keys: /^passenger_transport$/, type: "Airline", pattern: /(\bvluchten\b|vliegtickets?|\bvliegen\b|billets? d'avion|flugtickets?|biglietti aerei|billetes de avión|\bflights?\b|\bvols?\b|\bflüge\b|\bvoli\b|\bvuelos\b|\bvoos\b|\bloty\b)/iu },
  { keys: /^real_estate$/, type: "RealEstateAgent", pattern: /(makelaar|makelaardij|real estate agen|realtor|estate agents?\b|immobilienmakler|agence immobili|agenzia immobiliare|inmobiliaria)/iu },
  { keys: /^professional_services$/, type: "AccountingService", pattern: /(boekhoud|accountant|administratiekantoor|accounting|bookkeeping|steuerberat|expert-comptable|commercialista)/iu },
  { keys: /^professional_services$/, type: "LegalService", pattern: /(advoca|notaris|law firm|lawyers?\b|rechtsanw|avocat|avvocat|abogad)/iu },
];

// Construction and trade businesses (any language). The profession named FIRST
// in the organisation's own title/description/H1 decides the subtype, so
// "Heizung und Sanitär" is an HVAC business and "Plumbing & Heating" a plumber.
// Without a recognisable profession the sector type HomeAndConstructionBusiness
// is advised; never a product or store type.
const TRADE_TYPES: { type: string; pattern: RegExp }[] = [
  { type: "Electrician", pattern: /(elektricien|electricians?|electrical contractor|elektriker|elektroinstall|elektrotechn|électricien|electricista|elettricista)/iu },
  { type: "Plumber", pattern: /(loodgieter|plumb|klempner|sanitär|plombier|plomberie|fontaner|idraulic)/iu },
  { type: "HVACBusiness", pattern: /(cv-?(?:ketel|monteur|installateur)|warmtepomp|airco|heat pumps?|hvac|heating engineer|air conditioning|heizung|wärmepumpe|klimaanlage|chauffagiste|climatisation|pompe à chaleur|calefacción|climatizaci|caldai|termoidraulic|climatizzazion)/iu },
  { type: "RoofingContractor", pattern: /(dakdekker|dakwerk|roofers?|roofing|dachdecker|couvreur|couverture|techador|tejados?|lattoniere)/iu },
  { type: "HousePainter", pattern: /(schilders|schilderwerk|schildersbedrijf|painters?(?: and decorators?)?|painting contractor|malerbetrieb|malermeister|peintre|imbianchin|pintor(?:es)? de|empresa de pintura)/iu },
  { type: "Locksmith", pattern: /(slotenmaker|locksmith|schlüsseldienst|serrurier|cerrajer)/iu },
  { type: "GeneralContractor", pattern: /(aannemer|bouwbedrijf|general contractor|building contractor|bauunternehm|baufirma|entreprise de (?:bâtiment|construction)|constructora|impresa edile|impresa di costruzioni)/iu },
];

function tradeSchemaType(identityText: string): string {
  let best: { type: string; index: number } | null = null;
  for (const rule of TRADE_TYPES) {
    const match = rule.pattern.exec(identityText);
    if (match && (!best || match.index < best.index)) best = { type: rule.type, index: match.index };
  }
  return best?.type || "HomeAndConstructionBusiness";
}

export function sectorSchemaType(input: Input): string | null {
  const key = String(input.key || ""), sector = String(input.sector || "");
  if (BY_KEY[key]) return BY_KEY[key];
  if (key === "home_services" || key === "construction" || sector === "home_services" || sector === "construction") return tradeSchemaType(input.identityText);
  for (const rule of BY_WORDING) if ((rule.keys.test(key) || rule.keys.test(sector)) && rule.pattern.test(input.identityText)) return rule.type;
  return null;
}

// Only generic advice is replaced; government, news, webshop and product
// advice stay as they are.
export function isGenericSchemaAdvice(advice: string): boolean {
  return /^(?:Organization \+ WebSite|Organization \/ WebPage|LocalBusiness|Hairdresser|AutomotiveBusiness|Store)$/.test(advice.trim());
}
