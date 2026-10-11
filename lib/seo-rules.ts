export const CRAWLER_VERSION = "2.6.0";
export const RULES_VERSION = "1.4.0";
export const FIX_POLICY_VERSION = "1.2.0";
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

// x-default marks a language/country picker, not a page language, so it never
// counts as a mismatch against the document lang.
export function hasSelfHreflangLanguageMismatch(selfHreflangLanguages: string[], documentLanguage: string): boolean {
  const documentLanguageBase = documentLanguage.trim().toLowerCase().replace("_", "-").split("-")[0] || "";
  const languageEntries = selfHreflangLanguages.map((language) => language.trim().toLowerCase()).filter((language) => language && language !== "x-default");
  if (!documentLanguageBase || !languageEntries.length) return false;
  return !languageEntries.some((language) => language.split("-")[0] === documentLanguageBase);
}

export type HreflangLink = { language: string; href: string };
export type HreflangAssessment =
  | { kind: "none" }
  | { kind: "invalid"; total: number; invalid: number }
  | { kind: "self_mismatch"; documentLanguage: string }
  | { kind: "external_hosts"; count: number }
  | { kind: "conflict"; targets: [string, string[]][] }
  | { kind: "duplicate"; targets: [string, string][] }
  | { kind: "unconfirmed"; total: number };

// ISO 639 language, optional ISO 15924 script, optional ISO 3166 / UN M.49 region.
// "uk" is Ukrainian as a language but not a region; en-uk must be en-gb.
export function isValidHreflangCode(code: string): boolean {
  const value = code.trim().toLowerCase();
  if (value === "x-default") return true;
  const match = value.match(/^[a-z]{2,3}(?:-[a-z]{4})?(?:-([a-z]{2}|[0-9]{3}))?$/);
  return Boolean(match) && match?.[1] !== "uk";
}

// Ordered like the report: broken markup first, then self-reference, then
// cross-host, conflicts and duplicates; anything else is syntactically sound
// but reciprocity cannot be proven from a single page.
export function assessHreflang(links: HreflangLink[], pageUrl: string, documentLanguage: string, normalizeUrl: (url: string) => string): HreflangAssessment {
  if (!links.length) return { kind: "none" };
  const page = new URL(pageUrl);
  const entries = links.map((link) => {
    const language = link.language.trim().toLowerCase();
    let target: URL | null = null;
    try {
      const parsed = new URL(link.href, page);
      if (link.href.trim() && (parsed.protocol === "http:" || parsed.protocol === "https:")) target = parsed;
    } catch {}
    return { language, target, validLanguage: isValidHreflangCode(language) };
  });
  const invalid = entries.filter((entry) => !entry.validLanguage || !entry.target).length;
  if (invalid) return { kind: "invalid", total: entries.length, invalid };

  const valid = entries as { language: string; target: URL; validLanguage: boolean }[];
  const currentUrl = normalizeUrl(page.toString());
  const selfLanguages = valid.filter((entry) => normalizeUrl(entry.target.toString()) === currentUrl).map((entry) => entry.language);
  if (hasSelfHreflangLanguageMismatch(selfLanguages, documentLanguage)) return { kind: "self_mismatch", documentLanguage: documentLanguage.trim().toLowerCase().replace("_", "-") };

  const bareHost = (host: string) => host.replace(/^www\./i, "").toLowerCase();
  const externalHosts = valid.filter((entry) => bareHost(entry.target.hostname) !== bareHost(page.hostname)).length;
  if (externalHosts) return { kind: "external_hosts", count: externalHosts };

  const targetsByLanguage = new Map<string, string[]>();
  for (const entry of valid) targetsByLanguage.set(entry.language, [...(targetsByLanguage.get(entry.language) || []), normalizeUrl(entry.target.toString())]);
  const conflicts = [...targetsByLanguage.entries()].filter(([, urls]) => new Set(urls).size > 1).map(([language, urls]) => [language, [...new Set(urls)]] as [string, string[]]);
  if (conflicts.length) return { kind: "conflict", targets: conflicts };
  const duplicates = [...targetsByLanguage.entries()].filter(([, urls]) => urls.length > 1).map(([language, urls]) => [language, urls[0]] as [string, string]);
  if (duplicates.length) return { kind: "duplicate", targets: duplicates };
  return { kind: "unconfirmed", total: valid.length };
}
