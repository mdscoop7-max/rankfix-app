import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDatabaseFreeQaPreview, checkDatabaseFreeQaLimit } from "../lib/database-free-qa.ts";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("database-free QA is strictly isolated to the dedicated preview branch", () => {
  const qa = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/dashboard-login-resilience-20261020" };
  assert.equal(isDatabaseFreeQaPreview(qa), true);
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
