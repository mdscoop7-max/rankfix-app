// AutoFix merge safety (P0 31 Oct, Astra review of 54fab62: F1–F4, F7).
// Every scenario runs the REAL engine (tryAutoMerge / evaluate*) against a
// scripted, offline GitHub. "merged" means the engine called PUT /merge.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
register("./scan-matrix/loader.mjs", import.meta.url);
const E = await import("../lib/fix-engine.ts");
const P = await import("../lib/merge-policy.ts");

const H = "a".repeat(40);
const APPROVED = "<meta name=\"description\" content=\"Goedgekeurde tekst\">";
const APPROVED_SHA256 = await E.contentDigest(APPROVED);
const b64 = (text) => Buffer.from(text, "utf8").toString("base64");
const APP = 15368; // GitHub Actions
let nextId = 1000;
export const run = (name, conclusion, extra = {}) => ({ id: extra.id ?? nextId++, name, status: "completed", conclusion, head_sha: H, app: { id: APP }, check_suite: { id: 1 }, ...extra });

/** Scripted GitHub. Every field can be overridden per scenario; `fresh` changes the PR on the 2nd+ read. */
export function fakeGithub(over = {}) {
  const calls = [];
  const reads = { pull: 0, rules: 0, checks: 0, contents: 0, headContent: 0 };
  const s = {
    head: H, baseSha: "base1",
    rules: [{ type: "required_status_checks", ruleset_id: 9, parameters: { required_status_checks: [{ context: "build", integration_id: APP }] } }],
    rulesError: null, ruleset: { enforcement: "active", current_user_can_bypass: "never" }, rulesetError: null,
    protection: null, protectionError: 404,
    runs: () => [run("build", "success", { id: 1 })], total: null, checksError: null,
    statuses: [], statusError: null,
    baseBlob: "b1", baseError: null, headContent: APPROVED, headContentError: null,
    ...over,
  };
  const fail = (status) => { const e = new Error("GitHub " + status); e.status = status; throw e; };
  const gh = async (path, init = {}) => {
    const method = init.method || "GET"; calls.push(method + " " + path);
    if (s.onRequest) await s.onRequest(method, path, reads);
    const url = new URL("http://x" + path);
    if (/\/pulls\/7$/.test(url.pathname)) {
      reads.pull++;
      const base = { state: "open", merged: false, mergeable: true, mergeable_state: "clean", head: { sha: s.head, ref: "rankfix/x" }, base: { ref: "main", sha: s.baseSha } };
      return reads.pull >= 2 && s.fresh ? { ...base, ...(typeof s.fresh === "function" ? s.fresh(reads.pull) : s.fresh) } : base;
    }
    if (/\/pulls\/7\/files$/.test(url.pathname)) return [{ filename: "templates/index.html", additions: 1, deletions: 1, status: "modified" }];
    if (/\/pulls\/7\/merge$/.test(url.pathname)) return s.mergeError ? fail(s.mergeError) : { merged: true };
    if (/\/rules\/branches\//.test(url.pathname)) { reads.rules++; const err = typeof s.rulesError === "function" ? s.rulesError(reads.rules) : s.rulesError; if (err) fail(err); return typeof s.rules === "function" ? s.rules(reads.rules) : s.rules; }
    if (/\/rulesets\/\d+$/.test(url.pathname)) return s.rulesetError ? fail(s.rulesetError) : s.ruleset;
    if (/\/branches\/[^/]+\/protection$/.test(url.pathname)) return s.protectionError ? fail(s.protectionError) : s.protection;
    if (/\/check-runs$/.test(url.pathname)) {
      reads.checks++;
      if (s.checksError) fail(s.checksError);
      const runs = typeof s.runs === "function" ? s.runs(reads.checks) : s.runs;
      const page = Number(url.searchParams.get("page"));
      return { total_count: s.total ?? runs.length, check_runs: page === 1 ? runs : [] };
    }
    if (/\/actions\/runs$/.test(url.pathname)) {
      if (s.actionsError) fail(s.actionsError);
      const suite = url.searchParams.get("check_suite_id");
      const runs = s.workflowRuns ? s.workflowRuns(suite) : [{ id: 500 + Number(suite), head_sha: s.head }];
      return { total_count: runs.length, workflow_runs: runs };
    }
    if (/\/actions\/runs\/\d+\/jobs$/.test(url.pathname)) {
      if (s.jobsError) fail(s.jobsError);
      assert.equal(url.searchParams.get("filter"), "latest");
      const ids = s.latestJobs || [];
      const page = Number(url.searchParams.get("page"));
      return { total_count: ids.length, jobs: page === 1 ? ids.map((id) => ({ id: id + 9000, check_run_url: `https://api.github.com/repos/o/r/check-runs/${id}`, head_sha: s.head })) : [] };
    }
    if (/\/status$/.test(url.pathname)) { if (s.statusError) fail(s.statusError); return { sha: s.head, state: "pending", total_count: s.statuses.length, statuses: url.searchParams.get("page") === "1" ? s.statuses : [] }; }
    if (/\/contents\//.test(url.pathname) && /^[0-9a-f]{40}$/.test(url.searchParams.get("ref") || "")) {
      // File content at an immutable commit.
      if (s.headContentError) fail(s.headContentError);
      const n = ++reads.headContent;
      const text = url.searchParams.get("ref") === s.head ? (typeof s.headContent === "function" ? s.headContent(n) : s.headContent) : null;
      return text === null ? fail(404) : { type: "file", encoding: "base64", content: b64(text) };
    }
    if (/\/contents\//.test(url.pathname)) { reads.contents++; if (s.baseError) fail(s.baseError); return { sha: typeof s.baseBlob === "function" ? s.baseBlob(reads.contents) : s.baseBlob }; }
    return fail(404);
  };
  return { gh, calls, reads, state: s };
}
export const fixRow = (over = {}) => ({ id: "1", user_id: "u", issue_id: "META_DESCRIPTION_GUIDANCE", scanned_url: "https://x.test/", status: "AWAITING_MERGE", repository: "o/r", pr_number: 7, branch: "rankfix/x", base_branch: "main", file_path: "templates/index.html", auto_publish: true, head_sha: H, base_blob_sha: "b1", approved_content_sha256: APPROVED_SHA256, ...over });
// Minimal pending_fixes table: applies every "column=$n" of the engine's UPDATEs.
function tableDb(row, repo = { id: "m1", autofix_policy_floor: null }) {
  return { repo, query: async (sql, params = []) => {
    if (/^SELECT (?:id,)?autofix_policy_floor FROM website_repositories/.test(sql)) return { rows: [{ ...repo }], rowCount: 1 };
    if (/^UPDATE website_repositories SET autofix_policy_floor=\$3/.test(sql)) {
      if ((repo.autofix_policy_floor ?? null) !== params[3]) return { rows: [], rowCount: 0 };
      repo.autofix_policy_floor = params[2]; return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE pending_fixes SET merge_claim=\$3, merge_claim_at=NOW\(\)/.test(sql)) {
      const free = !row.merge_claim || (row.merge_claim_at && Date.now() - new Date(row.merge_claim_at).getTime() > 5 * 60_000);
      if (!["AWAITING_MERGE", "PR_CREATED"].includes(row.status) || row.auto_publish !== true || row.merged_at || row.head_sha !== params[3] || !free) return { rows: [], rowCount: 0 };
      row.merge_claim = params[2]; row.merge_claim_at = new Date(); return { rows: [{ id: row.id }], rowCount: 1 };
    }
    if (/^UPDATE pending_fixes SET merge_claim=NULL/.test(sql)) { if (row.merge_claim === params[2]) { row.merge_claim = null; row.merge_claim_at = null; } return { rows: [], rowCount: 1 }; }
    if (!/^UPDATE pending_fixes SET/.test(sql)) return { rows: [], rowCount: 1 };
    if (/status=\$\d+ RETURNING/.test(sql) && row.status !== params[params.length - 1]) return { rows: [], rowCount: 0 };
    for (const [, key, n] of sql.split(" WHERE ")[0].matchAll(/(\w+)=\$(\d+)/g)) row[key] = params[Number(n) - 1];
    return { rows: [{ ...row }], rowCount: 1 };
  } };
}
// The database row and the engine's copy are separate objects, as in production.
export async function attempt(ghOver = {}, rowOver = {}, dbOver = {}) {
  const dbRow = fixRow({ ...rowOver, ...dbOver });
  const db = tableDb(dbRow);
  const f = fakeGithub(typeof ghOver === "function" ? ghOver(dbRow) : ghOver);
  const result = await E.tryAutoMerge({ github: f.gh, db, probe: null }, fixRow(rowOver));
  return { result, merged: f.calls.some((c) => c.startsWith("PUT ") && c.endsWith("/merge")), calls: f.calls, reads: f.reads, dbRow };
}
const noMerge = async (name, ghOver, rowOver, code) => {
  const { result, merged } = await attempt(ghOver, rowOver);
  assert.equal(merged, false, `${name}: PUT /merge was called`);
  if (code) assert.equal(result.code, code, name);
  assert.notEqual(result.decision, "merged", name);
};

/* ------------------------------------------------------------ CI evidence (P0) */
const ciInput = (over = {}) => ({
  headSha: H,
  required: { checks: [{ context: "build", appId: APP, source: "ruleset" }] },
  checkRuns: { ok: true, runs: [run("build", "success", { id: 1 })], totalCount: 1 },
  statuses: { ok: true, sha: H, statuses: [], totalCount: 0 },
  ...over,
});
test("CI evidence: only every required app-bound check, completed and successful on this exact SHA, is ok", () => {
  assert.deepEqual(E.evaluateCiEvidence(ciInput()), { verdict: "ok", code: "CI_GREEN" });
  const cases = [
    ["no checks at all", { checkRuns: { ok: true, runs: [], totalCount: 0 } }, "REQUIRED_CHECK_MISSING"],
    ["check-runs API error", { checkRuns: { ok: false, runs: [], totalCount: null } }, "CI_UNAVAILABLE"],
    ["status API error", { statuses: { ok: false, sha: null, statuses: [], totalCount: null } }, "CI_UNAVAILABLE"],
    ["incomplete list", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1 })], totalCount: 3 } }, "CI_INCOMPLETE"],
    ["unknown total", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1 })], totalCount: null } }, "CI_INCOMPLETE"],
    ["incomplete statuses", { statuses: { ok: true, sha: H, statuses: [], totalCount: 2 } }, "CI_INCOMPLETE"],
    ["run on another SHA", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1, head_sha: "b".repeat(40) })], totalCount: 1 } }, "CI_SHA_MISMATCH"],
    ["statuses of another SHA", { statuses: { ok: true, sha: "b".repeat(40), statuses: [], totalCount: 0 } }, "CI_SHA_MISMATCH"],
    ["run without status", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1, status: undefined })], totalCount: 1 } }, "CI_UNRELIABLE"],
    ["no head SHA", { headSha: "" }, "EVIDENCE_MISSING"],
    ["no required set", { required: { checks: [] } }, "REQUIRED_CHECKS_UNDEFINED"],
    ["required set without app binding", { required: { checks: [{ context: "build", appId: null }] } }, "REQUIRED_CHECK_UNBOUND"],
    ["required skipped", { checkRuns: { ok: true, runs: [run("build", "skipped", { id: 1 })], totalCount: 1 } }, "REQUIRED_CHECK_NOT_SUCCESSFUL"],
    ["required neutral", { checkRuns: { ok: true, runs: [run("build", "neutral", { id: 1 })], totalCount: 1 } }, "REQUIRED_CHECK_NOT_SUCCESSFUL"],
    ["required stale", { checkRuns: { ok: true, runs: [run("build", "stale", { id: 1 })], totalCount: 1 } }, "CHECKS_FAILED"],
    ["other check failed", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1 }), run("lint", "failure", { id: 2, check_suite: { id: 2 } })], totalCount: 2 } }, "CHECKS_FAILED"],
    ["status error", { statuses: { ok: true, sha: H, statuses: [{ id: 1, context: "ci/x", state: "error" }], totalCount: 1 } }, "CHECKS_FAILED"],
    ["required still running", { checkRuns: { ok: true, runs: [run("build", null, { id: 1, status: "in_progress" })], totalCount: 1 } }, "CHECKS_PENDING"],
    ["only a random green check", { checkRuns: { ok: true, runs: [run("lint", "success", { id: 2 })], totalCount: 1 } }, "REQUIRED_CHECK_MISSING"],
    // Astra F1: a same-named check of another app, or a legacy status of any actor, never satisfies it.
    ["required check from another app", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1, app: { id: 999 } })], totalCount: 1 } }, "REQUIRED_CHECK_MISSING"],
    ["legacy commit status with the required name", { checkRuns: { ok: true, runs: [], totalCount: 0 }, statuses: { ok: true, sha: H, statuses: [{ id: 1, context: "build", state: "success", creator: { login: "unexpected-actor" } }], totalCount: 1 } }, "REQUIRED_CHECK_MISSING"],
  ];
  for (const [name, over, code] of cases) {
    const got = E.evaluateCiEvidence(ciInput(over));
    assert.equal(got.code, code, name);
    assert.notEqual(got.verdict, "ok", name);
  }
});

/* ------------------------------------------------------------ trusted policy (F1, F7) */
const serverOk = (over = {}) => ({ rules: "ok", protection: "none", checks: [{ context: "build", appId: APP, source: "ruleset" }], enforced: [`build#${APP}`], mergeQueue: false, ...over });
test("policy: only server-enforced, app-bound, non-bypassable checks support an automatic merge", () => {
  const ok = P.evaluatePolicy({ server: serverOk(), recorded: { valid: true, checks: [] }, snapshot: null });
  assert.equal(ok.verdict, "ok");
  const cases = [
    ["rules temporarily unavailable", { server: serverOk({ rules: "unavailable" }) }, "wait", "POLICY_UNAVAILABLE"],
    ["protection temporarily unavailable", { server: serverOk({ protection: "unavailable" }) }, "wait", "POLICY_UNAVAILABLE"],
    ["no rules at all", { server: serverOk({ checks: [], enforced: [] }) }, "block", "REQUIRED_CHECKS_UNDEFINED"],
    ["check without producer binding", { server: serverOk({ checks: [{ context: "build", appId: null, source: "ruleset" }], enforced: ["build#any"] }) }, "block", "REQUIRED_CHECK_UNBOUND"],
    ["identity can bypass the ruleset", { server: serverOk({ enforced: [] }) }, "block", "NOT_SERVER_ENFORCED"],
    ["only a recorded policy, nothing enforced by GitHub", { server: serverOk({ rules: "unreadable", checks: [], enforced: [] }), recorded: { valid: true, checks: [{ context: "build", appId: APP, source: "recorded" }] } }, "block", "NOT_SERVER_ENFORCED"],
    ["merge queue required", { server: serverOk({ mergeQueue: true }) }, "block", "MERGE_QUEUE_REQUIRED"],
    ["invalid recorded policy", { recorded: { valid: false, checks: [] } }, "block", "POLICY_INVALID"],
    ["earlier stricter requirement disappeared", { snapshot: { checks: [{ context: "build", appId: APP, source: "ruleset" }, { context: "e2e", appId: APP, source: "ruleset" }], strict: false } }, "block", "POLICY_WEAKENED"],
    ["earlier requirement now unreadable", { server: serverOk({ rules: "unreadable", checks: [], enforced: [] }), snapshot: { checks: [{ context: "build", appId: APP, source: "ruleset" }], strict: false } }, "block", "POLICY_UNREADABLE"],
  ];
  for (const [name, over, verdict, code] of cases) {
    const got = P.evaluatePolicy({ server: serverOk(), recorded: { valid: true, checks: [] }, snapshot: null, ...over });
    assert.equal(got.verdict, verdict, name); assert.equal(got.code, code, name);
  }
  // A recorded policy is an EXTRA requirement on top of server enforcement.
  const extra = P.evaluatePolicy({ server: serverOk(), recorded: { valid: true, checks: [{ context: "e2e", appId: APP, source: "recorded" }] }, snapshot: null });
  assert.equal(extra.verdict, "ok"); assert.deepEqual(extra.required.map((c) => c.context).sort(), ["build", "e2e"]);
});

test("policy reads: 404/403/429/5xx are distinguished and never lower the bar", async () => {
  assert.equal(P.readErrorState({ status: 404 }), "none");
  assert.equal(P.readErrorState({ status: 403 }), "unreadable");
  assert.equal(P.readErrorState({ status: 401 }), "unreadable");
  for (const s of [429, 500, 502, 503, undefined]) assert.equal(P.readErrorState({ status: s }), "unavailable", String(s));
  const { gh } = fakeGithub();
  const policy = await P.readServerPolicy(gh, "o/r", "main");
  assert.equal(policy.rules, "ok"); assert.deepEqual(policy.enforced, [`build#${APP}`]);
  const bypass = await P.readServerPolicy(fakeGithub({ ruleset: { enforcement: "active", current_user_can_bypass: "always" } }).gh, "o/r", "main");
  assert.deepEqual(bypass.enforced, []);
  const evaluate = await P.readServerPolicy(fakeGithub({ ruleset: { enforcement: "evaluate", current_user_can_bypass: "never" } }).gh, "o/r", "main");
  assert.deepEqual(evaluate.enforced, []);
  const adminNoEnforce = await P.readServerPolicy(fakeGithub({ rules: [], protectionError: null, protection: { required_status_checks: { checks: [{ context: "build", app_id: APP }] }, enforce_admins: { enabled: false } } }).gh, "o/r", "main");
  assert.equal(adminNoEnforce.protection, "ok"); assert.deepEqual(adminNoEnforce.enforced, []);
  const adminEnforced = await P.readServerPolicy(fakeGithub({ rules: [], protectionError: null, protection: { required_status_checks: { checks: [{ context: "build", app_id: APP }] }, enforce_admins: { enabled: true } } }).gh, "o/r", "main");
  assert.deepEqual(adminEnforced.enforced, [`build#${APP}`]);
  const legacyContexts = await P.readServerPolicy(fakeGithub({ rules: [], protectionError: null, protection: { required_status_checks: { contexts: ["build"], checks: [] }, enforce_admins: { enabled: true } } }).gh, "o/r", "main");
  assert.equal(legacyContexts.checks[0].appId, null);
});

test("recorded policy (F7): every item valid with an app_id, or the whole request is rejected", () => {
  assert.deepEqual(P.parseRecordedPolicy([{ context: "build", app_id: APP }, { context: "build", app_id: APP }]).checks, [{ context: "build", appId: APP, source: "recorded" }]);
  for (const v of [null, undefined, "", "[]", []]) { const r = P.parseRecordedPolicy(v); assert.equal(r.valid, true); assert.equal(r.checks.length, 0); }
  for (const bad of [["build"], '["build"]', [{ context: "build" }], [{ context: "build", app_id: -1 }], [{ context: "build", app_id: APP }, 7], [{ context: "x".repeat(121), app_id: APP }], [{ context: " build", app_id: APP }], Array.from({ length: 31 }, (_, i) => ({ context: "c" + i, app_id: APP })), "{", 42, {}])
    assert.equal(P.parseRecordedPolicy(bad).valid, false, JSON.stringify(bad).slice(0, 60));
});

/* ------------------------------------------------------------ tryAutoMerge end-to-end (offline) */
test("tryAutoMerge: proven green CI under a server-enforced, non-bypassable policy merges", async () => {
  const ok = await attempt();
  assert.equal(ok.result.code, "MERGED"); assert.equal(ok.merged, true);
});

test("tryAutoMerge (F1): wrong producer, unbound or unreadable policy, bypass or weakened rules → no merge", async () => {
  await noMerge("wrong app, enforced policy", { runs: () => [run("build", "success", { id: 1, app: { id: 999 } })] }, {}, "REQUIRED_CHECK_MISSING");
  await noMerge("legacy status with required name", { runs: () => [], statuses: [{ id: 1, context: "build", state: "success" }] }, {}, "REQUIRED_CHECK_MISSING");
  // Astra repro: protection unreadable + recorded name + check of app 999 merged on 54fab62.
  await noMerge("unreadable rules + recorded policy + wrong app", { rulesError: 403, runs: () => [run("build", "success", { id: 1, app: { id: 999 } })] }, { required_checks: JSON.stringify([{ context: "build", app_id: APP }]) }, "NOT_SERVER_ENFORCED");
  await noMerge("unreadable rules + legacy name-only recorded set", { rulesError: 403 }, { required_checks: '["build"]' }, "POLICY_INVALID");
  for (const status of [429, 500, 503]) await noMerge(`rules ${status}`, { rulesError: status }, {}, "POLICY_UNAVAILABLE");
  await noMerge("rules 403, nothing else", { rulesError: 403 }, {}, "REQUIRED_CHECKS_UNDEFINED");
  await noMerge("ruleset bypass possible", { ruleset: { enforcement: "active", current_user_can_bypass: "pull_requests_only" } }, {}, "NOT_SERVER_ENFORCED");
  await noMerge("ruleset unreadable", { rulesetError: 503 }, {}, "POLICY_UNAVAILABLE");
  await noMerge("unbound ruleset check", { rules: [{ type: "required_status_checks", ruleset_id: 9, parameters: { required_status_checks: [{ context: "build" }] } }] }, {}, "REQUIRED_CHECK_UNBOUND");
  await noMerge("merge queue", { rules: [{ type: "merge_queue", ruleset_id: 9, parameters: {} }] }, {}, "MERGE_QUEUE_REQUIRED");
  // A stricter policy seen earlier for this fix cannot be lost by a later 403/500.
  const snapshot = P.serializePolicy([{ context: "build", appId: APP, source: "ruleset", enforced: true }, { context: "e2e", appId: APP, source: "ruleset", enforced: true }]);
  await noMerge("earlier e2e requirement removed", {}, { required_policy: snapshot }, "POLICY_WEAKENED");
  await noMerge("earlier policy, rules now 403", { rulesError: 403 }, { required_policy: snapshot }, "POLICY_UNREADABLE");
  await noMerge("earlier policy, rules now 500", { rulesError: 500 }, { required_policy: snapshot }, "POLICY_UNAVAILABLE");
  // The policy seen is returned so the engine can keep it.
  const seen = await attempt({ runs: () => [] });
  assert.equal(seen.result.policy, P.serializePolicy([{ context: "build", appId: APP, source: "ruleset", enforced: true }]));
});

test("tryAutoMerge (P0): missing, failing, incomplete or unreadable CI evidence → no merge", async () => {
  await noMerge("missing CI", { runs: () => [] }, {}, "REQUIRED_CHECK_MISSING");
  await noMerge("check-runs 500", { checksError: 500 }, {}, "CI_UNAVAILABLE");
  await noMerge("check-runs 404", { checksError: 404 }, {}, "CI_UNAVAILABLE");
  await noMerge("status 502", { statusError: 502 }, {}, "CI_UNAVAILABLE");
  await noMerge("incomplete pagination", { total: 4 }, {}, "CI_INCOMPLETE");
  await noMerge("skipped required", { runs: () => [run("build", "skipped", { id: 1 })] }, {}, "REQUIRED_CHECK_NOT_SUCCESSFUL");
  await noMerge("head changed since approval", { head: "c".repeat(40) }, {}, "HEAD_CHANGED");
  await noMerge("approved head not stored", {}, { head_sha: null }, "EVIDENCE_MISSING");
  await noMerge("approved base blob not stored", {}, { base_blob_sha: null }, "EVIDENCE_MISSING");
  await noMerge("base file unreadable", { baseError: 500 }, {}, "BASE_UNAVAILABLE");
});

/* ------------------------------------------------------------ re-runs vs independent workflows (F2) */
test("CI evidence (F2, 31 Oct): same-named runs in one suite count only with GitHub's latest-attempt proof", () => {
  const ev = (runs, attempts) => E.evaluateCiEvidence(ciInput({ checkRuns: { ok: true, runs, totalCount: runs.length }, attempts }));
  const rerun = [run("build", "failure", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 5 } })];
  // Real re-run: GitHub lists id 2 as the latest attempt of the job.
  assert.equal(ev(rerun, { 5: { ok: true, latestRunIds: [2, 7] } }).verdict, "ok");
  // Without proof the same data is ambiguous (two different jobs could share the name).
  assert.equal(ev(rerun).code, "CI_AMBIGUOUS");
  // Two DIFFERENT jobs in the same suite named "build": both are latest → ambiguous, never green.
  assert.equal(ev(rerun, { 5: { ok: true, latestRunIds: [1, 2] } }).code, "CI_AMBIGUOUS");
  // A re-run that failed again after a success is still a failure.
  assert.equal(ev([run("build", "success", { id: 1, check_suite: { id: 5 } }), run("build", "failure", { id: 2, check_suite: { id: 5 } })], { 5: { ok: true, latestRunIds: [2] } }).code, "CHECKS_FAILED");
  // Proof unreadable → unavailable; proof that names neither run → unreliable.
  assert.equal(ev(rerun, { 5: { ok: false, latestRunIds: [] } }).code, "CI_UNAVAILABLE");
  assert.equal(ev(rerun, { 5: { ok: true, latestRunIds: [99] } }).code, "CI_UNRELIABLE");
  // Independent workflows (different suites), same job name and app.
  assert.equal(ev([run("build", "failure", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 6 } })]).code, "CHECKS_FAILED");
  assert.equal(ev([run("build", "success", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 6 } })]).code, "CI_AMBIGUOUS");
  assert.equal(ev([run("build", "success", { id: 1, check_suite: null })]).code, "CI_UNRELIABLE");
  assert.equal(ev([run("build", "success", { id: 1, app: null })]).code, "CI_UNRELIABLE");
});

test("tryAutoMerge (F2, 31 Oct): different jobs with one name never merge; a proven re-run does", async () => {
  const rerunRuns = () => [run("build", "failure", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 5 } })];
  const proven = await attempt({ runs: rerunRuns, latestJobs: [2] });
  assert.equal(proven.merged, true);
  assert.ok(proven.calls.some((c) => /actions\/runs\?check_suite_id=5/.test(c)));
  await noMerge("two jobs named build in one workflow run (one failed)", { runs: rerunRuns, latestJobs: [1, 2] }, {}, "CI_AMBIGUOUS");
  await noMerge("two jobs named build, both green", { runs: () => [run("build", "success", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 5 } })], latestJobs: [1, 2] }, {}, "CI_AMBIGUOUS");
  await noMerge("not a GitHub Actions suite (no workflow run)", { runs: rerunRuns, workflowRuns: () => [] }, {}, "CI_AMBIGUOUS");
  await noMerge("workflow run of another commit", { runs: rerunRuns, workflowRuns: (suite) => [{ id: 505, head_sha: "e".repeat(40) }] }, {}, "CI_AMBIGUOUS");
  await noMerge("jobs API error", { runs: rerunRuns, jobsError: 500 }, {}, "CI_UNAVAILABLE");
  await noMerge("actions API error", { runs: rerunRuns, actionsError: 502 }, {}, "CI_UNAVAILABLE");
  await noMerge("independent workflows, failed then success", { runs: () => [run("build", "failure", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 6 } })] }, {}, "CHECKS_FAILED");
  await noMerge("independent workflows, both success", { runs: () => [run("build", "success", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 6 } })] }, {}, "CI_AMBIGUOUS");
});

/* ------------------------------------------------------------ final re-check before merge (F3) */
test("tryAutoMerge (F3): the complete evaluation runs twice, right before the merge", async () => {
  const ok = await attempt();
  assert.equal(ok.merged, true);
  assert.equal(ok.reads.pull, 2); assert.equal(ok.reads.rules, 2); assert.equal(ok.reads.checks, 2); assert.equal(ok.reads.contents, 2);
});

test("tryAutoMerge (F3): any change or new blocker between evaluation and merge → no merge", async () => {
  // Astra repro: first PR read clean, second blocked/unstable/unknown/behind merged on 54fab62.
  await noMerge("final PR blocked", { fresh: { mergeable_state: "blocked" } }, {}, "BRANCH_PROTECTED");
  await noMerge("final PR unstable", { fresh: { mergeable_state: "unstable" } }, {}, "CHECKS_FAILED");
  await noMerge("final PR unknown", { fresh: { mergeable: null, mergeable_state: "unknown" } }, {}, "MERGEABILITY_PENDING");
  await noMerge("final PR behind", { fresh: { mergeable_state: "behind" } }, {}, "BASE_ADVANCED");
  await noMerge("final PR conflict", { fresh: { mergeable: false, mergeable_state: "dirty" } }, {}, "MERGE_CONFLICT");
  await noMerge("final PR closed", { fresh: { state: "closed" } }, {}, "PR_CLOSED");
  await noMerge("final head changed", { fresh: { head: { sha: "c".repeat(40), ref: "rankfix/x" } } }, {}, "HEAD_CHANGED");
  await noMerge("base commit advanced, same head", { fresh: { base: { ref: "main", sha: "base2" } } }, {}, "EVIDENCE_CHANGED");
  await noMerge("base commit missing", { baseSha: "" }, {}, "EVIDENCE_MISSING");
  await noMerge("CI restarted before merge", { runs: (n) => (n === 1 ? [run("build", "success", { id: 1 })] : [run("build", null, { id: 2, status: "in_progress" })]) }, {}, "CHECKS_PENDING");
  await noMerge("required check failed on re-read", { runs: (n) => (n === 1 ? [run("build", "success", { id: 1 })] : [run("build", "failure", { id: 1 })]) }, {}, "CHECKS_FAILED");
  const twoChecks = [{ type: "required_status_checks", ruleset_id: 9, parameters: { required_status_checks: [{ context: "build", integration_id: APP }, { context: "e2e", integration_id: APP }] } }];
  await noMerge("stricter policy added before merge", { rules: (n) => (n === 1 ? fakeGithub().state.rules : twoChecks) }, {}, "REQUIRED_CHECK_MISSING");
  await noMerge("policy weakened before merge", { rules: (n) => (n === 1 ? twoChecks : fakeGithub().state.rules), runs: () => [run("build", "success", { id: 1 }), run("e2e", "success", { id: 2 })] }, {}, "EVIDENCE_CHANGED");
  await noMerge("policy unavailable on re-read", { rulesError: (n) => (n > 1 ? 503 : null) }, {}, "POLICY_UNAVAILABLE");
  await noMerge("policy unreadable on re-read", { rulesError: (n) => (n > 1 ? 403 : null) }, {}, "REQUIRED_CHECKS_UNDEFINED");
  await noMerge("base file changed before merge", { baseBlob: (n) => (n === 1 ? "b1" : "b2") }, {}, "STALE_BASE");
  // After both evaluations GitHub itself is the last defence: a refusal is reported, never retried as success.
  for (const [mergeError, code] of [[405, "MERGE_REJECTED"], [403, "MERGE_REJECTED"], [422, "MERGE_REJECTED"], [409, "HEAD_CHANGED"]]) {
    const { result } = await attempt({ mergeError });
    assert.deepEqual([result.decision, result.code], ["block", code], `server ${mergeError}`);
  }
});

/* ------------------------------------------------------------ approved content bound to the immutable head (F4) */
test("tryAutoMerge (F4): the approved content must be exactly the file at the immutable head commit", async () => {
  const ok = await attempt();
  assert.equal(ok.merged, true); assert.equal(ok.reads.headContent, 2);
  // Another small change in the SAME file (within the line limit) on the approved SHA.
  await noMerge("same-file change", { headContent: APPROVED + "\n<!-- extra -->" }, {}, "CONTENT_MISMATCH");
  await noMerge("content changes between the two evaluations", { headContent: (n) => (n === 1 ? APPROVED : APPROVED + " ") }, {}, "CONTENT_MISMATCH");
  await noMerge("approved content hash not stored (legacy fix)", {}, { approved_content_sha256: null }, "EVIDENCE_MISSING");
  await noMerge("file missing at head", { headContent: null }, {}, "CONTENT_UNAVAILABLE");
  await noMerge("content API error", { headContentError: 502 }, {}, "CONTENT_UNAVAILABLE");
  await noMerge("binary / invalid UTF-8", { headContent: "\uFFFD" }, { approved_content_sha256: "0".repeat(64) }, "CONTENT_MISMATCH");
});

test("fix route (F4): the stored head SHA is the commit RankFix wrote, verified at that exact SHA", () => {
  const src = readFileSync(new URL("../app/api/github/fix/route.ts", import.meta.url), "utf8");
  assert.match(src, /approvedCommitSha=typeof put\?\.commit\?\.sha==="string"/);
  assert.match(src, /contents\/"\+path\+"\?ref="\+approvedCommitSha/);
  assert.doesNotMatch(src, /const headRef=await githubFetch/);
  assert.match(src, /approved_content_sha256/);
});

/* ------------------------------------------------------------ recovery (F5) */
const R = await import("../lib/fix-recovery.ts");
test("recovery actions: resume only for stops new evidence can resolve; cancel only unmerged tasks", () => {
  for (const code of ["REQUIRED_CHECKS_UNDEFINED", "NOT_SERVER_ENFORCED", "CI_UNAVAILABLE", "EVIDENCE_MISSING", "MERGE_TIMEOUT", "POLICY_UNAVAILABLE"])
    assert.equal(R.fixActions({ status: "NEEDS_ATTENTION", last_error_code: code, merged_at: null }).resume, true, code);
  for (const code of ["CONTENT_MISMATCH", "HEAD_CHANGED", "UNEXPECTED_FILES", "STALE_BASE", "POLICY_WEAKENED", "PR_CLOSED", "DEPLOY_FAILED"])
    assert.equal(R.fixActions({ status: "NEEDS_ATTENTION", last_error_code: code, merged_at: null }).resume, false, code);
  assert.equal(R.fixActions({ status: "AWAITING_MERGE", last_error_code: "CI_UNAVAILABLE", merged_at: null }).resume, false);
  assert.equal(R.fixActions({ status: "NEEDS_ATTENTION", last_error_code: "MERGE_REJECTED", merged_at: new Date() }).cancel, false);
  assert.equal(R.fixActions({ status: "AWAITING_DEPLOYMENT", last_error_code: null, merged_at: null }).cancel, false);
});

test("legacy evidence is recovered only from the approved content at the PR's immutable head", async () => {
  const proposal = { proposed_content: APPROVED, base_blob_sha: "b1", file_path: "templates/index.html", repository: "o/r", base_branch: "main" };
  const legacy = { head_sha: null, approved_content_sha256: null, base_blob_sha: null };
  const ok = await R.recoverLegacyEvidence(fakeGithub().gh, fixRow(legacy), proposal);
  assert.deepEqual(ok, { ok: true, fields: { head_sha: H, approved_content_sha256: APPROVED_SHA256, base_blob_sha: "b1" } });
  assert.equal((await R.recoverLegacyEvidence(fakeGithub({ headContent: APPROVED + "x" }).gh, fixRow(legacy), proposal)).code, "CONTENT_MISMATCH");
  assert.equal((await R.recoverLegacyEvidence(fakeGithub().gh, fixRow(legacy), null)).code, "EVIDENCE_MISSING");
  assert.equal((await R.recoverLegacyEvidence(fakeGithub().gh, fixRow(legacy), { ...proposal, file_path: "other.html" })).code, "EVIDENCE_MISSING");
  assert.equal((await R.recoverLegacyEvidence(fakeGithub({ fresh: null, head: "c".repeat(40) }).gh, fixRow({ ...legacy, head_sha: H }), proposal)).code, "HEAD_CHANGED");
  const merged = await R.recoverLegacyEvidence(async (path) => (/pulls\/7$/.test(path) ? { merged: true, state: "closed", head: { sha: H, ref: "rankfix/x" } } : {}), fixRow(legacy), proposal);
  assert.equal(merged.code, "EVIDENCE_MISSING");
});

/* ------------------------------------------------------------ real cause instead of MERGE_TIMEOUT (F6) */
const advance = async (ghOver, rowOver) => {
  const row = fixRow({ phase_started_at: new Date(Date.now() - 20 * 60_000), ...rowOver });
  const f = fakeGithub(ghOver);
  await E.advanceFix({ db: tableDb(row), github: f.gh, probe: async () => ({ reachable: false, httpStatus: null, blocked: false, html: "" }) }, row);
  return { row, view: E.publicFixView(row) };
};

test("after the wait limit the real cause is kept and shown, with the missing checks", async () => {
  const { row, view } = await advance({ runs: () => [] });
  assert.equal(row.status, "NEEDS_ATTENTION");
  assert.equal(row.last_error_code, "REQUIRED_CHECK_MISSING");
  assert.deepEqual(JSON.parse(row.stop_detail).missing, ["build"]);
  assert.equal(view.timed_out, true); assert.equal(view.reason_kind, "ci_missing");
  assert.deepEqual(view.missing_checks, ["build"]);
  assert.match(view.reason, /verplichte GitHub-controle/); assert.match(view.reason, /Betreft: build/); assert.match(view.reason, /maximale wachttijd/);
  assert.equal(view.actions.resume, true);
});

test("each stop category stays distinguishable: CI missing, evidence unreadable, policy, GitHub refused", async () => {
  assert.equal((await advance({ checksError: 500 })).view.reason_kind, "evidence_unreadable");
  assert.equal((await advance({ rulesError: 503 })).row.last_error_code, "POLICY_UNAVAILABLE");
  assert.equal((await advance({ ruleset: { enforcement: "active", current_user_can_bypass: "always" } })).view.reason_kind, "policy");
  const refused = await advance({ mergeError: 405 });
  assert.equal(refused.row.last_error_code, "MERGE_REJECTED"); assert.equal(refused.view.reason_kind, "github_refused"); assert.equal(refused.view.timed_out, false);
  // Only "GitHub never decided mergeability" becomes MERGE_TIMEOUT.
  const unknown = await advance({ fresh: { mergeable: null, mergeable_state: "unknown" } });
  assert.equal(unknown.row.last_error_code, "MERGE_TIMEOUT"); assert.equal(unknown.view.reason_kind, "github_refused");
  assert.doesNotMatch(unknown.view.reason, /stond het samenvoegen niet/);
});

test("while waiting during execution the customer sees why", async () => {
  const { row, view } = await advance({ runs: () => [run("build", null, { id: 1, status: "in_progress" })] }, { phase_started_at: new Date() });
  assert.equal(row.status, "AWAITING_MERGE");
  assert.equal(view.stage, "executing"); assert.equal(view.reason_code, "CHECKS_PENDING"); assert.equal(view.reason_kind, "ci_missing"); assert.equal(view.timed_out, false);
});

/* ------------------------------------------------------------ stricter policy survives resume / new tasks; unreadable or weakened server protection (31 Oct, points 2 and 4) */
const floorOf = (checks, strict = false) => ({ checks: checks.map(([context, enforced = true, source = "ruleset"]) => ({ context, appId: APP, source, enforced })), strict });
test("policy floor: a requirement, its enforcement or 'strict' can never silently disappear", () => {
  const ev = (over) => P.evaluatePolicy({ server: serverOk(), recorded: { valid: true, checks: [] }, snapshot: null, ...over });
  // Server dropped "build" but the owner still records it: was enforced, now only recorded.
  assert.equal(ev({ server: serverOk({ checks: [{ context: "lint", appId: APP, source: "ruleset" }], enforced: [`lint#${APP}`] }), recorded: { valid: true, checks: [{ context: "build", appId: APP, source: "recorded" }] }, snapshot: floorOf([["build"]]) }).code, "POLICY_WEAKENED");
  assert.equal(ev({ snapshot: floorOf([["build"]], true) }).code, "POLICY_WEAKENED");
  assert.equal(ev({ server: serverOk({ strict: true }), snapshot: floorOf([["build"]], true) }).verdict, "ok");
  assert.equal(ev({ snapshot: "corrupt" }).code, "POLICY_UNREADABLE");
  assert.equal(ev({ server: serverOk({ rulesetUnreadable: true }) }).code, "RULESET_UNREADABLE");
  // A blocked evaluation still reports what it saw, so the stricter set is kept.
  const blocked = ev({ server: serverOk({ checks: [{ context: "build", appId: APP, source: "ruleset" }, { context: "e2e", appId: APP, source: "ruleset" }], enforced: [] }) });
  assert.equal(blocked.code, "NOT_SERVER_ENFORCED");
  assert.deepEqual(P.parsePolicySnapshot(blocked.observed).checks.map((c) => c.context).sort(), ["build", "e2e"]);
  // Old array snapshots still parse; garbage is "corrupt", never "no floor".
  assert.equal(P.parsePolicySnapshot('[{"context":"build","app_id":15368}]').checks[0].context, "build");
  for (const bad of ["{", '{"x":1}', '[{"context":""}]', 42]) assert.equal(P.parsePolicySnapshot(bad), "corrupt", String(bad));
  assert.equal(P.parsePolicySnapshot(null), null);
});

test("server protection: an unreadable or incomplete ruleset is never skipped", async () => {
  for (const rulesetError of [403, 404]) assert.equal((await P.readServerPolicy(fakeGithub({ rulesetError }).gh, "o/r", "main")).rulesetUnreadable, true, String(rulesetError));
  assert.equal((await P.readServerPolicy(fakeGithub({ ruleset: { enforcement: "active" } }).gh, "o/r", "main")).rulesetUnreadable, true);
  const strict = await P.readServerPolicy(fakeGithub({ rules: [{ type: "required_status_checks", ruleset_id: 9, parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "build", integration_id: APP }] } }] }).gh, "o/r", "main");
  assert.equal(strict.strict, true);
  await noMerge("ruleset 403", { rulesetError: 403 }, {}, "RULESET_UNREADABLE");
  await noMerge("ruleset 404", { rulesetError: 404 }, {}, "RULESET_UNREADABLE");
  await noMerge("ruleset without bypass information", { ruleset: { enforcement: "active" } }, {}, "RULESET_UNREADABLE");
  await noMerge("second, unreadable ruleset next to an enforced one", { rules: [...fakeGithub().state.rules, { type: "required_status_checks", ruleset_id: 10, parameters: { required_status_checks: [{ context: "e2e", integration_id: APP }] } }], rulesetError: null, ruleset: undefined }, {}, null);
  await noMerge("strict switched off since approval", {}, { required_policy: P.serializePolicy([{ context: "build", appId: APP, source: "ruleset", enforced: true }], true) }, "POLICY_WEAKENED");
  await noMerge("corrupt stored policy", {}, { required_policy: "{not json" }, "POLICY_UNREADABLE");
});

test("resume after a blocked policy keeps the stricter requirements (Astra scenario)", async () => {
  const strictRules = [{ type: "required_status_checks", ruleset_id: 9, parameters: { required_status_checks: [{ context: "build", integration_id: APP }, { context: "e2e", integration_id: APP }] } }];
  const row = fixRow({ phase_started_at: new Date() });
  const db = tableDb(row);
  const probe = async () => ({ reachable: false, httpStatus: null, blocked: false, html: "" });
  // 1. build+e2e required, but RankFix could bypass → blocked, floor stored anyway.
  await E.advanceFix({ db, github: fakeGithub({ rules: strictRules, ruleset: { enforcement: "active", current_user_can_bypass: "always" } }).gh, probe }, row);
  assert.equal(row.last_error_code, "NOT_SERVER_ENFORCED");
  assert.deepEqual(P.parsePolicySnapshot(row.required_policy).checks.map((c) => c.context).sort(), ["build", "e2e"]);
  assert.deepEqual(P.parsePolicySnapshot(db.repo.autofix_policy_floor).checks.map((c) => c.context).sort(), ["build", "e2e"]);
  // 2. Owner removes the bypass but also drops e2e, then resumes: no merge.
  Object.assign(row, { status: "AWAITING_MERGE", last_error_code: null, next_check_at: null });
  const f = fakeGithub();
  await E.advanceFix({ db, github: f.gh, probe }, row);
  assert.equal(f.calls.some((c) => c.startsWith("PUT ")), false);
  assert.equal(row.last_error_code, "POLICY_WEAKENED");
  // 3. A NEW task for the same repository+branch inherits the floor.
  const fresh = fixRow({ id: "2", phase_started_at: new Date() });
  const g = fakeGithub();
  await E.advanceFix({ db: tableDb(fresh, db.repo), github: g.gh, probe }, fresh);
  assert.equal(g.calls.some((c) => c.startsWith("PUT ")), false);
  assert.equal(fresh.last_error_code, "POLICY_WEAKENED");
});

/* ------------------------------------------------------------ cancel / revoke during the evaluation (31 Oct, point 1) */
test("a cancel, a revoked consent or a parallel merge during the evaluation prevents the merge", async () => {
  // The owner acts while RankFix is between its first evaluation and the merge.
  const during = (change) => (dbRow) => ({ onRequest: async (method, path, reads) => { if (reads.pull === 2) change(dbRow); } });
  for (const [name, change] of [
    ["cancelled", (r) => { r.status = "CANCELLED"; r.auto_publish = false; }],
    ["consent revoked (auto_publish off)", (r) => { r.auto_publish = false; }],
    ["moved to NEEDS_ATTENTION", (r) => { r.status = "NEEDS_ATTENTION"; }],
    ["head SHA replaced in the database", (r) => { r.head_sha = "f".repeat(40); }],
    ["another poller already claimed the merge", (r) => { r.merge_claim = "other"; r.merge_claim_at = new Date(); }],
  ]) {
    const { result, merged } = await attempt(during(change));
    assert.equal(merged, false, name); assert.equal(result.code, "AUTHORIZATION_CHANGED", name);
  }
  // A stale claim (crashed worker) does not block forever.
  const stale = await attempt({}, {}, { merge_claim: "old", merge_claim_at: new Date(Date.now() - 10 * 60_000) });
  assert.equal(stale.merged, true);
});

test("the claim is held during the merge request and released only on a definitive answer", async () => {
  const ok = await attempt();
  assert.equal(ok.merged, true); assert.ok(ok.dbRow.merge_claim, "claim held until the engine records the merge");
  const refused = await attempt({ mergeError: 405 });
  assert.equal(refused.result.code, "MERGE_REJECTED"); assert.equal(refused.dbRow.merge_claim, null);
  // Unknown outcome (network/time-out): the claim stays, so a cancel cannot race the in-flight merge.
  const dbRow = fixRow(); const db = tableDb(dbRow); const f = fakeGithub({ mergeError: 504 });
  await assert.rejects(E.tryAutoMerge({ github: f.gh, db, probe: null }, fixRow()));
  assert.ok(dbRow.merge_claim);
  // The merge request carries a time-out signal.
  const src = readFileSync(new URL("../lib/fix-engine.ts", import.meta.url), "utf8");
  assert.match(src, /signal: AbortSignal\.timeout\(MERGE_REQUEST_TIMEOUT_MS\)/);
});

test("advanceFix: after AUTHORIZATION_CHANGED nothing is written from the stale copy; a merge clears the claim", async () => {
  const dbRow = fixRow({ phase_started_at: new Date() }); const db = tableDb(dbRow);
  const engineRow = { ...dbRow };
  const f = fakeGithub({ onRequest: async (m, p, reads) => { if (reads.pull === 2) { dbRow.status = "CANCELLED"; dbRow.last_error_code = "CANCELLED_BY_OWNER"; } } });
  await E.advanceFix({ db, github: f.gh, probe: async () => ({ reachable: false }) }, engineRow);
  assert.equal(dbRow.status, "CANCELLED"); assert.equal(dbRow.last_error_code, "CANCELLED_BY_OWNER");
  const okRow = fixRow({ phase_started_at: new Date() }); const okDb = tableDb(okRow);
  await E.advanceFix({ db: okDb, github: fakeGithub().gh, probe: async () => ({ reachable: false }) }, { ...okRow });
  assert.equal(okRow.status, "AWAITING_DEPLOYMENT"); assert.equal(okRow.merge_claim, null);
});
