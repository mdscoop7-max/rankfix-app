// A catalog subtype can refine a primary family only when this site's OWN
// declared identity supports it. Article topics or sampled pages are not identity.
export type SectorSubtype = "dentist" | "legal";
export type SubtypeIdentityInput = {
  subtype: SectorSubtype;
  primarySector: string;
  declaredSector?: string | null;
  title: string;
  description: string;
  siteName?: string;
  h1s?: string[];
  schemaTypes?: string[];
};
const SUBTYPE_RULES: Record<SectorSubtype, {family:string;identity:RegExp;schemas:Set<string>}> = {
  dentist: {
    family:"health_wellness",
    identity:/\b(?:tandarts(?:praktijk)?|mondzorg|dentist(?:ry)?|dental\s+(?:clinic|practice|care)|zahnarzt(?:praxis)?|dentiste|orthodontist)\b/i,
    schemas:new Set(["dentist"]),
  },
  legal: {
    family:"professional_services",
    identity:/\b(?:advocaat(?:enkantoor)?|advocatuur|juridisch(?:e)?\s+(?:advies|dienstverlening|kantoor)|law\s+firm|legal\s+(?:practice|services|firm)|lawyer|attorney|rechtsanwalt|cabinet\s+d.avocats?)\b/i,
    schemas:new Set(["legalservice","attorney"]),
  },
};
export function canPromoteSectorSubtype(input:SubtypeIdentityInput):boolean {
  const rule=SUBTYPE_RULES[input.subtype];
  if(!rule||input.primarySector!==rule.family)return false;
  // News, government, software, finance etc. beat stray subtype keywords.
  if(input.declaredSector&&input.declaredSector!==rule.family)return false;
  const schemas=(input.schemaTypes||[]).map(t=>String(t).toLowerCase());
  if(schemas.some(type=>rule.schemas.has(type)))return true;
  // Do not use body text or second-hop pages as subtype-identity evidence.
  const identity=[input.title,input.description,input.siteName||"",...(input.h1s||[]).slice(0,1)]
    .filter(Boolean).join(" ").slice(0,3000);
  return rule.identity.test(identity);
}
