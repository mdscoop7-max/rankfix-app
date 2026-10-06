import test from "node:test";
import assert from "node:assert/strict";
import { extractImageMetrics } from "../lib/image-metrics.ts";
import { applyEvidenceBasedScoreCap, scoreApplicableChecks, summarizeAuditChecks } from "../lib/audit-score.ts";
import { isPrivateHost, validatePublicHttpUrl } from "../lib/safe-fetch.ts";
import { statusCode } from "../lib/seo-rules.ts";

test("decorative empty alt is valid; only a missing alt attribute is actionable", () => {
  const metrics = extractImageMetrics('<img src="/hero.jpg" alt=""><img src="/product.jpg" alt="Product"><img src="/broken.jpg">');
  assert.equal(metrics.elementCount, 3);
  assert.equal(metrics.missingAlt, 1);
});

test("N/A and unable-to-confirm never lower the score", () => {
  const score = scoreApplicableChecks([
    { issue_status: "PASS", points: 10, maxPoints: 10 },
    { issue_status: "NOT_APPLICABLE", points: 0, maxPoints: 100 },
    { issue_status: "UNABLE_TO_CONFIRM", points: 0, maxPoints: 100 },
  ]);
  assert.equal(score, 100);
});

test("no applicable evidence produces score zero rather than a false 100", () => {
  assert.equal(scoreApplicableChecks([
    { issue_status: "NOT_APPLICABLE", points: 0, maxPoints: 100 },
    { issue_status: "UNABLE_TO_CONFIRM", points: 0, maxPoints: 100 },
  ]), 0);
});

test("summary never counts N/A or unable-to-confirm as passed", () => {
  const summary = summarizeAuditChecks([
    { issue_status: "PASS", points: 1, maxPoints: 1 },
    { issue_status: "WARNING", points: 0, maxPoints: 1 },
    { issue_status: "NOT_APPLICABLE", points: 0, maxPoints: 1 },
    { issue_status: "UNABLE_TO_CONFIRM", points: 0, maxPoints: 1 },
  ]);
  assert.deepEqual(summary, { passed: 1, issues: 1, critical: 0, important: 0, advice: 1, notApplicable: 1, unableToConfirm: 1, pendingFixes: 0 });
});

test("critical score cap requires a confirmed high-confidence failure", () => {
  assert.equal(applyEvidenceBasedScoreCap(96, [
    { issue_status: "UNABLE_TO_CONFIRM", severity: "CRITICAL", confidence: "low" },
  ]), 96);
  assert.equal(applyEvidenceBasedScoreCap(96, [
    { issue_status: "WARNING", severity: "CRITICAL", confidence: "high" },
  ]), 96);
  assert.equal(applyEvidenceBasedScoreCap(96, [
    { issue_status: "FAIL", severity: "CRITICAL", confidence: "high" },
  ]), 70);
});

test("unknown rule statuses fail closed as unable-to-confirm", () => {
  assert.equal(statusCode("pass"), "PASS");
  assert.equal(statusCode("n/a"), "NOT_APPLICABLE");
  assert.equal(statusCode("unable-to-confirm"), "UNABLE_TO_CONFIRM");
  assert.equal(statusCode("unexpected-status"), "UNABLE_TO_CONFIRM");
});

test("scanner URL guard blocks local and private targets", () => {
  assert.equal(isPrivateHost("localhost"), true);
  assert.equal(isPrivateHost("127.0.0.1"), true);
  assert.equal(isPrivateHost("10.1.2.3"), true);
  assert.equal(isPrivateHost("192.168.1.10"), true);
  assert.equal(isPrivateHost("example.com"), false);
  assert.throws(() => validatePublicHttpUrl("http://localhost/admin"), /URL_HOST_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("ftp://example.com/file"), /URL_PROTOCOL_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("https://user:pass@example.com/"), /URL_CREDENTIALS_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("https://example.com:8443/"), /URL_PORT_BLOCKED/);
});


test("scanner regression source keeps evidence-only classification safeguards", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");

  assert.match(source, /productSchemaCommerceSignal/);
  assert.match(source, /fetchfout alleen is geen bewijs van een kapotte link/);
  assert.match(source, /const accessibilityIssueCount=unlabeledFormControls\+emptyButtons/);
  assert.match(source, /Organization\/WebSite structured data kon niet betrouwbaar worden bevestigd/);
  assert.match(source, /Een individuele auteur is niet vereist op een organisatie-, dienst- of merkhomepage/);
  assert.match(source, /buiten richtwaarde 30–60/);
  assert.match(source, /uitzonderlijk.*kort.*lang/s);
});


test("EU regression bundle keeps classification, confidence and challenge guards", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");

  assert.match(source, /transportBookingIdentity/);
  assert.match(source, /catalogStorefrontSignal/);
  assert.match(source, /transport_travel/);
  assert.match(source, /telecom_technology/);
  assert.match(source, /radware page/);
  assert.match(source, /canonicalIsLocalePreferred/);
  assert.match(source, /Een individuele auteur is niet vereist op een organisatie-/);
  assert.match(source, /te weinig onafhankelijk bewijs om entity-signalen betrouwbaar te beoordelen/);
  assert.match(source, /evidenceCredit/);
  assert.match(report, /Score beveiligingsinstellingen:/);
  assert.match(report, /reasonFor\(check,language\)/);
});


test("central classification bundle keeps transport, retail and canonical decisions aligned", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /transportBookingIdentityEarly/);
  assert.match(source, /transportRetailStoreEvidence/);
  assert.match(source, /!transportBookingIdentity && shopCatalogHrefCount/);
  assert.match(source, /strongArticleMarkupSignal/);
  assert.match(source, /safePublicFetch follows redirects manually/);
  assert.equal(source.includes("fetchedFinalUrl ?? new URL(response.url"), true);
  assert.match(source, /prijevoz\|putnički/);
  assert.match(source, /δρομολόγ\|εισιτήρ\|πτήσ/);
  assert.match(source, /sectorPriority/);
  assert.match(source, /transportContextBoost/);
  assert.match(source, /!\/\^https\?:\$\/\.test\(resolved\.protocol\)/);
  assert.match(source, /hasEcommerceSignal && !transportBookingIdentity && scarcityMatches/);
});


test("multilingual trust, social URL and auth redirect bundle stays evidence based", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /normalizeLegalText/);
  assert.match(source, /privatnost\\w\*\|zasebnost\\w\*/);
  assert.match(source, /piskotk\\w\*\|kolacic\\w\*/);
  assert.match(source, /assistenza\\w\*\|apoio ao cliente\|pomoc\\w\*/);
  assert.match(source, /legalLanguageSupported/);
  assert.match(source, /og:image \(geen absolute http\(s\)-URL\)/);
  assert.match(source, /og:url \(geen absolute http\(s\)-URL\)/);
  assert.match(source, /sourcePersonalizationPath/);
  assert.match(source, /recomendacoes\|recomendacoes-personalizadas\|recommendations/);
});


test("score model exposes weighted coverage and transparent formula", async () => {
  const { readFile } = await import("node:fs/promises");
  const score = await readFile(new URL("../lib/audit-score.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  assert.match(score, /SCORE_MODEL_VERSION = "3\.0-evidence-strict"/);
  assert.match(score, /assessedWeight \/ totalWeight/);
  assert.match(route, /formula: mode === "both" \? "0\.6 × SEO \+ 0\.4 × GEO"/);
  assert.match(route, /securitySeparate: true/);
  assert.match(route, /coverageBasis: "assessed_weight \/ applicable_weight"/);
  assert.match(report, /Betrouwbaarheid:/);
  assert.match(report, /representatieve selectie/);
  assert.match(report, /Scoremodel:/);
});


test("multi-page retail evidence can strengthen site profile without activating page checks", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /pageCommerceEvidence/);
  assert.match(source, /confirmedRetailPage: pageProductSchema/);
  assert.match(source, /sitewideCommerceEvidence/);
  assert.match(source, /!transportBookingIdentity && sitewideCommerceEvidence\.confirmed/);
  assert.match(source, /technologyProfile\.siteType = "Webshop"/);
  assert.match(source, /never silently[\s\S]*activates page-specific webshop checks/);
});


test("government identity overrides generic LocalBusiness schema advice", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /governmentIdentitySignal/);
  assert.match(source, /GovernmentOrganization \+ WebSite/);
  assert.match(source, /effectiveLocalSchemaSignal = hasLocalBusinessSignal && !governmentIdentitySignal/);
  assert.match(source, /effectiveLocalBusinessPage = !isProductPage && !hasCategorySignal && effectiveLocalSchemaSignal/);
  assert.match(source, /localBusinessDetails = effectiveLocalSchemaSignal/);
});


test("meta description diagnostics distinguish missing from empty", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /descriptionState: "missing" \| "empty" \| "present"/);
  assert.match(source, /descriptionState === "empty" \? "De meta description-tag is aanwezig, maar de content is leeg\."/);
  assert.match(source, /descriptionState,/);
  assert.match(source, /pageDescriptionTag\?"Meta description-tag aanwezig maar content is leeg\."/);
});


test("multi-page canonical absence uses the same evidence semantics as the main scan", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /key:"canonical",status:pageCanonical[\s\S]*?: "WARNING"/);
  assert.match(source, /Geen canonical-linkelement gevonden in de gecontroleerde raw HTML/);
  assert.doesNotMatch(source, /afwezigheid wordt hier niet als bewezen fout gescoord/);
  assert.match(source, /item\.key === "canonical"\) return pageCanonical \? 0\.7 : 0\.35/);
});


test("strong product evidence wins over article classification and exposes an invariant", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const rawArticleSignal = !isHomepage/);
  assert.match(source, /const articleSuppressedByCommerce = isProductPage && rawArticleSignal/);
  assert.match(source, /const hasArticleSignal = rawArticleSignal && !isProductPage/);
  assert.match(source, /article signal suppressed by stronger product evidence/);
  assert.match(source, /const pageTypeContradictions = \[/);
  assert.match(source, /article_vs_product_schema/);
  assert.match(source, /product_vs_transport_booking/);
  assert.match(source, /pageTypeInvariant/);
});


test("score engine deduplicates penalties that share one proven root cause", async () => {
  const { scoreApplicableChecks, SCORE_MODEL_VERSION } = await import("../lib/audit-score.ts");
  const base = { confidence: "high" };
  const score = scoreApplicableChecks([
    { ...base, issue_status: "WARNING", points: 0, maxPoints: 10, rootCause: "meta_description" },
    { ...base, issue_status: "WARNING", points: 0, maxPoints: 4, rootCause: "meta_description" },
    { ...base, issue_status: "PASS", points: 6, maxPoints: 6 },
  ]);
  assert.equal(SCORE_MODEL_VERSION, "3.0-evidence-strict");
  assert.equal(score, 50);
});

test("score engine gives confirmed high-impact findings a stricter bounded penalty", async () => {
  const { scoreApplicableChecks } = await import("../lib/audit-score.ts");
  const low = scoreApplicableChecks([
    { issue_status: "WARNING", severity: "LOW", confidence: "high", points: 5, maxPoints: 10, rootCause: "a" },
    { issue_status: "PASS", points: 90, maxPoints: 90 },
  ]);
  const high = scoreApplicableChecks([
    { issue_status: "WARNING", severity: "HIGH", confidence: "high", points: 5, maxPoints: 10, rootCause: "a" },
    { issue_status: "PASS", points: 90, maxPoints: 90 },
  ]);
  assert.ok(high < low);
});

test("score engine keeps independent penalties independent", async () => {
  const { scoreApplicableChecks } = await import("../lib/audit-score.ts");
  const score = scoreApplicableChecks([
    { issue_status: "WARNING", points: 0, maxPoints: 10, rootCause: "meta_description" },
    { issue_status: "WARNING", points: 0, maxPoints: 4, rootCause: "social_metadata" },
    { issue_status: "PASS", points: 6, maxPoints: 6 },
  ]);
  assert.equal(score, 30);
});


test("advisory evidence does not become a hard failure", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /Deze ene meting is traag, maar bewijst geen structureel performanceprobleem/);
  assert.doesNotMatch(source, /check\("fail", "response", "seo", "Server response"/);
  assert.match(source, /check\("warning", "schema", "geo", "Structured data"[\s\S]*machineleesbare optimalisatiekans/);
  assert.match(source, /schema:\s*"structured_data_context"/);
  assert.match(source, /issue_id: key, rule_id: key/);
});


test("alt scoring is gradual and keeps the existing fix rule stable", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const missingAltRatio = imageElementCount \? imagesMissingAlt \/ imageElementCount : 0/);
  assert.match(source, /missingAltRatio <= 0\.10[\s\S]*\? 6[\s\S]*missingAltRatio <= 0\.25[\s\S]*\? 5[\s\S]*missingAltRatio <= 0\.50[\s\S]*\? 3[\s\S]*: 1/);
  assert.match(source, /alt: \{ rule_id: "IMAGE_ALT_MISSING", severity: "LOW" \}/);
  assert.match(source, /alt: imageElementCount \? imagesMissingAlt : null/);
});


test("measurable metadata defects use gradual penalties", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const titleLengthPoints = \(length: number\) =>/);
  assert.match(source, /length >= 25 && length <= 65\) return 8/);
  assert.match(source, /length >= 20 && length <= 70\) return 6/);
  assert.match(source, /titleLengthPoints\(title\.length\), 10/);
  assert.match(source, /Math\.max\(1, 4 - Math\.min\(3, missingOpenGraphFields\.length \+ invalidOpenGraphFields\.length\)\), 4/);
  assert.match(source, /title: \{ rule_id: title \? "META_TITLE_GUIDANCE" : "META_TITLE_MISSING"/);
  assert.match(source, /social: \{ rule_id: "SOCIAL_METADATA_INCOMPLETE"/);
});


test("description length advice is gradual without changing fix identity", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const descriptionLengthPoints = \(length: number\) =>/);
  assert.match(source, /length >= 50 && length < 70/);
  assert.match(source, /length >= 30 && length < 50/);
  assert.match(source, /descriptionLengthPoints\(description\.length\), 10/);
  assert.match(source, /description: \{ rule_id: description \? "META_DESCRIPTION_GUIDANCE" : "META_DESCRIPTION_MISSING"/);
  assert.match(source, /description: description \|\| \(item\.key === "description" \? "metaDescriptionPresent=false" : null\)/);
});


test("score model protects low-confidence failures from hard penalties", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/audit-score.ts", import.meta.url), "utf8");
  assert.match(source, /SCORE_MODEL_VERSION = "3\.0-evidence-strict"/);
  assert.match(source, /item\.issue_status === "FAIL" && item\.confidence === "low"/);
  assert.match(source, /points: item\.maxPoints, issue_status: "INFO" as const/);
  assert.match(source, /for \(const item of confidenceSafe\)/);
});


test("GEO brand identity respects evidence confidence and gradual signals", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const brandIdentityPoints = visibleBrandSignals >= 3 \? 5 : visibleBrandSignals === 2 \? 4 : visibleBrandSignals === 1 \? 3 : 2/);
  assert.match(source, /metadataMayBeClientRendered[\s\S]*check\("unable_to_confirm", "identity", "geo", "Brand identity"/);
  assert.match(source, /check\("warning", "identity", "geo", "Brand identity", brandSignalDetail, brandRecommendation, brandIdentityPoints, 5\)/);
});


test("link and accessibility penalties scale with proven impact", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /brokenInternalLinkRatio <= 0\.05 \? 4 : brokenInternalLinkRatio <= 0\.15 \? 3 : brokenInternalLinkRatio <= 0\.30 \? 2 : 1/);
  assert.match(source, /redirectedInternalLinkRatio <= 0\.10 \? 3 : redirectedInternalLinkRatio <= 0\.30 \? 2 : 1/);
  assert.match(source, /brokenLinkPoints, 5/);
  assert.match(source, /internalRedirectPoints, 4/);
  assert.match(source, /accessibilityIssueRatio <= 0\.05 \? 4 : accessibilityIssueRatio <= 0\.20 \? 3 : accessibilityIssueRatio <= 0\.50 \? 2 : 1/);
  assert.match(source, /accessibilityPoints,5/);
});


test("heading advice scales gradually without becoming a hard failure", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const headingStructurePoints = hasH2 \? 7 : subheadingCount >= 3 \? 6 : subheadingCount >= 1 \? 5 : 4/);
  assert.match(source, /check\("warning", "headings", "seo", "Heading-structuur"[\s\S]*headingStructurePoints, 7\)/);
  assert.match(source, /structuuradvies en geen bewezen rankingfout/);
});


test("GEO identity and trust advice preserve partial proven signals", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /organizationWebsiteSignals = Number\(organizationSchemaPresent\) \+ Number\(websiteSchemaPresent\)/);
  assert.match(source, /organizationWebsiteSignals === 2 \? 8 : organizationWebsiteSignals === 1 \? 6 : 4/);
  assert.match(source, /machineleesbaar identity-advies en geen bewijs dat de zichtbare organisatie-identiteit ontbreekt/);
  assert.match(source, /Math\.max\(2, Number\(hasPrivacyLink\)\+Number\(hasCookieLink\)\+Number\(hasContactLink\)\+2\),5/);
  assert.match(source, /rule_id: key/);
  assert.match(source, /issue_id: key/);
});


test("Evidence Engine reconciles representative identity and capabilities before final score", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /reconciledIdentitySource/);
  assert.match(source, /Scanbewijs: primaire activiteit bevestigd over representatieve pagina's/);
  assert.match(source, /multiPageCapabilities\.treatment && sectorProfile\.sector === "health_wellness"/);
  assert.match(source, /representativeProduct/);
  assert.match(source, /selectedSeoScore = scoreApplicableChecks\(selectedSeoChecks\)/);
});

test("health identity includes acupuncture and therapy evidence", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /acupunctuur\|acupuncture\|acupuncturist/);
  assert.match(source, /behandelingen\|treatment\|treatments/);
});


test("audit report explains customer-facing evidence statuses", async () => {
  const { readFile } = await import("node:fs/promises");
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(report, /Statusuitleg/);
  assert.match(report, /Niet te bevestigen: onvoldoende bewijs/);
  assert.match(report, /N\.v\.t\.: geldt niet voor deze website/);
  assert.doesNotMatch(scanner, /contact-, afspraak- of boekingsfunctie toont/);
});


test("customer audit UX is localized for every supported locale", async () => {
  const { readFile } = await import("node:fs/promises");
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  assert.match(report, /const AUDIT_UX:Record<Locale/);
  assert.match(report, /Wichtigste nachgewiesene Probleme/);
  assert.match(report, /Principaux problèmes prouvés/);
  assert.match(report, /Principali problemi dimostrati/);
  assert.match(report, /Principales problemas demostrados/);
  assert.match(report, /const ux=AUDIT_UX\[language\]/);
});


test("cookie security is evaluated per observed Set-Cookie record", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const cookieObservations = observedCookies\.map/);
  assert.match(source, /cookiesMissingSecure/);
  assert.match(source, /cookiesMissingSameSite/);
  assert.match(source, /sessionCookiesMissingHttpOnly/);
  assert.match(source, /HttpOnly wordt alleen beoordeeld voor bevestigde sessie-\/authenticatiecookies/);
  assert.doesNotMatch(source, /Cookie-flags zijn niet volledig bevestigd \(Secure=/);
});


test("representative site evidence propagates into specialist checks", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /promoteCheckFromRepresentativeEvidence/);
  assert.match(source, /"sector_real_estate_listings",\s*multiPageCapabilities\.properties/);
  assert.match(source, /"sector_automotive_inventory",\s*multiPageCapabilities\.vehicleSales/);
  assert.match(source, /"sector_automotive_services",\s*multiPageCapabilities\.automotiveService/);
  assert.match(source, /"sector_health_services",\s*multiPageCapabilities\.treatment/);
});


test("representative page ranking prefers structural capability context", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /anchorContextByUrl/);
  assert.match(source, /const capabilityContext =/);
  assert.match(source, /const utilityContext =/);
  assert.match(source, /if \(capabilityContext\) score \+= 24/);
  assert.match(source, /Path semantics are deliberately weak evidence only/);
});


test("Evidence Engine keeps URL-only product hints below confirmed retail evidence", async () => {
  const { buildScanEvidence } = await import("../lib/scan-evidence.ts");
  const hint = buildScanEvidence({url:"https://example.com/product/widget/",html:"<html><body><h1>Widget</h1></body></html>"});
  assert.equal(hint.version, "1.2");
  assert.equal(hint.commerce.productPage.value, true);
  assert.equal(hint.commerce.productPage.confidence, "medium");
  assert.ok(hint.commerce.productPage.sources.includes("url"));
  const schema = buildScanEvidence({url:"https://example.com/item",html:'<script type="application/ld+json">{"@type":"Product","name":"Widget"}</script>'});
  assert.equal(schema.commerce.productPage.confidence, "high");
  assert.ok(schema.commerce.productPage.sources.includes("structured_data"));
});

test("Evidence Engine exposes explicit capability states and never infers absence from one page", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /type EvidenceCapabilityState = "detected" \| "likely" \| "unknown" \| "absent_proven"/);
  assert.match(source, /buildCapabilityState/);
  assert.match(source, /reason:"insufficient_coverage"/);
  assert.match(source, /state:"likely"/);
  assert.match(source, /explicitNegativeProof/);
  assert.match(source, /state:"absent_proven"/);
  assert.match(source, /const capabilityStates: EvidenceCapability\[\]/);
  assert.match(source, /capabilityStates = capabilityStates/);
});


test("representative evidence preserves page intent across structural dedupe", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.equal(source.includes('const key = `${item.type}:${item.structureKey || templateShapeKey(item.url)}`;'), true);
  assert.equal(source.includes("audited:auditedRawPages.length"), true);
  assert.equal(source.includes("formEvidence:{formCount:pageForms.length"), true);
  assert.equal(source.includes("representativeFormEvidence"), true);
});

test("customer report groups not-applicable checks and shows sitewide sample warnings", async () => {
  const { readFile } = await import("node:fs/promises");
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  assert.equal(report.includes("Sitebrede steekproef"), true);
  assert.equal(report.includes("groupedNa.map"), true);
  assert.equal(report.includes('<p className="meta">{deep.rule}:'), false);
  assert.equal(report.includes("</div>\\n    <footer>"), false);
});

test("sector reconciliation hides provisional previous sector and protects beauty-wellness identity", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.equal(source.includes("Vorige voorlopige sector:"), false);
  assert.equal(source.includes("beautyServiceIdentity && !explicitMedicalIdentity"), true);
  assert.equal(source.includes('label:"Beauty & Wellness"'), true);
});

test("response decoder supports declared legacy charset", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/safe-fetch.ts", import.meta.url), "utf8");
  assert.equal(source.includes("windows-1252"), true);
  assert.equal(source.includes("declaredCharset"), true);
  assert.equal(source.includes('text.includes("\\uFFFD")'), true);
});


test("share.google is resolved before usage, history and scan evidence", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const resolver = source.indexOf('target.hostname.toLowerCase() === "share.google"');
  const usage = source.indexOf("const usageWebsiteHost = target.hostname");
  assert.ok(resolver >= 0 && usage > resolver);
  assert.match(source, /target = validatePublicHttpUrl\(normalizeScanUrl\(resolvedShare\.finalUrl\.toString\(\)\)\)/);
});

test("representative page typing includes service listing and support intents", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /"service" \| "listing" \| "support"/);
  assert.match(source, /supportPath \? "support" : listingPath \? "listing"/);
  assert.match(source, /resolvedServicePage \? "service"/);
});

test("transport and ecommerce schema advice do not fall through to generic LocalBusiness", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /transportLogisticsSchemaContext/);
  assert.match(source, /"Service \+ Organization"/);
  assert.match(source, /ecommerceSchemaContext/);
  assert.match(source, /"OnlineStore \+ WebSite"/);
});

test("security form transport uses representative form pages rather than global forms", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /representativeFormPages = auditedMultiPages\.filter\(\(item\)=>item\.type==="form"\)/);
  assert.match(source, /Globale zoek-, login- en footerformulieren tellen niet als bewijs/);
});

test("full audit report shows complete actions and uncertainty lists", async () => {
  const { readFile } = await import("node:fs/promises");
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(report, /\.slice\(0,5\)\.map\(\(c,i\)=>/);
  assert.match(report, /group\.items\.map\(item=>item\.title\)\.join\(" · "\)/);
  assert.doesNotMatch(report, /groupedUnable\.map\(\(group,i\)=><details/);
});


test("transport route pages are typed as services for transport sectors", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /transport\|logist/);
  assert.match(source, /\(\?:\^\|\\\/\)transport\(\?:\\\/\|\$\)/);
});

test("structured data uses effective local context instead of raw local hints", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /geoChecks\.push\(\s*effectiveLocalSchemaSignal/);
  assert.doesNotMatch(source, /geoChecks\.push\(\s*hasLocalBusinessSignal\s*\?/);
});


test("tracking parameters are stripped before scan usage and fetch logic", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const stripping = source.indexOf('["utm_source", "utm_medium", "utm_campaign"');
  const usage = source.indexOf("const usageWebsiteHost = target.hostname");
  assert.ok(stripping >= 0 && usage > stripping);
  assert.match(source, /target\.searchParams\.delete\(param\)/);
});

test("commerce product pages cannot inherit transport schema context from incidental text", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const transportLogisticsSchemaContext = !hasEcommerceSignal && !isProductPage/);
  assert.match(source, /test\(localIdentityText\)/);
});


test("production scan limits have no plan-wide or hardcoded-host bypass", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /validationTestAccount\s*=\s*planCode\s*===\s*"pro"/);
  assert.doesNotMatch(source, /unlimitedTestHost/);
  assert.doesNotMatch(source, /trendmix-jet\.vercel\.app/);
  assert.match(source, /if \(!internalTestAccount && used >= limits\.scans\)/);
});

test("anonymous public scans and contact mail have coarse abuse protection", async () => {
  const { readFile } = await import("node:fs/promises");
  const scan = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const contact = await readFile(new URL("../app/api/contact/route.ts", import.meta.url), "utf8");
  assert.match(scan, /consumeRateLimit\("public-scan",publicIp,8,3600\)/);
  assert.match(contact, /consumeRateLimit\("contact",requestIp\(request\),5,3600\)/);
  assert.match(contact, /message\.length>5000/);
});

test("plan catalog matches customer-visible website and scan limits", async () => {
  const { PLAN_CATALOG } = await import("../lib/plans.ts");
  assert.deepEqual(
    Object.fromEntries(Object.entries(PLAN_CATALOG).map(([key,value])=>[key,[value.websites,value.scans]])),
    {free:[1,2],start:[1,15],business:[5,50],"e-commerce":[5,75],pro:[15,150],agency:[50,500]}
  );
});

test("legacy credits and production test-plan route are no longer part of active schema", async () => {
  const { readFile, access } = await import("node:fs/promises");
  const dbInit = await readFile(new URL("../lib/db-init.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  assert.doesNotMatch(dbInit, /credit_transactions|credits INTEGER/);
  assert.doesNotMatch(schema, /credit_transactions|credits INTEGER/);
  await assert.rejects(access(new URL("../app/api/account/test-plan/route.ts", import.meta.url)));
});

test("manual health run returns the Health Guard response directly", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/health/run-now/route.ts", import.meta.url), "utf8");
  assert.match(source, /return runHealthGuard\(\)/);
  assert.doesNotMatch(source, /NextResponse\.json\(await runHealthGuard\(\)\)/);
});

test("assistant monitoring context uses the production monitor table and real route", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/assistant/route.ts", import.meta.url), "utf8");
  assert.match(source, /FROM website_monitors WHERE user_id=\$1/);
  assert.doesNotMatch(source, /website_monitoring/);
  assert.doesNotMatch(source, /\/dashboard\/monitoring/);
});


test("active scanner fix IDs map to bounded dashboard fix actions", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/fix-policy.ts", import.meta.url), "utf8");
  const expected = {
    title:"meta_title",
    description:"meta_description",
    h1:"h1",
    alt:"alt_text",
    schema:"structured_data",
    social:"social_metadata",
    canonical:"canonical",
    headings:"heading_structure",
    breadcrumbs:"breadcrumb",
  };
  for (const [ruleId,safeType] of Object.entries(expected)) {
    const expectedEntry = ruleId + ': { category: "B", safe_type: "' + safeType + '" }';
    assert.equal(source.includes(expectedEntry), true, ruleId);
  }
  assert.match(source, /policy\.category === "B" && policy\.safe_type \? "github_fix" : "manual"/);
});

test("GitHub proposal routing recognizes active scanner IDs without title guessing", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/dashboard/github/page.tsx", import.meta.url), "utf8");
  for (const mapping of ['title:"meta_title"','description:"meta_description"','h1:"h1"','alt:"alt_text"','schema:"structured_data"']) {
    assert.equal(source.includes(mapping),true,mapping);
  }
});

test("Evidence Engine avoids double-counting medium text hints as independent sector proof", async () => {
  const { readFile } = await import("node:fs/promises");
  const evidence = await readFile(new URL("../lib/scan-evidence.ts", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../lib/sector-catalog.ts", import.meta.url), "utf8");
  assert.match(evidence,/vehicleSchema \? "high" : vehicles \? "medium"/);
  assert.match(evidence,/propertySchema \? "high" : properties \? "medium"/);
  assert.match(evidence,/businessCapabilities[\s\S]*\], "high"\)/);
  assert.match(catalog,/const high = \(item: \{ value: unknown; confidence: string \}\)/);
  assert.match(catalog,/"inventory\.properties": high\(evidence\.inventory\.properties\)/);
  assert.doesNotMatch(catalog,/"inventory\.properties": Boolean\(evidence\.inventory\.properties\.value\)/);
});

test("structured-data fix handles composite schema recommendations as separate nodes", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/ai-fix/route.ts", import.meta.url), "utf8");
  const validator = await readFile(new URL("../lib/seo-fix-validator.ts", import.meta.url), "utf8");
  assert.match(route,/preferredSchema\.split\("\+"\)/);
  assert.match(route,/"@graph":schemaTypes\.map\(nodeFor\)/);
  assert.match(route,/deterministicTypes: FixType\[\] = \["structured_data"/);
  assert.match(validator,/expectedTypes = preferredAlternative\.split\("\+"\)/);
  assert.match(validator,/Structured data mist aanbevolen type\(s\)/);
});

test("unused evidence merge and sector capability exports stay removed", async () => {
  const { readFile } = await import("node:fs/promises");
  const evidence = await readFile(new URL("../lib/scan-evidence.ts", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../lib/sector-catalog.ts", import.meta.url), "utf8");
  assert.doesNotMatch(evidence,/export function mergeScanEvidence/);
  assert.doesNotMatch(catalog,/export function controlCapabilitiesForSector/);
});


test("dashboard scans do not call removed automatic report email code", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source,/sendScanReportEmail/);
});


test("Local SEO has no hardcoded website bypass", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/local-seo/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source,/internalTestHost/);
  assert.doesNotMatch(source,/trendmix\.onrender\.com|trendmix-jet\.vercel\.app/);
  assert.match(source,/if\(limits\.localSeo===0&&!internalTestAccount\)/);
  assert.match(source,/if\(!internalTestAccount&&used>=limits\.localSeo\)/);
});

test("all mapped scanner rule IDs have an explicit fix policy", async () => {
  const { readFile } = await import("node:fs/promises");
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const policy = await readFile(new URL("../lib/fix-policy.ts", import.meta.url), "utf8");
  const start=scanner.indexOf("const ruleMap");
  const end=scanner.indexOf("for (const item of [...seoChecks, ...geoChecks])",start);
  assert.ok(start>=0&&end>start);
  const block=scanner.slice(start,end);
  const ruleIds=[...block.matchAll(/rule_id:\s*"([^"]+)"/g)].map((match)=>match[1]);
  for(const ruleId of ruleIds) assert.equal(policy.includes(ruleId+":"),true,ruleId);
  assert.match(policy,/ORGANIZATION_WEBSITE_SCHEMA: \{ category: "B", safe_type: "structured_data" \}/);
  assert.match(policy,/GOOGLE_ADS_READINESS: \{ category: "C", safe_type: null, action: "manual" \}/);
});

test("Organization and FAQ fixes carry explicit evidence through the dashboard gate", async () => {
  const { readFile } = await import("node:fs/promises");
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const policy = await readFile(new URL("../lib/fix-policy.ts", import.meta.url), "utf8");
  assert.match(scanner,/organization_website: isHomepage \?/);
  assert.match(scanner,/faqContent=false; faqSchema=false/);
  assert.match(policy,/faq: \{ category: "B", safe_type: "faq" \}/);
});

test("audit AI-advice actions open the in-dashboard assistant", async () => {
  const { readFile } = await import("node:fs/promises");
  const audit = await readFile(new URL("../app/dashboard/audit/[id]/page.tsx", import.meta.url), "utf8");
  const assistant = await readFile(new URL("../components/ai-assistant.tsx", import.meta.url), "utf8");
  assert.match(audit,/remediationAction\(check\)==="ai_advice"/);
  assert.match(audit,/rankfix:open-assistant/);
  assert.match(audit,/Vraag RankFix AI/);
  assert.match(assistant,/addEventListener\("rankfix:open-assistant"/);
  assert.match(assistant,/if \(detail\?\.prompt\) setInput\(detail\.prompt\)/);
});


test("GitHub OAuth production fallback points to Render, not retired Vercel host", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/github/connect/route.ts", import.meta.url), "utf8");
  assert.match(source,/https:\/\/rankfix-app\.onrender\.com/);
  assert.doesNotMatch(source,/rankfix-app\.vercel\.app/);
});

test("Local SEO route contains no deployment-marker residue", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/local-seo/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source,/Deployment marker/);
});


test("expensive and mail-triggering endpoints have coarse rate limits", async () => {
  const { readFile } = await import("node:fs/promises");
  const forgot = await readFile(new URL("../app/api/auth/forgot-password/route.ts", import.meta.url), "utf8");
  const local = await readFile(new URL("../app/api/local-seo/route.ts", import.meta.url), "utf8");
  const competitor = await readFile(new URL("../app/api/competitor-scan/route.ts", import.meta.url), "utf8");
  const health = await readFile(new URL("../app/api/health/run-now/route.ts", import.meta.url), "utf8");
  assert.match(forgot,/consumeRateLimit\("forgot-password",requestIp\(request\),5,3600\)/);
  assert.match(local,/consumeRateLimit\("local-seo",String\(user\.id\),6,600\)/);
  assert.match(competitor,/consumeRateLimit\("competitor-scan",String\(user\.id\),4,600\)/);
  assert.match(health,/consumeRateLimit\("health-run-now",String\(user\.id\),6,3600\)/);
});


test("every audit problem has a visible remediation path", async () => {
  const { readFile } = await import("node:fs/promises");
  const audit = await readFile(new URL("../app/dashboard/audit/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(audit,/Maak veilige GitHub-fix/);
  assert.match(audit,/Vraag RankFix AI/);
  assert.match(audit,/Bekijk handmatige stappen/);
  assert.match(audit,/remediationAction\(check\)==="manual"/);
});
