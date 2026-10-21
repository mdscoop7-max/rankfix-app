/**
 * Detect an owner/landlord of residential property, not a sales broker.
 * Only primary self-description on a homepage can establish the subtype.
 * No domains, brand names, postcode/URL assumptions or sector overrides.
 */
export function residentialLandlordIdentity(input: {
  title?: string; description?: string; h1s?: readonly string[];
  bodyText?: string; homepage?: boolean;
}): { key: "residential_landlord"; label: string; evidence: string[]; confidenceScore: number } | null {
  if (!input.homepage) return null;
  const own = [input.title || "", input.description || "", ...(input.h1s || []).slice(0, 4)].join(" ");
  const body = (input.bodyText || "").slice(0, 16000);
  const ownerTerm = /\b(?:woningbelegger|vastgoedbelegger|residential (?:property )?investor|institutional (?:housing|residential) investor|woningverhuurder|residential landlord|property owner(?:ship)? and landlord|we (?:own|manage) (?:rental )?(?:residential )?homes)\b/iu;
  const housingTerm = /\b(?:huurwoning(?:en)?|woningverhuur|verhuur(?:der|ders|t|en)? (?:van )?(?:huur)?woning(?:en)?|huurders?|rental (?:homes|housing|properties)|residential (?:property|properties)|tenants?|verhuurportefeuille)\b/iu;
  const brokerTerm = /\b(?:makelaar|makelaardij|estate agency|real estate agent|realtor|makelaarskantoor)\b/iu;
  const firstPartyStatement = /\b(?:wij zijn|we are|we're|ons bedrijf|onze organisatie|(?:is|zijn) (?:een|de) (?:nederlandse |dutch )?(?:woningbelegger|vastgoedbelegger|woningverhuurder)|(?:are|is) (?:a|an) (?:residential )?(?:investor|landlord))\b/iu;
  const explicitOwn = ownerTerm.test(own) && housingTerm.test([own,body.slice(0,3000)].join(" "));
  const explicitBody = firstPartyStatement.test(body) && ownerTerm.test(body) && housingTerm.test(body);
  // Generic housing listings are not an owner claim. Sales brokers remain brokers
  // unless the company clearly declares residential ownership/letting.
  if ((!explicitOwn && !explicitBody) || (brokerTerm.test(own) && !explicitOwn)) return null;
  return {
    key:"residential_landlord", label:"Vastgoed & Woningverhuur · belegger/verhuurder",
    evidence: [
      explicitOwn ? "Primaire paginametadata benoemt woningbelegger/verhuurder" : "Eigen bedrijfsomschrijving benoemt eigendom en verhuur van woningen",
      "Zelf beschreven woon-/huuractiviteit, niet afgeleid uit alleen een woninglijst",
    ],
    confidenceScore: explicitOwn ? 91 : 82,
  };
}
