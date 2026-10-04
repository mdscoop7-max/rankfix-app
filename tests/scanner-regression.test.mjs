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
  assert.match(source, /Een individuele auteur is niet vereist op de homepage van een nieuws- of mediasite/);
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
  assert.match(report, /Security-score:/);
  assert.match(report, /— \{c.title\} · \{t.labels.not_applicable\}/);
});


test("central classification bundle keeps transport, retail and canonical decisions aligned", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /transportBookingIdentityEarly/);
  assert.match(source, /transportRetailStoreEvidence/);
  assert.match(source, /!transportBookingIdentity && shopCatalogHrefCount/);
  assert.match(source, /strongArticleMarkupSignal/);
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
  assert.match(score, /SCORE_MODEL_VERSION = "2\.0-evidence"/);
  assert.match(score, /assessedWeight \/ totalWeight/);
  assert.match(route, /formula: mode === "both" \? "0\.6 × SEO \+ 0\.4 × GEO"/);
  assert.match(route, /securitySeparate: true/);
  assert.match(route, /coverageBasis: "assessed_weight \/ applicable_weight"/);
  assert.match(report, /Dekking:/);
  assert.match(report, /Beperkte dekking/);
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
  assert.equal(SCORE_MODEL_VERSION, "2.1-root-cause");
  assert.equal(score, 50);
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
  assert.match(source, /check\("warning", "response", "seo", "Server response"[\s\S]*één meting is traag/);
  assert.doesNotMatch(source, /check\("fail", "response", "seo", "Server response"/);
  assert.match(source, /check\("warning", "schema", "geo", "Structured data"[\s\S]*machineleesbare optimalisatiekans/);
  assert.match(source, /"schema": "structured_data_context"/);
  assert.match(source, /issue_id: key, rule_id: key/);
});
