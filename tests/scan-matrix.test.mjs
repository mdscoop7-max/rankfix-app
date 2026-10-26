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

// QA #203/#204: WooCommerce, headless Shopify, Magento, PrestaShop and OpenCart shops
// are webshops with their platform and branch; case shops are not carriers; template
// bindings are not links; negative controls never become a webshop.
test("webshops across platforms (QA #203/#204): type, platform, branch, modules, links, currencies", () => {
  const r = run("run-webshop-qa204.mjs");
  assert.ok(r.total >= 12, `too few sites: ${r.total}`);
  assert.equal(r.failed, 0, r.log.split("\n").filter((l) => /^ - /.test(l)).join("\n"));
});

test("start page answering 404: confirmed, recovered or not verifiable, never a guess (QA #204)", () => {
  const r = run("run-root-404.mjs");
  assert.equal(r.total, 6);
  assert.equal(r.failed, 0, r.log);
});

test("rendering: rich render is used, failed/poorer renders fall back honestly, challenges abstain", () => {
  const r = run("run-render.mjs");
  assert.equal(r.total, 17);
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

// QA #186 (TestLab 23-10 evening): no schema DDL on a warm schema, and an idempotent,
// retried scan insert (deadlock victim / broken connection never loses the report).
test("scan persistence on real PostgreSQL: schema init never blocks a running save; insert retry stores exactly one row", { skip: !process.env.RF_PG_TEST_URL && "RF_PG_TEST_URL not set" }, () => {
  const r = run("run-save-race-pg.mjs", { RF_REAL_DB: "1", DATABASE_URL: process.env.RF_PG_TEST_URL });
  assert.equal(r.failed, 0, r.log);
});

// QA-144 (Big.dk ran into the 300 s platform limit without an answer): a scan whose
// browser work hangs stops itself with SCAN_TIMEOUT, not charged, within the limit.
test("hard time limit: a hanging scan answers SCAN_TIMEOUT before the platform limit", { timeout: 60000 }, () => {
  const r = run("run-hard-limit.mjs", { RANKFIX_SCAN_HARD_LIMIT_MS: "12000" });
  assert.equal(r.failed, 0, r.log);
});

// QA-144: a webshop, menu prices, a donation form or a shop sub-page never becomes
// the primary sector of an organisation that does not present itself as a shop;
// genuine shops (incl. an "official store") stay ecommerce.
test("commerce is a channel unless the site presents itself as a shop", () => {
  const r = run("run-commerce-channel.mjs");
  assert.equal(r.failed, 0, r.log);
});

// Sector recognition 24-10: opticians, hair salons, hotels and restaurants (and
// other local trades) in NL, EN, DE, FR, ES and IT, with negative controls
// (online lens/haircare shops, salon/hotel software, catering wholesale) and
// abstention cases. Checks sector, subtype, sales channel and that unknown is
// never presented as confirmed.
test("local businesses: multilingual trade identity, shop vs service vs webshop, abstention", () => {
  const r = run("run-local-business.mjs");
  assert.equal(r.failed, 0, r.log);
  assert.ok(r.total >= 50, `only ${r.total} local-business profiles ran`);
});

// Live QA scan 4a9fe1db: a sampled page that answered HTTP 403 (also in the browser)
// was scored 71 with "HTTP 403" passed. Refusal pages are never scored, and an
// HTTP check never passes on a 4xx/5xx sample.
test("sampled pages that refuse access are not scored and never pass the HTTP check", () => {
  const r = run("run-sample-access.mjs");
  assert.equal(r.failed, 0, r.log);
});

// HTTP 200/403/404/410/429/500 and soft 404 for the scanned page, sampled pages and
// internal links: no score for a missing or failing homepage (in every language), a
// sampled 404 is not an assessed page, missing pages, server errors and blocks are
// reported apart with URL, reason and action.
test("HTTP status matrix: homepage, sampled pages and internal links", { timeout: 600000 }, () => {
  const r = run("run-http-status.mjs");
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
// (RF_ROUTE_REPLAY=1, ~1-2 min per run). Measured 23 Oct 2026 (evening repairs):
// morning fixture: 65 compatible, 0 unknown, 1 wrong (a reconstruction artefact that
// the old engine shows too), 4 without report (Colruyt, Iberia, bol, Agfa: block or
// CAPTCHA pages). Evening fixture: 66 compatible, 0 unknown, 1 wrong (same
// artefact), 2 without report (bol, Agfa). The deployed engine (af918dbd)
// reproduces the live evening result exactly on the evening fixture.
for (const [label, fixture, minimum, blocked, labelDisputes = []] of [
  ["96-site run 23-10 morning", "route.json.gz", 65, ["colruyt.be", "iberia.com", "bol.com", "agfa.com"]],
  ["96-site run 23-10 evening", "route-evening.json.gz", 66, ["bol.com", "agfa.com"]],
  // Two animal-welfare charities labelled "veterinary" in the TestLab; the engine
  // says non-profit. A label dispute, listed explicitly, not a hidden tolerance.
  ["144-site run 24-10 (QA 5da81ee4)", "../testlab-144-replay/route.json.gz", 79, ["remondis.com"], ["pdsa.org.uk", "rspca.org.uk"]],
]) test(`full-route replay of the recorded ${label}: no new wrong sectors, block pages never scored`, { skip: !process.env.RF_ROUTE_REPLAY && "RF_ROUTE_REPLAY not set", timeout: 300000 }, () => {
  const out = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/scan-matrix/register.mjs", "tests/scan-matrix/run-route-replay.mjs", "--json"], { cwd: root, encoding: "utf8", timeout: 280000, env: { ...process.env, ROUTE_FIXTURE: `${root}/tests/fixtures/testlab-96-replay/${fixture}` } });
  const line = (out.stdout || "").split("\n").find((l) => l.startsWith("ROUTE_REPLAY "));
  assert.ok(line, (out.stderr || "").slice(-1500));
  const rows = JSON.parse(line.slice("ROUTE_REPLAY ".length));
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  const wrong = rows.filter((r) => r.verdict === "wrong" && !labelDisputes.includes(r.host));
  assert.ok(wrong.length <= 1, wrong.map((r) => `${r.host}: ${r.sector}`).join(", "));
  assert.ok(count("compatible") >= minimum, `compatible ${count("compatible")}`);
  // A wrong sector is never presented as confirmed (>= 80).
  for (const r of wrong) assert.ok((r.confidence ?? 0) < 80, `${r.host}: wrong sector shown as confirmed (${r.confidence})`);
  for (const host of blocked) assert.equal(rows.find((r) => r.host === host)?.verdict, "no_report", `${host} must not be scored`);
  const achmea = rows.find((r) => r.host === "achmea.nl");
  if (achmea) assert.equal(achmea.key, "financial_insurance", "Achmea subtype");
});

test("QA 144: blocked homepage → incident + alternative start; accessible subpage → partial report with blocked homepage registered", () => {
  const r = run("run-blocked-homepage.mjs");
  assert.equal(r.total, 2);
  assert.equal(r.failed, 0, r.log);
});

test("QA 144: sector failure classes (hospitality group ≠ beauty, careers site ≠ transport, supermarkets, compound bank brand) with negative controls", () => {
  const r = run("run-local-business.mjs", { PROFILES: "qa144" });
  assert.ok(r.total >= 11, `profiles missing: ${r.total}`);
  assert.equal(r.failed, 0, r.log);
});

test("QA 144: proven problems on other sampled pages reach the advice list; high score carries a caution", () => {
  const r = run("run-sitewide-issues.mjs");
  assert.equal(r.failed, 0, r.log);
});

test("QA 144: product data stays bound to the entered page (no sibling SKU), ambiguous products are not merged", () => {
  const r = run("run-product-provenance.mjs");
  assert.equal(r.total, 2);
  assert.equal(r.failed, 0, r.log);
});
