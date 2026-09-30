export type FixRoute = "ai" | "github" | "guided" | "integration" | "customer_input";
export type AiFixType = "meta_title" | "meta_description" | "h1" | "alt_text" | "heading_structure";
export type FixDefinition = {
  route: FixRoute;
  aiType?: AiFixType;
  helpSlug: string;
  video?: "github-connect" | "github-pr" | "search-console" | "merchant-center" | "woocommerce" | "shopify";
};

const DEFINITIONS: Record<string, FixDefinition> = {
  META_TITLE_MISSING:{route:"ai",aiType:"meta_title",helpSlug:"meta-title"},
  META_TITLE_GUIDANCE:{route:"ai",aiType:"meta_title",helpSlug:"meta-title"},
  META_DESCRIPTION_MISSING:{route:"ai",aiType:"meta_description",helpSlug:"meta-description"},
  META_DESCRIPTION_GUIDANCE:{route:"ai",aiType:"meta_description",helpSlug:"meta-description"},
  H1_MISSING:{route:"ai",aiType:"h1",helpSlug:"headings"},
  IMAGE_ALT_MISSING:{route:"ai",aiType:"alt_text",helpSlug:"image-alt"},
  SOCIAL_METADATA_INCOMPLETE:{route:"github",helpSlug:"social-metadata"},
  social:{route:"github",helpSlug:"social-metadata"},
  STRUCTURED_DATA_MISSING:{route:"github",helpSlug:"structured-data"},
  breadcrumbs:{route:"github",helpSlug:"structured-data"},
  canonical:{route:"github",helpSlug:"canonical"},
  headings:{route:"ai",aiType:"heading_structure",helpSlug:"headings"},
  BROKEN_LINK:{route:"guided",helpSlug:"broken-links"},
  REDIRECT:{route:"guided",helpSlug:"redirects"},
  BUSINESS_DETAILS_MISSING:{route:"customer_input",helpSlug:"business-details"},
  SEARCH_CONSOLE_NOT_CONNECTED:{route:"integration",helpSlug:"search-console",video:"search-console"},
  MERCHANT_CENTER_NOT_CONNECTED:{route:"integration",helpSlug:"merchant-center",video:"merchant-center"},
};

export function getFixDefinition(issueId?: string | null): FixDefinition {
  const key=String(issueId||"").trim();
  return DEFINITIONS[key] || {route:"guided",helpSlug:"problem-solving"};
}

export function helpHref(issueId?: string | null){
  const d=getFixDefinition(issueId);
  return "/dashboard/help#"+encodeURIComponent(d.helpSlug);
}

export function needsVideo(issueId?: string | null){
  return getFixDefinition(issueId).video || null;
}

export function aiFixType(issueId?: string | null){
  return getFixDefinition(issueId).aiType || null;
}
