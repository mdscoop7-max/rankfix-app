import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
register("./scan-matrix/loader.mjs", import.meta.url);
const E = await import("../lib/fix-engine.ts");

test("support levels: only exact, bounded fixes are AutoFix; others need review or manual work", () => {
  for (const id of ["META_DESCRIPTION_GUIDANCE", "META_DESCRIPTION_MISSING", "STRUCTURED_DATA_MISSING", "ORGANIZATION_WEBSITE_SCHEMA", "SOCIAL_METADATA_INCOMPLETE"]) assert.equal(E.autofixLevel(id), "auto", id);
  for (const id of ["META_TITLE_GUIDANCE", "H1_MISSING", "IMAGE_ALT_MISSING", "canonical", "faq"]) assert.equal(E.autofixLevel(id), "review", id);
  for (const id of ["BUSINESS_PLACEHOLDER", "security_headers", "PRODUCT_PRICE_CONSISTENCY", "identity", "H1_MULTIPLE", "UNKNOWN_RULE"]) assert.equal(E.autofixLevel(id), "manual", id);
});

test("publication requires the deterministic generator of that exact issue type", () => {
  assert.equal(E.autoPublishSupported("META_DESCRIPTION_GUIDANCE", "meta_description_v1"), true);
  assert.equal(E.autoPublishSupported("META_DESCRIPTION_GUIDANCE", "ai_rewrite"), false);
  assert.equal(E.autoPublishSupported("STRUCTURED_DATA_MISSING", "ai_rewrite"), false, "schema without verified data is never auto-published");
  assert.equal(E.autoPublishSupported("STRUCTURED_DATA_MISSING", "meta_description_v1"), false);
  assert.equal(E.autoPublishSupported("META_TITLE_GUIDANCE", "meta_description_v1"), false);
});

test("standing consent is bound to the repository and branch it was given for", () => {
  const ok = { repository: "o/site", base_branch: "main", autofix_publish: true, autofix_repository: "o/site", autofix_branch: "main" };
  assert.equal(E.siteConsentValid(ok), true);
  assert.equal(E.siteConsentValid({ ...ok, autofix_publish: false }), false);
  assert.equal(E.siteConsentValid({ ...ok, repository: "o/other" }), false);
  assert.equal(E.siteConsentValid({ ...ok, base_branch: "production" }), false);
  assert.equal(E.siteConsentValid(null), false);
});

const base = () => ({
  pr: { state: "open", merged: false, mergeable: true, mergeable_state: "clean", head: { sha: "h1", ref: "rankfix/x" }, base: { ref: "main" } },
  files: [{ filename: "templates/index.html", additions: 1, deletions: 1, status: "modified" }],
  checkRuns: [], combinedState: "pending", combinedCount: 0,
  expected: { branch: "rankfix/x", baseBranch: "main", path: "templates/index.html", headSha: "h1", baseBlobSha: "b1" },
  baseFileSha: "b1",
});
test("merge safety: merges only a clean, single-file, small, unchanged PR with green checks", () => {
  assert.deepEqual(E.evaluateMergeSafety(base()), { decision: "merge", code: "SAFE" });
  const cases = [
    [(x) => { x.pr.merged = true; }, "merged", "MERGED"],
    [(x) => { x.pr.state = "closed"; }, "block", "PR_CLOSED"],
    [(x) => { x.pr.base.ref = "dev"; }, "block", "BASE_MISMATCH"],
    [(x) => { x.pr.head.ref = "other"; }, "block", "HEAD_MISMATCH"],
    [(x) => { x.pr.head.sha = "h2"; }, "block", "HEAD_CHANGED"],
    [(x) => { x.files.push({ filename: "x.js", additions: 1, deletions: 0 }); }, "block", "UNEXPECTED_FILES"],
    [(x) => { x.files[0].filename = "other.html"; }, "block", "UNEXPECTED_FILES"],
    [(x) => { x.files[0].additions = 40; }, "block", "DIFF_TOO_LARGE"],
    [(x) => { x.baseFileSha = "b2"; }, "block", "STALE_BASE"],
    [(x) => { x.checkRuns = [{ status: "completed", conclusion: "failure" }]; }, "block", "CHECKS_FAILED"],
    [(x) => { x.combinedState = "failure"; x.combinedCount = 1; }, "block", "CHECKS_FAILED"],
    [(x) => { x.checkRuns = [{ status: "in_progress", conclusion: null }]; }, "wait", "CHECKS_PENDING"],
    [(x) => { x.combinedCount = 2; }, "wait", "CHECKS_PENDING"],
    [(x) => { x.pr.mergeable = null; }, "wait", "MERGEABILITY_PENDING"],
    [(x) => { x.pr.mergeable = false; }, "block", "MERGE_CONFLICT"],
    [(x) => { x.pr.mergeable_state = "blocked"; }, "block", "BRANCH_PROTECTED"],
    [(x) => { x.pr.mergeable_state = "behind"; }, "block", "BASE_ADVANCED"],
    [(x) => { x.pr.mergeable_state = "unstable"; }, "block", "CHECKS_FAILED"],
  ];
  for (const [mutate, decision, code] of cases) {
    const input = base(); mutate(input);
    assert.deepEqual(E.evaluateMergeSafety(input), { decision, code }, code);
  }
});

test("deployment state prefers production and never treats failure as success", () => {
  assert.equal(E.deploymentState([]), "none");
  assert.equal(E.deploymentState([{ environment: "Preview", statuses: [{ state: "success" }] }, { environment: "Production", production_environment: true, statuses: [{ state: "in_progress" }] }]), "pending");
  assert.equal(E.deploymentState([{ environment: "Production", statuses: [{ state: "success" }] }]), "success");
  assert.equal(E.deploymentState([{ environment: "Production", statuses: [{ state: "failure" }] }]), "failure");
  assert.equal(E.deploymentState([{ environment: "Production", statuses: [] }]), "pending");
});

test("live probe: blocked, challenged or non-HTML responses are never 'reachable'", () => {
  assert.equal(E.classifyLiveResponse(200, "text/html", "<title>Shop</title><p>" + "x ".repeat(400) + "</p>").reachable, true);
  assert.equal(E.classifyLiveResponse(403, "text/html", "<title>Access denied</title>").blocked, true);
  assert.equal(E.classifyLiveResponse(200, "text/html", "<title>Just a moment...</title>").reachable, false);
  assert.equal(E.classifyLiveResponse(200, "text/html", "<p>Pardon Our Interruption</p>").blocked, true);
  assert.equal(E.classifyLiveResponse(503, "text/html", "<p>down</p>").reachable, false);
  assert.equal(E.classifyLiveResponse(200, "application/json", "{}").reachable, false);
});

test("live check: exact approved text, one description tag; duplicates are never 'applied'", () => {
  const text = "Bekijk het assortiment van Voorbeeldshop: keukenspullen, tuingereedschap en opbergoplossingen, overzichtelijk per categorie geordend.";
  const html = (d) => `<head><meta name="description" content="${d}"></head>`;
  assert.equal(E.liveFixApplied("META_DESCRIPTION_GUIDANCE", html(text), text), "applied");
  assert.equal(E.liveFixApplied("META_DESCRIPTION_GUIDANCE", html("Oud."), text), "not_yet");
  assert.equal(E.liveFixApplied("META_DESCRIPTION_GUIDANCE", html(text) + html(text), text), "not_yet");
  assert.equal(E.liveFixApplied("STRUCTURED_DATA_MISSING", '<script type="application/ld+json">{"@type":"Organization"}</script>', null), "applied");
  assert.equal(E.liveFixApplied("H1_MISSING", "<h1>x</h1>", null), "unknown");
  assert.equal(E.liveFixApplied("META_DESCRIPTION_GUIDANCE", "", text), "unknown");
});

test("customer stages: a PR alone is never success; PR without consent is a manual action", () => {
  assert.equal(E.customerStage({ status: "AWAITING_MERGE", auto_publish: true }), "executing");
  assert.equal(E.customerStage({ status: "AWAITING_MERGE", auto_publish: false }), "manual");
  assert.equal(E.customerStage({ status: "AWAITING_DEPLOYMENT" }), "updating");
  assert.equal(E.customerStage({ status: "AWAITING_VERIFICATION" }), "checking");
  assert.equal(E.customerStage({ status: "STILL_PRESENT" }), "checking");
  assert.equal(E.customerStage({ status: "VERIFIED_RESOLVED" }), "confirmed");
  assert.equal(E.customerStage({ status: "NEEDS_ATTENTION" }), "manual");
  assert.deepEqual(Object.values(E.STAGE_LABEL_NL), ["Oplossing voorbereiden", "Fix veilig uitvoeren", "Website wordt bijgewerkt", "Live resultaat controleren", "Fix bevestigd", "Handmatige actie nodig"]);
  const view = E.publicFixView({ id: "1", user_id: "u", issue_id: "X", scanned_url: "https://a.test/", status: "NEEDS_ATTENTION", last_error_code: "DEPLOY_FAILED" });
  assert.equal(view.reason_code, "DEPLOY_FAILED");
  assert.match(view.reason, /deployment/i);
});

test("verification scans: only once live, bounded attempts", () => {
  const now = Date.now();
  assert.equal(E.readyForVerificationScan({ status: "AWAITING_DEPLOYMENT", phase_started_at: new Date(now - 1e6) }, now), false);
  assert.equal(E.readyForVerificationScan({ status: "AWAITING_VERIFICATION", phase_started_at: new Date(now), verification_attempts: 0 }, now), true);
  assert.equal(E.readyForVerificationScan({ status: "AWAITING_VERIFICATION", phase_started_at: new Date(now), verification_attempts: 3 }, now), false);
  assert.equal(E.readyForVerificationScan({ status: "STILL_PRESENT", phase_started_at: new Date(now - 10_000), verification_attempts: 1 }, now), false);
  assert.equal(E.readyForVerificationScan({ status: "STILL_PRESENT", phase_started_at: new Date(now - 120_000), verification_attempts: 1 }, now), true);
});

function memoryDb(row) {
  const queries = [];
  return {
    queries,
    query: async (sql, params = []) => {
      queries.push(sql);
      if (/^UPDATE pending_fixes SET status=/.test(sql)) {
        const expectedFrom = params[params.length - 1];
        if (row.status !== expectedFrom) return { rows: [], rowCount: 0 };
        row.status = params[2]; row.last_error_code = params[3];
        return { rows: [{ ...row }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
}

test("advance: GitHub outage keeps the state and records a clear code (no crash, no transition)", async () => {
  const row = { id: "1", user_id: "u", issue_id: "META_DESCRIPTION_GUIDANCE", scanned_url: "https://a.test/", status: "AWAITING_MERGE", repository: "o/r", pr_number: 3, auto_publish: true, phase_started_at: new Date() };
  const db = memoryDb(row);
  const err = Object.assign(new Error("Service Unavailable"), { status: 503 });
  await E.advanceFix({ db, github: async () => { throw err; }, probe: async () => ({ reachable: false, httpStatus: null, blocked: false, html: "" }) }, row);
  assert.equal(row.status, "AWAITING_MERGE");
  assert.equal(row.last_error_code, "GITHUB_UNAVAILABLE");
});

test("advance: missing GitHub connection is reported, not merged", async () => {
  const row = { id: "1", user_id: "u", issue_id: "META_DESCRIPTION_GUIDANCE", scanned_url: "https://a.test/", status: "AWAITING_MERGE", repository: "o/r", pr_number: 3, auto_publish: true };
  await E.advanceFix({ db: memoryDb(row), github: null, probe: async () => ({ reachable: false, httpStatus: null, blocked: false, html: "" }) }, row);
  assert.equal(row.last_error_code, "GITHUB_NOT_CONNECTED");
  assert.equal(row.status, "AWAITING_MERGE");
});

test("advance: deployment timeout and unreachable page stop safely instead of 'fixed'", async () => {
  const old = new Date(Date.now() - E.LIMITS.deployWaitMs - 1000);
  const row = { id: "1", user_id: "u", issue_id: "META_DESCRIPTION_GUIDANCE", scanned_url: "https://a.test/", status: "AWAITING_DEPLOYMENT", repository: "o/r", merge_commit_sha: "m", phase_started_at: old, expected_value: "x" };
  await E.advanceFix({ db: memoryDb(row), github: async () => [], probe: async () => ({ reachable: false, httpStatus: 403, blocked: true, html: "" }) }, row);
  assert.equal(row.status, "NEEDS_ATTENTION");
  assert.equal(row.last_error_code, "LIVE_UNREACHABLE");
});

test("status endpoint and routes: database outage is a clear 503, consent is explicit, merges are consent-gated", () => {
  const status = readFileSync(new URL("../app/api/fixes/status/route.ts", import.meta.url), "utf8");
  assert.match(status, /code:"DATABASE_UNAVAILABLE"/);
  const site = readFileSync(new URL("../app/api/github/site-repository/route.ts", import.meta.url), "utf8");
  assert.match(site, /body\?\.confirm!=="AUTOFIX_PUBLISH_CONSENT"/);
  assert.match(site, /autofix_repository=repository,autofix_branch=base_branch/);
  const fix = readFileSync(new URL("../app/api/github/fix/route.ts", import.meta.url), "utf8");
  assert.match(fix, /allowMerge=autoPublishSupported\(issueId,generator\)&&\(publishMode==="publish"\|\|\(publishMode==="auto"&&consent\)\)/);
  assert.doesNotMatch(fix, /\/merge"/, "the route itself never calls the merge API; only the engine does after its checks");
  const engine = readFileSync(new URL("../lib/fix-engine.ts", import.meta.url), "utf8");
  assert.equal((engine.match(/\/merge`/g) || []).length, 1, "exactly one merge call site");
  assert.match(engine, /sha: headSha/);
});

test("an unmerged AutoFix remains approvable inside RankFix, without exposing an unsafe universal publish button", () => {
  const page=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
  const status=readFileSync(new URL("../app/api/fixes/status/route.ts",import.meta.url),"utf8");
  assert.match(page,/fix\.reason_code === "PR_AWAITING_OWNER"/);
  assert.match(page,/approveExisting\(\)/);
  assert.match(page,/proposal_hash:review\.proposal_hash/);
  assert.match(status,/autoPublishSupported\(row\.issue_id,String\(proposal\.generator\|\|""\)\)/);
  assert.match(status,/row\.status==="AWAITING_MERGE"&&!row\.auto_publish&&row\.proposal_id&&row\.pr_number/);
  assert.match(status,/const refreshed=await db\.query/);
});
test("assistant refuses malformed preview secret before building Authorization header", () => {
  const assistant=readFileSync(new URL("../app/api/assistant/route.ts",import.meta.url),"utf8");
  assert.match(assistant,/ASSISTANT_CONFIGURATION_UNAVAILABLE/);
  assert.match(assistant,/!\/\^sk-\[A-Za-z0-9_-\]\+\$\/\.test\(key\)/);
  assert.match(assistant,/max_output_tokens: 2000/);
});

test("assistant can explain a known blocked Fix status even if provider configuration is unavailable", () => {
  const source=readFileSync(new URL("../app/api/assistant/route.ts",import.meta.url),"utf8");
  const fallback=source.indexOf('mode:"verified_status_help"');
  const provider=source.indexOf('const key = (process.env.OPENAI_API_KEY || "").trim()');
  assert.ok(fallback>0 && provider>fallback);
  assert.match(source,/dashboard && errorContext/);
  const shared=readFileSync(new URL("../lib/meta-description-fix.ts",import.meta.url),"utf8");
  assert.match(shared,/!key \|\| !\/\^sk-/);
});

test("saved website mapping and pending Fix load independently of GitHub repository enumeration", () => {
  const ui=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
  assert.match(ui,/Promise\.allSettled\(\[/);
  assert.match(ui,/fetch\("\/api\/github\/site-repository\?url="/);
  assert.match(ui,/refreshStatus\(url\)/);
  const mapped=ui.indexOf('mappedRepository = md.repository');
  const discover=ui.indexOf('fetch("/api/github/repos", { cache: "no-store" })');
  assert.ok(mapped>=0 && discover>mapped, "load existing mapping before GitHub repo discovery");
  assert.match(ui,/!contextLoading && !fix && !fixPlan/);
  assert.match(ui,/disabled=\{busy \|\| Boolean\(mappingWarning\) \|\| !repo \|\| connected !== true \|\| !check\}/);
  assert.match(ui,/setMappingWarning\("De bestaande websitekoppeling is tijdelijk niet bereikbaar/);
});

test("a legacy pending Pull Request cannot consume a freshly approved Fix", () => {
  const source=readFileSync(new URL("../app/api/github/fix/route.ts",import.meta.url),"utf8");
  assert.match(source,/const sameProposal=Boolean\(active\.proposal_id && activeProposal && active\.proposal_id===activeProposal\.id\)/);
  assert.match(source,/olderPr\.merged\|\|olderPr\.merged_at/);
  assert.match(source,/olderPr\.head\?\.ref!==active\.branch/);
  assert.match(source,/PREVIOUS_PR_UNAVAILABLE/);
  assert.match(source,/REPLACED_BY_FRESH_APPROVAL/);
  assert.match(source,/proposal_id IS NOT DISTINCT FROM \$4 RETURNING id/);
  assert.match(source,/status='SUPERSEDED'/);
  const ui=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
  assert.match(ui,/Nieuw veilig voorstel maken/);
  assert.match(ui,/setFix\(null\); setFixPlan\(null\); void runFix\(\)/);
});
