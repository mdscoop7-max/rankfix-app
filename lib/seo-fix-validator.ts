import { getFixPolicy, FixCategory } from "./fix-policy";

export type FixValidation = { valid: boolean; errors: string[]; warnings: string[] };
export type NormalizedFix = {
  issue_id: string;
  category: FixCategory;
  safe_type: string | null;
  proposed: string;
  validation: FixValidation;
  source: "deterministic" | "ai";
  approved: boolean;
  scan_id: string | null;
  generated_at: string;
};

function hasPlaceholder(value: string) {
  return /(?:\{\{[^}]+\}\}|\[YOUR_|\bTODO\b)/i.test(value);
}

export function validateFix(input: {
  issue_id: string;
  rule_id?: string;
  proposed: unknown;
  source: "deterministic" | "ai";
  currentIssue?: { issue_id: string; status?: string; rule_id?: string } | null;
  scanId?: string | null;
}): NormalizedFix {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issue = input.currentIssue;
  const ruleId = input.rule_id || issue?.rule_id || input.issue_id;
  const policy = getFixPolicy(ruleId);
  if (!input.issue_id) errors.push("issue_id ontbreekt.");
  if (!issue || issue.issue_id !== input.issue_id) errors.push("Issue bestaat niet meer in het actuele rapport.");
  if (issue?.status === "PASS" || issue?.status === "NOT_APPLICABLE") errors.push("Issue is niet meer actief.");
  if (typeof input.proposed !== "string" || !input.proposed.trim()) errors.push("Fix bevat geen bruikbare output.");
  const proposed = typeof input.proposed === "string" ? input.proposed.trim() : "";
  if (proposed.length > 0 && hasPlaceholder(proposed)) errors.push("Fix bevat placeholders.");
  if (input.source === "ai") warnings.push("AI-output kan nooit automatisch worden toegepast.");
  if (policy.category === "C") warnings.push("Deze fix vereist menselijke controle.");
  return {
    issue_id: input.issue_id,
    category: policy.category,
    safe_type: policy.safe_type,
    proposed,
    validation: { valid: errors.length === 0, errors, warnings },
    source: input.source,
    approved: false,
    scan_id: input.scanId || null,
    generated_at: new Date().toISOString(),
  };
}

export function isFixStale(fix: NormalizedFix, currentScanId: string | null) {
  return !!fix.scan_id && !!currentScanId && fix.scan_id !== currentScanId;
}
