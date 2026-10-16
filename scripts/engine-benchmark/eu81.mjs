// EU-81 benchmark entry point.
//   node scripts/engine-benchmark/eu81.mjs baseline            → metrics of the stored audits in issue #151
//   node scripts/engine-benchmark/eu81.mjs export scans.json   → metrics of a read-only Neon export (pilot)
// Export (read-only): SELECT scanned_url, final_url, overall_score, created_at, result FROM scans ORDER BY created_at;
// Save the rows as a JSON array. Nothing is written to any database.
import { readFileSync } from "node:fs";
import { evaluate } from "./metrics.mjs";

const plan = JSON.parse(readFileSync(new URL("../../tests/fixtures/eu81/plan.json", import.meta.url), "utf8")).sites;
const norm = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return String(u || "").toLowerCase(); } };

export function baselineRows() {
  return plan.map((s) => ({
    id: `${s.country} ${s.name}`, expected: s.expected, scanned: Boolean(s.baseline),
    predicted: s.baseline?.sector, score: s.baseline?.overall, coverage: s.baseline?.coverage, reliability: s.baseline?.reliability,
    // Sector confidence is not in the dossier table (only RTL: 88%). Unknown → treated as confident.
    confidence: s.name.startsWith("RTL") ? 88 : undefined,
  }));
}

export function exportRows(scans) {
  const latest = new Map();
  for (const scan of scans) {
    const host = norm(scan.scanned_url);
    const site = plan.find((s) => s.hosts.some((h) => norm(h) === host));
    if (!site) continue;
    const prev = latest.get(site.name);
    if (!prev || new Date(scan.created_at) > new Date(prev.created_at)) latest.set(site.name, scan);
  }
  return plan.map((s) => {
    const scan = latest.get(s.name); const r = scan?.result || {};
    const checks = r.checks || [];
    return {
      id: `${s.country} ${s.name}`, expected: s.expected, scanned: Boolean(scan),
      predicted: r.sectorProfile?.sector ?? r.metrics?.sector?.sector, confidence: r.sectorProfile?.confidenceScore,
      score: scan?.overall_score ?? r.overallScore, coverage: r.coverage?.coveragePercent, reliability: r.selfCheck?.reliability,
      evidenceLevel: r.scoreModel?.evidenceLevel, headlineKind: r.scoreModel?.headline?.kind, unconfirmed: checks.filter((c) => c.status === "unable_to_confirm").length,
      invariantViolations: r.selfCheck ? r.selfCheck.corrections?.length ?? 0 : undefined,
      ms: typeof r.scanDurationMs === "number" ? r.scanDurationMs : undefined,
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, file] = process.argv.slice(2);
  const rows = mode === "export" ? exportRows(JSON.parse(readFileSync(file, "utf8"))) : baselineRows();
  console.log(JSON.stringify(evaluate(rows), null, 1));
}
