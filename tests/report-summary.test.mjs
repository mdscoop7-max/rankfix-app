import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeAuditChecks, summaryFromChecks } from "../lib/audit-score.ts";

const c = (key, status, extra = {}) => ({ key, status, issue_status: status.toUpperCase(), points: 0, maxPoints: 5, severity: "MEDIUM", confidence: "high", ...extra });
const count = (checks, status) => checks.filter((x) => x.status === status).length;
const assertMatchesDetails = (summary, checks, label) => {
  assert.equal(summary.passed, count(checks, "pass"), `${label}: passed`);
  assert.equal(summary.issues, count(checks, "fail") + count(checks, "warning"), `${label}: issues`);
  assert.equal(summary.notApplicable, count(checks, "not_applicable"), `${label}: not applicable`);
  assert.equal(summary.unableToConfirm, count(checks, "unable_to_confirm"), `${label}: unable to confirm`);
};

// Late evidence reconciliation as the scanner does it: in-place Object.assign
// on the same check objects after the first (provisional) summary.
const reconcile = (checks, changes) => {
  for (const [key, status] of changes) Object.assign(checks.find((x) => x.key === key), { status, issue_status: status.toUpperCase() });
};

const sites = [
  {
    label: "webshop homepage (representative product page reconciles product checks)",
    checks: [c("title", "pass"), c("h1", "warning"), c("alt", "warning"), c("product_schema", "not_applicable"), c("product_copy", "not_applicable"), c("product_availability", "not_applicable"), c("merchant_product_readiness", "not_applicable"), c("broken_links", "pass"), c("checkout", "unable_to_confirm"), c("privacy", "unable_to_confirm")],
    changes: [["product_schema", "pass"], ["product_copy", "pass"], ["product_availability", "pass"], ["merchant_product_readiness", "pass"], ["broken_links", "unable_to_confirm"]],
  },
  {
    label: "news article (transient link status becomes unconfirmed)",
    checks: [c("article_schema", "pass"), c("content", "pass"), c("broken_links", "fail"), c("product_schema", "not_applicable")],
    changes: [["broken_links", "unable_to_confirm"]],
  },
  {
    label: "local service practice (no late changes)",
    checks: [c("local_business", "pass"), c("nap", "warning"), c("product_schema", "not_applicable"), c("cookies", "unable_to_confirm")],
    changes: [],
  },
  {
    label: "SaaS homepage (commerce checks resolved to N.v.t.)",
    checks: [c("pricing", "unable_to_confirm"), c("checkout", "unable_to_confirm"), c("faq", "pass")],
    changes: [["pricing", "not_applicable"], ["checkout", "not_applicable"]],
  },
];

for (const site of sites) {
  test(`summary equals the detailed checks — ${site.label}`, () => {
    const checks = site.checks.map((x) => ({ ...x }));
    const provisional = summarizeAuditChecks(checks);
    reconcile(checks, site.changes);
    const final = summarizeAuditChecks(checks);
    assertMatchesDetails(final, checks, site.label);
    assertMatchesDetails(summaryFromChecks(checks), checks, `${site.label} (display)`);
    if (site.changes.length) assert.notDeepEqual(provisional, final, "the provisional count would have been wrong");
  });
}

test("display summary reads lower-case status when issue_status is absent (older saved scans)", () => {
  const checks = [{ status: "pass" }, { status: "warning" }, { status: "not_applicable" }, { status: "unable_to_confirm" }, { status: "fail" }];
  const s = summaryFromChecks(checks);
  assert.deepEqual([s.passed, s.issues, s.notApplicable, s.unableToConfirm], [1, 2, 1, 1]);
});

test("scanner counts the summary only after the final evidence reconciliation", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const lastMutation = Math.max(
    source.lastIndexOf('Object.assign(item, check("pass","merchant_product_readiness"'),
    source.lastIndexOf('item.issue_status = "UNABLE_TO_CONFIRM";'),
  );
  const finalSummary = source.lastIndexOf("scanSummary = summarizeAuditChecks(checks);");
  const response = source.indexOf("summary: scanSummary");
  assert.ok(lastMutation > 0 && finalSummary > lastMutation, "final summary after the last check mutation");
  assert.ok(response > finalSummary, "response uses the final summary");
  const between = source.slice(finalSummary, response);
  assert.doesNotMatch(between, /Object\.assign\(item|issue_status = "/, "no check changes after the summary");
});

test("public result and export derive counts from the displayed checks", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const summary = summaryFromChecks\(/);
  assert.match(page, /const passedCount = summaryFromChecks\(summaryChecks\)\.passed;/);
  assert.doesNotMatch(page, /"Passed: " \+ result\.summary\.passed/);
});
