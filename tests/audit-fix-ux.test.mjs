import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (name) => readFile(new URL("../" + name, import.meta.url), "utf8");

test("public free scan exposes a real Fix action per identified active issue", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /\{issues\.map\(\(item\) => \(/);
  assert.match(page, /\(item\.issue_id \|\| item\.rule_id\) \? \(/);
  assert.match(page, /onClick=\{\(\) => createGithubFix\(item\)\}/);
  assert.match(page, /Fix bekijken/);
  assert.match(page, /start_fix:"1"/);
  assert.match(page, /\/dashboard\/scan\?/);
  assert.doesNotMatch(page, /onClick=\{\(\) => \{\}\}/);
});

test("dashboard makes Fix discoverable for scans with proven issues", async () => {
  const page = await source("app/dashboard/page.tsx");
  assert.match(page, /latest\?\.open_issues \? \(/);
  assert.match(page, /Fix verbeterpunten/);
  assert.match(page, /scan\.open_issues>0&&<Link className="rf-site-fix-link"/);
  assert.match(page, /rankfix-priorities/);
  assert.doesNotMatch(page, /<strong>\$\{latestHost/);
});

test("audit keeps approved per-rule Fix policy and separates destructive controls", async () => {
  const page = await source("app/dashboard/audit/[id]/page.tsx");
  assert.match(page, /getFixPolicy\(issueId\)/);
  assert.match(page, /check\.fix_category==="C"/);
  assert.match(page, /!hasEvidence/);
  assert.match(page, /fixHref\(check,scan\)/);
  assert.match(page, /id="rankfix-priorities"/);
  assert.match(page, /<details className="rf-audit-manage/);
  const manageIndex = page.indexOf('<details className="rf-audit-manage');
  const deleteIndex = page.indexOf("onClick={deleteAudit}");
  assert.ok(manageIndex >= 0 && deleteIndex > manageIndex,
    "Delete belongs in audit management, not in the prominent audit toolbar");
  assert.equal((page.match(/onClick=\{deleteAudit\}/g) || []).length, 1);
});

test("audit stylesheet keeps responsive buttons and readable dark/light content", async () => {
  const publicCss = await source("app/public-audit.css");
  const dashboardCss = await source("app/dashboard/dashboard.css");
  const auditCss = await source("app/dashboard/audit/[id]/audit.css");
  assert.match(publicCss, /#resultaat \.rf-public-finding/);
  assert.match(publicCss, /min-height: 44px/);
  assert.match(dashboardCss, /\.rf-site-actions \.rf-site-fix-link/);
  assert.match(auditCss, /\.rf-audit-manage/);
  assert.match(auditCss, /#rankfix-priorities ol li/);
});
