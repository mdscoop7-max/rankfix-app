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

test("checkout, merchant and EU-consumer checks become N/A without confirmed commerce, before the final score", async () => {
  const route = await read("app/api/scan/route.ts");
  const arbiter = route.indexOf("const sectorArbiter = arbitratePrimarySector(");
  const reconcile = route.indexOf("if (!finalCommerceDecision.confirmed) {\n      for (const item of [...seoChecks,...geoChecks]) {\n        if (finalCommerceOnlyKeys.has(item.key))");
  const rescore = route.indexOf("selectedSeoScore = scoreApplicableChecks(selectedSeoChecks);", reconcile);
  assert.ok(arbiter > 0 && reconcile > arbiter, "reconciliation follows the Sector Motor decision");
  assert.ok(rescore > reconcile, "score is recomputed after commerce checks are neutralised");
  const keys = route.slice(route.indexOf("const finalCommerceOnlyKeys = new Set(["), route.indexOf("const finalEuCommerceKeys"));
  for (const key of ["checkout_trust", "checkout_funnel_static", "checkout_information_signal", "merchant_product_readiness", "merchant_feed_signal", "webshop_trust", "webshop_claims", "product_schema", "eu_consumer_information_signal", "eu_discount_reference_signal"]) {
    assert.match(keys, new RegExp(`"${key}"`), key);
  }
});

test("Fix Engine chain: scan evidence -> approved proposal hash -> PR -> manual merge -> fresh live rescan", async () => {
  const fix = await read("app/api/github/fix/route.ts");
  // No branch, commit or PR without an explicitly approved, unchanged proposal.
  assert.match(fix, /if\(!proposalId \|\| !approvedHash\)\{/);
  assert.match(fix, /loadedProposal\.proposal_hash!==approvedHash/);
  assert.match(fix, /code:"PROPOSAL_HASH_MISMATCH"/);
  assert.match(fix, /code:"COMMIT_MISMATCH"/, "GitHub must confirm the exact approved content");
  assert.ok(fix.indexOf("if(!proposalId || !approvedHash){") < fix.indexOf("/pulls"), "approval is checked before any pull request call");
  // Merged is not resolved: only a fresh scan with PASS + high confidence + evidence verifies the fix.
  const route = await read("app/api/scan/route.ts");
  assert.match(route, /const verified=liveStatus==="PASS" && liveConfidence==="high" && hasLiveEvidence;/);
  assert.match(route, /pending\.status === "AWAITING_VERIFICATION" \|\| pending\.status === "STILL_PRESENT"/);
  assert.doesNotMatch(route, /status='VERIFIED_RESOLVED'[^"]*WHERE[^"]*AWAITING_MERGE/, "an unmerged PR is never marked resolved");
});
