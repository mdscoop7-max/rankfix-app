// EU-81 benchmark entry point.
//   node scripts/engine-benchmark/eu81.mjs baseline            → metrics of the stored audits in issue #151
//   node scripts/engine-benchmark/eu81.mjs export scans.json   → metrics of a read-only Neon export (pilot)
//   RF_PLAN=tests/fixtures/eu-pilot2/plan.json node … export …  → same for the blind pilot 2 set
// Export (read-only): SELECT scanned_url, final_url, overall_score, created_at, result FROM scans ORDER BY created_at;
// Optional 2nd file: SELECT requested_url, http_status, outcome, error, duration_ms, created_at FROM scan_attempts;
// Save the rows as JSON arrays. Nothing is written to any database.
import { readFileSync } from "node:fs";
import { evaluate } from "./metrics.mjs";
import { effectiveCategory } from "../../lib/scan-attempts.ts";

const planPath = process.env.RF_PLAN ? new URL(process.env.RF_PLAN, `file://${process.cwd()}/`) : new URL("../../tests/fixtures/eu81/plan.json", import.meta.url);
const plan = JSON.parse(readFileSync(planPath, "utf8")).sites;
const exposures = JSON.parse(readFileSync(new URL("../../tests/fixtures/evaluation/exposures.json", import.meta.url), "utf8")).exposures;
const norm = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return String(u || "").toLowerCase(); } };

export function baselineRows() {
  return plan.map((s) => ({
    id: `${s.country} ${s.name}`, expected: s.expected, scanned: Boolean(s.baseline),
    predicted: s.baseline?.sector, score: s.baseline?.overall, coverage: s.baseline?.coverage, reliability: s.baseline?.reliability,
    // Sector confidence is not in the dossier table (only RTL: 88%). Unknown → treated as confident.
    confidence: s.name.startsWith("RTL") ? 88 : undefined,
  }));
}

export function attemptSummary(attempts = []) {
  const withCat = attempts.map((a) => ({ ...a, cat: effectiveCategory(a) }));
  const bySite = plan.map((s) => {
    const mine = withCat.filter((a) => s.hosts.some((h) => norm(h) === norm(a.requested_url)));
    const last = mine.filter((a) => a.cat !== "success").at(-1);
    return { site: `${s.country} ${s.name}`, attempts: mine.length, successes: mine.filter((a) => a.cat === "success").length, lastCategory: last?.cat || null, lastCode: last?.error_code || null, lastError: last?.error || null };
  });
  const failedSites = bySite.filter((x) => x.attempts && !x.successes);
  const byCategory = failedSites.reduce((acc, x) => { acc[x.lastCategory || "unknown"] = (acc[x.lastCategory || "unknown"] || 0) + 1; return acc; }, {});
  return { attemptedSites: bySite.filter((x) => x.attempts).length, sitesWithSuccess: bySite.filter((x) => x.successes).length, notAttempted: bySite.filter((x) => !x.attempts).map((x) => x.site), failedByCategory: byCategory, failedSites };
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
    const checks = r.checks?.length ? r.checks : [...(r.seo?.checks || []), ...(r.geo?.checks || [])];
    return {
      id: `${s.country} ${s.name}`, expected: s.expected, scanned: Boolean(scan),
      exposure: exposures.find((x) => s.hosts.some((h) => norm(h) === norm(x.host))) || null,
      predicted: r.sectorProfile?.sector ?? r.metrics?.sector?.sector, confidence: r.sectorProfile?.confidenceScore,
      score: scan?.overall_score ?? r.overallScore, coverage: r.coverage?.coveragePercent, reliability: r.selfCheck?.reliability,
      evidenceLevel: r.scoreModel?.evidenceLevel, headlineKind: r.scoreModel?.headline?.kind, unconfirmed: checks.filter((c) => c.status === "unable_to_confirm").length,
      invariantViolations: r.selfCheck ? r.selfCheck.corrections?.length ?? 0 : undefined,
      ms: typeof r.scanDurationMs === "number" ? r.scanDurationMs : undefined,
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, file, attemptsFile] = process.argv.slice(2);
  const rows = mode === "export" ? exportRows(JSON.parse(readFileSync(file, "utf8"))) : baselineRows();
  const result = evaluate(rows);
  // Exposed cases (seen or tuned after the plan was frozen) never count as blind evidence.
  if (rows.some((r) => r.exposure)) {
    result.independent = evaluate(rows.filter((r) => !r.exposure));
    result.exposedCases = rows.filter((r) => r.exposure).map((r) => ({ id: r.id, expected: r.expected, predictedNow: r.predicted, original: r.exposure.originalResult, originalVerdict: r.exposure.originalVerdict }));
  }
  if (attemptsFile) result.attempts = attemptSummary(JSON.parse(readFileSync(attemptsFile, "utf8")));
  console.log(JSON.stringify(result, null, 1));
}
