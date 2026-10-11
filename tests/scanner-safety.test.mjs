// Route-level safety guards that cannot run without Next.js/DB; checked on source like
// the existing regression suite, so a refactor cannot silently remove them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("scan route classifies every fetch failure and HTTP error instead of a generic 'blocked' message", async () => {
  const route = await read("app/api/scan/route.ts");
  assert.match(route, /classifyFetchError\(fetchError\)/);
  assert.match(route, /classifyHttpStatus\(response\.status, response\.headers\)/);
  assert.match(route, /retryDecision\(response\.status, response\.headers, attempt/);
  assert.doesNotMatch(route, /Scan geblokkeerd door website \(HTTP/, "a 404/500 is not a block");
  assert.doesNotMatch(route, /Math\.min\(Math\.max\(requestedDelayMs, 500\), 5000\)/, "old 429 loop ignored long Retry-After");
  assert.match(route, /inputFailure\("NOT_A_DOMAIN"\)/);
});

test("headers and cookies of a blocked (403/405) response are never security evidence", async () => {
  const route = await read("app/api/scan/route.ts");
  assert.match(route, /const headersFromBlockedResponse = Boolean\(recoveredHtml\) && !response\.ok;/);
  assert.match(route, /headersFromBlockedResponse\s*\?\s*securityCheck\("unable_to_confirm","security_headers"/);
  assert.match(route, /headersFromBlockedResponse\s*\?\s*securityCheck\("unable_to_confirm","security_cookie_flags"/);
});

test("reports list the checks that stayed unconfirmed because JavaScript did not run", async () => {
  const route = await read("app/api/scan/route.ts");
  assert.match(route, /renderingWithScope\.unconfirmedChecks = rendering\.warning/);
  for (const lang of ["de:", "fr:", "it:", "es:"]) {
    assert.match(route, new RegExp(`${lang} javascriptCandidate \\? "`), `${lang} explains a failed render`);
  }
});

test("Fix Engine never merges a pull request itself", async () => {
  const fix = await read("app/api/github/fix/route.ts");
  assert.doesNotMatch(fix, /\/pulls\/"\+Number\(pr\.number\)\+"\/merge/);
  assert.doesNotMatch(fix, /merge_method/);
  assert.match(fix, /RankFix never merges/);
  const ui = await read("app/dashboard/github/page.tsx");
  assert.doesNotMatch(ui, /automatisch gemerged/);
  // The explicit-merge detection that moves AWAITING_MERGE -> AWAITING_VERIFICATION stays in place.
  const status = await read("app/api/fixes/status/route.ts");
  assert.match(status, /status='AWAITING_VERIFICATION'/);
});

test("Fix Engine refuses sector-dependent structured-data fixes when the sector is uncertain", async () => {
  const fix = await read("app/api/github/fix/route.ts");
  assert.match(fix, /fixPolicy\.safe_type==="structured_data" && storedArbiterStatus==="uncertain"/);
  assert.match(fix, /code:"SECTOR_UNCERTAIN"/);
  // Only proven, non-low-confidence FAIL/WARNING findings with evidence may become fixes.
  assert.match(fix, /!\["FAIL","WARNING"\]\.includes\(trustedStatus\) \|\| trustedConfidence==="low" \|\| !hasTrustedEvidence/);
});

test("non-http schemes typed by a customer are refused as unsafe, not as a strange hostname", async () => {
  const route = await read("app/api/scan/route.ts");
  assert.match(route, /throw new Error\("URL_PROTOCOL_BLOCKED"\)/);
});

test("a failed scan never registers scan usage: usage is written only after every failure exit", async () => {
  const route = await read("app/api/scan/route.ts");
  const usageInsert = route.indexOf("INSERT INTO usage_events");
  assert.ok(usageInsert > 0);
  const lastFailureExit = route.lastIndexOf("scanFailurePayload(");
  assert.ok(lastFailureExit > 0 && lastFailureExit < usageInsert, "all classified failure responses come before the usage insert");
  const lastQualityExit = route.lastIndexOf("qualityMessages[scanLanguage], charged: false");
  assert.ok(lastQualityExit > 0 && lastQualityExit < usageInsert);
  assert.match(route.slice(usageInsert - 200, usageInsert), /if \(dashboardScan\)/);
});

test("empty documents are not reported as challenge pages", async () => {
  const route = await read("app/api/scan/route.ts");
  assert.match(route, /if \(!interstitialDetected && \(nonStandardEmptyDocument \|\| emptyDocument\)\)/);
  assert.match(route, /new Error\("JAVASCRIPT_NOT_RENDERED"\)/);
  assert.match(route, /new Error\("EMPTY_DOCUMENT"\)/);
});
