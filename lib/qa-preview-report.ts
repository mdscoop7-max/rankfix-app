// Isolated QA preview only: format existing scan evidence for convenient mobile
// copying. This never fetches private dashboard history or changes scan limits.
export type QaCheck = {
  title?: string;
  key?: string;
  status: string;
  message?: string;
  fix?: string;
  points?: number;
  maxPoints?: number;
  evidence?: { url?: string; details?: string; found?: unknown };
};
export type QaResult = {
  finalUrl?: string;
  scannedUrl?: string;
  httpStatus?: number;
  responseTime?: number;
  overallScore: number;
  grade?: string;
  sectorProfile?: {
    label?: string;
    key?: string;
    confidenceScore?: number;
    evidence?: string[];
    applicableModules?: string[];
  };
  technologyProfile?: {
    siteType?: string;
    cms?: string;
    commercePlatform?: string;
    framework?: string;
  };
  seo?: { score: number; checks?: QaCheck[] };
  geo?: { score: number; checks?: QaCheck[] };
  security?: { score: number };
  rendering?: { mode?: string; javascriptExecuted?: boolean };
  metrics?: { title?: string; description?: string; canonical?: string | null; lang?: string | null; h1s?: string[]; wordCount?: number; imageCount?: number; imagesMissingAlt?: number };
};

function evidenceText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return ""; }
}

export function qaPreviewAuditText(scan: QaResult): string {
  const checkSections = [
    ["SEO", scan.seo?.checks ?? []] as const,
    ["GEO", scan.geo?.checks ?? []] as const,
  ];
  const checks = checkSections.flatMap(([, items]) => items);
  const counts = (status: string) => checks.filter(check => check.status === status).length;
  const lines = [
    "RankFix — BOTH audit (QA-preview, niet opgeslagen in dashboard)",
    `URL: ${scan.finalUrl || scan.scannedUrl || "onbekend"}`,
    `HTTP: ${scan.httpStatus ?? "onbekend"} | ${scan.responseTime ?? "onbekend"} ms`,
    `Score: ${scan.overallScore}/100 | Grade: ${scan.grade || "—"}`,
    `SEO: ${scan.seo?.score ?? "—"}/100 | GEO: ${scan.geo?.score ?? "—"}/100`,
    `Rendering: ${scan.rendering?.mode || "niet opgegeven"} | JavaScript uitgevoerd: ${scan.rendering?.javascriptExecuted === true ? "ja" : scan.rendering?.javascriptExecuted === false ? "nee" : "niet opgegeven"}`,
    "",
    "WEBSITE PROFILE",
    `Type: ${scan.technologyProfile?.siteType || "niet bevestigd"}`,
    `CMS: ${scan.technologyProfile?.cms || "niet bevestigd"}`,
    `Platform: ${scan.technologyProfile?.commercePlatform || "niet bevestigd"}`,
    `Framework: ${scan.technologyProfile?.framework || "niet bevestigd"}`,
    "",
    `SECTOR: ${scan.sectorProfile?.label || "niet bevestigd"}`,
    `Sector key: ${scan.sectorProfile?.key || "niet bevestigd"}`,
    `Confidence: ${scan.sectorProfile?.confidenceScore ?? "niet bevestigd"}`,
    "Sector evidence:",
    ...(scan.sectorProfile?.evidence || []).map(item => `- ${item}`),
    `Applicable modules: ${(scan.sectorProfile?.applicableModules || []).join(", ") || "niet bevestigd"}`,
    "",
    "SUMMARY",
    `Passed: ${counts("pass")}`,
    `Issues: ${counts("warning") + counts("fail")}`,
    `Not applicable: ${counts("not_applicable")}`,
    `Unable to confirm: ${counts("unable_to_confirm")}`,
    "",
    "PAGE METRICS",
    `Title: ${scan.metrics?.title || "niet gevonden"}`,
    `Meta description: ${scan.metrics?.description || "niet gevonden"}`,
    `Canonical: ${scan.metrics?.canonical || "niet gevonden"}`,
    `Language: ${scan.metrics?.lang || "niet gevonden"}`,
    `H1: ${(scan.metrics?.h1s || []).join(" | ") || "niet gevonden"}`,
    `Words: ${scan.metrics?.wordCount ?? "onbekend"}`,
    `Images: ${scan.metrics?.imageCount ?? "onbekend"}`,
    `Images missing alt: ${scan.metrics?.imagesMissingAlt ?? "onbekend"}`,
  ];
  for (const [label, section] of checkSections) {
    lines.push("", `${label} — ${label === "SEO" ? scan.seo?.score ?? "—" : scan.geo?.score ?? "—"}/100`);
    section.forEach((check, i) => {
      lines.push("", `${i + 1}. ${check.title || check.key || "Controle"} [${check.status}]`);
      if (check.maxPoints != null) lines.push(`Points: ${check.points ?? 0}/${check.maxPoints}`);
      if (check.message) lines.push(check.message);
      if (check.fix) lines.push(`Recommendation: ${check.fix}`);
      if (check.evidence?.url) lines.push(`Evidence URL: ${check.evidence.url}`);
      if (check.evidence?.details) lines.push(`Evidence: ${check.evidence.details}`);
      const found = evidenceText(check.evidence?.found);
      if (found) lines.push(`Found: ${found}`);
    });
  }
  lines.push("", "QA-preview: deze audit staat alleen in het huidige browserresultaat. Log in en scan via het dashboard om een rapport op te slaan.");
  return lines.join("\n");
}
