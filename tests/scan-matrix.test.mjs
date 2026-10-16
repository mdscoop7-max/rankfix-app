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
  assert.equal(r.total, 6);
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
