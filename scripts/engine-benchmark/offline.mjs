// Offline engine benchmark: runs the REAL scan route over the whole synthetic
// matrix plus the real EU identity fixtures (no network, no database) and
// computes the same metrics as the EU-81 pilot.
//   node scripts/engine-benchmark/offline.mjs [--json out.json]
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./metrics.mjs";

export function runOffline(root = fileURLToPath(new URL("../..", import.meta.url)), env = {}) {
  const out = join(mkdtempSync(join(tmpdir(), "rf-bench-")), "rows.json");
  const res = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-matrix.mjs"], { cwd: root, encoding: "utf8", timeout: 600000, env: { ...process.env, ...env, BENCH_OUT: out } });
  if (res.status !== 0) throw new Error(res.stderr.slice(-2000));
  const raw = JSON.parse(readFileSync(out, "utf8"));
  // Only sites that expect a scored report take part (HTTP-failure fixtures test error handling).
  const rows = raw.filter((r) => r.bench && r.bench.expected && !(r.bench.expectHttp && r.status !== 200)).map((r) => ({
    id: r.id, expected: r.bench.expected.filter((x) => x !== "unknown" && x !== "general_business").length ? r.bench.expected.filter((x) => x !== "unknown" && x !== "general_business") : ["unknown"],
    acceptUnknown: r.bench.acceptUnknown, scanned: r.status === 200, predicted: r.sector, confidence: r.conf, score: r.score,
    coverage: r.bench.coverage, reliability: r.bench.reliability, evidenceLevel: r.bench.evidenceLevel, headlineKind: r.bench.headlineKind, unconfirmed: r.bench.unconfirmed,
    // Expectation mismatches (sector/label/page) are measured by the sector metrics, not as report inconsistencies.
    invariantViolations: r.problems.filter((x) => !/^(?:SECTOR|LABEL|PAGE) /.test(x)).length, ms: r.ms, real: r.bench.real, eu: r.bench.eu,
  }));
  return { rows, all: evaluate(rows), realEu: evaluate(rows.filter((r) => r.real)), eu: evaluate(rows.filter((r) => r.eu)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runOffline(undefined, process.argv.includes("--holdout") ? { HOLDOUT: "only" } : {});
  const i = process.argv.indexOf("--json");
  if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(result, null, 1));
  const brief = (m) => ({ sites: m.sector.scanned, accuracyPct: m.sector.accuracyPct, wrong: m.sector.wrong, abstained: m.sector.abstained, highConfidenceWrong: m.sector.highConfidenceWrong, macroF1: m.sector.macroF1, honesty: m.honesty.perfectWithIncompleteEvidence + m.honesty.score98PlusAtLowCoverage, consistencyViolations: m.consistency.reportsWithViolations, p95Ms: m.performance.p95Ms, scorecard: m.scorecard.score });
  console.log(JSON.stringify({ all: brief(result.all), eu: brief(result.eu), realEu: brief(result.realEu) }, null, 1));
}
