// Report claim audit: every claim a finished RankFix report makes must be
// backed by the evidence the same report carries. Pure function, no I/O.
// Used by the replay end-to-end tests over the recorded TestLab evidence and
// available for TestLab analysis. A violation is a contradiction inside one
// report, never a judgement about the website itself.

const SCHEMA_NAME = /^[A-Za-z][A-Za-z0-9]{1,63}$/;
const ORGANIZATION_LIKE = /^(?:organization|corporation|localbusiness|onlinestore|onlinebusiness|ngo|\w*organization|\w*business|\w*service|\w*agency|\w*store|airline|bankorcreditunion|dentist|physician|hospital|restaurant|hotel|attorney|bakery|cafeorcoffeeshop|pharmacy|realestateagent|autodealer|autorepair|hairsalon|beautysalon|dayspa|healthclub|exercisegym|plumber|electrician|generalcontractor|travelagency|lodgingbusiness|bedandbreakfast|resort|campground|childcare|movingcompany|florist|collegeoruniversity|school|sportsteam)$/i;
const RETAIL_ONLY_CHECKS = ["product_schema", "merchant_product_readiness", "webshop_trust", "checkout_trust", "product_availability", "product_price_consistency"];
const GENERIC_START_PAGE = /(?:^|\/)(?:home|homepage|index|start|startseite|startpagina|accueil|inicio)(?:\.(?:html?|php|aspx?|jsp))?\/?$/i;

const checksOf = (report) => [...(report?.seo?.checks || []), ...(report?.geo?.checks || [])];
const lower = (list) => (list || []).map((t) => String(t).toLowerCase());

export function auditReportClaims(report) {
  const violations = [];
  if (!report || report.success !== true) return violations;
  const add = (code, detail) => violations.push({ code, detail });
  const m = report.metrics || {};
  const byKey = new Map(checksOf(report).map((c) => [c.key, c]));
  const status = (key) => byKey.get(key)?.status;
  const types = lower(m.schemaTypes);

  // Website type: one source of truth (QA: classification "Webshop" next to profile "Dienstverlener").
  const profileShop = report.websiteProfile?.websiteType?.value === "ecommerce_store" && report.websiteProfile?.websiteType?.status === "confirmed";
  const classShop = report.classification?.websiteType === "Webshop";
  if (report.websiteProfile && classShop !== profileShop) add("website_type_conflict", `classification=${report.classification?.websiteType} profile=${report.websiteProfile?.websiteType?.value}/${report.websiteProfile?.websiteType?.status}`);
  if ((m.siteType === "ECOMMERCE") !== classShop) add("site_type_conflict", `metrics.siteType=${m.siteType} classification=${report.classification?.websiteType}`);

  // Self-check corrections mean an upstream detector contradicted itself.
  for (const c of report.selfCheck?.corrections || []) add("self_check_correction", `${c.code}: ${String(c.detail || "").slice(0, 160)}`);

  // Structured data claims.
  for (const t of m.schemaTypes || []) if (!SCHEMA_NAME.test(String(t))) add("non_schema_type", String(t).slice(0, 80));
  if (status("schema") === "pass" && !types.length) add("schema_pass_without_types", byKey.get("schema").message);
  if (status("breadcrumbs") === "pass" && !types.includes("breadcrumblist")) add("breadcrumbs_pass_without_schema", types.join(","));
  if (status("organization_website") === "pass" && !types.some((t) => ORGANIZATION_LIKE.test(t)) && !types.includes("website")) add("organization_pass_without_schema", types.join(","));
  if (status("product_schema") === "pass" && !types.includes("product") && !report.multiPage?.representativeProduct) add("product_schema_pass_without_product", "");

  // On-page metadata claims.
  if (status("h1") === "pass" && !(m.h1Count > 0)) add("h1_pass_without_h1", `h1Count=${m.h1Count}`);
  if (m.h1Count === 1 && status("h1") === "fail") add("h1_fail_with_single_h1", byKey.get("h1").message);
  if (status("title") === "pass" && !m.title) add("title_pass_without_title", "");
  if (status("description") === "pass" && !m.description) add("description_pass_without_description", "");
  if (status("canonical") === "pass" && !m.canonical) add("canonical_pass_without_canonical", "");
  if (status("lang") === "pass" && !m.lang) add("lang_pass_without_lang", "");

  // Points follow status.
  for (const c of checksOf(report)) {
    if ((c.status === "not_applicable" || c.status === "unable_to_confirm") && c.points) add("points_on_unscored_check", `${c.key} ${c.points}`);
    if ((c.status === "warning" || c.status === "fail") && c.maxPoints && c.points === c.maxPoints) add("issue_with_full_points", c.key);
  }
  const seen = new Map();
  for (const c of checksOf(report)) {
    if (seen.has(c.key) && seen.get(c.key) !== c.status) add("duplicate_check_conflict", `${c.key} ${seen.get(c.key)}/${c.status}`);
    seen.set(c.key, c.status);
  }

  // Retail checks only judge a shop.
  const sector = report.sectorProfile?.sector;
  const shopContext = classShop || report.websiteProfile?.websiteType?.value === "ecommerce_store" || sector === "ecommerce";
  for (const key of RETAIL_ONLY_CHECKS) if (!shopContext && (status(key) === "warning" || status(key) === "fail")) add("retail_issue_on_non_shop", `${key} sector=${sector}`);

  // Page type: a generic start page is never a product or category page.
  let path = "/";
  try { path = new URL(report.finalUrl).pathname; } catch {}
  if (GENERIC_START_PAGE.test(path) && ["product", "category"].includes(report.pageTypeEvidence?.type)) add("start_page_typed_as_" + report.pageTypeEvidence.type, path);

  // Sector certainty.
  if (sector === "unknown" && (report.sectorProfile?.confidenceScore || 0) > 0) add("unknown_sector_with_confidence", String(report.sectorProfile.confidenceScore));

  // Score certainty: 100 only with complete evidence and no scored issue.
  if (report.overallScore === 100 && report.scoreModel?.evidenceLevel !== "complete") add("perfect_score_without_complete_evidence", String(report.scoreModel?.evidenceLevel));
  if (report.overallScore === 100 && checksOf(report).some((c) => (c.status === "warning" || c.status === "fail") && c.maxPoints > 0)) add("perfect_score_with_issue", "");
  return violations;
}
