import { FIX_POLICY_VERSION } from "./seo-rules";

export type FixCategory = "A" | "B" | "C";
export type FixAction = "github_fix" | "ai_advice" | "manual";
export type FixPolicy = { category: FixCategory; safe_type: string | null; action?: FixAction };

const POLICY: Record<string, FixPolicy> = {
  // Active scanner rule IDs. Keep these aliases aligned with app/api/scan/route.ts
  // so proven, bounded issues actually expose their safe dashboard Fix action.
  title: { category: "B", safe_type: "meta_title" },
  description: { category: "B", safe_type: "meta_description" },
  h1: { category: "B", safe_type: "h1" },
  alt: { category: "B", safe_type: "alt_text" },
  schema: { category: "B", safe_type: "structured_data" },
  META_TITLE_MISSING: { category: "B", safe_type: "meta_title" },
  META_TITLE_GUIDANCE: { category: "B", safe_type: "meta_title" },
  META_DESCRIPTION_MISSING: { category: "B", safe_type: "meta_description" },
  META_DESCRIPTION_GUIDANCE: { category: "B", safe_type: "meta_description" },
  H1_MISSING: { category: "B", safe_type: "h1" },
  H1_MULTIPLE: { category: "C", safe_type: null, action: "ai_advice" },
  IMAGE_ALT_MISSING: { category: "B", safe_type: "alt_text" },
  SOCIAL_METADATA_INCOMPLETE: { category: "B", safe_type: "social_metadata" },
  social: { category: "B", safe_type: "social_metadata" },
  FAQ_CONTENT_MISSING: { category: "B", safe_type: "faq" },
  faq: { category: "B", safe_type: "faq" },
  TWITTER_CARD_MISSING: { category: "C", safe_type: null, action: "ai_advice" },
  HREFLANG_MISSING: { category: "C", safe_type: null, action: "ai_advice" },
  DUPLICATE_URL_PATH: { category: "C", safe_type: null, action: "ai_advice" },
  HTML_ESCAPE_VISIBLE: { category: "C", safe_type: null, action: "ai_advice" },
  EXTERNAL_IMAGE_SOURCE: { category: "C", safe_type: null, action: "ai_advice" },
  BUSINESS_PLACEHOLDER: { category: "C", safe_type: null, action: "manual" },
  PRICE_FORMAT: { category: "C", safe_type: null, action: "ai_advice" },
  WEBSHOP_TRUST_SIGNALS: { category: "C", safe_type: null, action: "ai_advice" },
  PRODUCT_VARIANT_URL: { category: "C", safe_type: null, action: "ai_advice" },
  WEBSHOP_CLAIM_VERIFICATION: { category: "C", safe_type: null, action: "ai_advice" },
  CHECKOUT_TRUST_SIGNALS: { category: "C", safe_type: null, action: "ai_advice" },
  GOOGLE_ADS_READINESS: { category: "C", safe_type: null, action: "manual" },
  ORGANIZATION_WEBSITE_SCHEMA: { category: "B", safe_type: "structured_data" },
  PRODUCT_SCHEMA_MISSING: { category: "C", safe_type: null, action: "ai_advice" },
  PRODUCT_PRICE_CONSISTENCY: { category: "C", safe_type: null, action: "ai_advice" },
  PRODUCT_AVAILABILITY: { category: "C", safe_type: null, action: "ai_advice" },
  // Performance timing is measured, but its root cause is not proven by a scan.
  // Diagnose before changing hosting, caching, database or SSR configuration.
  response: { category: "C", safe_type: null, action: "ai_advice" },
  // This rule aggregates different accessibility signals. RankFix must not guess
  // the semantics of an empty button or form control and auto-edit production code.
  accessibility_basics: { category: "C", safe_type: null, action: "ai_advice" },
  // A broken/invalid sitemap can require CMS, server or routing changes.
  sitemap: { category: "C", safe_type: null, action: "ai_advice" },
  viewport: { category: "C", safe_type: null, action: "ai_advice" },
  hreflang: { category: "C", safe_type: null, action: "ai_advice" },
  lang: { category: "C", safe_type: null, action: "ai_advice" },
  indexability: { category: "C", safe_type: null, action: "ai_advice" },
  broken_links: { category: "C", safe_type: null, action: "ai_advice" },
  internal_redirects: { category: "C", safe_type: null, action: "ai_advice" },
  security_headers: { category: "C", safe_type: null, action: "manual" },
  // Commerce consistency findings can be proven by the scanner, but changing
  // price, stock, checkout or merchant data automatically can affect orders.
  merchant_product_readiness: { category: "C", safe_type: null, action: "ai_advice" },
  merchant_feed_signal: { category: "C", safe_type: null, action: "manual" },
  product_price_consistency: { category: "C", safe_type: null, action: "ai_advice" },
  product_availability: { category: "C", safe_type: null, action: "ai_advice" },
  price_currency_consistency: { category: "C", safe_type: null, action: "ai_advice" },
  checkout_funnel_static: { category: "C", safe_type: null, action: "ai_advice" },
  eu_consumer_information_signal: { category: "C", safe_type: null, action: "ai_advice" },
  eu_discount_reference_signal: { category: "C", safe_type: null, action: "ai_advice" },
  variant_url: { category: "C", safe_type: null, action: "ai_advice" },
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
