import type { QualifiableResult } from "@/lib/score-qualifier";

export type WebsiteScan = { id: string; scanned_url: string; final_url?: string | null; overall_score: number; seo_score: number; geo_score: number; security_score?: number; created_at: string; open_issues: number; critical_issues: number };
export type WorkspaceUsage = { plan: string; used: number; limit: number | null; actions?: { aiFixes?: { used: number; limit: number | null } } };
export type WorkspaceHistory = { scans: WebsiteScan[]; history: WebsiteScan[]; fixes: Record<string, number>; usage: WorkspaceUsage };
export type AuditCheck = { title: string; category?: string; key?: string; rule_id?: string; issue_id?: string; status: string; severity?: string; message?: string; fix?: string; confidence?: string; evidence?: { found?: unknown } };
export type WorkspaceAudit = QualifiableResult & { seo?: { score: number; checks?: AuditCheck[] }; geo?: { score: number; checks?: AuditCheck[] }; security?: { score?: number; checks?: AuditCheck[] } };

export function websiteHost(scan: Pick<WebsiteScan, "scanned_url" | "final_url">): string {
  try { return new URL(scan.final_url || scan.scanned_url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return scan.scanned_url; }
}

// Same rule/category identity and status ordering as the existing history summary.
export function priorityChecks(audit: WorkspaceAudit | null): AuditCheck[] {
  const rank: Record<string, number> = { fail: 5, warning: 4, pass: 3, unable_to_confirm: 2, not_applicable: 1 };
  const unique = new Map<string, AuditCheck>();
  for (const check of [...(audit?.seo?.checks || []), ...(audit?.geo?.checks || [])]) {
    const key = `${String(check.category || "").trim().toLowerCase()}:${String(check.rule_id || check.issue_id || check.key || check.title || "").trim().toLowerCase()}`;
    const previous = unique.get(key);
    if (!previous || (rank[check.status] || 0) > (rank[previous.status] || 0)) unique.set(key, check);
  }
  const severity: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return [...unique.values()].filter(check => ["fail", "warning"].includes(check.status)).sort((a, b) => (severity[a.severity?.toUpperCase() || ""] ?? 2) - (severity[b.severity?.toUpperCase() || ""] ?? 2));
}

export function comparableScans(history: WebsiteScan[], selected: WebsiteScan | undefined): WebsiteScan[] {
  if (!selected) return [];
  return history.filter(scan => websiteHost(scan) === websiteHost(selected) && Number.isFinite(scan.overall_score) && Number.isFinite(Date.parse(scan.created_at)))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(-12);
}

export function remaining(limit: number | null | undefined, used: number): number | null {
  return limit == null ? null : Math.max(0, limit - used);
}
