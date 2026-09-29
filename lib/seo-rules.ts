export const CRAWLER_VERSION = "2.5.0";
export const RULES_VERSION = "1.2.0";
export const FIX_POLICY_VERSION = "1.0.0";
export const AI_POLICY_VERSION = "1.0.0";

export type IssueStatus = "PASS" | "FAIL" | "WARNING" | "INFO" | "NOT_APPLICABLE" | "UNABLE_TO_CONFIRM";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Confidence = "high" | "medium" | "low";

export type NormalizedIssue = {
  issue_id: string;
  rule_id: string;
  title: string;
  category: string;
  severity: Severity;
  confidence: Confidence;
  evidence: { url?: string; found?: string | number | boolean | null; expected?: string; details?: string };
  description: string;
  recommendation: string;
  affected_urls: string[];
  status: IssueStatus;
};

export function normalizeIssue(issue: Partial<NormalizedIssue> & { id?: string; key?: string }): NormalizedIssue | null {
  const issue_id = issue.issue_id || issue.id || issue.rule_id || issue.key;
  if (!issue_id) return null;
  return {
    issue_id,
    rule_id: issue.rule_id || issue_id,
    title: issue.title || issue_id,
    category: issue.category || "TECHNICAL",
    severity: issue.severity || "MEDIUM",
    confidence: issue.confidence || (issue.evidence && Object.keys(issue.evidence).length ? "medium" : "low"),
    evidence: issue.evidence || {},
    description: issue.description || "",
    recommendation: issue.recommendation || "",
    affected_urls: issue.affected_urls || [],
    status: issue.status || "INFO",
  };
}

export function statusCode(status: string): IssueStatus {
  const normalized = status.trim().toLowerCase();
  if (normalized === "pass") return "PASS";
  if (normalized === "fail") return "FAIL";
  if (normalized === "warning") return "WARNING";
  if (normalized === "not_applicable" || normalized === "not-applicable" || normalized === "n/a") return "NOT_APPLICABLE";
  if (normalized === "unable_to_confirm" || normalized === "unable-to-confirm") return "UNABLE_TO_CONFIRM";
  if (normalized === "info") return "INFO";
  return "UNABLE_TO_CONFIRM";
}
