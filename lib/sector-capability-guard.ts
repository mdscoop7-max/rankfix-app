/**
 * Broad text from representative pages may discuss another industry without
 * demonstrating that the audited organization offers that industry's services.
 * When independent evidence has established a strong primary identity, bare
 * sector keywords cannot add unrelated specialist capabilities.
 *
 * Unconfirmed identities stay eligible for corroboration from site samples.
 */
export function corroborateSpecialistCapability(input: {
  keywordEvidence: boolean;
  primarySector: string;
  primaryConfidence: number;
  specialistSector: string;
}): boolean {
  if (!input.keywordEvidence) return false;
  const hasConfirmedOtherIdentity =
    input.primaryConfidence >= 85 &&
    input.primarySector !== "unknown" &&
    input.primarySector !== input.specialistSector;
  return !hasConfirmedOtherIdentity;
}

type SpecialistFlag = "transport" | "hospitality" | "treatment" | "vehicleSales" | "automotiveService" | "properties" | "professional";

const specialistIdentity: Record<SpecialistFlag, string> = {
  transport: "transport_travel",
  hospitality: "hospitality",
  treatment: "health_wellness",
  vehicleSales: "automotive",
  automotiveService: "automotive",
  properties: "real_estate",
  professional: "professional_services",
};

// Master capabilities added from a word match, not from a separately verified
// booking, product or service flow. The baseline preserves independent evidence.
const inferredMasterCapabilities: Record<SpecialistFlag, readonly string[]> = {
  transport: ["services","service_area","quote_request","contact"],
  hospitality: ["rooms","booking"],
  treatment: ["services"],
  vehicleSales: ["vehicles"],
  automotiveService: ["services"],
  properties: ["properties"],
  professional: [],
};

/**
 * A site can be reclassified late in a representative crawl. Revalidate every
 * specialist word signal against that *final* primary identity, then retract
 * capabilities supported only by a discarded preliminary guess.
 *
 * Preserve separately proven/master capabilities and capabilities supported by
 * a surviving specialist. Does not change product/retail evidence.
 */
export function reconcileRepresentativeSpecialistCapabilities(input: {
  capabilities: Record<SpecialistFlag,boolean>;
  sector: string;
  confidence: number;
  initialMasterCapabilities: readonly string[];
  masterCapabilities: string[];
}): {removedCapabilities:string[]} {
  const before = new Set(input.initialMasterCapabilities);
  const tentative = new Set<string>();
  const surviving = new Set<string>();
  for (const [flag, specialistSector] of Object.entries(specialistIdentity) as [SpecialistFlag,string][]) {
    if (!input.capabilities[flag]) continue;
    for (const capability of inferredMasterCapabilities[flag]) tentative.add(capability);
    input.capabilities[flag] = corroborateSpecialistCapability({
      keywordEvidence: true,
      primarySector: input.sector,
      primaryConfidence: input.confidence,
      specialistSector,
    });
    if (input.capabilities[flag]) for (const capability of inferredMasterCapabilities[flag]) surviving.add(capability);
  }
  const revoked = [...tentative].filter((c)=>!before.has(c)&&!surviving.has(c));
  if (revoked.length) {
    const remove=new Set(revoked);
    for(let i=input.masterCapabilities.length-1;i>=0;i--) {
      if(remove.has(input.masterCapabilities[i])) input.masterCapabilities.splice(i,1);
    }
  }
  return {removedCapabilities:revoked};
}
