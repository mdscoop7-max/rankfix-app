import test from "node:test";
import assert from "node:assert/strict";
import { extractImageMetrics } from "../lib/image-metrics.ts";
import { applyEvidenceBasedScoreCap, scoreApplicableChecks, summarizeAuditChecks } from "../lib/audit-score.ts";
import { isPrivateHost, validatePublicHttpUrl } from "../lib/safe-fetch.ts";
import { statusCode } from "../lib/seo-rules.ts";

test("decorative empty alt is valid; only a missing alt attribute is actionable", () => {
  const metrics = extractImageMetrics('<img src="/hero.jpg" alt=""><img src="/product.jpg" alt="Product"><img src="/broken.jpg">');
  assert.equal(metrics.elementCount, 3);
  assert.equal(metrics.missingAlt, 1);
});

test("N/A and unable-to-confirm never lower the score", () => {
  const score = scoreApplicableChecks([
    { issue_status: "PASS", points: 10, maxPoints: 10 },
    { issue_status: "NOT_APPLICABLE", points: 0, maxPoints: 100 },
    { issue_status: "UNABLE_TO_CONFIRM", points: 0, maxPoints: 100 },
  ]);
  assert.equal(score, 100);
});

test("no applicable evidence produces score zero rather than a false 100", () => {
  assert.equal(scoreApplicableChecks([
    { issue_status: "NOT_APPLICABLE", points: 0, maxPoints: 100 },
    { issue_status: "UNABLE_TO_CONFIRM", points: 0, maxPoints: 100 },
  ]), 0);
});

test("summary never counts N/A or unable-to-confirm as passed", () => {
  const summary = summarizeAuditChecks([
    { issue_status: "PASS", points: 1, maxPoints: 1 },
    { issue_status: "WARNING", points: 0, maxPoints: 1 },
    { issue_status: "NOT_APPLICABLE", points: 0, maxPoints: 1 },
    { issue_status: "UNABLE_TO_CONFIRM", points: 0, maxPoints: 1 },
  ]);
  assert.deepEqual(summary, { passed: 1, issues: 1, notApplicable: 1, unableToConfirm: 1, pendingFixes: 0 });
});

test("critical score cap requires a confirmed high-confidence failure", () => {
  assert.equal(applyEvidenceBasedScoreCap(96, [
    { issue_status: "UNABLE_TO_CONFIRM", severity: "CRITICAL", confidence: "low" },
  ]), 96);
  assert.equal(applyEvidenceBasedScoreCap(96, [
    { issue_status: "WARNING", severity: "CRITICAL", confidence: "high" },
  ]), 96);
  assert.equal(applyEvidenceBasedScoreCap(96, [
    { issue_status: "FAIL", severity: "CRITICAL", confidence: "high" },
  ]), 70);
});

test("unknown rule statuses fail closed as unable-to-confirm", () => {
  assert.equal(statusCode("pass"), "PASS");
  assert.equal(statusCode("n/a"), "NOT_APPLICABLE");
  assert.equal(statusCode("unable-to-confirm"), "UNABLE_TO_CONFIRM");
  assert.equal(statusCode("unexpected-status"), "UNABLE_TO_CONFIRM");
});

test("scanner URL guard blocks local and private targets", () => {
  assert.equal(isPrivateHost("localhost"), true);
  assert.equal(isPrivateHost("127.0.0.1"), true);
  assert.equal(isPrivateHost("10.1.2.3"), true);
  assert.equal(isPrivateHost("192.168.1.10"), true);
  assert.equal(isPrivateHost("example.com"), false);
  assert.throws(() => validatePublicHttpUrl("http://localhost/admin"), /URL_HOST_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("ftp://example.com/file"), /URL_PROTOCOL_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("https://user:pass@example.com/"), /URL_CREDENTIALS_BLOCKED/);
  assert.throws(() => validatePublicHttpUrl("https://example.com:8443/"), /URL_PORT_BLOCKED/);
});
