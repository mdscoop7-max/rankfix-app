import { findWebshopClaims } from "../lib/commerce-claims.ts";
import { confirmedFaqContent } from "../lib/faq-evidence.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { extractImageMetrics } from "../lib/image-metrics.ts";
import { applyEvidenceBasedScoreCap, scoreApplicableChecks, scoreRange, summarizeAuditChecks, weightedCoverage } from "../lib/audit-score.ts";
import { isPrivateHost, validatePublicHttpUrl } from "../lib/safe-fetch.ts";
import { assessHreflang, hasSelfHreflangLanguageMismatch, isMarketSelectorPage, isValidHreflangCode, statusCode } from "../lib/seo-rules.ts";
import { COMMERCE_APPLICABILITY_COPY, GENERIC_LINK_DESTINATION_PASS, UNCONFIRMED_COMMERCE_REASON_CODE, commerceApplicability, isStorefrontOnlyForService, neutralizeShopWording, shopWordingApplies } from "../lib/commerce-applicability.ts";
import { decodeHtmlEntities } from "../lib/html-entities.ts";
import { analyzeScriptIntegrity, assessPassiveSecurity, findExposedSecrets, findForms, findMixedContent, observeCookie, securityScore, setCookieValues, splitSetCookieHeader } from "../lib/security-signals.ts";
import { legacyPassiveSecurity } from "./fixtures/security-legacy.mjs";
import { pages as securityPages } from "./fixtures/security-pages.mjs";
import { INDIRECT_CONTACT_KINDS, assessBusinessDetails, classifyContactAnchor, isFirstPartyLegalLink, findBusinessContactDetails, findCompanyRegistration, findVisibleAddress, findVisibleEmail, findVisiblePhone, isContactForm } from "../lib/contact-evidence.ts";
import { selectRepresentativePages } from "../lib/representative-pages.ts";
import { clientIpFromHeaders, isInternalTester, isInternalTesterCustomerId, retryAfterSeconds, scanRateLimitMessage, scanRateLimitPolicy } from "../lib/scan-access.ts";

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
  // Representative-page meta wording lives in lib/report-quality.ts.
  const quality = await readFile(new URL("../lib/report-quality.ts", import.meta.url), "utf8");
  assert.match(quality, /pixelbreedte, niet van een harde tekengrens/);
  assert.match(quality, /uitzonderlijk kort/);
  assert.match(quality, /uitzonderlijk lang/);
  assert.match(source, /assessPageTitle\(pageTitle, finalCandidate\.hostname, new Date\(\), representativeTitlePixelWidth\)/);
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
  const contactLexicon = await readFile(new URL("../lib/contact-evidence.ts", import.meta.url), "utf8");
  assert.match(contactLexicon, /assistenza clienti/);
  assert.match(contactLexicon, /apoio ao cliente/);
  assert.match(contactLexicon, /assistenza\|pomoc\\w\*/);
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
  assert.match(score, /SCORE_MODEL_VERSION = "3\.5-evidence-gated"/);
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
  assert.match(source, /assessPageDescription\(pageDescription, Boolean\(pageDescriptionTag\)\)/);
  const quality = await readFile(new URL("../lib/report-quality.ts", import.meta.url), "utf8");
  assert.match(quality, /"Meta description-tag aanwezig maar content is leeg\."/);
});


test("multi-page canonical absence uses the same evidence semantics as the main scan", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /key:"canonical",status:pageCanonical[\s\S]*?: "WARNING"/);
  assert.match(source, /Geen expliciete canonical gevonden; dit is niet automatisch een indexeringsprobleem/);
  assert.doesNotMatch(source, /afwezigheid wordt hier niet als bewezen fout gescoord/);
  assert.match(source, /item\.key === "canonical"\) return pageCanonical \? 0\.85 : 0\.9/);
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
  assert.equal(SCORE_MODEL_VERSION, "3.5-evidence-gated");
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
  assert.match(source, /length >= 15 && length <= 110 \? 10 : 9/);
  assert.match(source, /titlePixelEstimate\.warning/);
  assert.match(source, /titlePixelEstimate\.warning\n\s+\? check\("pass", "title", "seo", "Meta title", `\$\{titlePixelEstimate\.message\} Advies, geen aftrek\.`/);
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
  assert.match(source, /SCORE_MODEL_VERSION = "3\.5-evidence-gated"/);
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
  assert.match(source, /Math\.max\(2, Number\(hasPrivacyLink\)\+Number\(cookieSignalOk\)\+Number\(hasContactLink\)\+2\),5/);
  assert.match(source, /rule_id: key/);
  assert.match(source, /issue_id: key/);
});


test("Evidence Engine reconciles representative identity and capabilities before final score", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /reconciledIdentitySource/);
  // Late reconciliation uses the sampled pages' own identity (title/description/H1),
  // needs two agreeing pages and never claims high confidence (issue #151).
  assert.match(source, /representatieve pagina's noemen deze activiteit in hun eigen titel\/omschrijving\/H1/);
  assert.match(source, /reconciledPages >= 2/);
  assert.doesNotMatch(source, /reconciledIdentitySource = \[sectorIdentitySource, multiPageIdentityText\]/);
  assert.match(source, /multiPageCapabilities\.treatment && sectorProfile\.sector === "health_wellness"/);
  assert.match(source, /representativeProduct/);
  assert.match(source, /selectedSeoScore = applyEvidenceBasedScoreCap\(scoreApplicableChecks\(stableCoreChecks\(selectedSeoChecks,"seo"\)\)/);
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
  // Per-cookie evaluation lives in lib/security-signals.ts (behaviour tested in "security FP/FN 4").
  const signals = await readFile(new URL("../lib/security-signals.ts", import.meta.url), "utf8");
  assert.match(source, /const cookieObservations = passiveSecurity\.cookieFlags\.cookies/);
  assert.match(signals, /const cookies = input\.setCookies\.map\(observeCookie\)/);
  for (const name of ["missingSecure", "missingSameSite", "sessionMissingHttpOnly"]) assert.match(signals, new RegExp(`const ${name} = cookies\\.filter`));
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
  assert.match(source, /supportPath \? "support" : \(articlePath \|\| editorialPage\) \? "article" : eventPage \? "event" : corporatePage \? "corporate" : listingPath \? "listing"/);
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
  // Anonymous scans are limited before any fetch starts (limits: lib/scan-access.ts).
  assert.match(scan, /if \(!dashboardScan\) \{\n\s+const limited = await enforceScanRateLimit\(\);\n\s+if \(limited\) return limited;/);
  assert.ok(scan.indexOf("const limited = await enforceScanRateLimit();") < scan.indexOf("const started = Date.now();"));
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


test("representative JS pages receive bounded browser evidence recovery", async () => {
  const { readFile } = await import("node:fs/promises");
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(scanner,/representativeJsFramework/);
  assert.match(scanner,/representativeThinShell/);
  assert.match(scanner,/javascript-rendered representative page/);
  assert.match(scanner,/javascript rendering unavailable; raw HTML retained/);
});

test("commerce identity requires confirmed high-confidence signals", async () => {
  const { readFile } = await import("node:fs/promises");
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(scanner,/confirmedCommerceSignals >= 2 && evidenceCommerceStrength >= 3/);
  assert.match(scanner,/scanEvidence\.commerce\.productPage\.confidence === "high"/);
  assert.match(scanner,/scanEvidence\.commerce\.addToCart\.confidence === "high"/);
});


test("sector identity ignores low-confidence accommodation and property evidence", async () => {
  const { readFile } = await import("node:fs/promises");
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(scanner,/lodgingDetail\.shortStay\.confidence !== "low"/);
  assert.match(scanner,/scanEvidence\.appointments\.booking\.confidence !== "low"/);
  assert.match(scanner,/scanEvidence\.inventory\.properties\.confidence !== "low"/);
});

test("structural actions outrank plain text hints in scan evidence", async () => {
  const { readFile } = await import("node:fs/promises");
  const evidence = await readFile(new URL("../lib/scan-evidence.ts", import.meta.url), "utf8");
  assert.match(evidence,/appointmentAction \? "high" : appointment \? "medium"/);
  assert.match(evidence,/contactLink \? "high" : contactText \? "medium"/);
  assert.match(evidence,/shortStaySchema \? "high" : shortStayText \? "medium"/);
  assert.match(evidence,/automotiveDealerSchema \? "high" : automotiveDealerText \? "medium"/);
});


test("Scan Motor 3.0 audits a bounded diverse representative sample", async () => {
  const { readFile } = await import("node:fs/promises");
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  // dfbe309 deliberately raised the cap from 20 to 30 distinct pages.
  assert.match(scanner,/const representativePageLimit = 30;/);
  assert.match(scanner,/pickMultiPage\("product", 4\)/);
  assert.match(scanner,/pickMultiPage\("service", 5\)/);
  assert.match(scanner,/selectRepresentativePages\(\[scannedPageSample, \.\.\.multiPagePages\], rankedMultiPage, representativePageLimit, \(url\)=>normalizeScanUrl\(stripTrackingParams\(url\)\), templateShapeKey[,)]/);
  assert.match(scanner,/const representativeAuditConcurrency = 4;/);
});


test("representative page audits expose raw versus rendered provenance", async () => {
  const { readFile } = await import("node:fs/promises");
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(scanner,/evidenceSource\?: "raw_html" \| "rendered_html"/);
  assert.match(scanner,/representativeEvidenceSource: "raw_html" \| "rendered_html" = "raw_html"/);
  assert.match(scanner,/representativeEvidenceSource = "rendered_html"/);
  assert.match(scanner,/evidenceSource:representativeEvidenceSource/);
});


test("audit shows transparent representative page coverage", async () => {
  const { readFile } = await import("node:fs/promises");
  const audit = await readFile(new URL("../app/dashboard/audit/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(audit,/Paginadekking/);
  assert.match(audit,/counts\?\.audited/);
  assert.match(audit,/counts\?\.unableToConfirm/);
  assert.match(audit,/discoveredInternalUrls/);
});


test("representative crawl uses bounded concurrency", async () => {
  const { readFile } = await import("node:fs/promises");
  const scanRoute = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(scanRoute, /const representativeAuditConcurrency = 4;/);
  assert.match(scanRoute, /Math\.min\(representativeAuditConcurrency, uniqueMultiPagePages\.length\)/);
  assert.doesNotMatch(scanRoute, /Promise\.all\(uniqueMultiPagePages\.map\(auditMultiPage\)\)/);
});

test("x-default self hreflang on a country picker is not a language mismatch", () => {
  // ikea.com-style global portal: lang="en", self-reference only as x-default.
  assert.equal(hasSelfHreflangLanguageMismatch(["x-default"], "en"), false);
  assert.equal(hasSelfHreflangLanguageMismatch(["x-default", "en-gb"], "en"), false);
  assert.equal(hasSelfHreflangLanguageMismatch(["nl-nl"], "nl"), false);
  assert.equal(hasSelfHreflangLanguageMismatch(["de-de"], "en"), true);
  assert.equal(hasSelfHreflangLanguageMismatch(["x-default", "de-de"], "en"), true);
  assert.equal(hasSelfHreflangLanguageMismatch(["de-de"], ""), false);
});

// Mirrors normalizeScanUrl in the scan route: host without www, no trailing slash.
const normalizeTestUrl = (value) => {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
};
const hreflang = (links, page, lang) => assessHreflang(links, page, lang, normalizeTestUrl);

test("hreflang: country picker with only x-default self reference is not flagged", () => {
  const result = hreflang([
    { language: "x-default", href: "https://www.ikea.com/" },
    { language: "nl-nl", href: "https://www.ikea.com/nl/nl/" },
    { language: "de-de", href: "https://www.ikea.com/de/de/" },
  ], "https://www.ikea.com/", "en");
  assert.equal(result.kind, "unconfirmed");
});

test("hreflang: normal reciprocal set with matching self reference is unconfirmed, not a warning", () => {
  const result = hreflang([
    { language: "nl-nl", href: "https://shop.nl/nl/" },
    { language: "en-gb", href: "https://shop.nl/en/" },
    { language: "x-default", href: "https://shop.nl/en/" },
  ], "https://www.shop.nl/nl", "nl");
  assert.deepEqual(result, { kind: "unconfirmed", total: 3 });
});

test("hreflang: no hreflang markup is not applicable", () => {
  assert.deepEqual(hreflang([], "https://shop.nl/", "nl"), { kind: "none" });
});

test("hreflang: missing or empty language code is still a real error", () => {
  assert.deepEqual(hreflang([{ language: "", href: "https://shop.nl/" }], "https://shop.nl/", "nl"), { kind: "invalid", total: 1, invalid: 1 });
  assert.equal(hreflang([{ language: "nl", href: "" }, { language: "en", href: "https://shop.nl/en/" }], "https://shop.nl/", "nl").kind, "invalid");
});

test("hreflang: invalid code combinations are detected, valid script and region codes pass", () => {
  for (const code of ["en_GB", "en-uk", "english", "nl-nld", "e", "en-gb-x"]) assert.equal(isValidHreflangCode(code), false, code);
  for (const code of ["nl", "nl-NL", "en-gb", "es-419", "zh-Hans", "zh-Hant-TW", "x-default", "uk", "uk-ua"]) assert.equal(isValidHreflangCode(code), true, code);
  assert.equal(hreflang([{ language: "en-uk", href: "https://shop.nl/en/" }], "https://shop.nl/", "nl").kind, "invalid");
});

test("hreflang: genuine self-reference language mismatch is still detected", () => {
  assert.deepEqual(hreflang([
    { language: "de-de", href: "https://shop.nl/" },
    { language: "x-default", href: "https://shop.nl/" },
  ], "https://shop.nl/", "nl"), { kind: "self_mismatch", documentLanguage: "nl" });
});

test("hreflang: conflicting and duplicate targets are detected", () => {
  assert.deepEqual(hreflang([
    { language: "nl", href: "https://shop.nl/a" },
    { language: "nl", href: "https://shop.nl/b" },
  ], "https://shop.nl/x", "nl"), { kind: "conflict", targets: [["nl", ["https://shop.nl/a", "https://shop.nl/b"]]] });
  assert.deepEqual(hreflang([
    { language: "nl", href: "https://shop.nl/a" },
    { language: "nl", href: "https://www.shop.nl/a/" },
  ], "https://shop.nl/x", "nl"), { kind: "duplicate", targets: [["nl", "https://shop.nl/a"]] });
});

test("hreflang: other hosts are unable-to-confirm, not an error", () => {
  assert.deepEqual(hreflang([
    { language: "nl", href: "https://shop.nl/" },
    { language: "de", href: "https://shop.de/" },
  ], "https://shop.nl/", "nl"), { kind: "external_hosts", count: 1 });
});

test("html entities decode once, like a browser", () => {
  assert.equal(decodeHtmlEntities("Privacy &amp; Cookie statement"), "Privacy & Cookie statement");
  assert.equal(decodeHtmlEntities("&amp;lt;b&amp;gt;"), "&lt;b&gt;");
  assert.equal(decodeHtmlEntities("&amp;amp;"), "&amp;");
  assert.equal(decodeHtmlEntities("Caf&eacute; &euro;&nbsp;5 &ndash; IKEA&rsquo;s"), "Café €\u00a05 – IKEA’s");
  assert.equal(decodeHtmlEntities("&#39;&#x27;&#x2F;&#8364;&#X20AC;"), "''/€€");
  assert.equal(decodeHtmlEntities("&AMP; &Eacute; &EACUTE;"), "& É é");
});

test("html entities: unknown names stay visible and bad code points never throw", () => {
  assert.equal(decodeHtmlEntities("&foo; &constructor; &toString;"), "&foo; &constructor; &toString;");
  assert.equal(decodeHtmlEntities("&#x110000;&#xD800;&#0;&#99999999999;"), "\ufffd\ufffd\ufffd\ufffd");
  assert.equal(decodeHtmlEntities("R&D en AT&T"), "R&D en AT&T");
});

test("hreflang: separate country domains are never a warning on their own", () => {
  const result = hreflang([
    { language: "nl-nl", href: "https://www.ikea.nl/nl/" },
    { language: "de-de", href: "https://www.ikea.de/de/" },
    { language: "fr-be", href: "https://www.ikea.be/fr/" },
    { language: "x-default", href: "https://www.ikea.com/" },
  ], "https://www.ikea.nl/nl/", "nl");
  assert.deepEqual(result, { kind: "external_hosts", count: 3 });
});

test("hreflang: proven conflicts and duplicates are reported even with country domains", () => {
  assert.equal(hreflang([
    { language: "nl-nl", href: "https://shop.nl/a" },
    { language: "nl-nl", href: "https://shop.nl/b" },
    { language: "de-de", href: "https://shop.de/" },
  ], "https://shop.nl/a", "nl").kind, "conflict");
  assert.equal(hreflang([
    { language: "de-de", href: "https://shop.de/" },
    { language: "de-de", href: "https://www.shop.de" },
  ], "https://shop.nl/", "nl").kind, "duplicate");
});

test("hreflang: self reference matches across www, trailing slash and relative href", () => {
  for (const href of ["https://www.shop.nl/nl/", "https://shop.nl/nl", "/nl/", "/nl#top"]) {
    assert.equal(hreflang([{ language: "de-de", href }, { language: "nl-nl", href: "https://shop.nl/x" }], "https://shop.nl/nl/", "nl").kind, "self_mismatch", href);
    assert.equal(hreflang([{ language: "nl-nl", href }, { language: "de-de", href: "https://shop.nl/de/" }], "https://shop.nl/nl/", "nl").kind, "unconfirmed", href);
  }
});

test("hreflang: no warning without proof (missing document lang, non-http targets are invalid only)", () => {
  assert.equal(hreflang([{ language: "de-de", href: "https://shop.nl/" }], "https://shop.nl/", "").kind, "unconfirmed");
  assert.equal(hreflang([{ language: "nl", href: "javascript:void(0)" }], "https://shop.nl/", "nl").kind, "invalid");
  assert.equal(hreflang([{ language: "nl", href: "mailto:info@shop.nl" }], "https://shop.nl/", "nl").kind, "invalid");
});

// Same-site page by default; pass pageUrl to test links to other websites.
const contactKind = (href, label = "", pageUrl) => classifyContactAnchor({ href, text: label, pageUrl: pageUrl || (/^https?:/i.test(href) ? new URL(href).origin + "/" : "https://shop.nl/") });

test("contact: FAQ and help articles are never a contact channel", () => {
  assert.equal(contactKind("https://www.ikea.com/global/en/support/faq/", "FAQs"), "faq_help");
  assert.equal(contactKind("/klantenservice/veelgestelde-vragen", "Veelgestelde vragen"), "faq_help");
  assert.equal(contactKind("/help-center", "Helpcentrum"), "faq_help");
  assert.equal(contactKind("/support", "Support"), "support");
});

test("contact: real channels are recognised separately", () => {
  assert.equal(contactKind("/contact", "Contact"), "contact_page");
  assert.equal(contactKind("/support/contact-us", "Neem contact op"), "contact_page");
  assert.equal(contactKind("/de/kontakt", "Kontakt"), "contact_page");
  assert.equal(contactKind("/klantenservice", "Klantenservice"), "customer_service");
  assert.equal(contactKind("mailto:info@tandarts.nl", "Mail ons"), "email");
  assert.equal(contactKind("tel:+31201234567", "Bel ons"), "phone");
});

test("contact: look-alikes and broken channels are not contact evidence", () => {
  assert.equal(contactKind("/contactlenzen", "Contactlenzen"), null);
  assert.equal(contactKind("mailto:", "Mail"), null);
  assert.equal(contactKind("tel:112", "Noodnummer"), null);
});

test("contact: contact forms need a message field and a reply field", () => {
  assert.equal(isContactForm('<form><input type="email" name="email"><textarea name="message"></textarea></form>'), true);
  assert.equal(isContactForm('<form><input name="telefoon"><textarea name="bericht"></textarea></form>'), true);
  assert.equal(isContactForm('<form role="search"><input type="search" name="q"></form>'), false);
  assert.equal(isContactForm('<form><input type="email" name="newsletter"><button>Aanmelden</button></form>'), false);
});

test("contact: visible e-mail addresses count, image asset names do not", () => {
  assert.equal(findVisibleEmail("Mail ons via info@makelaar.nl of bel"), "info@makelaar.nl");
  assert.equal(findVisibleEmail("logo@2x.png banner@3x.webp"), null);
  assert.equal(findVisibleEmail("Geen adres hier"), null);
});

test("contact: multilingual customer service and support terms keep their meaning", () => {
  assert.equal(contactKind("/assistenza-clienti", "Assistenza clienti"), "customer_service");
  assert.equal(contactKind("/apoio-ao-cliente", "Apoio ao cliente"), "customer_service");
  assert.equal(contactKind("/contacto", "Contacto"), "contact_page");
  assert.equal(contactKind("/contatti", "Contatti"), "contact_page");
  assert.equal(contactKind("/pomoc", "Pomoc"), "support");
});

test("image metrics decode entity-encoded src values with the shared decoder", () => {
  // &amp; and &#38; are the same URL; the old decoder left &#38; encoded and counted it twice.
  const metrics = extractImageMetrics('<img src="/media/a.jpg?w=1&amp;h=2"><source srcset="/media/a.jpg?w=1&#38;h=2"><source srcset="&#x2F;uploads&#x2F;b.png 2x">');
  assert.equal(metrics.elementCount, 1);
  assert.equal(metrics.uniqueImageReferences, 2);
  assert.equal(metrics.missingAlt, 1);
});

const pageUrl = (path) => ({ url: `https://shop.nl${path}`, type: path.startsWith("/p/") ? "product" : "other" });
const templateOf = (url) => new URL(url).pathname.replace(/\d+/g, ":n");
const pick = (seeds, ranked, limit = 30) => selectRepresentativePages(seeds, ranked, limit, normalizeTestUrl, templateOf);

test("representative sample never exceeds the 30-page cap", () => {
  const many = Array.from({ length: 80 }, (_, i) => pageUrl(`/p/${i}`));
  const seeds = Array.from({ length: 40 }, (_, i) => pageUrl(`/section-${String.fromCharCode(97 + (i % 26))}${i}`));
  assert.equal(pick(seeds, many).length, 30);
  assert.equal(pick([], many).length, 30);
});

test("representative sample keeps small sites small and never duplicates URLs", () => {
  const ranked = [pageUrl("/p/1"), pageUrl("/p/2"), pageUrl("/contact"), pageUrl("/p/1/"), pageUrl("/contact")];
  const selected = pick([pageUrl("/"), pageUrl("/contact")], ranked);
  assert.deepEqual(selected.map((page) => page.url), ["https://shop.nl/", "https://shop.nl/contact", "https://shop.nl/p/1", "https://shop.nl/p/2"]);
  assert.equal(pick([pageUrl("/")], []).length, 1);
});

test("representative sample prefers template diversity before filling same-template pages", () => {
  const seeds = [pageUrl("/"), pageUrl("/p/1"), pageUrl("/p/2"), pageUrl("/about")];
  const first = pick(seeds, [], 30).map((page) => page.url);
  assert.deepEqual(first, ["https://shop.nl/", "https://shop.nl/p/1", "https://shop.nl/about"]);
  const filled = pick(seeds, [pageUrl("/p/2"), pageUrl("/p/3")], 4).map((page) => page.url);
  assert.deepEqual(filled, ["https://shop.nl/", "https://shop.nl/p/1", "https://shop.nl/about", "https://shop.nl/p/2"]);
});

test("representative sample can cap FAQ/help pages so they do not crowd out evidence", () => {
  const faqCap = { matches: (url) => /\/(?:faq|help-center)(?:\/|$)/i.test(new URL(url).pathname), limit: 3 };
  const ranked = [...Array.from({ length: 6 }, (_, i) => pageUrl(`/faq/q${i}`)), pageUrl("/p/1"), pageUrl("/about")];
  const selected = selectRepresentativePages([pageUrl("/")], ranked, 30, normalizeTestUrl, templateOf, faqCap).map((page) => page.url);
  assert.equal(selected.filter((url) => url.includes("/faq/")).length, 3);
  assert.ok(selected.includes("https://shop.nl/p/1"));
  assert.ok(selected.includes("https://shop.nl/about"));
});

const TESTER_ID = "6f1c2b9e-1d2a-4c3b-8e4f-0a1b2c3d4e5f";
const testerEnv = { RANKFIX_INTERNAL_TEST_USER_ID: TESTER_ID, RANKFIX_INTERNAL_TEST_EMAIL: "owner@rankfix.test" };

test("scan access: anonymous visitors keep the per-network free limit", () => {
  assert.deepEqual(scanRateLimitPolicy({ dashboardScan: false, userId: null, paidPlan: false, tester: false }), { scope: "public-scan", key: "ip", limit: 8, windowSeconds: 3600, code: "PUBLIC_SCAN_RATE_LIMIT" });
});

test("scan access: Free accounts share the network limit, so fake accounts add no capacity", () => {
  assert.equal(scanRateLimitPolicy({ dashboardScan: false, userId: "u1", paidPlan: false, tester: false })?.key, "ip");
  assert.deepEqual(scanRateLimitPolicy({ dashboardScan: true, userId: "u1", paidPlan: false, tester: false }), { scope: "free-scan", key: "ip", limit: 8, windowSeconds: 3600, code: "FREE_SCAN_RATE_LIMIT" });
});

test("scan access: paying customers are never held to the anonymous network limit", () => {
  assert.equal(scanRateLimitPolicy({ dashboardScan: true, userId: "u2", paidPlan: true, tester: false }), null);
  assert.deepEqual(scanRateLimitPolicy({ dashboardScan: false, userId: "u2", paidPlan: true, tester: false }), { scope: "paid-public-scan", key: "user", limit: 30, windowSeconds: 3600, code: "ACCOUNT_SCAN_RATE_LIMIT" });
  // A paid flag without a signed-in account is just a visitor.
  assert.equal(scanRateLimitPolicy({ dashboardScan: false, userId: null, paidPlan: true, tester: false })?.scope, "public-scan");
});

test("scan access: configured tester account IDs are exempt from hourly limits", () => {
  assert.equal(isInternalTester(TESTER_ID, testerEnv), true);
  assert.equal(isInternalTester(TESTER_ID.toUpperCase(), testerEnv), true);
  assert.equal(scanRateLimitPolicy({ dashboardScan: true, userId: TESTER_ID, paidPlan: false, tester: true }), null);
  assert.equal(scanRateLimitPolicy({ dashboardScan: false, userId: TESTER_ID, paidPlan: false, tester: true }), null);
  assert.equal(isInternalTester("6f1c2b9e-0000-4c3b-8e4f-0a1b2c3d4e5f", { RANKFIX_INTERNAL_TEST_USER_IDS: `x, ${TESTER_ID.toUpperCase()}, "6f1c2b9e-0000-4c3b-8e4f-0a1b2c3d4e5f"` }), true);
});

test("scan access: e-mail alone, empty or malformed config never grants the exemption", () => {
  assert.equal(isInternalTester("owner@rankfix.test", testerEnv), false);
  assert.equal(isInternalTester("some-other-id", { RANKFIX_INTERNAL_TEST_EMAIL: "owner@rankfix.test" }), false);
  assert.equal(isInternalTester("", { RANKFIX_INTERNAL_TEST_USER_ID: "" }), false);
  assert.equal(isInternalTester(undefined, testerEnv), false);
  assert.equal(isInternalTester("not-a-uuid", { RANKFIX_INTERNAL_TEST_USER_ID: "not-a-uuid" }), false);
});

test("scan access: spoofed forwarding headers cannot pick a fresh rate-limit bucket", () => {
  const spoofed = new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9", "x-real-ip": "1.2.3.4" });
  assert.equal(clientIpFromHeaders(spoofed, {}), "203.0.113.9");
  // On Vercel the platform overwrites both headers with the real client.
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.7", "x-real-ip": "198.51.100.7" }), { VERCEL: "1" }), "198.51.100.7");
  assert.equal(clientIpFromHeaders(new Headers(), {}), "unknown");
});

test("scan access: the message shows the real remaining wait", () => {
  const start = new Date("2026-10-11T12:00:00Z");
  assert.equal(retryAfterSeconds(start, 3600, Date.parse("2026-10-11T12:43:00Z")), 1020);
  assert.equal(retryAfterSeconds(start, 3600, Date.parse("2026-10-11T13:30:00Z")), 1);
  assert.equal(scanRateLimitMessage("nl", 1020, false), "Er zijn vanaf dit netwerk veel gratis scans uitgevoerd. Probeer het over ongeveer 17 minuten opnieuw.");
  assert.equal(scanRateLimitMessage("en", 30, true), "Many scans were started from this account in a short time. Please try again in about 1 minute.");
  assert.match(scanRateLimitMessage("xx", 120, false), /ongeveer 2 minuten/);
});

test("scan route applies the shared policy and never trusts e-mail for the tester exemption", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const competitor = await readFile(new URL("../app/api/competitor-scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /scanRateLimitPolicy\(\{ dashboardScan, userId: usageUser\?\.id \|\| null, paidPlan: isPaidPlan\(planCode\), tester: internalTestAccount \}\)/);
  assert.match(route, /isInternalTester\(usageUser\?\.id\)/);
  assert.doesNotMatch(route, /configuredTestEmail === signedInEmail/);
  assert.doesNotMatch(competitor, /RANKFIX_INTERNAL_TEST_EMAIL/);
  assert.match(route, /"Retry-After": String\(result\.retryAfterSeconds\)/);
});

const commerce = (overrides) => commerceApplicability({ confirmed: false, primaryNonCommerceIdentity: false, commerceHints: false, thinShell: false, marketSelector: false, auditedRepresentativePages: 5, ...overrides });

test("market selector: x-default global portal with many country versions", () => {
  const ikeaGlobal = [
    { language: "x-default", href: "https://www.ikea.com/" },
    { language: "nl-nl", href: "https://www.ikea.com/nl/nl/" },
    { language: "de-de", href: "https://www.ikea.com/de/de/" },
    { language: "fr-fr", href: "https://www.ikea.com/fr/fr/" },
  ];
  assert.equal(isMarketSelectorPage(ikeaGlobal, "https://ikea.com/", normalizeTestUrl), true);
  // The Dutch country version is a language version itself, not a selector.
  assert.equal(isMarketSelectorPage(ikeaGlobal, "https://www.ikea.com/nl/nl/", normalizeTestUrl), false);
  // A normal multilingual site whose English home is also x-default is not a selector.
  assert.equal(isMarketSelectorPage([{ language: "x-default", href: "https://shop.nl/" }, { language: "en", href: "https://shop.nl/" }, { language: "nl", href: "https://shop.nl/nl/" }, { language: "de", href: "https://shop.nl/de/" }], "https://shop.nl/", normalizeTestUrl), false);
  assert.equal(isMarketSelectorPage([{ language: "x-default", href: "https://shop.nl/" }, { language: "nl", href: "https://shop.nl/nl/" }], "https://shop.nl/", normalizeTestUrl), false);
});

test("commerce applicability: proven commerce activates shop checks", () => {
  assert.deepEqual(commerce({ confirmed: true, marketSelector: true, thinShell: true }), { state: "confirmed" });
});

test("commerce applicability: country picker and JS shell are unable-to-confirm, never N/A", () => {
  assert.deepEqual(commerce({ marketSelector: true, commerceHints: true }), { state: "unconfirmed", reason: "market_selector" });
  assert.deepEqual(commerce({ thinShell: true }), { state: "unconfirmed", reason: "thin_shell" });
  assert.deepEqual(commerce({ thinShell: true, primaryNonCommerceIdentity: true }), { state: "unconfirmed", reason: "thin_shell" });
});

test("commerce applicability: weak shop signals or a thin sample are unable-to-confirm", () => {
  assert.deepEqual(commerce({ commerceHints: true }), { state: "unconfirmed", reason: "weak_commerce_signals" });
  assert.deepEqual(commerce({ auditedRepresentativePages: 1 }), { state: "unconfirmed", reason: "low_coverage" });
});

test("commerce applicability: N/A only with evidence that the site is not a shop", () => {
  // Service provider (dentist, broker, hotel) with secondary shop navigation.
  assert.deepEqual(commerce({ primaryNonCommerceIdentity: true, commerceHints: true }), { state: "absent", reason: "service_identity" });
  // Fully readable site, several pages sampled, no product/price/cart evidence anywhere.
  assert.deepEqual(commerce({}), { state: "absent", reason: "no_commerce_evidence" });
});

test("commerce applicability: every reason has report copy and an existing report reason code", () => {
  for (const reason of ["service_identity", "no_commerce_evidence", "market_selector", "thin_shell", "weak_commerce_signals", "low_coverage"]) assert.ok(COMMERCE_APPLICABILITY_COPY[reason], reason);
  for (const code of Object.values(UNCONFIRMED_COMMERCE_REASON_CODE)) assert.ok(["type_uncertain", "needs_js", "weak_evidence", "insufficient_pages"].includes(code), code);
});

test("scan route uses the three-way commerce gate instead of blanket N/A", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /Definitieve Scanbewijs bevestigt geen webshop-\/retailketen/);
  assert.match(route, /finalCommerceApplicability\.state === "absent"/);
  assert.match(route, /finalCommerceApplicability\.state === "unconfirmed"/);
  assert.match(route, /commerceApplicability: commerceApplicabilityReport/);
});

test("score model: unconfirmed commerce checks keep the score but lower coverage and widen the range", () => {
  // Current logic, recorded before any score change: only assessed checks score;
  // N/A leaves coverage untouched; unable-to-confirm lowers coverage and the low end of the range.
  const core = [
    { issue_status: "PASS", points: 10, maxPoints: 10, confidence: "high" },
    { issue_status: "WARNING", points: 5, maxPoints: 10, confidence: "high" },
  ];
  const commerce = (status) => Array.from({ length: 4 }, () => ({ issue_status: status, points: 0, maxPoints: 5 }));
  const asNa = [...core, ...commerce("NOT_APPLICABLE")];
  const asUnconfirmed = [...core, ...commerce("UNABLE_TO_CONFIRM")];
  assert.equal(scoreApplicableChecks(asNa), 75);
  assert.equal(scoreApplicableChecks(asUnconfirmed), 75);
  assert.equal(weightedCoverage(asNa).coveragePercent, 100);
  assert.equal(weightedCoverage(asUnconfirmed).coveragePercent, 50);
  assert.equal(weightedCoverage(asUnconfirmed).unableToConfirm, 4);
  assert.deepEqual([scoreRange(asNa).low, scoreRange(asNa).high], [75, 75]);
  assert.deepEqual([scoreRange(asUnconfirmed).low, scoreRange(asUnconfirmed).high], [38, 88]);
});

test("report shows commerce applicability and raw-HTML limitations separately from sector", async () => {
  const { readFile } = await import("node:fs/promises");
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  assert.match(report, /Webshopfunctionaliteit:/);
  assert.match(report, /Beperking scanbron:/);
  assert.match(report, /r\.seo\?\.score/);
  assert.match(report, /r\.geo\?\.score/);
  assert.match(report, /r\.security\?\.score/);
  assert.match(report, /toepasselijke controles/);
});

test("no regex matches a literal backslash where an escape class was meant", async () => {
  // "\\b", "\\s", "\\d", "\\." etc. inside a /regex/ literal (or "\\\\b" inside a
  // new RegExp string) match a backslash character, so the pattern silently never
  // fires. This broke sector checks, cookie flags, SRI, secret detection, robots.txt
  // parsing, www-normalisation and the reset-password digit rule.
  const { readFile, readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const root = new URL("..", import.meta.url).pathname;
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) await walk(rel);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(rel);
    }
  };
  for (const dir of ["app", "lib", "components"]) await walk(dir);
  const literal = /(?<![\w)\]])\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/[dgimsuy]*/g;
  const offenders = [];
  for (const file of files) {
    const lines = (await readFile(join(root, file), "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(literal)) {
        if (match[1].includes("RegExp(")) continue; // text between two "/" in strings, not a literal
        const body = match[1].replace(/\[(?:\\.|[^\]\\])*\]/g, ""); // escaped "\\" inside a character class is legitimate
        if (/\\\\[bBsSdDwWrnt.p+]/.test(body)) offenders.push(`${file}:${index + 1}`);
      }
      if (/RegExp\([^)]*\\\\\\\\[bBsSdDwW]/.test(line)) offenders.push(`${file}:${index + 1} (RegExp string)`);
    });
  }
  assert.deepEqual(offenders, []);
});

// --- Audit findings 11 October (KwikFit, IKEA NL/international, Brenger) ---

test("finding 1: review and rating links are never contact evidence", () => {
  const page = "https://www.kwik-fit.nl/";
  assert.equal(contactKind("https://www.kiyoh.com/reviews/1043233/kwik_fit", "76.121 beoordelingen", page), "review");
  assert.equal(contactKind("https://nl.trustpilot.com/review/kwik-fit.nl", "Contact? Lees 76.121 reviews", page), "review");
  assert.equal(contactKind("/klantbeoordelingen", "Bekijk alle beoordelingen", page), "review");
  // A contact page on another website suggests contact but does not prove the business's own channel.
  assert.equal(contactKind("https://partner.example.com/contact", "Contact", page), "external");
  assert.ok(INDIRECT_CONTACT_KINDS.has("external"));
  assert.equal(findVisiblePhone("Gemiddeld 9,2 uit 76.121 beoordelingen"), null);
  assert.equal(findVisiblePhone("Prijs 1.234.567 · datum 11-10-2026 12:00"), null);
  assert.equal(findVisiblePhone("Bel ons op 020-123 45 67"), "020-123 45 67");
});

test("finding 2: a general Services link is not a confirmed contact channel", () => {
  const page = "https://www.ikea.com/nl/nl/";
  assert.equal(contactKind("https://www.ikea.com/nl/nl/customer-service/services/", "Services", page), "support");
  assert.equal(contactKind("https://www.ikea.com/nl/nl/customer-service/", "Klantenservice", page), "customer_service");
  for (const kind of ["support", "customer_service", "faq_help"]) assert.ok(INDIRECT_CONTACT_KINDS.has(kind), kind);
  assert.equal(contactKind("https://www.ikea.com/nl/nl/customer-service/contact-us/", "Contact", page), "contact_page");
  assert.ok(!INDIRECT_CONTACT_KINDS.has("contact_page"));
});

test("finding 3: IKEA international FAQ, &amp; and x-default stay fixed", () => {
  assert.equal(contactKind("https://www.ikea.com/global/en/support/faq/", "FAQs", "https://www.ikea.com/"), "faq_help");
  assert.equal(decodeHtmlEntities("Privacy &amp; Cookie statement"), "Privacy & Cookie statement");
  assert.equal(hreflang([{ language: "x-default", href: "https://www.ikea.com/" }, { language: "nl-nl", href: "https://www.ikea.com/nl/nl/" }, { language: "de-de", href: "https://www.ikea.com/de/de/" }], "https://ikea.com/", "en").kind, "unconfirmed");
});

test("findings 4 and 7: shop wording only when a shop is proven and no other identity is primary", () => {
  const confirmed = { state: "confirmed" };
  assert.equal(shopWordingApplies(confirmed, false), true);
  assert.equal(shopWordingApplies(confirmed, true), false); // e.g. transport & logistics with prices
  assert.equal(shopWordingApplies({ state: "unconfirmed", reason: "weak_commerce_signals" }, false), false);
  assert.equal(neutralizeShopWording("1 geldige JSON-LD block(s) met een voor deze webshophomepage relevant schema-type gevonden. Relevante hoofdkeuze: OnlineStore + WebSite."),
    "1 geldige JSON-LD block(s) met een voor deze homepage relevant schema-type gevonden. Relevante hoofdkeuze: Organization + WebSite.");
  assert.doesNotMatch(GENERIC_LINK_DESTINATION_PASS.message, /product/i);
});

test("findings 4 and 7: scan route applies the shop-wording gate before final scoring", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const gate = route.indexOf("if (!shopWordingApplies(finalCommerceApplicability, Boolean(primaryNonCommerceIdentity)))");
  assert.ok(gate > 0);
  assert.ok(gate < route.lastIndexOf('selectedSeoScore = applyEvidenceBasedScoreCap(scoreApplicableChecks(stableCoreChecks(selectedSeoChecks,"seo"))'));
  assert.match(route.slice(gate, gate + 2000), /item\.key === "schema"/);
  assert.match(route.slice(gate, gate + 2000), /item\.key === "semantic_link_destination"/);
});

test("finding 5: garage appointment and test drive are separate checks", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const block = route.slice(route.indexOf('} else if (sectorProfile.sector === "automotive") {'), route.indexOf('} else if (sectorProfile.sector === "home_services") {'));
  const appointment = block.match(/const appointmentSignal = (.+);/)[1];
  assert.doesNotMatch(appointment, /hasContactChannelSignal|proefrit/);
  assert.match(block, /"sector_automotive_conversion","Werkplaatsafspraak"/);
  assert.match(block, /"sector_automotive_test_drive","Proefrit"/);
  // A garage without proven vehicle sales gets N/A for test drives, not a missing action.
  assert.match(block, /automotiveServiceIdentity && !inventorySignal\s*\?\s*check\("not_applicable","sector_automotive_test_drive"/);
  const appointmentRe = new RegExp(appointment.match(/^\/(.+)\/i\.test\(text\)$/)[1], "i");
  assert.equal(appointmentRe.test("Plan je APK-afspraak online"), true);
  assert.equal(appointmentRe.test("Maak een proefrit in de nieuwe Golf"), false);
});

test("finding 6: business details pass only with concrete details, not just absent placeholders", () => {
  const none = { phone: null, email: null, address: null, telLink: false, mailtoLink: false };
  assert.deepEqual(assessBusinessDetails({ placeholders: [], details: none, registration: null, schemaContact: false, thinShell: false }), { status: "unable_to_confirm", reason: "no_details" });
  assert.deepEqual(assessBusinessDetails({ placeholders: [], details: none, registration: null, schemaContact: false, thinShell: true }), { status: "unable_to_confirm", reason: "thin_shell" });
  assert.equal(assessBusinessDetails({ placeholders: ["[kvk]"], details: none, registration: null, schemaContact: false, thinShell: false }).status, "fail");
  const details = findBusinessContactDetails("Damrak 1, 1012 LG Amsterdam · bel 020-123 45 67", '<a href="mailto:info@bedrijf.nl">mail</a>');
  assert.deepEqual(assessBusinessDetails({ placeholders: [], details, registration: findCompanyRegistration("KvK-nummer: 12345678"), schemaContact: false, thinShell: false }),
    { status: "pass", found: ["KvK 12345678", "adres (Damrak 1, 1012 LG Amsterdam)", "telefoonnummer", "e-mailadres"] });
  assert.equal(findCompanyRegistration("Vul je KvK-nummer in"), null);
  assert.equal(findVisibleAddress("Vul je postcode in"), null);
  assert.equal(findBusinessContactDetails("", '<input type="email" name="email">').mailtoLink, false);
});

// --- Security Engine (now that its regexes actually match) ---

test("security: mixed content counts loaded subresources, not plain links", () => {
  const html = `
    <a href="http://partner.example.org/">Partner</a>
    <link rel="canonical" href="http://shop.nl/">
    <link rel="alternate" hreflang="de" href="http://shop.de/">
    <form action="http://forms.example.org/x"></form>
    <svg xmlns="http://www.w3.org/2000/svg"></svg>
    <img src="https://cdn.shop.nl/a.png">`;
  assert.deepEqual(findMixedContent(html), []);
  const mixed = `<img src="http://cdn.shop.nl/a.png"><script src='http://cdn.shop.nl/a.js'></script><link rel="stylesheet" href="http://cdn.shop.nl/a.css"><iframe src="http://video.example.org/e"></iframe><img srcset="http://cdn.shop.nl/b.png 2x">`;
  assert.deepEqual(findMixedContent(mixed).sort(), ["http://cdn.shop.nl/a.css", "http://cdn.shop.nl/a.js", "http://cdn.shop.nl/a.png", "http://cdn.shop.nl/b.png", "http://video.example.org/e"]);
});

test("security: cookie flags are read per cookie, including Expires commas", () => {
  const joined = "sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax, theme=dark; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, consent=1; secure; samesite=strict";
  const cookies = splitSetCookieHeader(joined).map(observeCookie);
  assert.deepEqual(cookies.map((c) => [c.name, c.secure, c.httpOnly, c.sameSite, c.sessionLike]), [
    ["sid", true, true, "lax", true],
    ["theme", false, false, "missing", false],
    ["consent", true, false, "strict", false],
  ]);
  // A cookie value containing "secure" is not the Secure attribute.
  assert.equal(observeCookie("pref=secure; Path=/").secure, false);
  assert.equal(observeCookie("csrftoken=x; Secure").sessionLike, false);
  const headers = new Headers();
  headers.append("set-cookie", "a=1; Secure; HttpOnly");
  headers.append("set-cookie", "b=2; Expires=Wed, 21 Oct 2026 07:28:00 GMT");
  assert.deepEqual(setCookieValues(headers), ["a=1; Secure; HttpOnly", "b=2; Expires=Wed, 21 Oct 2026 07:28:00 GMT"]);
});

test("security: forms, password fields and insecure actions are detected", () => {
  assert.deepEqual(findForms("<p>geen formulier</p>"), { count: 0, passwordForm: false, insecureActions: 0 });
  assert.deepEqual(findForms('<form action="/login"><input type="password" name="p"></form><form action="http://old.example.org/post"><input name="q"></form>'), { count: 2, passwordForm: true, insecureActions: 1 });
  // An http:// link inside an https form is not an insecure form action.
  assert.equal(findForms('<form action="https://shop.nl/s"><a href="http://help.example.org">help</a></form>').insecureActions, 0);
});

test("security: real exposed secrets are found, documentation examples are not", () => {
  const realAws = "AKIA" + "Q3EGRZ7LW5MNXK2P";
  const realGh = "ghp_" + "Zx9Qm2Lr7Tb4Vn8Kc1Hs6Pd3Wf5Gy0Ja8Nu4E";
  assert.deepEqual(findExposedSecrets(`<script>window.cfg={aws:"${realAws}"}</script>`), ["AWS access key"]);
  assert.deepEqual(findExposedSecrets(`<script>const t="${realGh}"</script>`), ["GitHub token"]);
  assert.deepEqual(findExposedSecrets(`<script>fetch(u,{headers:{Authorization:"Bearer ${"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.k3Lq9xPz"}"}})</script>`), ["generic bearer token"]);
  const pem = "-----BEGIN RSA PRIVATE KEY-----\n" + "MIIEowIBAAKCAQEA7dQ3x9Lq2Vh8Pz4Kn6Tr1Ws5Yb0Ec3Gu7Jm9Na2Df4Hk6Lp8Qs".repeat(2);
  assert.deepEqual(findExposedSecrets(`<script>var k="${pem}"</script>`), ["private key"]);
  // Tutorials and docs:
  assert.deepEqual(findExposedSecrets("<p>Use AKIAIOSFODNN7EXAMPLE as access key id.</p>"), []);
  assert.deepEqual(findExposedSecrets(`<pre><code>export AWS_KEY=${realAws}</code></pre>`), []);
  assert.deepEqual(findExposedSecrets("<p>Start your file with -----BEGIN PRIVATE KEY----- ... </p>"), []);
  assert.deepEqual(findExposedSecrets("<p>Authorization: Bearer YOUR_API_TOKEN_GOES_HERE_123</p>"), []);
  assert.deepEqual(findExposedSecrets("<p>ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</p>"), []);
});

test("security: SRI is only asked for versioned third-party files", () => {
  const html = `
    <script src="/app.js"></script>
    <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script>
    <script src="https://js.stripe.com/v3/"></script>
    <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js" integrity="sha384-x" crossorigin="anonymous"></script>`;
  const result = analyzeScriptIntegrity(html, "https://shop.nl/");
  assert.equal(result.crossOrigin, 4);
  assert.deepEqual(result.missingVersioned, ["https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js"]);
  assert.deepEqual(result.missingDynamic, ["https://www.googletagmanager.com/gtm.js?id=GTM-ABC", "https://js.stripe.com/v3/"]);
});

test("security route takes every passive security status from assessPassiveSecurity", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /const passiveSecurity = assessPassiveSecurity\(\{ isHttps, html, pageUrl: finalUrl\.toString\(\), setCookies: setCookieValues\(response\.headers\) \}\);/);
  for (const [key, statuses] of [["mixedContent", ["not_applicable", "pass"]], ["cookieFlags", ["unable_to_confirm", "pass"]], ["forms", ["not_applicable", "fail", "pass"]], ["exposedSecrets", ["fail"]], ["scriptIntegrity", ["pass"]]]) {
    for (const status of statuses) assert.ok(route.includes(`passiveSecurity.${key}.status === "${status}"`), `${key} ${status}`);
  }
  // No status may be decided from the raw signals any more.
  assert.doesNotMatch(route, /securityChecks\.push\((?:!isHttps|!cookiePresent|forms\.length === 0|exposedSignals\.length)/);
  assert.match(route, /securityCheck\("fail","security_https"/);
});

test("fix engine: AI-fix H1/title extraction and GitHub icon filter work on real markup", async () => {
  const { readFile } = await import("node:fs/promises");
  const aiFix = await readFile(new URL("../app/api/ai-fix/route.ts", import.meta.url), "utf8");
  // Evaluate the exact expressions from the source, so this fails if they regress.
  const h1Source = aiFix.match(/type==="h1"\?new RegExp\(("[^"]+"),"i"\)/)[1];
  const titleSource = aiFix.match(/type==="meta_title"\?new RegExp\(("[^"]+"),"i"\)/)[1];
  const h1 = new RegExp(JSON.parse(h1Source), "i");
  const title = new RegExp(JSON.parse(titleSource), "i");
  assert.equal('<h1 class="x">Autoservice\nin Utrecht</h1>'.match(h1)?.[1], "Autoservice\nin Utrecht");
  assert.equal("<title>Kwik Fit | APK</title>".match(title)?.[1], "Kwik Fit | APK");

  const githubFix = await readFile(new URL("../app/api/github/fix/route.ts", import.meta.url), "utf8");
  const iconBlock = githubFix.slice(githubFix.indexOf("const isIconAsset="), githubFix.indexOf("const trustedImage="));
  const isIconAsset = new Function(`${iconBlock.replace(/:string\b/g, "")}; return isIconAsset;`)();
  for (const icon of ["/favicon.ico", "/icons/icon-192x192.png", "/static/icon-512.png", "/apple-touch-icon.png"]) assert.equal(isIconAsset(icon), true, icon);
  for (const image of ["/images/hero-1200x630.jpg", "/media/iconic-shoe.png", "/og/product.webp"]) assert.equal(isIconAsset(image), false, image);
});

test("sector signals recognise concrete evidence and ignore generic words", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const start = route.indexOf('if (sectorProfile.sector === "real_estate") {');
  const sectors = route.slice(start, route.indexOf("const ", route.indexOf('} else if (sectorProfile.sector === "saas_b2b") {') + 600));
  // First /regex/flags.test(text) on the "const <name> =" line inside the given sector block.
  const signal = (sector, name) => {
    const from = sectors.indexOf(`sectorProfile.sector === "${sector}"`);
    const line = sectors.slice(from).split("\n").find((l) => l.includes(`const ${name} =`));
    const m = line.match(/\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n[])+)\/([a-z]*)\.test\(text\)/);
    return new RegExp(m[1], m[2]);
  };
  const cases = [
    ["automotive", "workshopSignal", ["APK-keuring en onderhoud", "Banden wisselen"], ["Welkom bij ons bedrijf"]],
    ["automotive", "appointmentSignal", ["Plan je afspraak online", "Book a service"], ["Bel 020-1234567", "Maak een proefrit"]],
    ["automotive", "inventorySignal", ["Bekijk onze occasions", "Auto's te koop"], ["APK-keuring"]],
    ["home_services", "serviceSignal", ["Uw loodgieter voor verstopping", "Installatie van zonnepanelen"], ["Lees onze blog"]],
    ["home_services", "quoteSignal", ["Vraag een offerte aan"], ["Over ons"]],
    ["hospitality", "openingSignal", ["Openingstijden: ma-vr 9-17", "Opening hours"], ["Office hours for support", "Happy hours"]],
    ["hospitality", "menuSignal", ["Bekijk de menukaart", "Lunch en diner", "View our menu"], ["Open menu", "Hoofdmenu sluiten"]],
    ["hospitality", "reservationSignal", ["Reserveer een tafel"], ["Neem contact op"]],
    ["health_wellness", "treatmentSignal", ["Fysiotherapie en behandelingen", "Tandartspraktijk"], ["Our services", "Customer services"]],
    ["professional_services", "expertiseSignal", ["Uw notaris in Utrecht", "Ervaren accountant"], ["Welkom"]],
    ["saas_b2b", "featureSignal", ["Bekijk alle features", "Integraties met je boekhouding"], ["Over ons team"]],
    ["saas_b2b", "audienceSignal", ["Software voor bedrijven", "Built for teams"], ["Business news", "Ons team"]],
  ];
  for (const [sector, name, yes, no] of cases) {
    const re = signal(sector, name);
    for (const text of yes) assert.equal(re.test(text), true, `${sector}.${name} should match "${text}"`);
    for (const text of no) assert.equal(re.test(text), false, `${sector}.${name} must not match "${text}"`);
  }
  // Author needs an explicit byline and a capitalised name; "door de" or "by Google" style text is not enough.
  const author = sectors.split("\n").find((l) => l.includes("const authorSignal ="));
  const authorRe = new RegExp(...author.match(/\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n[])+)\/([a-z]*)\.test\(text\)/).slice(1));
  assert.equal(authorRe.test("Geschreven door Anna de Vries"), true);
  assert.equal(authorRe.test("Auteur: Mark Jansen"), true);
  assert.equal(authorRe.test("Gemaakt door de klant"), false);
  assert.equal(authorRe.test("Powered by Google"), false);
});

// --- Security Engine: false positives and false negatives per signal ---

test("security FP/FN 1: real mixed content vs ordinary HTTP links", () => {
  const realMixed = [
    ['<IMG SRC = "http://cdn.example.nl/a.png">', "http://cdn.example.nl/a.png"],
    ['<video poster="http://cdn.example.nl/p.jpg"></video>', "http://cdn.example.nl/p.jpg"],
    ['<audio src="http://cdn.example.nl/a.mp3"></audio>', "http://cdn.example.nl/a.mp3"],
    ['<object data="http://cdn.example.nl/x.swf"></object>', "http://cdn.example.nl/x.swf"],
    ['<link href="http://cdn.example.nl/f.woff2" rel="preload" as="font">', "http://cdn.example.nl/f.woff2"],
    ['<link rel="icon" href="http://cdn.example.nl/favicon.ico">', "http://cdn.example.nl/favicon.ico"],
  ];
  for (const [html, url] of realMixed) assert.deepEqual(findMixedContent(html), [url], html); // no false negatives
  const notMixed = [
    '<A HREF="http://partner.example.org">Partner</A>',
    '<link rel="canonical" href="http://shop.nl/">',
    '<link rel="alternate" hreflang="de" href="http://shop.de/">',
    '<meta property="og:url" content="http://shop.nl/">',
    '<form action="http://forms.example.org/x"></form>',
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<img src="https://cdn.example.nl/a.png" srcset="https://cdn.example.nl/b.png 2x">',
    '<script>var u = "http://api.example.org/";</script>',
  ];
  for (const html of notMixed) assert.deepEqual(findMixedContent(html), [], html); // no false positives
  assert.equal(assessPassiveSecurity({ isHttps: false, html: realMixed[0][0], pageUrl: "http://shop.nl/", setCookies: [] }).mixedContent.status, "not_applicable");
});

test("security FP/FN 2: versioned third-party scripts without SRI vs dynamic scripts", () => {
  const page = "https://shop.nl/";
  const versioned = [
    "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
    "https://unpkg.com/htmx.org@1.9.12",
    "https://cdn.example.com/wp-includes/js/jquery/jquery.min.js?ver=3.7.1",
    "https://cdn.example.com/lib/v2.4.0/widget.js",
  ];
  for (const src of versioned) assert.deepEqual(analyzeScriptIntegrity(`<script src="${src}"></script>`, page).missingVersioned, [src], src);
  const dynamic = [
    "https://www.googletagmanager.com/gtag/js?id=G-ABC123",
    "https://js.stripe.com/v3/",
    "https://maps.googleapis.com/maps/api/js?key=AIzaSyA-example&v=weekly",
    "https://connect.facebook.net/en_US/fbevents.js",
  ];
  for (const src of dynamic) {
    const result = analyzeScriptIntegrity(`<script async src="${src}"></script>`, page);
    assert.deepEqual([result.missingVersioned, result.missingDynamic], [[], [src]], src);
  }
  assert.equal(analyzeScriptIntegrity('<script src="/static/app.4f3a.js"></script>', page).crossOrigin, 0);
  assert.deepEqual(analyzeScriptIntegrity(`<script src="${versioned[0]}" integrity="sha384-x" crossorigin="anonymous"></script>`, page).missingVersioned, []);
  assert.equal(assessPassiveSecurity({ isHttps: true, html: dynamic.map((src) => `<script src="${src}"></script>`).join(""), pageUrl: page, setCookies: [] }).scriptIntegrity.status, "pass");
  assert.equal(assessPassiveSecurity({ isHttps: true, html: `<script src="${versioned[1]}"></script>`, pageUrl: page, setCookies: [] }).scriptIntegrity.status, "warning");
});

test("security FP/FN 3: exposed secrets vs public identifiers and documentation", () => {
  const aws = "AKIA" + "Q3EGRZ7LW5MNXK2P";
  const gh = "ghp_" + "Zx9Qm2Lr7Tb4Vn8Kc1Hs6Pd3Wf5Gy0Ja8Nu4E";
  const pemBody = "MIIEowIBAAKCAQEA7dQ3x9Lq2Vh8Pz4Kn6Tr1Ws5Yb0Ec3Gu7Jm9Na2Df4Hk6Lp8Qs".repeat(2);
  const leaks = [
    [`<script type="application/json">{"aws":"${aws}"}</script>`, "AWS access key"],
    [`<script>const token = '${gh}';</script>`, "GitHub token"],
    [`<script>var key = \`-----BEGIN PRIVATE KEY-----\n${pemBody}\`;</script>`, "private key"],
    ['<script>fetch("/api",{headers:{"Authorization":"Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5In0.Qm7Zr2Lx"}})</script>', "generic bearer token"],
  ];
  for (const [html, label] of leaks) assert.deepEqual(findExposedSecrets(html), [label], label); // no false negatives
  const publicOrExample = [
    '<script>firebase.initializeApp({apiKey:"AIzaSyD-public-browser-key-123456"})</script>', // public browser key by design
    '<script>Stripe("pk_live_51H8xQ2EXAMPLEpublishable")</script>', // publishable key
    '<script>gtag("config","G-1A2B3C4D5E")</script>', // measurement ID
    '<script>mapboxgl.accessToken="pk.eyJ1IjoicmFua2ZpeCJ9.public"</script>', // public token
    "<p>Use AKIAIOSFODNN7EXAMPLE in the tutorial.</p>",
    `<pre><code>export AWS_ACCESS_KEY_ID=${aws}</code></pre>`,
    "<p>The file begins with -----BEGIN RSA PRIVATE KEY----- and ends with the footer.</p>",
    "<p>Send Authorization: Bearer YOUR_ACCESS_TOKEN_HERE in every request.</p>",
    "<!-- old token ghp_" + "Zx9Qm2Lr7Tb4Vn8Kc1Hs6Pd3Wf5Gy0Ja8Nu4E -->",
  ];
  for (const html of publicOrExample) assert.deepEqual(findExposedSecrets(html), [], html); // no false positives
});

test("security FP/FN 4: multiple Set-Cookie headers and Secure/HttpOnly/SameSite", () => {
  const headers = new Headers();
  headers.append("set-cookie", "SID=a; Path=/; SECURE; HTTPONLY; SameSite=Strict");
  headers.append("set-cookie", "prefs=dark,large; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; Secure; SameSite=None");
  headers.append("set-cookie", "auth_token=x; Path=/; Secure; SameSite=Lax");
  headers.append("set-cookie", "theme=HttpOnly; Path=/; SameSite=bogus");
  const values = setCookieValues(headers);
  assert.equal(values.length, 4);
  const result = assessPassiveSecurity({ isHttps: true, html: "", pageUrl: "https://shop.nl/", setCookies: values }).cookieFlags;
  assert.deepEqual(result.cookies.map((c) => [c.name, c.secure, c.httpOnly, c.sameSite, c.sessionLike]), [
    ["SID", true, true, "strict", true],
    ["prefs", true, false, "none", false],
    ["auth_token", true, false, "lax", true],
    ["theme", false, false, "missing", false], // a value "HttpOnly" is not the attribute; invalid SameSite counts as missing
  ]);
  assert.deepEqual([result.missingSecure, result.missingSameSite, result.sessionMissingHttpOnly], [["theme"], ["theme"], ["auth_token"]]);
  assert.deepEqual([result.status, result.issues, result.points, result.maxPoints], ["warning", 3, 2, 5]);
  // HTTP pages do not require Secure; no cookies means unable to confirm, not pass.
  assert.deepEqual(assessPassiveSecurity({ isHttps: false, html: "", pageUrl: "http://shop.nl/", setCookies: ["s=1; SameSite=Lax"] }).cookieFlags.status, "pass");
  assert.equal(assessPassiveSecurity({ isHttps: true, html: "", pageUrl: "https://shop.nl/", setCookies: [] }).cookieFlags.status, "unable_to_confirm");
  // Joined header fallback keeps Expires commas inside one cookie.
  assert.deepEqual(splitSetCookieHeader("a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT, b=2; Secure").length, 2);
});

test("security 5: results and scores before (main) and after the fixes", () => {
  const keys = ["mixedContent", "cookieFlags", "forms", "exposedSecrets", "scriptIntegrity"];
  const expected = {
    "modern shop": { before: ["pass", "warning", "not_applicable", "pass", "pass", 86], after: ["pass", "warning", "pass", "pass", "warning", 88] },
    "documentation site": { before: ["pass", "unable_to_confirm", "not_applicable", "fail", "pass", 50], after: ["pass", "unable_to_confirm", "not_applicable", "pass", "pass", 100] },
    "leaky site": { before: ["pass", "warning", "not_applicable", "pass", "pass", 86], after: ["fail", "warning", "fail", "fail", "pass", 23] },
    "plain links only": { before: ["pass", "unable_to_confirm", "not_applicable", "pass", "pass", 100], after: ["pass", "unable_to_confirm", "not_applicable", "pass", "pass", 100] },
  };
  for (const page of securityPages) {
    const before = legacyPassiveSecurity({ isHttps: true, html: page.html, pageUrl: page.url, joinedSetCookie: page.setCookies.join(", ") });
    const after = assessPassiveSecurity({ isHttps: true, html: page.html, pageUrl: page.url, setCookies: page.setCookies });
    assert.deepEqual([...keys.map((k) => before[k].status), securityScore(keys.map((k) => before[k]))], expected[page.name].before, `${page.name} before`);
    assert.deepEqual([...keys.map((k) => after[k].status), securityScore(keys.map((k) => after[k]))], expected[page.name].after, `${page.name} after`);
  }
  // Evidence behind the leaky-site result.
  const leaky = assessPassiveSecurity({ isHttps: true, html: securityPages[2].html, pageUrl: securityPages[2].url, setCookies: securityPages[2].setCookies });
  assert.deepEqual(leaky.mixedContent.urls, ["http://cdn.leaky.example.nl/hero.jpg"]);
  assert.deepEqual(leaky.exposedSecrets.labels, ["AWS access key"]);
  assert.equal(leaky.forms.insecureActions, 1);
  // main misread the modern shop's cookies: one cookie, no flags.
  const legacyShop = legacyPassiveSecurity({ isHttps: true, html: "", pageUrl: securityPages[0].url, joinedSetCookie: securityPages[0].setCookies.join(", ") });
  assert.deepEqual(legacyShop.detail.cookies.map((c) => [c.name, c.secure, c.httpOnly]), [["sid", false, false]]);
});

test("retail sector evidence wins over incidental sector words without claiming verified checkout", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const retailAssortmentIdentity =/);
  assert.match(source, /const explicitRetailIdentity = storeSchemaRetailIdentity \|\| \(retailAssortmentIdentity/);
  assert.match(source, /const retailPrimaryIdentity = retailPurchaseEvidence/);
  assert.match(source, /const primaryNonCommerceIdentity = retailPrimaryIdentity \? null/);
  assert.match(source, /commerceAsPrimaryIdentity = !telecomProviderIdentity && \(retailPrimaryIdentity/);
  assert.match(source, /commerceHints: Boolean\(retailPrimaryIdentity/);
  assert.match(source, /!retailPrimaryIdentity && !finalCommerceDecision\.confirmed && reconciledIdentityStrong/);
  assert.match(source, /explicitRetailIdentity && !evidenceCommerceConfirmed \? 78/);
  assert.match(source, /!shortStayIdentity && !realEstateIdentity && !automotiveServiceIdentity/);
});

test("street addresses exclude adjacent navigation and contact labels", () => {
  assert.equal(findVisibleAddress("Of chat Dutch Wegtersweg 1 7556 BP Hengelo Nederland"), "Wegtersweg 1, 7556 BP Hengelo");
  assert.equal(findVisibleAddress("Adres gegevens Artiscent Wellness Kanaalkade 48 1811LS Alkmaar Tel"), "Kanaalkade 48, 1811LS Alkmaar");
  assert.equal(findVisibleAddress("Contact Vestiging Aalsmeer F.A. Wentstraat 2b 1431 KZ Aalsmeer Vestiging Westland"), "F.A. Wentstraat 2b, 1431 KZ Aalsmeer");
  assert.equal(findVisibleAddress("Menu Toggle About Contact"), null);
});

test("privacy evidence belongs to scanned site, not embedded providers", () => {
  assert.equal(isFirstPartyLegalLink("/privacy", "https://www.kwik-fit.nl/"), true);
  assert.equal(isFirstPartyLegalLink("https://www.kwik-fit.nl/privacy", "https://kwik-fit.nl/"), true);
  assert.equal(isFirstPartyLegalLink("https://policies.google.com/privacy", "https://www.kwik-fit.nl/"), false);
  assert.equal(isFirstPartyLegalLink("https://privacy.kwik-fit.nl/beleid", "https://www.kwik-fit.nl/"), true);
  assert.equal(isFirstPartyLegalLink("https://kwik-fit.nl.attacker.example/privacy", "https://kwik-fit.nl/"), false);
});

test("FAQ evidence requires actual answers, not just generic accordions", () => {
  assert.equal(confirmedFaqContent('<h2>FAQ</h2><p>Welkom bij onze winkel</p>'), false);
  assert.equal(confirmedFaqContent('<details><summary>Instellingen</summary>Menu links</details>'), false);
  assert.equal(confirmedFaqContent('<details><summary>Hoe werkt retourneren?</summary><p>Stuur het product binnen 30 dagen terug.</p></details>'), true);
  assert.equal(confirmedFaqContent('<h2>Wanneer wordt mijn bestelling verzonden?</h2><p>De bestelling wordt de volgende werkdag verzonden.</p>'), true);
});

test("webshop delivery and returns claims are detected in marketing text", () => {
  const coolblue = "Beste webwinkel. Voor 23.59u besteld? Morgen gratis bezorgd. Gratis retourneren.";
  const found = findWebshopClaims(coolblue).join(" | ");
  assert.match(found, /23\.59u besteld/i);
  assert.match(found, /morgen gratis bezorgd/i);
  assert.match(found, /gratis retourneren/i);
  assert.deepEqual(findWebshopClaims("Wij verkopen elektronica en accessoires."), []);
});

test("internal customer ID exemption requires exact server authorization", () => {
  const customerId = "RF-70AD123D15B3453BA65FD8E21F4E2D2C";
  assert.equal(isInternalTesterCustomerId(customerId, {}), false);
  assert.equal(isInternalTesterCustomerId(customerId, { RANKFIX_INTERNAL_TEST_CUSTOMER_ID: customerId }), true);
  assert.equal(isInternalTesterCustomerId("RF-00000000000000000000000000000000", { RANKFIX_INTERNAL_TEST_CUSTOMER_ID: customerId }), false);
  assert.equal(isInternalTesterCustomerId(customerId, { RANKFIX_INTERNAL_TEST_CUSTOMER_ID: "invalid" }), false);
});

test("KPN-like telecom provider: storefront-wide checks do not masquerade as primary audit gaps", async () => {
  // Concrete regression: a telecom homepage with subscription prices and a
  // sampled phone product URL, but without proven separate retail checkout.
  const storeOnly = [
    "merchant_feed_signal", "webshop_trust", "checkout_funnel_static",
    "checkout_trust", "eu_review_transparency_signal", "eu_consumer_information_signal",
    "webshop_claims", "commercial_terms_signal",
  ];
  for (const key of storeOnly) {
    assert.equal(isStorefrontOnlyForService(key, true, false), true, key);
    assert.equal(isStorefrontOnlyForService(key, false, false), false, key);
    assert.equal(isStorefrontOnlyForService(key, true, true), false, key);
  }
  // A provider can also sell phones: product detail, pricing and subscription
  // evidence must still be evaluated (or honestly marked unconfirmed).
  for (const key of ["merchant_product_readiness", "product_schema", "product_availability", "product_price_consistency", "price_format", "subscription_price_visibility"]) {
    assert.equal(isStorefrontOnlyForService(key, true, false), false, key);
  }
  const route = await import("node:fs/promises").then(({readFile})=>readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8"));
  assert.match(route, /isStorefrontOnlyForService\(item\.key, Boolean\(primaryNonCommerceIdentity\), finalCommerceDecision\.confirmed\)/);
  assert.match(route, /De primaire activiteit is dienstverlening zonder onafhankelijk bevestigde retailcheckout/);
});

test("scan summary matches final check statuses after commerce and sector reconciliation", async () => {
  const data = [
    {key:"title",issue_status:"PASS",points:10,maxPoints:10},
    {key:"merchant_feed_signal",issue_status:"NOT_APPLICABLE",points:0,maxPoints:4},
    {key:"checkout_trust",issue_status:"NOT_APPLICABLE",points:0,maxPoints:5},
    {key:"schema",issue_status:"UNABLE_TO_CONFIRM",points:0,maxPoints:12},
  ];
  const early = summarizeAuditChecks(data);
  // When representative commerce evidence changes the final applicability,
  // pre-reconciliation counts MUST NOT be written into the final report.
  data[1].issue_status = "UNABLE_TO_CONFIRM";
  data[2].issue_status = "UNABLE_TO_CONFIRM";
  const final = summarizeAuditChecks(data);
  assert.equal(early.notApplicable, 2);
  assert.equal(final.notApplicable, 0);
  assert.equal(final.unableToConfirm, 3);
  assert.equal(final.unableToConfirm, data.filter(item=>item.issue_status==="UNABLE_TO_CONFIRM").length);
  assert.equal(final.notApplicable, data.filter(item=>item.issue_status==="NOT_APPLICABLE").length);

  const {readFile} = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const applicabilityEnd = route.indexOf("if (!shopWordingApplies(finalCommerceApplicability");
  const finalSummary = route.lastIndexOf("scanSummary = summarizeAuditChecks(checks);");
  const firstSave = route.indexOf("INSERT INTO scans (user_id");
  assert.ok(applicabilityEnd > 0 && finalSummary > applicabilityEnd, "summary must be recalculated after final commerce gate");
  assert.ok(firstSave > finalSummary, "the final counts must be available before saving report to history");
  assert.match(route, /summary: scanSummary/);
});

test("cookie link is only required when cookies or trackers are observed", async () => {
  const { readFile: rf } = await import("node:fs/promises");
  const source = await rf(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const cookieSignalOk = hasCookieLink \|\| !cookieUseObserved;/);
  assert.match(source, /!cookieSignalOk\?"cookies":null/);
  assert.doesNotMatch(source, /!hasCookieLink\?"cookies":null/);
});

test("cart/checkout signals never confirm a working checkout", async () => {
  const { readFile: rf } = await import("node:fs/promises");
  const source = await rf(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /check\("pass","checkout_funnel_static"/);
  assert.doesNotMatch(source, /check\("pass","checkout_trust"/);
});

test("canonical to the same page without query parameters is equivalent, not a warning", async () => {
  const { readFile: rf } = await import("node:fs/promises");
  const source = await rf(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /function canonicalEquivalent\(canonical: URL, page: URL\): boolean/);
  assert.match(source, /canonicalEquivalent\(resolved, finalCandidate\)\?"PASS":"WARNING"/);
  // Long homepage descriptions: advice, no deduction.
  assert.match(source, /description\.length > 160\n\s+\? check\("pass", "description"/);
});
