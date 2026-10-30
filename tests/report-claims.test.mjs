// End-to-end claim checks (30 Oct 2026): every claim in a finished report must
// be backed by evidence in that same report. Runs the real /api/scan route over
// the recorded TestLab evidence (three replay sets, scanned from the root like a
// live TestLab run) and over synthetic scenarios for each failure class found.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditReportClaims } from "../lib/report-claim-audit.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const node = (script, env = {}) => spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script, ...(script.endsWith("run-route-replay.mjs") ? ["--json"] : [])], { cwd: root, encoding: "utf8", timeout: 300000, env: { ...process.env, ...env } });

test("claim audit flags each contradiction class on a minimal report", () => {
  const base = { success: true, finalUrl: "https://x.test/", metrics: { schemaTypes: ["Organization"], h1Count: 1, title: "T", description: "D", canonical: "https://x.test/", lang: "nl", siteType: "WEBSITE" }, classification: { websiteType: "Website" }, websiteProfile: { websiteType: { value: "services", status: "probable" } }, sectorProfile: { sector: "professional_services", confidenceScore: 76 }, pageTypeEvidence: { type: "homepage" }, scoreModel: { evidenceLevel: "provisional" }, overallScore: 90, seo: { checks: [] }, geo: { checks: [] } };
  assert.deepEqual(auditReportClaims(base), []);
  const codes = (patch) => auditReportClaims({ ...structuredClone(base), ...patch }).map((v) => v.code);
  assert.ok(codes({ classification: { websiteType: "Webshop" }, metrics: { ...base.metrics, siteType: "ECOMMERCE" } }).includes("website_type_conflict"));
  assert.ok(codes({ metrics: { ...base.metrics, schemaTypes: ["mi-aem/components/x"] } }).includes("non_schema_type"));
  assert.ok(codes({ finalUrl: "https://x.test/de/start", pageTypeEvidence: { type: "product" } }).includes("start_page_typed_as_product"));
  assert.ok(codes({ selfCheck: { corrections: [{ code: "advice_sector_mismatch", detail: "x" }] } }).includes("self_check_correction"));
  assert.ok(codes({ seo: { checks: [{ key: "h1", status: "pass", points: 5, maxPoints: 5 }] }, metrics: { ...base.metrics, h1Count: 0 } }).includes("h1_pass_without_h1"));
  assert.ok(codes({ seo: { checks: [{ key: "product_schema", status: "warning", points: 2, maxPoints: 6 }] } }).includes("retail_issue_on_non_shop"));
  assert.ok(codes({ seo: { checks: [{ key: "x", status: "not_applicable", points: 3, maxPoints: 5 }] } }).includes("points_on_unscored_check"));
  assert.ok(codes({ overallScore: 100 }).includes("perfect_score_without_complete_evidence"));
  assert.ok(codes({ sectorProfile: { sector: "unknown", confidenceScore: 40 } }).includes("unknown_sector_with_confidence"));
  assert.ok(codes({ seo: { checks: [{ key: "title", status: "warning", message: "Te lang", points: 3, maxPoints: 10, severity: "LOW", evidence: { url: "https://x.test/" } }] } }).includes("finding_incomplete"));
  assert.deepEqual(codes({ seo: { checks: [{ key: "title", status: "warning", message: "Te lang", fix: "Inkorten", points: 3, maxPoints: 10, severity: "LOW", evidence: { url: "https://x.test/", found: 80 } }] } }), []);
});

test("synthetic claim scenarios: schema subtypes, sector-aware schema context, start pages, CMS @type", () => {
  const out = node("tests/scan-matrix/run-claim-consistency.mjs");
  const line = out.stdout.split("\n").find((l) => l.startsWith("SCAN_MATRIX_RESULT "));
  assert.ok(line, out.stderr || out.stdout);
  const result = JSON.parse(line.slice("SCAN_MATRIX_RESULT ".length));
  assert.equal(result.failed, 0, out.stdout);
  assert.equal(result.total, 17);
});

// Sector outcome on the replay sets may not get worse than on 30 Oct 2026.
const FLOOR = {
  "testlab-144-replay/route.json.gz": { compatible: 86, wrong: 2 },
  "testlab-96-replay/route.json.gz": { compatible: 66, wrong: 0 },
  "testlab-96-replay/route-evening.json.gz": { compatible: 67, wrong: 0 },
};
for (const [fixture, floor] of Object.entries(FLOOR)) {
  test(`replay ${fixture} from the root: no report claim contradicts its own evidence`, () => {
    const dir = mkdtempSync(join(tmpdir(), "rf-claims-"));
    try {
      const out = node("tests/scan-matrix/run-route-replay.mjs", { ROUTE_FIXTURE: join(root, "tests/fixtures", fixture), REPLAY_FROM_ROOT: "1", DUMP_DIR: dir });
      const line = out.stdout.split("\n").find((l) => l.startsWith("ROUTE_REPLAY "));
      assert.ok(line, out.stderr || out.stdout.slice(-2000));
      const rows = JSON.parse(line.slice("ROUTE_REPLAY ".length));
      const n = (v) => rows.filter((r) => r.verdict === v).length;
      assert.ok(n("compatible") >= floor.compatible, `compatible ${n("compatible")} < ${floor.compatible}`);
      assert.ok(n("wrong") <= floor.wrong, `wrong ${n("wrong")} > ${floor.wrong}: ${rows.filter((r) => r.verdict === "wrong").map((r) => r.host).join(", ")}`);
      const violations = [];
      for (const file of readdirSync(dir)) {
        const report = JSON.parse(readFileSync(join(dir, file), "utf8"));
        for (const v of auditReportClaims(report)) violations.push(`${file.replace(/\.json$/, "")}: ${v.code} ${v.detail}`);
      }
      assert.ok(readdirSync(dir).length >= rows.length - 1, "reports dumped");
      assert.deepEqual(violations, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test("crawl coverage: missing relevant parts are nominated from the sitemap index (no guessed paths)", () => {
  const out = node("tests/scan-matrix/run-section-gapfill.mjs");
  const line = out.stdout.split("\n").find((l) => l.startsWith("SCAN_MATRIX_RESULT "));
  assert.ok(line, out.stderr || out.stdout);
  assert.equal(JSON.parse(line.slice("SCAN_MATRIX_RESULT ".length)).failed, 0, out.stdout);
});

test("blocked homepage: partial report from a public sitemap page; fully blocked site and non-root pages unchanged", () => {
  const out = node("tests/scan-matrix/run-alternate-start.mjs");
  const line = out.stdout.split("\n").find((l) => l.startsWith("SCAN_MATRIX_RESULT "));
  assert.ok(line, out.stderr || out.stdout);
  assert.equal(JSON.parse(line.slice("SCAN_MATRIX_RESULT ".length)).failed, 0, out.stdout);
});
