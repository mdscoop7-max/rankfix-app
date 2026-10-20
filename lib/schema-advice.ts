// Sector-aware structured-data advice. The scan decides the primary sector first;
// schema advice must follow that decision instead of re-guessing from loose words.
// Generic: no domain or brand rules.

/** "https://schema.org/Organization", "http://schema.org/Organization", "schema:Organization" -> "organization" */
export function normalizeSchemaType(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const last = value.split(/[\/#:]/).filter(Boolean).pop() || value;
  return last.trim();
}

export type SchemaAdvice = {
  /** Most specific recommended schema.org type(s), shown to the user. */
  recommended: string;
  /** Lower-case schema.org types that count as a fitting identity for this sector. */
  accepted: Set<string>;
  contextLabel: string;
  /** Institutions are not LocalBusiness pages; never advise LocalBusiness for them. */
  suppressLocalBusiness: true;
};

const ORG_BASE = ["organization", "website", "webpage"];

const HOSPITAL_TYPES = ["hospital", "medicalorganization", "medicalclinic", "medicalbusiness", "communityhealth", "physician", "collegeoruniversity", ...ORG_BASE];
const CLINIC_TYPES = ["medicalclinic", "medicalorganization", "medicalbusiness", "physician", "dentist", "hospital", "pharmacy", "localbusiness", ...ORG_BASE];
const UNIVERSITY_TYPES = ["collegeoruniversity", "educationalorganization", "school", "researchorganization", ...ORG_BASE];
const SCHOOL_TYPES = ["educationalorganization", "school", "elementaryschool", "middleschool", "highschool", "preschool", "collegeoruniversity", ...ORG_BASE];

export function schemaAdviceForSector(input: {
  sector: string;
  key?: string;
  label?: string;
  ownIdentityText?: string;
  isHomepage: boolean;
}): SchemaAdvice | null {
  const own = `${input.key || ""} ${input.label || ""} ${input.ownIdentityText || ""}`.toLowerCase();
  const withSite = (type: string) => (input.isHomepage ? `${type} + WebSite` : `${type} / WebPage`);

  if (input.sector === "health_wellness") {
    const hospitalLike = /healthcare_academic|hospital|ziekenhuis|medisch centrum|medical cent|umc|klinikum|krankenhaus|hôpital|ospedal/.test(own);
    if (hospitalLike) {
      return { recommended: withSite("Hospital"), accepted: new Set(HOSPITAL_TYPES), contextLabel: input.isHomepage ? "ziekenhuis-homepage" : "zorgpagina", suppressLocalBusiness: true };
    }
    const institutional = /gezondheidscentrum|health cent|zorginstelling|zorggroep|medical organization/.test(own);
    if (institutional) {
      return { recommended: withSite("MedicalOrganization"), accepted: new Set(CLINIC_TYPES), contextLabel: input.isHomepage ? "zorg-homepage" : "zorgpagina", suppressLocalBusiness: true };
    }
    return null; // small practices stay with the existing local-business logic
  }

  if (input.sector === "education") {
    const university = /universit|hogeschool|hochschule|college|université|universidad|università|uniwersytet|polytechn/.test(own);
    return university
      ? { recommended: withSite("CollegeOrUniversity"), accepted: new Set(UNIVERSITY_TYPES), contextLabel: input.isHomepage ? "universiteits-/hogeschoolhomepage" : "onderwijspagina", suppressLocalBusiness: true }
      : { recommended: withSite("EducationalOrganization"), accepted: new Set(SCHOOL_TYPES), contextLabel: input.isHomepage ? "onderwijs-homepage" : "onderwijspagina", suppressLocalBusiness: true };
  }

  return null;
}
