// Turns one scanner response into a compact, comparable snapshot. Pure, so the
// classification rules are unit-tested without network or database. The
// snapshot never stores page text, contact details or secrets: only scores,
// classifications, rule ids and a one-way content fingerprint.
import { createHash } from "node:crypto";

export type ScanOutcome =
  | "scanned"        // scanner returned a report
  | "blocked"        // site refused (403/405/429/503, bot manager, challenge)
  | "http_error"     // site answered with another non-usable status
  | "timeout"        // scan did not finish inside the per-site budget
  | "scan_error"     // RankFix itself failed (5xx from the scanner)
  | "skipped";       // not scanned (disabled, awaiting approval, budget)

export type Finding = { rule: string; status: "FAIL" | "WARNING"; confidence: string; category: string };

export type RegressionSnapshot = {
  outcome: ScanOutcome;
  httpStatus: number | null;
  errorCode: string | null;
  durationMs: number | null;
  finalUrl: string | null;
  overallScore: number | null;
  seoScore: number | null;
  geoScore: number | null;
  securityScore: number | null;
  coveragePercent: number | null;
  highConfidencePercent: number | null;
  provisional: boolean;
  sector: { key: string; label: string; confidenceScore: number | null } | null;
  websiteType: string | null;
  pageType: { type: string; confidence: string } | null;
  pageTypeContradictions: string[];
  renderer: "javascript_rendered" | "raw_html" | null;
  renderFallbackReason: string | null;
  botProtection: boolean;
  recovery: { attempted: boolean; browserRecovered: boolean } | null;
  counts: { passed: number; issues: number; notApplicable: number; unableToConfirm: number } | null;
  findings: Finding[];
  fingerprint: string | null;
  scanner: { crawler: string | null; rules: string | null; scoreModel: string | null; commit: string | null };
};

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : {});
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

// Statuses a site uses to refuse automated visitors or to ask for a pause.
// They describe access, never SEO quality, and are never a RankFix regression.
const BLOCKING_STATUSES = new Set([401, 403, 405, 429, 503]);

export function emptySnapshot(outcome: ScanOutcome, extra: Partial<RegressionSnapshot> = {}): RegressionSnapshot {
  return {
    outcome, httpStatus: null, errorCode: null, durationMs: null, finalUrl: null,
    overallScore: null, seoScore: null, geoScore: null, securityScore: null,
    coveragePercent: null, highConfidencePercent: null, provisional: true,
    sector: null, websiteType: null, pageType: null, pageTypeContradictions: [],
    renderer: null, renderFallbackReason: null, botProtection: false, recovery: null,
    counts: null, findings: [], fingerprint: null,
    scanner: { crawler: null, rules: null, scoreModel: null, commit: null },
    ...extra,
  };
}

// Fingerprint of the page identity the scanner saw. A changed fingerprint means
// the site itself changed, so differences are not blamed on RankFix.
export function contentFingerprint(metrics: Json): string | null {
  const parts = [
    str(metrics.title) || "",
    str(metrics.description) || "",
    str(metrics.canonical) || "",
    Array.isArray(metrics.h1s) ? metrics.h1s.map((h) => String(h).trim()).join("|") : "",
    str(metrics.lang) || "",
    Array.isArray(metrics.schemaTypes) ? [...metrics.schemaTypes].map(String).sort().join(",") : "",
  ];
  if (!parts.some(Boolean)) return null;
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);
}

function findingsFrom(checks: unknown): Finding[] {
  if (!Array.isArray(checks)) return [];
  const seen = new Map<string, Finding>();
  for (const raw of checks) {
    const item = obj(raw);
    const status = String(item.issue_status || "").toUpperCase();
    if (status !== "FAIL" && status !== "WARNING") continue;
    const rule = str(item.rule_id) || str(item.issue_id) || str(item.key);
    if (!rule) continue;
    const finding: Finding = { rule, status, confidence: str(item.confidence) || "low", category: str(item.category) || "seo" };
    // One entry per rule; a FAIL outranks a WARNING for the same rule.
    const previous = seen.get(rule);
    if (!previous || (previous.status === "WARNING" && status === "FAIL")) seen.set(rule, finding);
  }
  return [...seen.values()].sort((a, b) => a.rule.localeCompare(b.rule));
}

export type ScanCall = {
  httpStatus: number;           // status returned by the RankFix scanner endpoint
  body: unknown;                // parsed JSON body, or null
  durationMs: number;
  timedOut?: boolean;
  scanner?: { crawler?: string | null; rules?: string | null; scoreModel?: string | null; commit?: string | null };
};

// Classifies one scanner call. The scanner returns 422 with a recovery object
// when the site refused or returned unusable HTML, 502 when it could not be
// fetched, 429 for RankFix's own rate limit and 5xx for internal errors.
export function snapshotFromScan(call: ScanCall): RegressionSnapshot {
  const scanner = {
    crawler: call.scanner?.crawler ?? null,
    rules: call.scanner?.rules ?? null,
    scoreModel: call.scanner?.scoreModel ?? null,
    commit: call.scanner?.commit ?? null,
  };
  const base = { durationMs: call.durationMs, scanner };
  if (call.timedOut || call.httpStatus === 504) return emptySnapshot("timeout", { ...base, errorCode: "SCAN_TIMEOUT" });
  const body = obj(call.body);
  if (call.httpStatus !== 200 || body.success !== true) {
    const recovery = obj(body.recovery);
    const siteStatus = num(recovery.originalHttpStatus);
    const code = str(body.code);
    if (code === "SCAN_TIMEOUT") return emptySnapshot("timeout", { ...base, errorCode: code });
    if (call.httpStatus >= 500 && call.httpStatus !== 502) return emptySnapshot("scan_error", { ...base, errorCode: code || `HTTP_${call.httpStatus}` });
    if (siteStatus !== null && BLOCKING_STATUSES.has(siteStatus)) return emptySnapshot("blocked", { ...base, httpStatus: siteStatus, errorCode: `SITE_HTTP_${siteStatus}` });
    // An interstitial, challenge or routing page instead of the website.
    if (call.httpStatus === 422 && !body.recovery && body.charged === false) return emptySnapshot("blocked", { ...base, errorCode: "SITE_CHALLENGE_PAGE" });
    if (call.httpStatus === 429) return emptySnapshot("skipped", { ...base, errorCode: code || "RANKFIX_RATE_LIMIT" });
    if (call.httpStatus === 502) return emptySnapshot("http_error", { ...base, errorCode: "SITE_UNREACHABLE" });
    return emptySnapshot("http_error", { ...base, httpStatus: siteStatus, errorCode: code || `HTTP_${call.httpStatus}` });
  }

  const metrics = obj(body.metrics);
  const coverage = obj(body.coverage);
  const classification = obj(body.classification);
  const sector = obj(classification.sector);
  const pageType = obj(classification.pageType);
  const rendering = obj(body.rendering);
  const recovery = obj(body.recovery);
  const summary = obj(body.summary);
  const scoreModel = obj(body.scoreModel);
  const invariant = obj(body.pageTypeInvariant);
  const botProtection = Array.isArray(rendering.botProtection) ? rendering.botProtection.length > 0 : Boolean(rendering.botProtection);
  const coveragePercent = num(coverage.coveragePercent);
  return {
    outcome: "scanned",
    httpStatus: num(body.httpStatus),
    errorCode: null,
    durationMs: call.durationMs,
    finalUrl: str(body.finalUrl),
    overallScore: num(body.overallScore),
    seoScore: num(obj(body.seo).score),
    geoScore: num(obj(body.geo).score),
    securityScore: num(obj(body.security).score),
    coveragePercent,
    highConfidencePercent: num(coverage.highConfidencePercent),
    provisional: Boolean(scoreModel.provisional) || (coveragePercent !== null && coveragePercent < 70),
    sector: str(sector.key) ? { key: String(sector.key), label: str(sector.label) || String(sector.key), confidenceScore: num(sector.confidenceScore) } : null,
    websiteType: str(classification.websiteType),
    pageType: str(pageType.type) ? { type: String(pageType.type), confidence: str(pageType.confidence) || "low" } : null,
    pageTypeContradictions: Array.isArray(invariant.contradictions) ? invariant.contradictions.map(String) : [],
    renderer: rendering.mode === "javascript_rendered" ? "javascript_rendered" : rendering.mode === "raw_html" ? "raw_html" : null,
    renderFallbackReason: str(rendering.fallbackReason),
    botProtection,
    recovery: { attempted: Boolean(recovery.attempted), browserRecovered: Boolean(recovery.browserRecovered) },
    counts: {
      passed: num(summary.passed) ?? 0,
      issues: num(summary.issues) ?? 0,
      notApplicable: num(summary.notApplicable) ?? 0,
      unableToConfirm: num(summary.unableToConfirm) ?? 0,
    },
    findings: findingsFrom(body.checks),
    fingerprint: contentFingerprint(metrics),
    scanner,
  };
}
