import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRun, toMarkdown } from "../scripts/testlab/analyze-evidence.mjs";
test("evidence analysis: counts, before/after with regressions, failures and sample H1", () => {
  const evidence = { commitSha: "abc123", rows: [
    { host: "a.test", expected: "public", evidenceState: "available", verdict: "equivalent", run: { status: "success" }, evidence: { sectorProfile: { sector: "government", key: "government" }, score: { evidenceLevel: "provisional" }, page: { title: "A" }, sample: { pages: [{ checks: [{ key: "h1", status: "UNABLE_TO_CONFIRM" }] }] } } },
    { host: "b.test", expected: "manufacturing", evidenceState: "available", verdict: "unconfirmed", run: { status: "success" }, evidence: { sectorProfile: { sector: "unknown", key: "unknown" }, score: { evidenceLevel: "insufficient" }, page: { title: "B" }, sample: { pages: [] } } },
    { host: "c.test", expected: "ecommerce", evidenceState: "scan_not_successful", run: { status: "website_outcome" }, failure: { code: "HTTP_BLOCKED", httpStatus: 403 } },
  ] };
  const baseline = { sites: [
    { host: "a.test", result: { status: "succes", sector: "news_media", sectorKey: "news_media" } },
    { host: "b.test", result: { status: "succes", sector: "manufacturing_industrial", sectorKey: "manufacturing_industrial" } },
  ] };
  const a = analyzeRun({ evidence, audits: [], baseline });
  assert.equal(a.success, 2); assert.deepEqual(a.verdicts, { equivalent: 1, unconfirmed: 1 });
  assert.equal(a.better.map((c) => c.host).join(), "a.test");
  assert.equal(a.worse.map((c) => c.host).join(), "b.test");
  assert.deepEqual(a.failures, { "HTTP_BLOCKED (HTTP 403)": 1 });
  assert.deepEqual(a.sampleH1, { pass: 0, warning: 0, unconfirmed: 1 });
  assert.match(toMarkdown(a), /REGRESSIE\*\* b\.test/);
});
