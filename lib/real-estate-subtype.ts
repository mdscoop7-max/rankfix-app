/**
 * Evidence-based real estate subtype detection: page intent != business model.
 * The output is a conservative hint, never a forced customer/domain mapping.
 */
export type RealEstateSubtype =
  | "institutional_property_rental" | "property_rental_operator"
  | "real_estate_agent" | "property_portal" | "unknown";

export type RealEstateSubtypeDecision = {
  subtype:RealEstateSubtype;
  label:string;
  confidenceScore:number;
  evidence:string[];
};

const UNKNOWN:RealEstateSubtypeDecision = {
  subtype:"unknown",label:"Type vastgoedorganisatie niet bevestigd",
  confidenceScore:0,evidence:[]
};

export function detectRealEstateSubtype(args:{
  title?:string;description?:string;h1s?:string[];
  navLabels?:string[];sampledOwnIdentity?:string[];
  schemaTypes?:string[];
}):RealEstateSubtypeDecision {
  const own=[args.title||"",args.description||"",...(args.h1s||[])].join(" ").toLowerCase();
  const nav=(args.navLabels||[]).join(" ").toLowerCase();
  // Sampled body prose and news articles are never trusted as self-description.
  const ownPages=(args.sampledOwnIdentity||[]).join(" ").toLowerCase();
  const schema=(args.schemaTypes||[]).map(v=>v.toLowerCase());
  const ownAndPages=[own,ownPages].join(" ");
  const investor=/\b(?:woningbelegger|woningbelegging|vastgoedbelegger|vastgoedbelegging|institutionele? (?:woning)?belegger|residenti(?:al|eel) (?:real estate )?invest(?:or|ment)|invest(?:or|ing) in (?:rental |residential )?(?:homes|housing|properties)|wohnungsinvestor|immobilieninvestor)\b/i.test(ownAndPages);
  const ownsRentals=/\b(?:wij verhuren|we verhuren|we rent out|we lease (?:out )?|our rental homes|ons(?:e)? huurwoningen|onze huurders|huurwoningen in (?:heel )?nederland (?:vindt|vind)|woningen huren bij|rent(?:al)? homes (?:with|from) us|wohnungen bei uns mieten|vermiet(?:en|ung) unserer wohnungen)\b/i.test(ownAndPages);
  const rentalIdentity=/\b(?:huurwoning(?:en)?|woningen te huur|woning huren|appartement huren|rental (?:apartments|housing|homes)|wohnungsvermietung|mietwohnungen)\b/i.test(own);
  const tenantOperations=/\b(?:huurders?|bestaande huurders|mijn huur|huurcontract|huurverhoging|huurdersservice|tenant(?:s)? portal|tenant services|mieter(?:service|portal)|huren in \d+ stappen|inschrijven en bezichtigen)\b/i.test(nav+" "+own);
  const agent=/\b(?:makelaar|makelaars|makelaardij|estate agent|real estate agent|immobilienmakler|immobilienvermittlung|buying agent)\b/i.test(own);
  const agentSchema=schema.includes("realestateagent");
  const portal=/\b(?:woningplatform|huizenplatform|vastgoedportaal|property portal|listing portal|real estate portal|makelaarsportaal|platform voor woning(?:en)?|platform for (?:property|real estate) listings)\b/i.test(ownAndPages);
  const sales=/\b(?:verkoop uw woning|verkopen van uw woning|woning verkopen|huis verkopen|selling your home|sell your house|verkauf ihrer immobilie)\b/i.test(own);
  // A brokerage or listing platform can also publish rental inventory. Mere
  // rental search language is never enough to declare it the landlord.
  if (agentSchema || (agent && sales))return {
    subtype:"real_estate_agent",label:"Makelaar",confidenceScore:agentSchema?96:90,
    evidence:[agentSchema?"schema.org RealEstateAgent":"Eigen identiteit noemt makelaar plus woningverkoop"]
  };
  if (portal && !ownsRentals)return {
    subtype:"property_portal",label:"Vastgoedportaal",confidenceScore:90,
    evidence:["Eigen bedrijfsomschrijving noemt een platform/portaal voor vastgoedaanbod"]
  };
  if (investor && (rentalIdentity || ownsRentals || tenantOperations))return {
    subtype:"institutional_property_rental",label:"Verhuurder / woningbelegger",confidenceScore:94,
    evidence:["Eigen website bevestigt woningbelegger of residentieel investeerder","Woningverhuur/huurderrelatie onafhankelijk bevestigd"]
  };
  if (!agent && ownsRentals && (rentalIdentity || tenantOperations))return {
    subtype:"property_rental_operator",label:"Woningverhuurder",confidenceScore:88,
    evidence:["Eigen website presenteert verhuur van eigen woningen","Huurwoning- of huurdersservicebewijs in navigatie of eigen identiteit"]
  };
  if (!agent && rentalIdentity && tenantOperations && !/\b(?:te koop|for sale|kopen)\b/i.test(own))return {
    subtype:"property_rental_operator",label:"Woningverhuurder",confidenceScore:78,
    evidence:["Eigen identiteit noemt huurwoningen en navigatie bevestigt huurderservice"]
  };
  return UNKNOWN;
}
