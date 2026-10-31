import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildEvidenceRow, parseResultKey, summarizeExport, summarizeScanResponse} from "../lib/testlab-evidence-export.mjs";

const scan = {
  success: true, scanId: null, scannedUrl: "https://shop.test/", finalUrl: "https://www.shop.test/", httpStatus: 200,
  rendering: { mode: "raw_html", javascriptExecuted: false, evidenceSource: "raw_html", fallbackReason: "RENDER_FAILED", fallbackDetail: "x".repeat(900) },
  metrics: { title: "Shop – woonaccessoires", description: "Bestel online", h1s: ["Nieuw binnen"], schemaTypes: ["Organization", "WebSite"],
    jsonLdBlocks: [{ "@type": ["Organization"], name: "Shop", huge: "y".repeat(50000) }], navigationLabels: ["Wonen", "Keuken", "Winkelmand"] },
  sectorProfile: { sector: "unknown", confidenceScore: 0, evidence: ["geen primaire identiteit"] },
  websiteProfile: { websiteType: { value: "unknown", status: "unconfirmed" } },
  multiPage: { sampleLinkSource: "rendered", pageAudits: [{ url: "https://www.shop.test/keuken/", type: "category", status: "audited", httpStatus: 200, title: "Keuken", commerceEvidence: { productSchema: false, itemListSchema: true, storeSchema: false, strongCommerceAction: true, repeatedProductLinks: true, priceSignals: 42, confirmedRetailPage: true, product: null } }] },
  seo: { score: 80, checks: [{ key: "product_schema", status: "not_applicable", message: "N.v.t." }, { key: "title", status: "pass" }] },
  geo: { score: 70, checks: [] }, overallScore: 76, scoreModel: { evidenceLevel: "provisional" },
};

test("result keys: baseline, catalog and foreign keys", () => {
  assert.deepEqual(parseResultKey("rankfix-qa-testlab-144:" + "a".repeat(40)), { catalogId: "baseline", sha: "a".repeat(40) });
  assert.deepEqual(parseResultKey("rankfix-qa-testlab-144:fresh144:faf8e6c9"), { catalogId: "fresh144", sha: "faf8e6c9" });
  assert.equal(parseResultKey("other:fresh144:abc"), null);
  assert.equal(parseResultKey("rankfix-qa-testlab-144:fresh144:not-a-sha"), null);
});

test("summary keeps identity, commerce and sample evidence, and bounds size", () => {
  const s = summarizeScanResponse(scan);
  assert.equal(s.page.title, "Shop – woonaccessoires");
  assert.deepEqual(s.page.h1s, ["Nieuw binnen"]);
  assert.deepEqual(s.page.navigationLabels, ["Wonen", "Keuken", "Winkelmand"]);
  assert.deepEqual(s.page.jsonLd[0].types, ["Organization"]);
  assert.ok(s.page.jsonLd[0].excerpt.length <= 1201);
  assert.ok(s.rendering.fallbackDetail.length <= 301);
  assert.equal(s.sample.pages[0].path, "/keuken/");
  assert.equal(s.sample.pages[0].commerce.priceSignals, 42);
  assert.equal(s.request.finalHost, "shop.test");
  assert.deepEqual(s.commerceChecks.map(c => c.key), ["product_schema"]);
  assert.ok(JSON.stringify(s).length < 20000);
});

test("older audits without navigation labels stay null instead of an empty proof", () => {
  const old = structuredClone(scan); delete old.metrics.navigationLabels;
  assert.equal(summarizeScanResponse(old).page.navigationLabels, null);
});

test("every missing-evidence reason is explicit, never a silent pass", () => {
  const site = { host: "shop.test", expected: "ecommerce" };
  const ok = { host: "shop.test", status: "succes", qaAuditId: "a1", sector: "unknown" };
  assert.equal(buildEvidenceRow({ site, result: null }).evidenceState, "not_tested");
  assert.equal(buildEvidenceRow({ site, result: { ...ok, status: "geblokkeerd" } }).evidenceState, "scan_not_successful");
  assert.equal(buildEvidenceRow({ site, result: { ...ok, qaAuditId: null, scanId: "db-1" } }).evidenceState, "stored_in_database");
  assert.equal(buildEvidenceRow({ site, result: { ...ok, qaAuditId: null } }).evidenceState, "no_audit_id");
  assert.equal(buildEvidenceRow({ site, result: ok, audit: null }).evidenceState, "audit_missing_in_browser");
  const row = buildEvidenceRow({ site, result: ok, audit: { result: scan }, verdict: "unconfirmed" });
  assert.equal(row.evidenceState, "available");
  assert.equal(row.evidence.sectorProfile.sector, "unknown");
  assert.equal(summarizeExport([row]).withEvidence, 1);
});

test("export page and component are read-only (no scan, write or delete)", () => {
  const src = readFileSync(new URL("../components/qa-evidence-export.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\/api\/scan|setItem|removeItem|localStorage\.clear|deleteObjectStore|\.delete\(|\.put\(|\.clear\(|"readwrite"/);
  assert.match(src, /indexedDB\.open\("rankfix-testlab-audits"\)/);
  const page = readFileSync(new URL("../app/dashboard/testlab/export/page.tsx", import.meta.url), "utf8");
  assert.match(page, /notFound\(\)/);
});
