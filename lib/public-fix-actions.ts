// UI proposals are advisory. The server verifies fix-policy, scan ownership, evidence and GitHub rights.
export type PublicFixProposalType = "meta_title"|"meta_description"|"h1"|"faq"|"breadcrumb"|"expertise"|"structured_data"|"social_metadata"|"heading_structure"|"canonical"|"alt_text";
const types:Record<string,PublicFixProposalType>={
  title:"meta_title",META_TITLE_MISSING:"meta_title",META_TITLE_GUIDANCE:"meta_title",SITE_TITLE_MISSING:"meta_title",
  description:"meta_description",META_DESCRIPTION_MISSING:"meta_description",META_DESCRIPTION_GUIDANCE:"meta_description",SITE_DESCRIPTION_MISSING:"meta_description",
  h1:"h1",H1_MISSING:"h1",SITE_H1_MISSING:"h1",faq:"faq",FAQ_CONTENT_MISSING:"faq",
  breadcrumbs:"breadcrumb",author:"expertise",social:"social_metadata",SOCIAL_METADATA_INCOMPLETE:"social_metadata",
  headings:"heading_structure",canonical:"canonical",SITE_CANONICAL_MISSING:"canonical",
  alt:"alt_text",IMAGE_ALT_MISSING:"alt_text",SITE_IMAGES_ALT:"alt_text",
  schema:"structured_data",STRUCTURED_DATA_MISSING:"structured_data",SITE_STRUCTURED_DATA_MISSING:"structured_data",ORGANIZATION_WEBSITE_SCHEMA:"structured_data"
};
export function publicFixProposalType(issueId?:string|null,key?:string|null):PublicFixProposalType|null{
  const id=String(issueId||key||"").trim();
  return Object.prototype.hasOwnProperty.call(types,id)?types[id]:null;
}
export function canOfferPublicFixProposal(c:{status?:string;issue_status?:string;issue_id?:string;rule_id?:string;key?:string}):boolean{
  const status=String(c.status||"").toLowerCase(),raw=String(c.issue_status||"").toUpperCase();
  return (status==="fail"||status==="warning")&&(!raw||raw==="FAIL"||raw==="WARNING")&&publicFixProposalType(c.issue_id||c.rule_id||c.key,c.key)!==null;
}
