export type AuditIssueStatus =
  | "PASS"
  | "FAIL"
  | "WARNING"
  | "INFO"
  | "NOT_APPLICABLE"
  | "UNABLE_TO_CONFIRM";

export type ScorableAuditCheck = {
  issue_status: AuditIssueStatus;
  points: number;
  maxPoints: number;
  confidence?: "high" | "medium" | "low";
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  rootCause?: string;
  fix_status?: "WAITING" | "AWAITING_MERGE" | "STILL_PRESENT" | "DONE";
};

export const SCORE_MODEL_VERSION = "3.1-stable-core-evidence";

// Fixed SEO/GEO core: adding sector-specific checks may increase report coverage
// without silently changing the headline score on the same website.
const CORE_SEO = new Set(["broken_links","internal_redirects","semantic_link_destination","title","description","h1","headings","canonical","viewport","lang","indexability","alt","content","https","status","response","social","robots_txt","sitemap","twitter_card","hreflang","duplicate_path","html_escape","image_sources"]);
const CORE_GEO = new Set(["schema","organization_website","entity","breadcrumbs","faq","author","trust","answer","identity"]);
export function stableCoreChecks<T extends ScorableAuditCheck & {key?:string}>(checks:T[], group:"seo"|"geo"):T[] {
  const keys = group==="seo" ? CORE_SEO : CORE_GEO;
  return checks.filter(item=>keys.has(item.key||""));
}


export function weightedCoverage(items: ScorableAuditCheck[]) {
  const relevant = items.filter((item) => item.issue_status !== "NOT_APPLICABLE");
  const totalWeight = relevant.reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  const assessed = relevant.filter((item) => item.issue_status !== "UNABLE_TO_CONFIRM");
  const assessedWeight = assessed.reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  const highConfidenceWeight = assessed
    .filter((item) => item.confidence === "high")
    .reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  return {
    relevant: relevant.length,
    confirmed: assessed.length,
    unableToConfirm: relevant.length - assessed.length,
    totalWeight,
    assessedWeight,
    coveragePercent: totalWeight ? Math.round((assessedWeight / totalWeight) * 100) : 0,
    highConfidencePercent: assessedWeight ? Math.round((highConfidenceWeight / assessedWeight) * 100) : 0,
  };
}

export function scoreRange(items: ScorableAuditCheck[]) {
  const applicable = items.filter((item) => item.issue_status !== "NOT_APPLICABLE");
  const assessed = applicable.filter((item) => item.issue_status !== "UNABLE_TO_CONFIRM");
  const unverified = applicable.filter((item) => item.issue_status === "UNABLE_TO_CONFIRM");
  const assessedWeight = assessed.reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  const unverifiedWeight = unverified.reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  const applicableWeight = assessedWeight + unverifiedWeight;
  // Same formula as the score itself (severity weighting, root-cause dedupe):
  // low = every unconfirmed check would fail, high = every one would pass.
  // The score, which leaves unconfirmed checks out, therefore always lies in range.
  const asOutcome = (pass: boolean) => applicable.map((item) => item.issue_status !== "UNABLE_TO_CONFIRM" ? item
    : { ...item, issue_status: pass ? "PASS" as const : "WARNING" as const, points: pass ? item.maxPoints : 0, rootCause: undefined, severity: "LOW" as const, confidence: "high" as const });
  return {
    low: applicableWeight ? scoreApplicableChecks(asOutcome(false)) : 0,
    high: applicableWeight ? scoreApplicableChecks(asOutcome(true)) : 0,
    assessedWeight,
    unverifiedWeight,
    applicableWeight,
  };
}

/** Overall range on the same 0.6 × SEO + 0.4 × GEO basis as the overall score. */
export function combinedScoreRange(seo: ReturnType<typeof scoreRange>, geo: ReturnType<typeof scoreRange>, weights = { seo: 0.6, geo: 0.4 }) {
  return {
    low: Math.round(seo.low * weights.seo + geo.low * weights.geo),
    high: Math.round(seo.high * weights.seo + geo.high * weights.geo),
    assessedWeight: seo.assessedWeight + geo.assessedWeight,
    unverifiedWeight: seo.unverifiedWeight + geo.unverifiedWeight,
    applicableWeight: seo.applicableWeight + geo.applicableWeight,
  };
}

export function scoreApplicableChecks(items: ScorableAuditCheck[]): number {
  const applicable = items.filter(
    (item) => item.issue_status !== "NOT_APPLICABLE" && item.issue_status !== "UNABLE_TO_CONFIRM"
  );
  const max = applicable.reduce((sum, item) => sum + item.maxPoints, 0);
  if (!max) return 0;

  // A low-confidence result must never masquerade as a proven hard failure.
  // Callers should normally emit UNABLE_TO_CONFIRM for weak evidence; this
  // safeguard prevents an accidental low-confidence FAIL from lowering scores.
  const confidenceSafe = applicable.map((item) =>
    item.issue_status === "FAIL" && item.confidence === "low"
      ? { ...item, points: item.maxPoints, issue_status: "INFO" as const }
      : item
  );

  // Score each proven root cause once. Dependent checks stay visible for
  // explanation, but cannot multiply the same underlying penalty.
  const rootCausePenalty = new Map<string, number>();
  let earnedWithoutRootCause = 0;
  let maxWithoutRootCause = 0;
  for (const item of confidenceSafe) {
    if (!item.rootCause || item.issue_status === "PASS" || item.issue_status === "INFO") {
      earnedWithoutRootCause += item.points;
      maxWithoutRootCause += item.maxPoints;
      continue;
    }
    const rawPenalty = Math.max(0, item.maxPoints - item.points);
    const severityMultiplier =
      item.severity === "CRITICAL" ? 1.75 :
      item.severity === "HIGH" ? 1.5 :
      item.severity === "MEDIUM" ? 1.2 : 1;
    const confidenceMultiplier = item.confidence === "medium" ? 0.9 : 1;
    const penalty = Math.min(item.maxPoints, rawPenalty * severityMultiplier * confidenceMultiplier);
    rootCausePenalty.set(item.rootCause, Math.max(rootCausePenalty.get(item.rootCause) || 0, penalty));
    maxWithoutRootCause += item.maxPoints;
    earnedWithoutRootCause += item.maxPoints;
  }
  const dedupedPenalty = [...rootCausePenalty.values()].reduce((sum, penalty) => sum + penalty, 0);
  return Math.max(0, Math.round(((earnedWithoutRootCause - dedupedPenalty) / maxWithoutRootCause) * 100));
}

export function summarizeAuditChecks(items: ScorableAuditCheck[]) {
  const actionable = items.filter((item) => item.issue_status === "FAIL" || item.issue_status === "WARNING");
  const severityOf = (item: ScorableAuditCheck) =>
    "severity" in item ? String((item as ScorableAuditCheck & { severity?: string }).severity || "INFO") : "INFO";
  const confidenceOf = (item: ScorableAuditCheck) =>
    "confidence" in item ? String((item as ScorableAuditCheck & { confidence?: string }).confidence || "low") : "low";
  return {
    passed: items.filter((item) => item.issue_status === "PASS").length,
    issues: actionable.length,
    // Priority buckets are evidence-aware: only confirmed FAILs can be critical/high
    // priorities. Warnings remain important/advice so optimization guidance never
    // outranks a proven technical problem.
    critical: actionable.filter((item) => item.issue_status === "FAIL" && severityOf(item) === "CRITICAL" && confidenceOf(item) === "high").length,
    important: actionable.filter((item) =>
      (item.issue_status === "FAIL" && ["HIGH","MEDIUM"].includes(severityOf(item)) && confidenceOf(item) !== "low") ||
      (item.issue_status === "WARNING" && severityOf(item) === "HIGH" && confidenceOf(item) === "high")
    ).length,
    advice: actionable.filter((item) =>
      !(item.issue_status === "FAIL" && severityOf(item) === "CRITICAL" && confidenceOf(item) === "high") &&
      !((item.issue_status === "FAIL" && ["HIGH","MEDIUM"].includes(severityOf(item)) && confidenceOf(item) !== "low") ||
        (item.issue_status === "WARNING" && severityOf(item) === "HIGH" && confidenceOf(item) === "high"))
    ).length,
    notApplicable: items.filter((item) => item.issue_status === "NOT_APPLICABLE").length,
    unableToConfirm: items.filter((item) => item.issue_status === "UNABLE_TO_CONFIRM").length,
    pendingFixes: items.filter((item) => item.fix_status === "WAITING" || item.fix_status === "AWAITING_MERGE" || item.fix_status === "STILL_PRESENT").length,
  };
}


export type ScoreCapCheck = {
  maxPoints: number;
  issue_status: AuditIssueStatus;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  confidence: "high" | "medium" | "low";
};

export function applyEvidenceBasedScoreCap(score: number, items: ScoreCapCheck[]): number {
  const provenCritical = items.some(
    (item) => item.issue_status === "FAIL" && item.severity === "CRITICAL" && item.confidence === "high"
  );
  if (provenCritical) return Math.min(score, 70);

  const provenHigh = items.some(
    (item) => item.issue_status === "FAIL" && item.severity === "HIGH" && item.confidence !== "low"
  );
  if (provenHigh) return Math.min(score, 88);
  // 100 means "nothing to improve": any confirmed warning or failure caps the
  // rounded score at 99 so a report never shows 100/100 next to an open issue.
  if (items.some((item) => item.issue_status === "WARNING" || item.issue_status === "FAIL")) return Math.min(score, 99);
  // Unknown signals must never be an invisible numeric penalty. The fixed
  // core result is stable when additional modules become unconfirmed. Missing
  // evidence is shown through coverage and a provisional score range instead.
  return score;
}
