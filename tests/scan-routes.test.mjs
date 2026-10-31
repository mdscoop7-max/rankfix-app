// Free scan and dashboard scan routes (30 Oct 2026, "RankFix kan niet scannen").
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const run = (script, env) => {
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", script], { cwd: root, encoding: "utf8", timeout: 240000, env: { ...process.env, ...((script.includes("consent-link") || script.includes("sample-h1") || script.includes("person-name-brand") || script.includes("sector-peers")) ? {} : { RF_REAL_DB: "1" }), ...env } });
  const line = out.stdout.split("\n").find((l) => l.startsWith("SCAN_MATRIX_RESULT "));
  assert.ok(line, out.stderr || out.stdout);
  return { result: JSON.parse(line.slice(19)), out };
};
test("local development without DATABASE_URL: anonymous free scan completes, dashboard scan refuses clearly", () => {
  const { result, out } = run("tests/scan-matrix/run-free-scan-nodb.mjs", { NODE_ENV: "development", DATABASE_URL: "" });
  assert.equal(result.failed, 0, out.stdout);
});
test("production without DATABASE_URL never runs the no-database mode", () => {
  const { out } = run("tests/scan-matrix/run-free-scan-nodb.mjs", { NODE_ENV: "production", DATABASE_URL: "" });
  assert.match(out.stdout, /"free":\[503/);
});
test("full chain on real PostgreSQL: free scan, dashboard scan → stored → history → full audit", { skip: !process.env.RF_PG_TEST_URL && "set RF_PG_TEST_URL to run against PostgreSQL" }, () => {
  const { result, out } = run("tests/scan-matrix/run-scan-chain-pg.mjs", { DATABASE_URL: process.env.RF_PG_TEST_URL });
  assert.equal(result.failed, 0, out.stdout);
});
test("a consent-settings link ('Privacy-instellingen' → ?modal=…) is not a privacy policy", () => {
  const { result, out } = run("tests/scan-matrix/run-consent-link.mjs", {});
  assert.equal(result.failed, 0, out.stdout);
});
test("sampled page without rendering: missing H1 is unconfirmed when scripts could add it, a warning on a static page", () => {
  const { result, out } = run("tests/scan-matrix/run-sample-h1.mjs", {});
  assert.equal(result.failed, 0, out.stdout);
});
test("a person name used as brand ('Leen Bakker' webshop) is not a bakery; real bakeries stay bakeries", () => {
  const { result, out } = run("tests/scan-matrix/run-person-name-brand.mjs", {});
  assert.equal(result.failed, 0, out.stdout);
});
test("sector peers: sites with the same sector and function get the same sector, type and webshop gating", () => {
  const { result, out } = run("tests/scan-matrix/run-sector-peers.mjs", {});
  assert.equal(result.failed, 0, out.stdout);
});
