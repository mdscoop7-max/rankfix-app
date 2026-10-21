import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicPage = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const auditPage = await readFile(new URL("../app/dashboard/audit/[id]/page.tsx", import.meta.url), "utf8");
const githubPage = await readFile(new URL("../app/dashboard/github/page.tsx", import.meta.url), "utf8");
const githubApi = await readFile(new URL("../app/api/github/fix/route.ts", import.meta.url), "utf8");

test("public scan never writes directly to GitHub", () => {
  assert.doesNotMatch(publicPage, /fetch\(["']\/api\/github\/fix["']/);
  assert.match(publicPage, /\/dashboard\/scan\?url=/);
});

test("public fix proposals use central safe policy; other issues get AI advice", () => {
  assert.match(publicPage, /getFixPolicy\(ruleId\)/);
  assert.match(publicPage, /policy\.action === "github_fix"/);
  assert.match(publicPage, /item\.fix_category !== "C"/);
  assert.match(publicPage, /found !== undefined && found !== null/);
  assert.match(publicPage, /openFixAdvice\(item\)/);
});

test("GitHub mutation requires stored scan, issue, review, premium", () => {
  assert.match(githubPage, /scan_id:activeScanId/);
  assert.match(githubPage, /issue_id:activeIssueId/);
  assert.match(githubPage, /preview:!publish/);
  assert.match(githubPage, /proposal_hash:publish\?proposalHash/);
  assert.match(githubPage, /Automatische GitHub- en AI-codefixes vereisen een betaald abonnement/);
  assert.match(githubApi, /!issueId\|\|!scanId/);
  assert.match(githubApi, /code:"PAID_PLAN_REQUIRED"/);
  assert.match(githubApi, /const trustedScan=await getDb\(\)\.query/);
  assert.match(auditPage, /getFixPolicy\(issueId\)/);
});

test("localized instructions do not falsely promise a no-merge flow", () => {
  assert.doesNotMatch(githubPage, /Nichts wird automatisch in Produktion gemergt|Rien n’est fusionné automatiquement en production|Nulla viene unito automaticamente in produzione|Nada se fusiona automáticamente en producción/);
});
