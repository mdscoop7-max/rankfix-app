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
  rootCause?: string;
  fix_status?: "WAITING" | "AWAITING_MERGE" | "STILL_PRESENT" | "DONE";
};

export const SCORE_MODEL_VERSION = "2.3-evidence-range";

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
  const earned = assessed.reduce((sum, item) => sum + Math.max(0, Math.min(item.maxPoints, item.points)), 0);
  return {
    low: applicableWeight ? Math.round((earned / applicableWeight) * 100) : 0,
    high: applicableWeight ? Math.round(((earned + unverifiedWeight) / applicableWeight) * 100) : 0,
    assessedWeight,
    unverifiedWeight,
    applicableWeight,
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
    const penalty = Math.max(0, item.maxPoints - item.points);
    rootCausePenalty.set(item.rootCause, Math.max(rootCausePenalty.get(item.rootCause) || 0, penalty));
    maxWithoutRootCause += item.maxPoints;
    earnedWithoutRootCause += item.maxPoints;
  }
  const dedupedPenalty = [...rootCausePenalty.values()].reduce((sum, penalty) => sum + penalty, 0);
  return Math.round(((earnedWithoutRootCause - dedupedPenalty) / maxWithoutRootCause) * 100);
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
  return provenHigh ? Math.min(score, 88) : score;
}
