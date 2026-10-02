import { FIX_POLICY_VERSION } from "./seo-rules";

export type FixCategory = "A" | "B" | "C";
export type FixAction = "github_fix" | "ai_advice" | "manual";
export type FixPolicy = { category: FixCategory; safe_type: string | null; action?: FixAction };

const POLICY: Record<string, FixPolicy> = {
  META_TITLE_MISSING: { category: "B", safe_type: "meta_title" },
  META_TITLE_GUIDANCE: { category: "B", safe_type: "meta_title" },
  META_DESCRIPTION_MISSING: { category: "B", safe_type: "meta_description" },
  META_DESCRIPTION_GUIDANCE: { category: "B", safe_type: "meta_description" },
  H1_MISSING: { category: "B", safe_type: "h1" },
  H1_MULTIPLE: { category: "C", safe_type: null, action: "ai_advice" },
  IMAGE_ALT_MISSING: { category: "B", safe_type: "alt_text" },
  SOCIAL_METADATA_INCOMPLETE: { category: "B", safe_type: "social_metadata" },
  social: { category: "B", safe_type: "social_metadata" },
  STRUCTURED_DATA_MISSING: { category: "B", safe_type: "structured_data" },
  breadcrumbs: { category: "B", safe_type: "breadcrumb" },
  author: { category: "C", safe_type: "expertise", action: "ai_advice" },
  canonical: { category: "B", safe_type: "canonical" },
  headings: { category: "B", safe_type: "heading_structure" },
  SITE_TITLE_MISSING: { category: "B", safe_type: "meta_title" },
  SITE_DESCRIPTION_MISSING: { category: "B", safe_type: "meta_description" },
  SITE_H1_MISSING: { category: "B", safe_type: "h1" },
  SITE_IMAGES_ALT: { category: "B", safe_type: "alt_text" },
  SITE_CANONICAL_MISSING: { category: "B", safe_type: "canonical" },
  SITE_STRUCTURED_DATA_MISSING: { category: "B", safe_type: "structured_data" },
  SITE_PRODUCT_SCHEMA_CORE: { category: "C", safe_type: null, action: "ai_advice" },
  SITE_PRODUCT_AVAILABILITY: { category: "C", safe_type: null, action: "ai_advice" },
  SITE_PRODUCT_IDENTITY: { category: "C", safe_type: null, action: "ai_advice" },
  SITE_CATEGORY_INDEXABILITY: { category: "C", safe_type: null, action: "ai_advice" },
  PRODUCT_COPY_OPTIMIZER: { category: "B", safe_type: "product_copy_metadata" },
};

export function getFixPolicy(ruleId: string): FixPolicy {
  const policy = POLICY[ruleId] || { category: "C" as const, safe_type: null };
  if (policy.action) return policy;
  return {
    ...policy,
    // B rules have a bounded generated/code proposal that still requires review.
    // B rules have a bounded code path. Selected C rules are explicitly
    // AI-advice-only when RankFix can explain the remediation but cannot safely
    // edit production code. Unknown/high-risk rules remain manual.
    action: policy.category === "B" && policy.safe_type ? "github_fix" : "manual",
  };
}
export const fixPolicyVersion = FIX_POLICY_VERSION;
