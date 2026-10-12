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
