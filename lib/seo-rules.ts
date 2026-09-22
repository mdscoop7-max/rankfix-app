export const CRAWLER_VERSION = "1.1.0";
export const RULES_VERSION = "1.1.0";
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
    confidence: issue.confidence || "high",
    evidence: issue.evidence || {},
    description: issue.description || "",
    recommendation: issue.recommendation || "",
    affected_urls: issue.affected_urls || [],
    status: issue.status || "INFO",
  };
}

export function statusCode(status: string): IssueStatus {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  if (status === "warning") return "WARNING";
  return "INFO";
}
