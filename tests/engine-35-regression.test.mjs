import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evidenceLevel } from "../lib/audit-score.ts";
import { scoreQualifier } from "../lib/score-qualifier.ts";
import { assessBusinessDetails, findBusinessContactDetails, findCompanyRegistration, findPlaceholderRegistration, isPlaceholderAddress, isPlaceholderEmail, isPlaceholderPhone } from "../lib/contact-evidence.ts";
import { countIndependentProducts, refineSamplePageType, SERVICE_INTENT } from "../lib/sample-quality.ts";
import { botManagerHeaders, isReducedBotResponse, stripTrackingParams } from "../lib/report-quality.ts";
import { annotateEvidenceSources, evidenceSourceFor } from "../lib/evidence-source.ts";
import { enforceReportConsistency } from "../lib/report-consistency.ts";

// RankFix 3.5 engine pass (17 Oct 2026). Generic failure classes from field
// reports; every case is synthetic and brand-free. Positive AND negative controls.

test("1. score certainty: one unconfirmed check is never 'Definitief'", () => {
  assert.equal(evidenceLevel({ coveragePercent: 92, javascriptRequiredButNotRendered: false, unconfirmed: 3 }).level, "provisional");
  assert.equal(evidenceLevel({ coveragePercent: 99, javascriptRequiredButNotRendered: false, unconfirmed: 1 }).level, "provisional");
  assert.equal(evidenceLevel({ coveragePercent: 100, javascriptRequiredButNotRendered: false, unconfirmed: 0 }).level, "complete");
  // An old stored "complete" at 92% is shown as provisional with its range.
  const q = scoreQualifier({ overallScore: 98, coverage: { coveragePercent: 92 }, scoreModel: { evidenceLevel: "complete", range: { low: 90, high: 99 } } }, "nl");
  assert.equal(q.level, "provisional");
  assert.doesNotMatch(q.label, /Definitief/);
  assert.match(q.detail, /90–99/);
  for (const l of ["en", "de", "fr", "it", "es"]) assert.notEqual(scoreQualifier({ coverage: { coveragePercent: 92 }, scoreModel: { evidenceLevel: "complete" } }, l).level, "complete");
});

test("3. bot managers: header-only detection, CDN headers alone are not a bot manager", () => {
  assert.deepEqual(botManagerHeaders([["x-datadome", "protected"], ["content-type", "text/html"]]), ["x-datadome"]);
  assert.deepEqual(botManagerHeaders([["server", "AkamaiGHost"], ["cf-ray", "abc"], ["x-cache", "HIT"]]), []);
  assert.equal(isReducedBotResponse({ botCookies: [], botHeaders: ["x-datadome"], jsonLdBlocks: 0, ogTags: 0, h1Count: 0 }), true);
  assert.equal(isReducedBotResponse({ botCookies: [], botHeaders: ["x-datadome"], jsonLdBlocks: 0, ogTags: 0, h1Count: 1, visibleWords: 60, descriptionPresent: false }), true);
  // A bot manager in front of a complete page is harmless.
  assert.equal(isReducedBotResponse({ botCookies: ["__cf_bm"], botHeaders: [], jsonLdBlocks: 2, ogTags: 4, h1Count: 1 }), false);
  assert.equal(isReducedBotResponse({ botCookies: [], botHeaders: ["x-datadome"], jsonLdBlocks: 0, ogTags: 0, h1Count: 1, visibleWords: 800, descriptionPresent: true }), false);
  // No bot manager: missing metadata is a real finding.
  assert.equal(isReducedBotResponse({ botCookies: [], botHeaders: [], jsonLdBlocks: 0, ogTags: 0, h1Count: 0 }), false);
});

const sample = { proposed: "other", productSchema: false, itemListSchema: false, repeatedProductLinks: false, productOffer: false, purchaseAction: false, visiblePrices: 0, uniqueH1: true, detailIdentity: false };
test("4. page types from content in EU languages, URL shape is only a hint", () => {
  const own = (title) => SERVICE_INTENT.test(title);
  for (const t of ["Envoyer un colis : tarifs et délais", "Spedire un pacco in Italia", "Konto firmowe – otwórz online", "Leasing dla firm – złóż wniosek", "Girokonto eröffnen", "Solicitar una tarjeta", "Pakket versturen naar het buitenland", "Open an account in minutes", "Abrir conta online"]) assert.ok(own(t), t);
  for (const t of ["Nieuwe herfstcollectie jassen", "Moneta d'argento 2026", "Sneakers voor heren"]) assert.ok(!own(t), t);
  assert.equal(refineSamplePageType({ ...sample, path: "/particulier/envoyer-un-colis", serviceEvidence: true }), "service");
  assert.equal(refineSamplePageType({ ...sample, path: "/firmy/leasing", serviceEvidence: true }), "service");
  // A catalogue-like URL without products, prices or purchase actions is not a product category.
  assert.equal(refineSamplePageType({ ...sample, proposed: "category", path: "/particulier/catalogue", serviceEvidence: true }), "service");
  assert.notEqual(refineSamplePageType({ ...sample, proposed: "category", path: "/catalogue/" }), "category");
  // With commerce on the page it stays a category; a real product stays a product.
  assert.equal(refineSamplePageType({ ...sample, proposed: "category", path: "/catalogue/", visiblePrices: 8, purchaseAction: true, productSchemaCount: 6 }), "category");
  assert.equal(refineSamplePageType({ ...sample, proposed: "product", path: "/negozio/moneta", productSchema: true, productOffer: true, purchaseAction: true, visiblePrices: 1, serviceEvidence: true }), "product");
  // Dated articles are articles in any language and path.
  assert.equal(refineSamplePageType({ ...sample, path: "/o-nas/komunikaty/zmiana-godzin", datedArticle: true }), "article");
  // Corporate pages are not turned into services by their wording.
  assert.equal(refineSamplePageType({ ...sample, path: "/about-us", serviceEvidence: true }), "corporate");
});

test("6. related products nested in a product page do not make it a category", () => {
  const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
  const p = (n) => ({ "@type": "Product", name: n });
  assert.equal(countIndependentProducts(ld({ ...p("A"), isRelatedTo: [p("B"), p("C")], hasVariant: [p("A-red")] })), 1);
  assert.equal(countIndependentProducts(ld({ "@type": "ItemList", itemListElement: [{ "@type": "ListItem", item: p("A") }, { "@type": "ListItem", item: p("B") }] })), 2);
  assert.equal(countIndependentProducts(ld({ "@graph": [p("A"), p("B"), p("C")] })), 3);
  assert.equal(countIndependentProducts("<script type='application/ld+json'>{broken</script>"), 0);
});

test("8. tracking parameters of common EU analytics tools never create a second sample page", () => {
  for (const q of ["xtor=CS1-24", "at_medium=affiliate&at_campaign=x", "srsltid=AfmBOo", "pk_campaign=x", "mtm_source=x", "wt_mc=x", "utm_source=a&utm_medium=b", "gclid=1", "mkt_tok=abc"]) {
    assert.equal(stripTrackingParams(`https://site.test/diensten/a?${q}`), "https://site.test/diensten/a", q);
  }
  // Functional parameters stay.
  assert.equal(stripTrackingParams("https://site.test/zoek?id=42&lang=fr"), "https://site.test/zoek?id=42&lang=fr");
});

test("9. evidence provenance per check", () => {
  assert.equal(evidenceSourceFor("status", "https://a.test/", "https://a.test/", "raw_html"), "http_response");
  assert.equal(evidenceSourceFor("robots_txt", "", "https://a.test/", "raw_html"), "robots_txt");
  assert.equal(evidenceSourceFor("broken_links", "", "https://a.test/", "raw_html"), "link_check");
  assert.equal(evidenceSourceFor("title", "https://a.test", "https://a.test/", "rendered_html"), "rendered_html");
  assert.equal(evidenceSourceFor("product_schema", "https://a.test/p/1", "https://a.test/", "raw_html"), "representative_sample");
  const checks = annotateEvidenceSources([{ key: "title", evidence: { url: "https://a.test/", found: true, details: "x" } }, { key: "h1" }], "https://a.test/", "raw_html");
  assert.deepEqual(checks.map((c) => c.evidence.source), ["raw_html", "raw_html"]);
});

test("10. example/test contact data is never business evidence (multi-language), real data still is", () => {
  for (const e of ["info@example.com", "test@domain.com", "naam@jouwdomein.nl", "kontakt@beispiel.de", "contact@exemple.fr", "max.mustermann@firma.de", "info@shop.test"]) assert.ok(isPlaceholderEmail(e, "realshop.nl"), e);
  for (const e of ["info@bakkerij-jansen.nl", "service@mail.example-free.nl".replace("example-free", "postbus"), "hello@company-name.eu"]) assert.ok(!isPlaceholderEmail(e, "bakkerij-jansen.nl"), e);
  assert.equal(isPlaceholderEmail("info@site.test", "site.test"), false, "the site's own domain is never a placeholder");
  for (const p of ["+31 6 12345678", "020-123 45 67", "0123456789", "+49 30 1234567", "06-00000000", "(555) 555-0123"]) assert.ok(isPlaceholderPhone(p), p);
  for (const p of ["+31 20 547 8812", "030 231 4477", "+33 1 44 87 52 10", "+48 22 637 44 10"]) assert.ok(!isPlaceholderPhone(p), p);
  for (const a of ["Teststraat 1, 1234 AB Voorbeeldstad", "Musterstraße 5, 12345 Musterstadt", "Kerkstraat 1, 1234 AB Amsterdam"]) assert.ok(isPlaceholderAddress(a), a);
  assert.ok(!isPlaceholderAddress("Oudegracht 211, 3511 NH Utrecht"));
  assert.equal(findCompanyRegistration("KvK 12345678"), null);
  assert.equal(findPlaceholderRegistration("KvK 12345678"), "KvK 12345678");
  assert.equal(findCompanyRegistration("KvK 30187264"), "KvK 30187264");
  const fake = findBusinessContactDetails("Teststraat 1, 1234 AB Voorbeeldstad · info@example.com · +31 6 12345678", "", "schilder.nl");
  const r = assessBusinessDetails({ placeholders: [], details: fake, registration: null, testRegistration: "KvK 12345678", schemaContact: false, thinShell: false });
  assert.equal(r.status, "warning");
  // A test value next to a real detail: the real detail counts (no penalty).
  const mixed = findBusinessContactDetails("Bel 030 231 4477 of mail info@example.com", "", "schilder.nl");
  assert.equal(mixed.phone, "030 231 4477");
  assert.equal(mixed.email, null);
  assert.equal(assessBusinessDetails({ placeholders: [], details: mixed, registration: null, schemaContact: false, thinShell: false }).status, "pass");
  assert.equal(findBusinessContactDetails("", '<a href="mailto:test@example.com">mail</a><a href="tel:0612345678">bel</a>', "x.nl").mailtoLink, false);
});

const chk = (key, issue_status, points, maxPoints, message = "ok") => ({ key, category: "seo", status: issue_status.toLowerCase(), issue_status, points, maxPoints, message, evidence: { url: "https://a.test/", found: null, details: message } });
const base = (checks, extra = {}) => enforceReportConsistency({ sector: { sector: "transport_travel", key: "postal_logistics", label: "Post- & pakketvervoer", confidence: "high", confidenceScore: 90, evidence: [], applicableModules: ["core_seo"] }, checks, scannedUrl: "https://a.test/", scores: { seo: 96, geo: 96, overall: 96, mode: "both" }, range: { low: 96, high: 96 }, coveragePercent: 100, ...extra });

test("7. self-check: final score, product wording, HTTP status and absolute claims stay consistent", () => {
  const a = base([chk("title", "PASS", 8, 8), chk("faq", "UNABLE_TO_CONFIRM", 0, 3)], { evidenceLevel: "complete" });
  assert.equal(a.evidenceLevel, "provisional");
  assert.ok(a.selfCheck.corrections.some((c) => c.code === "final_score_with_unconfirmed"));
  const ok = base([chk("title", "PASS", 8, 8)], { evidenceLevel: "complete" });
  assert.equal(ok.evidenceLevel, "complete");
  assert.equal(ok.selfCheck.corrections.length, 0);
  const na = chk("product_schema", "NOT_APPLICABLE", 0, 6, "De primaire activiteit is dienstverlening en er zijn geen producten of productpagina's gevonden die deze productcontrole nodig maken.");
  const b = base([na], { sampledProductPages: 2 });
  assert.ok(b.selfCheck.corrections.some((c) => c.code === "na_contradicts_product_sample"));
  assert.doesNotMatch(na.message, /geen producten/);
  const st = chk("status", "WARNING", 2, 6, "De pagina gaf HTTP 403 terug.");
  assert.ok(base([st], { scannedPageSampleStatus: 200 }).selfCheck.flags.some((f) => f.code === "http_status_contradiction"));
  const sec = { ...chk("security_headers", "PASS", 6, 6, "Alle headers aanwezig: de website is veilig."), category: "security" };
  const c = base([chk("title", "PASS", 8, 8)], { limitedChecks: [sec] });
  assert.ok(c.selfCheck.corrections.some((x) => x.code === "absolute_claim_in_limited_check"));
  assert.doesNotMatch(sec.message, /website is veilig/);
});

// End-to-end through the real scan route (17 synthetic sites, 6 languages).
test("engine 3.5 scenarios through the real scan route: all generic failure classes fixed", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-engine-35.mjs"], { cwd: root, encoding: "utf8", timeout: 240000 });
  const line = (out.stdout || "").split("\n").find((l) => l.startsWith("SCAN_MATRIX_RESULT "));
  assert.ok(line, (out.stderr || "").slice(-2000));
  const r = JSON.parse(line.slice("SCAN_MATRIX_RESULT ".length));
  assert.ok(r.total >= 17);
  assert.equal(r.failed, 0, out.stdout);
});
