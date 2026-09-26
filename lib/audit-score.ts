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
  fix_status?: "WAITING" | "DONE";
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
  return {
    passed: items.filter((item) => item.issue_status === "PASS").length,
    issues: items.filter((item) => item.issue_status === "FAIL" || item.issue_status === "WARNING").length,
    notApplicable: items.filter((item) => item.issue_status === "NOT_APPLICABLE").length,
    unableToConfirm: items.filter((item) => item.issue_status === "UNABLE_TO_CONFIRM").length,
    pendingFixes: items.filter((item) => item.fix_status === "WAITING").length,
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
