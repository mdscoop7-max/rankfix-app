import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Runs the real scan route offline against a broad synthetic matrix of sectors,
// languages, page types, HTTP failures and JavaScript-rendering outcomes, and
// checks report invariants (status totals, score breakdown, sector/page type,
// retail checks on non-shops). Each run is a separate process because module
// hooks stub the database, DNS and the headless browser.
const root = fileURLToPath(new URL("..", import.meta.url));
function run(script, env = {}) {
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", `tests/scan-matrix/${script}`], {
    cwd: root, encoding: "utf8", timeout: 240000, env: { ...process.env, ...env },
  });
  const line = (out.stdout || "").split("\n").find((l) => l.startsWith("SCAN_MATRIX_RESULT "));
  assert.ok(line, `no result from ${script}: ${(out.stderr || "").slice(-2000)}`);
  return { ...JSON.parse(line.slice("SCAN_MATRIX_RESULT ".length)), log: out.stdout };
}

for (const mode of ["both", "seo", "geo"]) {
  test(`scan matrix (${mode}): every synthetic site gets the right sector, page type and consistent report`, () => {
    const r = run("run-matrix.mjs", { MODE: mode });
    assert.ok(r.total >= 80, `matrix too small: ${r.total}`);
    assert.equal(r.failed, 0, r.log.split("\n").filter((l) => /✗|^\s+-/.test(l)).join("\n"));
  });
}

test("scan matrix: English and German reports keep the same decisions", () => {
  for (const lang of ["en", "de"]) {
    const r = run("run-matrix.mjs", { LANG_RF: lang, ONLY: "payments-en,shop-nl,hotel-nl,spa-shell,telecom-nl,http-404,camping-shop" });
    assert.equal(r.failed, 0, r.log);
  }
});

test("rendering: rich render is used, failed/poorer renders fall back honestly, challenges abstain", () => {
  const r = run("run-render.mjs");
  assert.equal(r.total, 14);
  assert.equal(r.failed, 0, r.log);
});

test("performance: pathological page content never makes a scan quadratic", () => {
  const r = run("run-redos.mjs");
  assert.ok(r.total >= 20);
  assert.equal(r.failed, 0, r.log);
});

test("isolation under load: parallel scans of different sites never mix evidence and match single scans", () => {
  const r = run("run-concurrency.mjs");
  assert.ok(r.total >= 40);
  assert.equal(r.failed, 0, r.log);
});

// Real PostgreSQL (opt-in: RF_PG_TEST_URL=postgres://...): every scan attempt,
// success or failure, is stored in scan_attempts with code and category, and an
// earlier scan_attempts table is upgraded in place.
test("scan_attempts on real PostgreSQL: success, 404, block, timeout, invalid input, cookie redirect", { skip: !process.env.RF_PG_TEST_URL && "RF_PG_TEST_URL not set" }, () => {
  const r = run("run-attempts-pg.mjs", { RF_REAL_DB: "1", DATABASE_URL: process.env.RF_PG_TEST_URL });
  assert.equal(r.failed, 0, r.log);
});

// QA #186: a page whose sampled text is cut inside an emoji must still be stored
// (old engine: SCAN_HISTORY_SAVE_FAILED, "invalid input syntax for type json").
test("scan persistence on real PostgreSQL: emoji cut by text limits and NUL never fail the save", { skip: !process.env.RF_PG_TEST_URL && "RF_PG_TEST_URL not set" }, () => {
  const r = run("run-save-pg.mjs", { RF_REAL_DB: "1", DATABASE_URL: process.env.RF_PG_TEST_URL });
  assert.equal(r.failed, 0, r.log);
});

// QA #186: wall-clock limits with requests that really hang until their timeout
// (about 90 s). Opt-in: RF_SLOW_TESTS=1.
test("timeouts: hanging primary and sample requests stay within the scan budget and fail cleanly", { skip: !process.env.RF_SLOW_TESTS && "RF_SLOW_TESTS not set", timeout: 300000 }, () => {
  const r = run("run-timeout-budget.mjs");
  assert.equal(r.failed, 0, r.log);
});

// QA #186: full-route replay of the 70 recorded TestLab sites (identity, text,
// sampled links, commerce evidence) through the real scan route. Opt-in
// (RF_ROUTE_REPLAY=1, ~1-2 min). Measured 23 Oct 2026 on this branch:
// 63 compatible, 4 unknown, 1 wrong (a reconstruction artefact that the old
// engine shows too), 2 without report (block/error pages). A higher wrong count
// or a lower compatible count is a regression.
test("full-route replay of the recorded 96-site run: no new wrong sectors", { skip: !process.env.RF_ROUTE_REPLAY && "RF_ROUTE_REPLAY not set", timeout: 300000 }, () => {
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-route-replay.mjs", "--json"], { cwd: root, encoding: "utf8", timeout: 280000 });
  const line = (out.stdout || "").split("\n").find((l) => l.startsWith("ROUTE_REPLAY "));
  assert.ok(line, (out.stderr || "").slice(-1500));
  const rows = JSON.parse(line.slice("ROUTE_REPLAY ".length));
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  assert.ok(count("wrong") <= 1, rows.filter((r) => r.verdict === "wrong").map((r) => `${r.host}: ${r.sector}`).join(", "));
  assert.ok(count("compatible") >= 63, `compatible ${count("compatible")}`);
});
