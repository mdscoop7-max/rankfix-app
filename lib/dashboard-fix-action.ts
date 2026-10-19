type Check = { key?: string; category?: string; title: string; issue_id?: string; rule_id?: string; status: string; confidence?: string; fix_category?: string; fix_status?: string; evidence?: { found?: unknown } };
type Policy = { action?: string; safe_type: string | null };

export function issueAnchor(check: Check) {
  return "issue-" + encodeURIComponent(`${check.category || ""}:${check.rule_id || check.issue_id || check.key || check.title}`.toLowerCase());
}

export function safeGithubFixHref(check: Check, scanId: string, policy: Policy) {
  const issueId = check.issue_id || check.rule_id || "";
  const found = check.evidence?.found;
  if (!scanId || !issueId || policy.action !== "github_fix" || !policy.safe_type || check.fix_category === "C" || check.fix_status === "DONE" || !["fail", "warning"].includes(check.status.toLowerCase()) || check.confidence?.toLowerCase() === "low" || found == null || found === "") return "";
  return "/dashboard/github?" + new URLSearchParams({ scan_id: scanId, issue_id: issueId }).toString();
}
