import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDatabaseFreeQaPreview, checkDatabaseFreeQaLimit } from "../lib/database-free-qa.ts";
import { qaAuditFilename } from "../lib/qa-audit-export.ts";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("database-free QA is strictly isolated to the dedicated preview branch", () => {
  const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/dashboard-login-resilience-20261020" };
  assert.equal(isDatabaseFreeQaPreview(qa), true);
  assert.equal(isDatabaseFreeQaPreview({ ...qa, VERCEL_GIT_COMMIT_REF: "qa/stateless-pdf-report-20261020" }), true);
  assert.equal(isDatabaseFreeQaPreview({ ...qa, VERCEL_GIT_COMMIT_REF: "qa/stateless-pdf-report-20261020", VERCEL_ENV: "production" }), false);
  assert.equal(isDatabaseFreeQaPreview({ ...qa, VERCEL_ENV: "production" }), false);
  assert.equal(isDatabaseFreeQaPreview({ ...qa, VERCEL_GIT_COMMIT_REF: "main" }), false);
  assert.equal(isDatabaseFreeQaPreview({ ...qa, VERCEL_GIT_COMMIT_REF: "feat/dashboard-reference-desktop-mobile-20261019" }), false);
  assert.equal(isDatabaseFreeQaPreview({ NODE_ENV: "development", RANKFIX_QA_NO_DB: "1" }), true);
  assert.equal(isDatabaseFreeQaPreview({ NODE_ENV: "production", RANKFIX_QA_NO_DB: "1" }), false);
});

test("QA in-instance throttle allows eight scans then rejects the next one", () => {
  const identity = "qa-regression-scan-limit-" + Date.now();
  for (let i=0; i<8; i++) assert.equal(checkDatabaseFreeQaLimit(identity, 1_000_000).allowed, true);
  const denied = checkDatabaseFreeQaLimit(identity, 1_000_000);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds > 0);
  assert.equal(checkDatabaseFreeQaLimit(identity, 1_000_000 + 3_600_000).allowed, true);
});

test("QA scan uses the real audit engine and does not touch DB logging or billing", async () => {
  const route = await source("app/api/scan/route.ts");
  const qaGuard = route.indexOf("if (isDatabaseFreeQaPreview())");
  const databaseAttempt = route.indexOf("const attemptStarted = Date.now();");
  assert.ok(qaGuard !== -1 && qaGuard < databaseAttempt);
  assert.match(route.slice(qaGuard, databaseAttempt), /return runRestrictedQaScan\(request\)/);
  assert.match(route, /export async function runRestrictedQaScan\(request: Request\) \{ return runScan\(request, true\); \}/);
  assert.match(route, /if \(restrictedQa\) \{/);
  assert.match(route, /if \(!restrictedQa\) \{ try \{ user = await getCurrentUser\(\)/);
});

test("QA dashboard is branch-isolated, provides a real request and JSON export", async () => {
  const page = await source("app/dashboard/page.tsx");
  const layout = await source("app/dashboard/layout.tsx");
  const ui = await source("app/dashboard/database-free-qa.tsx");
  assert.match(page, /isDatabaseFreeQaPreview\(\) \? <DatabaseFreeQaDashboard \/>/);
  assert.match(layout, /if \(isDatabaseFreeQaPreview\(\)\)/);
  assert.match(ui, /fetch\("\/api\/scan"/);
  assert.match(ui, /type: "application\/json;charset=utf-8"/);
  assert.match(ui, /Download volledig JSON-rapport/);
  assert.doesNotMatch(ui, /INITIAL_TEST_SITES|FAKE_SCORE|MOCK_SCAN/);
});

test("QA access does not touch Neon and clearly separates tester access from real login", async () => {
 const me = await source("app/api/auth/me/route.ts");
 const login = await source("app/api/auth/login/route.ts");
 const register = await source("app/api/auth/register/route.ts");
 const account = await source("app/account/page.tsx");
 for (const file of [me,login,register]) assert.match(file,/isDatabaseFreeQaPreview\(\)/);
 assert.match(me,/qaPreview: true, accountLoginAvailable: false/);
 assert.match(login,/QA_ACCOUNT_LOGIN_DISABLED/);
 assert.match(register,/QA_ACCOUNT_REGISTRATION_DISABLED/);
 assert.match(account,/Open testdashboard zonder accountlogin/);
});

test("QA testdashboard can stop a scan, download PDF and reuse browser-only websites", async () => {
 const page = await source("app/dashboard/database-free-qa.tsx");
 assert.match(page,/AbortController/);
 assert.match(page,/Stop scan/);
 assert.match(page,/downloadQaAuditPdf/);
 assert.match(page,/readRecentScanUrls/);
 assert.match(page,/rememberScanUrl/);
});

test("QA audit filenames are safe and reflect the scanned site and actual scan date", () => {
  assert.equal(qaAuditFilename("https://www.monumenten.nl/", "2026-10-20T08:03:29Z"), "rankfix-audit-www.monumenten.nl-2026-10-20.json");
  assert.equal(qaAuditFilename("not a url", "2026-10-20T08:03:29Z"), "rankfix-audit-website-2026-10-20.json");
  assert.equal(qaAuditFilename("https://test.nl/path?secret=1", "2026-10-20T08:03:29Z"), "rankfix-audit-test.nl-2026-10-20.json");
});

test("full QA audit has a persistent native download and mobile fallbacks", async () => {
  const ui = await source("app/dashboard/database-free-qa.tsx");
  assert.match(ui, /href=\{downloadHref \|\| undefined\} download=\{exportFilename\}/);
  assert.match(ui, /return \(\) => URL\.revokeObjectURL\(href\)/);
  assert.match(ui, /navigator\.share\(/);
  assert.match(ui, /navigator\.clipboard\.writeText\(json\)/);
  assert.match(ui, /value=\{json\} aria-label="Volledig JSON-auditrapport"/);
  assert.match(ui, /result\.scoreModel\?\.version/);
  assert.doesNotMatch(ui, /link\.click\(\)/);
});
