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
  fix_status?: "WAITING" | "AWAITING_MERGE" | "STILL_PRESENT" | "DONE";
};

export function scoreApplicableChecks(items: ScorableAuditCheck[]): number {
  const applicable = items.filter(
    (item) => item.issue_status !== "NOT_APPLICABLE" && item.issue_status !== "UNABLE_TO_CONFIRM"
  );
  const max = applicable.reduce((sum, item) => sum + item.maxPoints, 0);
  if (!max) return 0;
  return Math.round((applicable.reduce((sum, item) => sum + item.points, 0) / max) * 100);
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
