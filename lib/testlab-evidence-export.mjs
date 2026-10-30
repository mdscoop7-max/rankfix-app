// Read-only evidence export for TestLab runs (priority 2: sector + webshop QA).
// Pure functions only: no browser, network or storage access, so the same code
// is used by the export page and by the Node tests. Nothing here scans, deletes
// or rewrites stored results; it only reshapes what an earlier scan returned.

export const EVIDENCE_EXPORT_VERSION = "fresh144-evidence-1";
const RESULT_PREFIX = "rankfix-qa-testlab-144:";

const clip = (value, max = 300) => {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
};
const list = (value, max = 40, len = 200) => Array.isArray(value) ? value.slice(0, max).map((x) => typeof x === "string" ? clip(x, len) : x) : [];
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; } };
const path = (url) => { try { return new URL(url).pathname || "/"; } catch { return String(url || ""); } };

// localStorage key → {catalogId, sha}. Baseline keys have no catalog segment.
export function parseResultKey(key) {
  if (typeof key !== "string" || !key.startsWith(RESULT_PREFIX)) return null;
  const rest = key.slice(RESULT_PREFIX.length).split(":");
  if (rest.length === 1 && /^[a-f0-9]{7,40}$/i.test(rest[0])) return { catalogId: "baseline", sha: rest[0] };
  if (rest.length === 2 && /^[a-f0-9]{7,40}$/i.test(rest[1])) return { catalogId: rest[0], sha: rest[1] };
  return null;
}

// JSON-LD can be huge (product feeds); keep only types and a short excerpt.
function jsonLdSummary(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 12).map((block) => {
    const raw = typeof block === "string" ? block : JSON.stringify(block);
    const types = [...new Set([...String(raw).matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)].flatMap((m) => m[1].replace(/[[\]"]/g, "").split(",").map((t) => t.trim()).filter(Boolean)))].slice(0, 20);
    return { types, excerpt: clip(raw, 1200) };
  });
}

function pageAuditSummary(page) {
  const ce = page?.commerceEvidence || null;
  return {
    path: path(page?.url),
    type: page?.type ?? null,
    status: page?.status ?? null,
    httpStatus: page?.httpStatus ?? null,
    nonContent: page?.nonContent ?? null,
    fetchFailure: clip(page?.fetchFailure, 160),
    evidenceSource: page?.evidenceSource ?? null,
    title: clip(page?.title, 200),
    description: clip(page?.description, 240),
    identityHeadings: list(page?.identityHeadings, 6, 160),
    schemaTypes: list(page?.schemaTypes, 15, 80),
    commerce: ce ? {
      productSchema: Boolean(ce.productSchema), productSchemaCount: ce.productSchemaCount ?? null,
      itemListSchema: Boolean(ce.itemListSchema), storeSchema: Boolean(ce.storeSchema),
      strongCommerceAction: Boolean(ce.strongCommerceAction), repeatedProductLinks: Boolean(ce.repeatedProductLinks),
      priceSignals: ce.priceSignals ?? null, confirmedRetailPage: Boolean(ce.confirmedRetailPage),
      financialOffer: Boolean(ce.financialOffer), eventSchema: Boolean(ce.eventSchema),
      product: ce.product ? { name: clip(ce.product.name, 120), price: ce.product.price ?? null, currency: ce.product.currency ?? null, availability: ce.product.availability ?? null } : null,
    } : null,
    productLinks: list(page?.productLinks, 5, 160).map(path),
    // Per-page check outcomes (H1, title, description, canonical …) so sampled-page
    // claims such as "0 H1" can be reviewed without the full audit.
    checks: Array.isArray(page?.evidenceChecks) ? page.evidenceChecks.slice(0, 12).map((c) => ({ key: c.key, status: c.status, details: clip(c.details, 220) })) : [],
  };
}

// Compact, reviewable evidence for one scan response. Every field is copied or
// truncated from the stored response; absent fields stay null (never invented).
export function summarizeScanResponse(data) {
  if (!data || typeof data !== "object") return null;
  const m = data.metrics || {};
  const mp = data.multiPage || {};
  const checks = [...(data.seo?.checks || []), ...(data.geo?.checks || [])];
  const commerceChecks = checks.filter((c) => /product|checkout|cart|merchant|shipping|return|price|webshop|commerce/i.test(String(c?.key || ""))).slice(0, 30)
    .map((c) => ({ key: c.key, status: c.status ?? null, message: clip(c.message || c.details, 220) }));
  return {
    request: { scannedUrl: data.scannedUrl ?? null, finalUrl: data.finalUrl ?? null, finalHost: host(data.finalUrl), httpStatus: data.httpStatus ?? null, scannedAt: data.scannedAt ?? null, scanDurationMs: data.scanDurationMs ?? null, runtime: data.runtime ?? null },
    access: data.access ?? null,
    hostFallback: data.hostFallback ?? null,
    rendering: data.rendering ? { mode: data.rendering.mode ?? null, completeness: data.rendering.completeness ?? null, evidenceSource: data.rendering.evidenceSource ?? null, javascriptExecuted: data.rendering.javascriptExecuted ?? null, fallbackReason: data.rendering.fallbackReason ?? null, fallbackDetail: clip(data.rendering.fallbackDetail, 300), partialNavigation: data.rendering.partialNavigation ?? null } : null,
    page: {
      title: clip(m.title, 300), description: clip(m.description, 400), h1s: list(m.h1s, 8, 200), lang: m.lang ?? null,
      canonical: m.canonical ?? null, ogTitle: clip(m.openGraph?.title, 200), ogDescription: clip(m.openGraph?.description, 300),
      wordCount: m.wordCount ?? null, internalLinks: m.internalLinks ?? null,
      // Added to the scan response on 30 Oct 2026; older stored audits do not have it.
      navigationLabels: Array.isArray(m.navigationLabels) ? list(m.navigationLabels, 80, 80) : null,
      schemaTypes: list(m.schemaTypes, 20, 80), jsonLd: jsonLdSummary(m.jsonLdBlocks),
      pricingCurrency: m.pricingCurrency ?? null, checkoutFunnel: m.checkoutFunnel ?? null,
    },
    classification: data.classification ?? null,
    pageTypeEvidence: data.pageTypeEvidence ?? null,
    sectorProfile: data.sectorProfile ?? null,
    websiteProfile: data.websiteProfile ?? null,
    technologyProfile: data.technologyProfile ?? null,
    commerceApplicability: data.commerceApplicability ?? null,
    evidenceLayer: data.evidenceLayer ? { evidence: data.evidenceLayer.evidence ?? null, sectorCandidates: data.evidenceLayer.sectorCandidates ?? null, master: data.evidenceLayer.master ?? null } : null,
    sample: {
      sectionCoverage: mp.sectionCoverage ?? null,
      sampleLinkSource: mp.sampleLinkSource ?? null, fallbackSources: mp.fallbackSources ?? null, sampleLimitation: mp.sampleLimitation ?? null,
      discoveredInternalUrls: mp.discoveredInternalUrls ?? null, siteAccess: mp.siteAccess ?? null,
      sitewideCommerceEvidence: mp.sitewideCommerceEvidence ?? null, representativeProduct: mp.representativeProduct ?? null,
      pages: Array.isArray(mp.pageAudits) ? mp.pageAudits.slice(0, 30).map(pageAuditSummary) : [],
    },
    commerceChecks,
    score: { overall: data.overallScore ?? null, seo: data.seo?.score ?? null, geo: data.geo?.score ?? null, evidenceLevel: data.scoreModel?.evidenceLevel ?? null },
    selfCheck: data.selfCheck ? { corrections: list(data.selfCheck.corrections, 20), reliability: data.selfCheck.reliability ?? null } : null,
  };
}

// One row per catalog host: the run result (status, verdict) plus the evidence
// of its stored audit, or an explicit reason why no evidence exists.
export function buildEvidenceRow({ site, result, audit, verdict }) {
  const status = result?.status ?? "nog_niet_getest";
  let evidenceState;
  if (!result) evidenceState = "not_tested";
  else if (status !== "succes") evidenceState = "scan_not_successful";
  else if (result.scanId && !result.qaAuditId) evidenceState = "stored_in_database";
  else if (!result.qaAuditId) evidenceState = "no_audit_id";
  else if (!audit) evidenceState = "audit_missing_in_browser";
  else evidenceState = "available";
  return {
    host: site?.host ?? result?.host ?? null,
    name: site?.name ?? null, country: site?.country ?? null, group: site?.group ?? null,
    expected: site?.expected ?? result?.expected ?? null,
    run: result ? {
      status, pending: Boolean(result.pending), http: result.http ?? null, reason: clip(result.reason, 240),
      sector: result.sector ?? null, sectorKey: result.sectorKey ?? null, websiteType: result.websiteType ?? null,
      commercePlatform: result.commercePlatform ?? null, industryVertical: result.industryVertical ?? null,
      confidence: result.confidence ?? null, evidenceLevel: result.evidenceLevel ?? null,
      score: result.score ?? null, seo: result.seo ?? null, geo: result.geo ?? null, at: result.at ?? null,
      incident: result.incident ?? null, scanId: result.scanId ?? null, qaAuditId: result.qaAuditId ?? null,
    } : null,
    verdict: verdict ?? null,
    evidenceState,
    evidence: evidenceState === "available" ? summarizeScanResponse(audit.result) : null,
  };
}

export function summarizeExport(rows) {
  const count = (fn) => rows.filter(fn).length;
  const by = (field) => rows.reduce((acc, r) => { const k = field(r) ?? "none"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  return {
    sites: rows.length,
    tested: count((r) => r.run),
    success: count((r) => r.run?.status === "succes"),
    withEvidence: count((r) => r.evidenceState === "available"),
    evidenceState: by((r) => r.evidenceState),
    verdicts: by((r) => r.verdict),
    status: by((r) => r.run?.status),
  };
}
