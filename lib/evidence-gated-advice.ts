// Evidence-gated recommendations (owner assignment 7 Nov 2026, P0-3).
//
// Schema and title advice used to be chosen from keywords in title/description
// ("sportschool" -> ExerciseGym, every generic title -> "Kapper in Utrecht | Merk")
// BEFORE the final sector and business-model decision. Even with a correct
// classification that could give a directory ExerciseGym advice or a pharma group
// LocalBusiness advice. This layer runs after the final decision, per advice:
//
// - A LocalBusiness subtype (ExerciseGym, HairSalon, Hotel, LocalBusiness …) is
//   advised only when the site's own activity is a confirmed local service:
//   sector confirmed (>= 80), not a platform/booking/comparison role, not a
//   non-local business model, the subtype fits the confirmed sector, and the site
//   shows its own location details.
// - A deduction that rests on the gated premise ("no schema fitting this local
//   business page") is re-assessed against the advice that does apply.
// - The title example never invents a trade or a city.
// Generic technical advice (missing meta description, canonical, …) is untouched.
// Every gate is recorded in check.evidence.adviceGate with its reason.

export const LOCAL_SCHEMA_TYPES = new Set([
  "LocalBusiness", "Restaurant", "Physiotherapy", "MedicalClinic", "Pharmacy", "VeterinaryCare", "ExerciseGym", "HealthClub",
  "HairSalon", "BeautySalon", "Dentist", "Electrician", "Plumber", "GeneralContractor", "RoofingContractor", "HomeAndConstructionBusiness",
  "AutomotiveBusiness", "AutoRepair", "RealEstateAgent", "LegalService", "AccountingService", "TravelAgency", "Hotel", "LodgingBusiness",
  "Store", "ChildCare", "DrivingSchool", "FoodEstablishment", "Bakery", "Optician", "HVACBusiness", "Locksmith", "MovingCompany",
]);
// Business models that are not one local establishment (whatever their topic).
const NON_LOCAL_SECTORS = new Set(["financial_services", "telecom_technology", "news_media", "saas_b2b", "government", "ecommerce", "education",
  "nonprofit", "energy_utilities", "recruitment", "manufacturing_industrial", "service_marketplace"]);
const MEDIATION_KEYS = new Set(["travel", "comparison_platform", "service_marketplace", "marketplace", "booking_platform", "directory"]);

export type AdviceIdentity = {
  sector: string; key: string; label: string; confidence: number;
  /** schema type the confirmed sector itself calls for (sectorSchemaType), if any */
  expectedType: string | null;
  /** the site shows its own address/phone/opening hours (not those of third parties) */
  ownLocalEvidence: boolean;
  /** schema types present on the page */
  pageSchemaTypes: string[];
  /** distinct establishment addresses/phone numbers listed on the page (overview pages list many) */
  listedLocations?: number;
};

/**
 * Distinct postal addresses (NL/BE/DE/FR/… postcodes) and phone numbers on a page.
 * A page listing 3+ establishments is an overview (a directory, or a chain's
 * location list): its own LocalBusiness type belongs on each location page.
 */
export function countListedLocations(text: string): number {
  const t = String(text || "").slice(0, 200000);
  const postcodes = new Set((t.match(/(?<![\p{L}\d])\d{4}\s?[A-Z]{2}(?![\p{L}\d])|(?<![\p{L}\d])\d{5}\s+\p{Lu}\p{L}{2,}/gu) || []).map((x) => x.replace(/\s+/g, " ").toUpperCase()));
  const phones = new Set((t.match(/(?:\+\d{2}[\s-]?|(?<!\d)0)\d{1,3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2,4}(?!\d)/g) || []).map((x) => x.replace(/\D/g, "").replace(/^31/, "0")));
  return Math.max(postcodes.size, phones.size);
}

type Check = { key: string; status: string; message: string; fix: string; points?: number; maxPoints?: number; evidence?: Record<string, unknown> | null };

const firstType = (recommended: string) => String(recommended || "").split(/\s*[+/]\s*/)[0].trim();

/** What the schema advice may recommend for this identity, and why. */
export function schemaAdviceFor(recommended: string, id: AdviceIdentity): { schema: string; gated: boolean; reason: string | null } {
  const type = firstType(recommended);
  if (!LOCAL_SCHEMA_TYPES.has(type)) return { schema: recommended, gated: false, reason: null };
  // The subtype the confirmed or probable own sector itself calls for (a hair salon
  // naming itself a hair salon at 76%) is supported; any other local subtype
  // needs a confirmed sector.
  const sectorCallsForType = Boolean(id.expectedType) && id.expectedType === type && id.confidence >= 70;
  const confirmed = id.sector !== "unknown" && (id.confidence >= 80 || sectorCallsForType);
  const mediation = MEDIATION_KEYS.has(id.key) || id.sector === "service_marketplace";
  const reason = mediation ? "de website bemiddelt of vergelijkt aanbod van derden; zij exploiteert die vestigingen niet zelf"
    : !confirmed ? "de hoofdactiviteit is niet bevestigd"
    : NON_LOCAL_SECTORS.has(id.sector) ? `de organisatie (${id.label}) is geen lokale vestiging`
    : id.expectedType && type !== "LocalBusiness" && id.expectedType !== type && LOCAL_SCHEMA_TYPES.has(id.expectedType) ? `${type} past niet bij de bevestigde hoofdactiviteit (${id.label})`
    : (id.listedLocations || 0) >= 3 ? `deze pagina toont ${id.listedLocations} verschillende vestigingsadressen (een overzicht); een lokaal bedrijfstype hoort op de afzonderlijke vestigingspagina`
    // Own location details are required only while the sector is not confirmed:
    // a confirmed local trade without an address on the page is advised to add its
    // own LocalBusiness type with that address.
    : id.confidence < 80 && !sectorCallsForType && !id.ownLocalEvidence && !((id.listedLocations || 0) >= 1) ? "de hoofdactiviteit is nog niet bevestigd en de website toont geen eigen vestigingsgegevens (adres met telefoon, locatie of werkgebied)"
    : null;
  if (!reason) return { schema: recommended, gated: false, reason: null };
  const replacement = !mediation && confirmed && id.expectedType && !LOCAL_SCHEMA_TYPES.has(id.expectedType) ? `${id.expectedType} + WebSite` : "Organization + WebSite";
  return { schema: replacement, gated: true, reason };
}

const ENTITY_TYPES = /^(?:organization|corporation|ngo|governmentorganization|educationalorganization|website|webpage|onlinestore|onlinebusiness|medicalorganization|newsmediaorganization)$/i;

/** Apply the gate to the schema check in place. Returns the gate record (or null). */
export function gateSchemaCheck(check: Check | undefined, recommended: string, id: AdviceIdentity) {
  if (!check) return null;
  const advice = schemaAdviceFor(recommended, id);
  if (!advice.gated) return null;
  const replaceAll = (text: string) => String(text || "").split(recommended).join(advice.schema);
  const record = { original: recommended, applied: advice.schema, reason: advice.reason };
  const hasEntity = id.pageSchemaTypes.some((t) => ENTITY_TYPES.test(String(t)));
  // A deduction "no schema fitting this local business page" rests on the gated
  // premise. With an entity schema that does apply on the page it is not proven.
  if (check.status === "warning" && hasEntity && /lokale bedrijfspagina|lokaal bedrijfstype|herkenbaar relevant|overtuigend aan deze/i.test(check.message)) {
    Object.assign(check, {
      status: "pass", points: check.maxPoints ?? check.points,
      message: `Structured data met een organisatie- of websitetype gevonden (${id.pageSchemaTypes.filter((t) => ENTITY_TYPES.test(String(t))).slice(0, 3).join(", ")}). Een lokaal bedrijfstype wordt niet geadviseerd: ${advice.reason}.`,
      fix: `Houd ${advice.schema} consistent met de zichtbare inhoud; voeg alleen een specifiek schema-type toe dat aantoonbaar bij de eigen hoofdactiviteit past.`,
    });
  } else {
    Object.assign(check, { message: replaceAll(check.message), fix: `${replaceAll(check.fix)} Geen lokaal bedrijfstype geadviseerd: ${advice.reason}.` });
  }
  check.evidence = { ...(check.evidence || {}), adviceGate: record };
  return record;
}

/** Brand for the example: og:site_name, else the title segment that is not a generic word. */
export function brandFromTitle(title: string, siteName?: string | null): string {
  const generic = /^(?:home|homepage|start|startpagina|welkom|welcome|accueil|inicio|startseite|index|hoofdpagina)$/i;
  if (siteName && !generic.test(siteName.trim())) return siteName.trim();
  const parts = String(title || "").split(/\s*[|–—:]\s*|\s+-\s+/).map((p) => p.trim()).filter((p) => p && !generic.test(p));
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || "Merk";
}

/** The generic-title example names the confirmed activity, never an invented trade or city. */
export function titleExample(id: AdviceIdentity, brand: string): string {
  const name = (brand || "Merk").trim().slice(0, 40) || "Merk";
  const confirmed = id.sector !== "unknown" && id.confidence >= 80 && id.label && !/niet bevestigd/i.test(id.label);
  const activity = confirmed ? id.label.split(/\s*[·(]/)[0].trim() : "Belangrijkste aanbod";
  const local = confirmed && !NON_LOCAL_SECTORS.has(id.sector) && !MEDIATION_KEYS.has(id.key) && id.ownLocalEvidence;
  return `${activity}${local ? " in [plaats]" : ""} | ${name}`;
}

const FIXED_TITLE_EXAMPLE = 'bijvoorbeeld "Kapper in Utrecht | Merk"';

export function gateTitleCheck(check: Check | undefined, id: AdviceIdentity, brand: string) {
  if (!check || !String(check.fix || "").includes(FIXED_TITLE_EXAMPLE)) return null;
  const example = titleExample(id, brand);
  check.fix = check.fix.replace(FIXED_TITLE_EXAMPLE, `bijvoorbeeld "${example}"`);
  const record = { original: "Kapper in Utrecht | Merk", applied: example, reason: "voorbeeld volgt de eigen, bevestigde hoofdactiviteit" };
  check.evidence = { ...(check.evidence || {}), adviceGate: record };
  return record;
}
