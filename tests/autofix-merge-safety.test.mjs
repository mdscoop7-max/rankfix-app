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
const APP = 15368; // GitHub Actions
let nextId = 1000;
export const run = (name, conclusion, extra = {}) => ({ id: extra.id ?? nextId++, name, status: "completed", conclusion, head_sha: H, app: { id: APP }, check_suite: { id: 1 }, ...extra });

/** Scripted GitHub. Every field can be overridden per scenario; `fresh` changes the PR on the 2nd+ read. */
export function fakeGithub(over = {}) {
  const calls = [];
  const reads = { pull: 0, rules: 0, checks: 0, contents: 0 };
  const s = {
    head: H, baseSha: "base1",
    rules: [{ type: "required_status_checks", ruleset_id: 9, parameters: { required_status_checks: [{ context: "build", integration_id: APP }] } }],
    rulesError: null, ruleset: { enforcement: "active", current_user_can_bypass: "never" }, rulesetError: null,
    protection: null, protectionError: 404,
    runs: () => [run("build", "success", { id: 1 })], total: null, checksError: null,
    statuses: [], statusError: null,
    baseBlob: "b1", baseError: null,
    ...over,
  };
  const fail = (status) => { const e = new Error("GitHub " + status); e.status = status; throw e; };
  const gh = async (path, init = {}) => {
    const method = init.method || "GET"; calls.push(method + " " + path);
    const url = new URL("http://x" + path);
    if (/\/pulls\/7$/.test(url.pathname)) {
      reads.pull++;
      const base = { state: "open", merged: false, mergeable: true, mergeable_state: "clean", head: { sha: s.head, ref: "rankfix/x" }, base: { ref: "main", sha: s.baseSha } };
      return reads.pull >= 2 && s.fresh ? { ...base, ...(typeof s.fresh === "function" ? s.fresh(reads.pull) : s.fresh) } : base;
    }
    if (/\/pulls\/7\/files$/.test(url.pathname)) return [{ filename: "templates/index.html", additions: 1, deletions: 1, status: "modified" }];
    if (/\/pulls\/7\/merge$/.test(url.pathname)) return s.mergeError ? fail(s.mergeError) : { merged: true };
    if (/\/rules\/branches\//.test(url.pathname)) { reads.rules++; if (s.rulesError) fail(typeof s.rulesError === "function" ? s.rulesError(reads.rules) : s.rulesError); return typeof s.rules === "function" ? s.rules(reads.rules) : s.rules; }
    if (/\/rulesets\/\d+$/.test(url.pathname)) return s.rulesetError ? fail(s.rulesetError) : s.ruleset;
    if (/\/branches\/[^/]+\/protection$/.test(url.pathname)) return s.protectionError ? fail(s.protectionError) : s.protection;
    if (/\/check-runs$/.test(url.pathname)) {
      reads.checks++;
      if (s.checksError) fail(s.checksError);
      const runs = typeof s.runs === "function" ? s.runs(reads.checks) : s.runs;
      const page = Number(url.searchParams.get("page"));
      return { total_count: s.total ?? runs.length, check_runs: page === 1 ? runs : [] };
    }
    if (/\/status$/.test(url.pathname)) { if (s.statusError) fail(s.statusError); return { sha: s.head, state: "pending", total_count: s.statuses.length, statuses: url.searchParams.get("page") === "1" ? s.statuses : [] }; }
    if (/\/contents\//.test(url.pathname)) { reads.contents++; if (s.baseError) fail(s.baseError); return { sha: typeof s.baseBlob === "function" ? s.baseBlob(reads.contents) : s.baseBlob }; }
    return fail(404);
  };
  return { gh, calls, reads, state: s };
}
export const fixRow = (over = {}) => ({ id: "1", user_id: "u", issue_id: "META_DESCRIPTION_GUIDANCE", scanned_url: "https://x.test/", status: "AWAITING_MERGE", repository: "o/r", pr_number: 7, branch: "rankfix/x", base_branch: "main", file_path: "templates/index.html", auto_publish: true, head_sha: H, base_blob_sha: "b1", ...over });
export async function attempt(ghOver = {}, rowOver = {}) {
  const f = fakeGithub(ghOver);
  const result = await E.tryAutoMerge({ github: f.gh, db: null, probe: null }, fixRow(rowOver));
  return { result, merged: f.calls.some((c) => c.startsWith("PUT ") && c.endsWith("/merge")), calls: f.calls, reads: f.reads };
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
    ["earlier stricter requirement disappeared", { snapshot: [{ context: "build", appId: APP }, { context: "e2e", appId: APP }] }, "block", "POLICY_WEAKENED"],
    ["earlier requirement now unreadable", { server: serverOk({ rules: "unreadable", checks: [], enforced: [] }), snapshot: [{ context: "build", appId: APP }] }, "block", "POLICY_UNREADABLE"],
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
  const snapshot = P.serializePolicy([{ context: "build", appId: APP, source: "ruleset" }, { context: "e2e", appId: APP, source: "ruleset" }]);
  await noMerge("earlier e2e requirement removed", {}, { required_policy: snapshot }, "POLICY_WEAKENED");
  await noMerge("earlier policy, rules now 403", { rulesError: 403 }, { required_policy: snapshot }, "POLICY_UNREADABLE");
  await noMerge("earlier policy, rules now 500", { rulesError: 500 }, { required_policy: snapshot }, "POLICY_UNAVAILABLE");
  // The policy seen is returned so the engine can keep it.
  const seen = await attempt({ runs: () => [] });
  assert.equal(seen.result.policy, P.serializePolicy([{ context: "build", appId: APP, source: "ruleset" }]));
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
test("CI evidence (F2): only a newer attempt in the SAME check suite counts as a re-run", () => {
  const ev = (runs) => E.evaluateCiEvidence(ciInput({ checkRuns: { ok: true, runs, totalCount: runs.length } }));
  // True re-run: same workflow run (check suite), failed attempt then successful attempt.
  assert.equal(ev([run("build", "failure", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 5 } })]).verdict, "ok");
  // A re-run that fails again after a success is still a failure.
  assert.equal(ev([run("build", "success", { id: 1, check_suite: { id: 5 } }), run("build", "failure", { id: 2, check_suite: { id: 5 } })]).code, "CHECKS_FAILED");
  // Astra repro: two independent workflows, same job name and same app (GitHub Actions).
  assert.equal(ev([run("build", "failure", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 6 } })]).code, "CHECKS_FAILED");
  assert.equal(ev([run("build", "success", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 6 } })]).code, "CI_AMBIGUOUS");
  assert.equal(ev([run("build", "success", { id: 1, check_suite: null })]).code, "CI_UNRELIABLE");
  assert.equal(ev([run("build", "success", { id: 1, app: null })]).code, "CI_UNRELIABLE");
});

test("tryAutoMerge (F2): independent same-named workflows never merge; a real re-run does", async () => {
  await noMerge("independent workflows, failed then success", { runs: () => [run("build", "failure", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 6 } })] }, {}, "CHECKS_FAILED");
  await noMerge("independent workflows, both success", { runs: () => [run("build", "success", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 6 } })] }, {}, "CI_AMBIGUOUS");
  const rerun = await attempt({ runs: () => [run("build", "failure", { id: 1, check_suite: { id: 5 } }), run("build", "success", { id: 2, check_suite: { id: 5 } })] });
  assert.equal(rerun.merged, true);
});
