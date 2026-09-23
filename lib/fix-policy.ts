import { FIX_POLICY_VERSION } from "./seo-rules";

export type FixCategory = "A" | "B" | "C";
export type FixPolicy = { category: FixCategory; safe_type: string | null };

const POLICY: Record<string, FixPolicy> = {
  META_TITLE_MISSING: { category: "B", safe_type: "meta_title" },
  META_TITLE_GUIDANCE: { category: "B", safe_type: "meta_title" },
  META_DESCRIPTION_MISSING: { category: "B", safe_type: "meta_description" },
  META_DESCRIPTION_GUIDANCE: { category: "B", safe_type: "meta_description" },
  H1_MISSING: { category: "B", safe_type: "h1" },
  H1_MULTIPLE: { category: "C", safe_type: null },
  IMAGE_ALT_MISSING: { category: "B", safe_type: "alt_text" },
  SOCIAL_METADATA_INCOMPLETE: { category: "B", safe_type: "social_metadata" },
  social: { category: "B", safe_type: "social_metadata" },
  STRUCTURED_DATA_MISSING: { category: "B", safe_type: "structured_data" },
  breadcrumbs: { category: "B", safe_type: "breadcrumb" },
  author: { category: "C", safe_type: "expertise" },
};

export function getFixPolicy(ruleId: string): FixPolicy {
  return POLICY[ruleId] || { category: "C", safe_type: null };
}
export const fixPolicyVersion = FIX_POLICY_VERSION;
