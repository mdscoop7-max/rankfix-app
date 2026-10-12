// One overview per nightly run. Pure: builds totals, the "green night" verdict
// and a Dutch Markdown report used for the job summary and the single e-mail.
import type { Classification, ResultClass } from "./compare.ts";
import type { RegressionSnapshot } from "./snapshot.ts";

export type ReportRow = {
  siteId: string;
  label: string;
  url: string | null;
  snapshot: RegressionSnapshot;
  classification: Classification;
};

export type RunTotals = {
  total: number;
  passed: number;        // passed + baseline_created
  warnings: number;
  unconfirmed: number;
  blocked: number;
  timeouts: number;
  skipped: number;
  regressions: number;
  scanErrors: number;
  scannedOk: number;     // outcome scanned with usable evidence
};

const LABELS: Record<ResultClass, string> = {
  passed: "Geslaagd",
  baseline_created: "Geslaagd (baseline)",
  warning: "Waarschuwing",
  unconfirmed: "Niet bevestigd",
  blocked: "Geblokkeerd door site",
  timeout: "Timeout",
  skipped: "Overgeslagen",
  regression: "REGRESSIE",
};

export function runTotals(rows: ReportRow[]): RunTotals {
  const count = (...classes: ResultClass[]) => rows.filter((r) => classes.includes(r.classification.result)).length;
  return {
    total: rows.length,
    passed: count("passed", "baseline_created"),
    warnings: count("warning"),
    unconfirmed: count("unconfirmed"),
    blocked: count("blocked"),
    timeouts: count("timeout"),
    skipped: count("skipped"),
    regressions: count("regression"),
    scanErrors: rows.filter((r) => r.snapshot.outcome === "scan_error").length,
    scannedOk: rows.filter((r) => r.snapshot.outcome === "scanned").length,
  };
}

// A night is green when RankFix produced no regression and no internal error,
// and enough sites were actually scanned to mean something. Blocked sites and
// timeouts are tolerated up to 30% of the attempted sites.
export function isGreenRun(totals: RunTotals): boolean {
  const attempted = totals.total - totals.skipped;
  if (attempted <= 0) return false;
  return totals.regressions === 0 && totals.scanErrors === 0 && totals.scannedOk >= Math.ceil(attempted * 0.7);
}

const cell = (value: unknown) => String(value ?? "—").replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "—";
const signed = (value: number | null) => (value === null ? "—" : value > 0 ? `+${value}` : String(value));
const seconds = (ms: number | null) => (ms === null ? "—" : `${Math.round(ms / 1000)} s`);

export function buildMarkdownReport(input: {
  runKey: string;
  commit: string | null;
  sitesVersion: string;
  rows: ReportRow[];
  consecutiveGreen: number;
}): { markdown: string; totals: RunTotals; green: boolean } {
  const totals = runTotals(input.rows);
  const green = isGreenRun(totals);
  const lines: string[] = [];
  lines.push(`## RankFix regressiepilot — ${input.runKey}`);
  lines.push("");
  lines.push(`Scanner-commit: \`${input.commit ? input.commit.slice(0, 7) : "onbekend"}\` · testset: \`${input.sitesVersion}\` · read-only, geen fixes, geen klantdata`);
  lines.push("");
  lines.push(`**${green ? "Groene nacht" : "Geen groene nacht"}** · opeenvolgende groene nachten: **${input.consecutiveGreen}** (3 nodig vóór uitbreiding naar 29)`);
  lines.push("");
  lines.push("| Totaal | Geslaagd | Waarschuwing | Niet bevestigd | Geblokkeerd | Timeout | Overgeslagen | Echte regressies |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|");
  lines.push(`| ${totals.total} | ${totals.passed} | ${totals.warnings} | ${totals.unconfirmed} | ${totals.blocked} | ${totals.timeouts} | ${totals.skipped} | ${totals.regressions} |`);
  lines.push("");
  lines.push("| Site | Resultaat | SEO | GEO | Security | Totaal (Δ) | Dekking | Sector | Paginatype | Rendering | Duur |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---|---|---|---:|");
  for (const row of input.rows) {
    const s = row.snapshot;
    const c = row.classification;
    const rendering = s.renderer ? `${s.renderer === "javascript_rendered" ? "JS" : "raw"}${s.renderFallbackReason ? ` (${s.renderFallbackReason})` : ""}${s.botProtection ? " · bot" : ""}` : "—";
    lines.push(`| ${cell(row.label)} | ${LABELS[c.result]} | ${cell(s.seoScore)} | ${cell(s.geoScore)} | ${cell(s.securityScore)} | ${cell(s.overallScore)} (${signed(c.scoreDelta.overall)}) | ${s.coveragePercent === null ? "—" : `${s.coveragePercent}%`} | ${s.sector ? `${cell(s.sector.key)} ${s.sector.confidenceScore ?? "?"}%` : "—"} | ${cell(s.pageType?.type)} | ${cell(rendering)} | ${seconds(s.durationMs)} |`);
  }
  const attention = input.rows.filter((r) => r.classification.result !== "passed" && r.classification.result !== "baseline_created");
  if (attention.length) {
    lines.push("");
    lines.push("### Toelichting");
    for (const row of attention) {
      lines.push(`- **${row.label}** — ${LABELS[row.classification.result]}: ${row.classification.reasons.map(cell).join("; ")}`);
    }
  }
  const diffs = input.rows.filter((r) => r.classification.newFindings.length || r.classification.resolvedFindings.length);
  if (diffs.length) {
    lines.push("");
    lines.push("### Verschillen t.o.v. vorige bruikbare scan");
    for (const row of diffs) {
      const added = row.classification.newFindings.map((f) => f.rule).join(", ");
      const resolved = row.classification.resolvedFindings.map((f) => f.rule).join(", ");
      lines.push(`- **${row.label}**${row.classification.contentChanged ? " (inhoud gewijzigd)" : ""}: ${added ? `nieuw: ${added}` : ""}${added && resolved ? " · " : ""}${resolved ? `verdwenen: ${resolved}` : ""}`);
    }
  }
  lines.push("");
  lines.push("_Geblokkeerd, timeout en niet bevestigd zijn nooit een regressie: onvoldoende bewijs wordt niet als fout of verbetering geteld._");
  return { markdown: lines.join("\n"), totals, green };
}
