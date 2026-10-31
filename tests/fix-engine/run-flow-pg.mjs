// End-to-end Fix Engine workflow against a REAL PostgreSQL database, the REAL API routes
// (scan, ai-fix, github/fix, site-repository, fixes/status), a simulated GitHub and a
// simulated website that only changes after a simulated deployment. No network is used.
//
// Run: RF_REAL_DB=1 DATABASE_URL=postgres://... node --experimental-strip-types \
//        --import ./tests/scan-matrix/register.mjs tests/fix-engine/run-flow-pg.mjs
import { createHash } from "node:crypto";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const problems = [];
const results = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); return cond; };
const quiet = () => { const s = [console.info, console.warn, console.log, console.error]; console.info = console.warn = console.error = () => {}; return () => { [console.info, console.warn, console.log, console.error] = s; }; };

const { getDb } = await import(ROOT + "/lib/db.ts");
const { ensureDatabase } = await import(ROOT + "/lib/db-init.ts");
const { encryptToken } = await import(ROOT + "/lib/github.ts");
const db = getDb();
await ensureDatabase();

/* ------------------------------------------------------------------ fake GitHub */
const sha = (v) => createHash("sha1").update(String(v)).digest("hex");
function makeRepo(fullName, files, opts = {}) {
  // Every commit is an immutable snapshot, readable by its SHA (Astra F4).
  const snapshots = {};
  const commit = (fs) => { const id = sha(JSON.stringify(fs) + Math.random()); snapshots[id] = { files: { ...fs } }; return id; };
  const main = { files: { ...files } }; main.sha = commit(main.files);
  return { fullName, branches: { main }, snapshots, pulls: [], deployments: [], opts, calls: [], commit, deployedFiles: { ...files }, failNext: {} };
}
let REPOS = {};
let LIVE = {}; // host -> { repo, path, blocked }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const blob = (content) => ({ type: "file", encoding: "base64", content: Buffer.from(content, "utf8").toString("base64"), sha: sha("blob:" + content) });

function lineDiff(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  let add = 0, del = 0;
  const max = Math.max(A.length, B.length);
  for (let i = 0; i < max; i++) if (A[i] !== B[i]) { if (A[i] !== undefined) del++; if (B[i] !== undefined) add++; }
  return { add, del };
}

function github(method, path, body) {
  const m = path.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
  if (!m) return json({ message: "Not Found" }, 404);
  const repo = REPOS[m[1].toLowerCase()];
  if (!repo) return json({ message: "Not Found" }, 404);
  const rest = m[2] || "";
  const [rpath, query = ""] = rest.split("?");
  const q = new URLSearchParams(query);
  repo.calls.push(method + " " + rpath);
  const key = method + " " + rpath.replace(/\/\d+/g, "/N");
  if (repo.failNext[key]) { repo.failNext[key]--; return json({ message: "Server Error" }, 500); }
  if (rpath === "" && method === "GET") return json({ full_name: repo.fullName, default_branch: "main", permissions: { push: true }, archived: false });
  let mm;
  if ((mm = rpath.match(/^\/contents\/(.+)$/))) {
    const filePath = decodeURIComponent(mm[1]);
    const ref = q.get("ref") || body?.branch || "main";
    const branch = repo.branches[ref] || repo.snapshots[ref];
    if (method === "GET") { if (!branch || branch.files[filePath] === undefined) return json({ message: "Not Found" }, 404); return json(blob(branch.files[filePath])); }
    if (method === "PUT") {
      const target = repo.branches[body.branch];
      if (!target) return json({ message: "Branch not found" }, 404);
      if (sha("blob:" + target.files[filePath]) !== body.sha) return json({ message: "sha mismatch" }, 409);
      target.files[filePath] = Buffer.from(body.content, "base64").toString("utf8");
      target.sha = repo.commit(target.files); target.commits = (target.commits || 0) + 1;
      const written = target.sha;
      // Astra F4 race: someone pushes a small change to the SAME file right after RankFix's write.
      if (repo.opts.racePushSameFile) { target.files[filePath] = target.files[filePath].replace("</head>", "<script src=\"https://evil.test/x.js\"></script>\n</head>"); target.sha = repo.commit(target.files); }
      return json({ commit: { sha: written } }, 200);
    }
  }
  if ((mm = rpath.match(/^\/git\/ref\/heads\/(.+)$/))) {
    const b = repo.branches[decodeURIComponent(mm[1])];
    return b ? json({ object: { sha: b.sha } }) : json({ message: "Not Found" }, 404);
  }
  if (rpath === "/git/refs" && method === "POST") {
    const name = body.ref.replace("refs/heads/", "");
    if (repo.branches[name]) return json({ message: "Reference already exists" }, 422);
    repo.branches[name] = { files: { ...repo.branches.main.files }, sha: body.sha };
    return json({ ref: body.ref }, 201);
  }
  if (rpath === "/pulls" && method === "GET") {
    const head = q.get("head")?.split(":")[1];
    return json(repo.pulls.filter((p) => p.state === "open" && (!head || p.head.ref === head)));
  }
  if (rpath === "/pulls" && method === "POST") {
    const pr = { number: repo.pulls.length + 1, state: "open", merged: false, title: body.title, html_url: `https://github.test/${repo.fullName}/pull/${repo.pulls.length + 1}`, head: { ref: body.head }, base: { ref: body.base }, polls: 0 };
    repo.pulls.push(pr);
    return json(pr, 201);
  }
  if ((mm = rpath.match(/^\/pulls\/(\d+)(\/.*)?$/))) {
    const pr = repo.pulls[Number(mm[1]) - 1];
    if (!pr) return json({ message: "Not Found" }, 404);
    const head = repo.branches[pr.head.ref];
    const sub = mm[2] || "";
    if (sub === "" && method === "GET") {
      pr.polls++;
      // Someone pushes to the PR branch between RankFix's evaluation and its merge.
      if (repo.opts.pushBeforeMerge && pr.polls === repo.opts.pushBeforeMerge) { head.files["templates/about.html"] = "<p>late push</p>"; head.sha = repo.commit(head.files); }
      const computing = repo.opts.mergeabilityDelay && pr.polls <= repo.opts.mergeabilityDelay;
      return json({ ...pr, head: { ref: pr.head.ref, sha: head.sha }, base: { ref: pr.base.ref, sha: repo.branches[pr.base.ref].sha }, mergeable: computing ? null : true, mergeable_state: computing ? "unknown" : (repo.opts.mergeableState || "clean") });
    }
    if (sub === "/files") {
      const changed = Object.keys(head.files).filter((f) => head.files[f] !== repo.branches[pr.base.ref].files[f]);
      return json(changed.map((f) => { const d = lineDiff(repo.branches[pr.base.ref].files[f] || "", head.files[f]); return { filename: f, status: "modified", additions: d.add, deletions: d.del }; }));
    }
    if (sub === "/merge" && method === "PUT") {
      if (body.sha !== head.sha) return json({ message: "Head branch was modified" }, 409);
      if (pr.merged) return json({ message: "already merged" }, 405);
      repo.branches[pr.base.ref].files = { ...head.files };
      repo.branches[pr.base.ref].sha = repo.commit(head.files);
      pr.merged = true; pr.state = "closed"; pr.merge_commit_sha = repo.branches[pr.base.ref].sha; pr.merged_at = new Date().toISOString();
      repo.merges = (repo.merges || 0) + 1;
      repo.deployments.push({ id: repo.deployments.length + 1, sha: pr.merge_commit_sha, environment: "Production", production_environment: true, polls: 0, files: { ...head.files } });
      return json({ merged: true, sha: pr.merge_commit_sha });
    }
  }
  // CI (P0, 31 Oct): a realistic GitHub. Default: branch protection requires
  // "build", and "build" ran successfully on exactly the head commit.
  const ci = repo.opts.ci || "green";
  // Server-side policy (Astra F1): an active ruleset requires "build" from GitHub
  // Actions (app 15368) and the RankFix identity cannot bypass it.
  if ((mm = rpath.match(/^\/rules\/branches\/([^/]+)$/))) {
    if (ci === "rules_unreadable" || ci === "rules_unreadable_recorded") return json({ message: "Resource not accessible by integration" }, 403);
    return json([{ type: "required_status_checks", ruleset_id: 9, ruleset_source_type: "Repository", parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "build", integration_id: 15368 }] } }]);
  }
  if ((mm = rpath.match(/^\/rulesets\/(\d+)$/))) return json({ id: 9, enforcement: "active", current_user_can_bypass: ci === "bypass" ? "always" : "never" });
  if ((mm = rpath.match(/^\/branches\/([^/]+)\/protection$/))) return json({ message: "Branch not protected" }, 404);
  if ((mm = rpath.match(/^\/commits\/([^/]+)\/check-runs$/))) {
    if (ci === "checks_api_error") return json({ message: "Server Error" }, 500);
    const headSha = mm[1];
    const run = (name, conclusion, extra = {}) => ({ id: 1, name, status: "completed", conclusion, head_sha: headSha, app: { id: 15368 }, check_suite: { id: 77 }, ...extra });
    if (ci === "missing") return json({ total_count: 0, check_runs: [] });
    if (ci === "skipped") return json({ total_count: 1, check_runs: [run("build", "skipped")] });
    // GitHub reports 3 runs but only one is ever delivered (later pages empty).
    if (ci === "incomplete") return json({ total_count: 3, check_runs: q.get("page") === "1" ? [run("build", "success")] : [] });
    if (ci === "random_green") return json({ total_count: 1, check_runs: [run("lint", "success")] });
    // Two independent workflows publish "build": one failed, one passed (Astra F2).
    if (ci === "same_name_workflows") return json({ total_count: 2, check_runs: [run("build", "failure", { id: 1, check_suite: { id: 77 } }), run("build", "success", { id: 2, check_suite: { id: 78 } })] });
    if (ci === "wrong_app") return json({ total_count: 1, check_runs: [run("build", "success", { app: { id: 999 } })] });
    return json({ total_count: 1, check_runs: [run("build", "success")] });
  }
  if ((mm = rpath.match(/^\/commits\/([^/]+)\/status$/))) {
    if (ci === "status_api_error") return json({ message: "Server Error" }, 500);
    return json({ sha: mm[1], state: "pending", total_count: 0, statuses: [] });
  }
  if (rpath === "/deployments") return json(repo.deployments.filter((d) => d.sha === q.get("sha")).map((d) => ({ id: d.id, environment: d.environment, production_environment: true })));
  if ((mm = rpath.match(/^\/deployments\/(\d+)\/statuses$/))) {
    const d = repo.deployments[Number(mm[1]) - 1];
    d.polls++;
    const state = repo.opts.deployFails ? "failure" : d.polls <= (repo.opts.deployPolls ?? 1) ? "in_progress" : "success";
    if (state === "success") repo.deployedFiles = { ...d.files };
    return json([{ state }]);
  }
  return json({ message: "Not Found: " + method + " " + rpath }, 404);
}

/* ------------------------------------------------------------------ fake websites */
const page = (descriptionTag) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Voorbeeldshop | Handige spullen voor binnen en buiten</title>${descriptionTag}<link rel="canonical" href="https://shop.voorbeeld.test/"></head><body><header><a href="/">Voorbeeldshop</a></header><h1>Alles voor een opgeruimd en praktisch huis</h1><p>${"Voorbeeldshop verkoopt keukenspullen, tuingereedschap en opbergoplossingen. ".repeat(30)}</p><a href="/contact">Contact</a></body></html>`;
const SHORT = "Ontdek keukenspullen en tuingereedschap bij Voorbeeldshop.";
const templateHtml = (desc) => `<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n<title>Voorbeeldshop | Handige spullen voor binnen en buiten</title>\n<meta name="description" content="${desc}">\n<link rel="canonical" href="https://shop.voorbeeld.test/">\n</head>\n<body>\n<h1>Alles voor een opgeruimd en praktisch huis</h1>\n</body>\n</html>\n`;
function renderSite(host) {
  const site = LIVE[host];
  if (!site) return new Response("nf", { status: 404 });
  if (site.blocked) return new Response("<html><head><title>Access denied</title></head><body>Access denied</body></html>", { status: 403, headers: { "content-type": "text/html" } });
  const repo = REPOS[site.repo];
  const src = repo.deployedFiles[site.path] || "";
  const desc = src.match(/<meta name="description" content="([^"]*)">/)?.[1];
  return new Response(page(desc !== undefined ? `<meta name="description" content="${desc}">` : ""), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

let OPENAI = null; // null = no key configured; otherwise a handler
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const body = init.body ? JSON.parse(init.body) : undefined;
  if (u.host === "api.github.com") return github(init.method || "GET", u.pathname + u.search, body);
  if (u.host === "api.openai.com") return OPENAI ? OPENAI(body) : new Response("{}", { status: 500 });
  if (LIVE[u.host]) return u.pathname === "/" ? renderSite(u.host) : new Response("<html><body>nf</body></html>", { status: u.pathname === "/robots.txt" ? 404 : 200, headers: { "content-type": "text/html" } });
  return new Response("nf", { status: 404 });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };

/* ------------------------------------------------------------------ routes */
const scanRoute = await import(ROOT + "/app/api/scan/route.ts");
const aiFixRoute = await import(ROOT + "/app/api/ai-fix/route.ts");
const fixRoute = await import(ROOT + "/app/api/github/fix/route.ts");
const siteRoute = await import(ROOT + "/app/api/github/site-repository/route.ts");
const statusRoute = await import(ROOT + "/app/api/fixes/status/route.ts");
const call = async (handler, method, path, body) => {
  const restore = quiet();
  try {
    const r = await handler(new Request("http://localhost" + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
    return { status: r.status, body: await r.json() };
  } finally { restore(); }
};

async function newUser(label) {
  const email = `fixflow-${label}-${Date.now()}@rankfix.test`;
  const user = (await db.query("INSERT INTO users (email,password_hash,name,plan_code,customer_id) VALUES ($1,'x','QA','agency','RF-' || UPPER(REPLACE(gen_random_uuid()::text,'-',''))) RETURNING id", [email])).rows[0];
  await db.query("INSERT INTO github_connections (user_id,github_user_id,github_login,access_token_encrypted,scopes) VALUES ($1,1,'qa-owner',$2,'repo')", [user.id, encryptToken("gh-test-token")]);
  globalThis.__RF_USER = { id: user.id, email };
  return user;
}
async function scanSite(url) {
  const r = await call(scanRoute.POST, "POST", "/api/scan", { url, mode: "both", language: "nl", dashboard: true });
  return r;
}
const issueOf = (scan, id) => [...(scan.body.seo?.checks || []), ...(scan.body.geo?.checks || [])].find((c) => (c.issue_id || c.rule_id) === id);
async function poll(url, issue, rounds = 12) {
  let fix = null;
  for (let i = 0; i < rounds; i++) {
    await db.query("UPDATE pending_fixes SET next_check_at=NULL WHERE user_id=$1", [globalThis.__RF_USER.id]);
    const r = await call(statusRoute.GET, "GET", `/api/fixes/status?url=${encodeURIComponent(url)}&issue_id=${issue}`);
    fix = r.body.fixes?.find((f) => f.issue_id === issue) || null;
    if (!fix || fix.ready_for_scan || ["confirmed", "manual"].includes(fix.stage)) break;
  }
  return fix;
}
async function prepare(scanId, issue, repo, proposedViaAi = true, url = "https://shop.voorbeeld.test/") {
  let proposed;
  if (proposedViaAi) {
    const ai = await call(aiFixRoute.POST, "POST", "/api/ai-fix", { url, issue_id: issue, type: "meta_description", current: SHORT, context: { title: "Voorbeeldshop | Handige spullen voor binnen en buiten", description: SHORT, h1: "Alles voor een opgeruimd en praktisch huis" }, issue_status: "WARNING" });
    if (ai.status !== 200) return { ai };
    proposed = ai.body.fix.content;
  }
  const pv = await call(fixRoute.POST, "POST", "/api/github/fix", { repo, scan_id: scanId, issue_id: issue, preview: true, proposed_value: proposed, language: "nl" });
  return { proposed, pv };
}
const publish = (scanId, issue, repo, pv, mode) => call(fixRoute.POST, "POST", "/api/github/fix", { repo, scan_id: scanId, issue_id: issue, preview: false, proposal_id: pv.body.proposal_id, proposal_hash: pv.body.proposal_hash, publish_mode: mode, language: "nl" });
const ISSUE = "META_DESCRIPTION_GUIDANCE";

async function scenario(name, fn) {
  const before = problems.length;
  try { await fn(); } catch (e) { problems.push(`${name}: threw ${e?.stack || e}`); }
  results.push({ name, ok: problems.length === before });
}
function freshSite(host, repoName, extraOpts = {}) {
  REPOS[repoName.toLowerCase()] = makeRepo(repoName, { "templates/index.html": templateHtml(SHORT), "templates/about.html": "<p>about</p>" }, extraOpts);
  LIVE[host] = { repo: repoName.toLowerCase(), path: "templates/index.html" };
  return REPOS[repoName.toLowerCase()];
}

/* ================================================================ scenarios */

await scenario("A one-click AutoFix with standing consent: scan → fix → merge → deploy → live → rescan → confirmed", async () => {
  const user = await newUser("a");
  const repo = freshSite("shop.voorbeeld.test", "acme/shop", { deployPolls: 2, mergeabilityDelay: 1 });
  const url = "https://shop.voorbeeld.test/";
  const s1 = await scanSite(url);
  check(s1.status === 200, `A: scan HTTP ${s1.status}`);
  const issue = issueOf(s1, ISSUE);
  check(issue && /warning/i.test(issue.status), `A: meta description issue not detected (${issue?.status})`);
  // One-time setup: repository link (created by the first preview) + explicit consent.
  const { proposed, pv } = await prepare(s1.body.scanId, ISSUE, "acme/shop");
  check(pv.status === 200 && pv.body.status === "preview", `A: preview failed ${pv.status} ${JSON.stringify(pv.body).slice(0, 300)}`);
  check(proposed && proposed.length >= 120 && proposed.length <= 160, `A: proposal length ${proposed?.length}`);
  check(pv.body.autofix?.publishable === true && pv.body.autofix?.siteConsent === false, `A: autofix flags ${JSON.stringify(pv.body.autofix)}`);
  const noConsent = await publish(s1.body.scanId, ISSUE, "acme/shop", pv, "auto");
  check(noConsent.status === 403 && noConsent.body.code === "AUTOFIX_NOT_AUTHORIZED", `A: auto without consent should be refused (${noConsent.status})`);
  check(repo.pulls.length === 0, "A: nothing may be created without consent");
  const missingConfirm = await call(siteRoute.PATCH, "PATCH", "/api/github/site-repository", { url, autofix_publish: true });
  check(missingConfirm.status === 400, "A: consent requires explicit confirmation");
  const consent = await call(siteRoute.PATCH, "PATCH", "/api/github/site-repository", { url, autofix_publish: true, confirm: "AUTOFIX_PUBLISH_CONSENT" });
  check(consent.status === 200 && consent.body.autofix?.enabled === true, `A: consent ${JSON.stringify(consent.body)}`);
  const pub = await publish(s1.body.scanId, ISSUE, "acme/shop", pv, "auto");
  check(pub.status === 200, `A: publish ${pub.status} ${JSON.stringify(pub.body).slice(0, 300)}`);
  let fix = await poll(url, ISSUE);
  check(fix?.ready_for_scan === true && fix.stage === "checking", `A: expected live change before rescan, got ${JSON.stringify(fix).slice(0, 300)}`);
  check(repo.merges === 1 && repo.pulls.length === 1, `A: merges ${repo.merges}, PRs ${repo.pulls.length}`);
  const main = repo.branches.main.files;
  check(main["templates/index.html"] === templateHtml(proposed), "A: main must contain exactly the approved text and nothing else");
  check(main["templates/about.html"] === "<p>about</p>", "A: unrelated file changed");
  const s2 = await scanSite(url);
  check(issueOf(s2, ISSUE) === undefined || /pass/i.test(issueOf(s2, ISSUE)?.status || "pass"), "A: rescan should pass");
  fix = await poll(url, ISSUE, 1);
  check(fix?.stage === "confirmed" && fix.status === "VERIFIED_RESOLVED", `A: not confirmed: ${JSON.stringify(fix).slice(0, 300)}`);
  const events = (await db.query("SELECT stage,reason_code FROM fix_events WHERE user_id=$1 ORDER BY id", [user.id])).rows.map((r) => r.stage + (r.reason_code ? ":" + r.reason_code : ""));
  check(events.includes("AWAITING_DEPLOYMENT") && events.includes("AWAITING_VERIFICATION"), `A: lifecycle events ${events.join(",")}`);

  // Pressing Fix again on the (old) scan: nothing new may be created.
  const again = await prepare(s1.body.scanId, ISSUE, "acme/shop", false);
  check(again.pv.status === 200 && again.pv.body.alreadyApplied === true, `A: second Fix should report already applied (${again.pv.status} ${JSON.stringify(again.pv.body).slice(0, 200)})`);
  check(repo.pulls.length === 1 && repo.merges === 1, "A: second Fix created extra PR/merge");
  // And on the fresh scan the issue is gone, so no Fix is possible.
  const onFresh = await call(fixRoute.POST, "POST", "/api/github/fix", { repo: "acme/shop", scan_id: s2.body.scanId, issue_id: ISSUE, preview: true, language: "nl" });
  check(onFresh.status === 404 || onFresh.status === 422, `A: fresh scan must not offer a fix (${onFresh.status})`);
});

await scenario("B approve-and-publish inside RankFix without standing consent", async () => {
  await newUser("b");
  const repo = freshSite("b.voorbeeld.test", "acme/b-shop", { deployPolls: 1 });
  const url = "https://b.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/b-shop", true, url);
  const pub = await publish(s1.body.scanId, ISSUE, "acme/b-shop", pv, "publish");
  check(pub.status === 200 && repo.merges === 1, `B: approve should merge (${pub.status}, merges ${repo.merges}) ${JSON.stringify(pub.body).slice(0, 200)}`);
  const fix = await poll(url, ISSUE);
  check(fix?.ready_for_scan, `B: ${JSON.stringify(fix).slice(0, 200)}`);
});

// P0 (31 Oct): fail-closed merge. None of these may ever reach PUT /merge.
const noMergeScenario = (label, ci, codes, extra = {}) => scenario(`${label}: no automatic merge (${ci})`, async () => {
  const id = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  await newUser(id);
  const repo = freshSite(`${id}.voorbeeld.test`, `acme/${id}-shop`, { ci, ...extra });
  const url = `https://${id}.voorbeeld.test/`;
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, `acme/${id}-shop`, true, url);
  await publish(s1.body.scanId, ISSUE, `acme/${id}-shop`, pv, "publish");
  const fix = await poll(url, ISSUE, 3);
  check(repo.merges === undefined && !repo.calls.includes("PUT /pulls/1/merge"), `${label}: merged without CI evidence (${ci})`);
  check(codes.includes(fix?.reason_code || "") || codes.includes(String((await db.query("SELECT last_error_code FROM pending_fixes WHERE scanned_url=$1", [url])).rows[0]?.last_error_code)), `${label}: reason ${fix?.reason_code} / ${JSON.stringify(fix).slice(0, 200)}`);
});
await noMergeScenario("CI1", "missing", ["REQUIRED_CHECK_MISSING"]);
await noMergeScenario("CI2", "checks_api_error", ["CI_UNAVAILABLE"]);
await noMergeScenario("CI3", "status_api_error", ["CI_UNAVAILABLE"]);
await noMergeScenario("CI4", "skipped", ["REQUIRED_CHECK_NOT_SUCCESSFUL"]);
await noMergeScenario("CI5", "incomplete", ["CI_INCOMPLETE", "CI_UNAVAILABLE"]);
await noMergeScenario("CI6", "rules_unreadable", ["REQUIRED_CHECKS_UNDEFINED"]);
await noMergeScenario("CI7", "green", ["HEAD_CHANGED", "UNEXPECTED_FILES"], { pushBeforeMerge: 2 });

await noMergeScenario("CI10", "wrong_app", ["REQUIRED_CHECK_MISSING"]);
await noMergeScenario("CI11", "bypass", ["NOT_SERVER_ENFORCED"]);
await noMergeScenario("CI12", "same_name_workflows", ["CHECKS_FAILED"]);
await noMergeScenario("CI13", "green", ["HEAD_CHANGED", "CONTENT_MISMATCH"], { racePushSameFile: true });

await scenario("CI8 unreadable server rules + recorded policy: still PR-only; PATCH keeps or validates the policy", async () => {
  await newUser("ci8");
  const repo = freshSite("ci8.voorbeeld.test", "acme/ci8-shop", { ci: "rules_unreadable_recorded", deployPolls: 1 });
  const url = "https://ci8.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/ci8-shop", true, url);
  const invalid = await call(siteRoute.PATCH, "PATCH", "/api/github/site-repository", { url, autofix_publish: true, confirm: "AUTOFIX_PUBLISH_CONSENT", required_checks: [{ context: "build", app_id: 15368 }, "lint"] });
  check(invalid.status === 400 && invalid.body.code === "POLICY_INVALID", `CI8: invalid policy must be refused (${invalid.status})`);
  const consent = await call(siteRoute.PATCH, "PATCH", "/api/github/site-repository", { url, autofix_publish: true, confirm: "AUTOFIX_PUBLISH_CONSENT", required_checks: [{ context: "build", app_id: 15368 }] });
  check(consent.status === 200 && JSON.stringify(consent.body.autofix?.requiredChecks?.checks) === '[{"context":"build","app_id":15368}]', `CI8: consent ${JSON.stringify(consent.body)}`);
  const again = await call(siteRoute.PATCH, "PATCH", "/api/github/site-repository", { url, autofix_publish: true, confirm: "AUTOFIX_PUBLISH_CONSENT" });
  check(JSON.stringify(again.body.autofix?.requiredChecks?.checks) === '[{"context":"build","app_id":15368}]', `CI8: PATCH without the field must keep the policy ${JSON.stringify(again.body.autofix)}`);
  await publish(s1.body.scanId, ISSUE, "acme/ci8-shop", pv, "auto");
  await poll(url, ISSUE, 3);
  const code = (await db.query("SELECT last_error_code FROM pending_fixes WHERE scanned_url=$1", [url])).rows[0]?.last_error_code;
  check(repo.merges === undefined && code === "NOT_SERVER_ENFORCED", `CI8: recorded policy alone must not merge (${repo.merges}, ${code})`);
});

await scenario("CI9 a green non-required check never replaces the missing required check", async () => {
  await newUser("ci9");
  const repo = freshSite("ci9.voorbeeld.test", "acme/ci9-shop", { ci: "random_green" });
  const url = "https://ci9.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/ci9-shop", true, url);
  await publish(s1.body.scanId, ISSUE, "acme/ci9-shop", pv, "publish");
  await poll(url, ISSUE, 3);
  check(repo.merges === undefined, "CI9: a non-required green check must not allow the merge");
});

await scenario("C PR-only: never merged by RankFix, shown as manual action", async () => {
  await newUser("c");
  const repo = freshSite("c.voorbeeld.test", "acme/c-shop");
  const url = "https://c.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/c-shop", true, url);
  const pub = await publish(s1.body.scanId, ISSUE, "acme/c-shop", pv, "pr_only");
  check(pub.status === 200 && pub.body.fix?.stage === "manual" && pub.body.fix?.reason_code === "PR_AWAITING_OWNER", `C: ${JSON.stringify(pub.body).slice(0, 300)}`);
  const fix = await poll(url, ISSUE, 3);
  check(repo.merges === undefined && fix?.status === "AWAITING_MERGE", `C: merged without consent (${repo.merges}) ${fix?.status}`);
  // Later explicit approval of the same proposal resumes and publishes, without a second PR.
  const approve = await publish(s1.body.scanId, ISSUE, "acme/c-shop", pv, "publish");
  check(approve.status === 200 && repo.merges === 1 && repo.pulls.length === 1, `C: approval should merge the same PR (${approve.status}, merges ${repo.merges}, PRs ${repo.pulls.length})`);
});

await scenario("D retry after GitHub failure resumes without duplicate branch/commit/PR", async () => {
  await newUser("d");
  const repo = freshSite("d.voorbeeld.test", "acme/d-shop");
  const url = "https://d.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/d-shop", true, url);
  repo.failNext["POST /pulls"] = 1;
  const first = await publish(s1.body.scanId, ISSUE, "acme/d-shop", pv, "publish");
  check(first.status >= 500, `D: first attempt should fail (${first.status})`);
  const branchName = Object.keys(repo.branches).find((b) => b.startsWith("rankfix/"));
  check(branchName && repo.branches[branchName].commits === 1, "D: branch + commit from first attempt expected");
  const second = await publish(s1.body.scanId, ISSUE, "acme/d-shop", pv, "publish");
  check(second.status === 200, `D: retry ${second.status} ${JSON.stringify(second.body).slice(0, 200)}`);
  check(repo.branches[branchName].commits === 1 && repo.pulls.length === 1, `D: duplicate work (commits ${repo.branches[branchName].commits}, PRs ${repo.pulls.length})`);
  const third = await publish(s1.body.scanId, ISSUE, "acme/d-shop", pv, "publish");
  check(third.status === 200 && third.body.idempotent === true && repo.pulls.length === 1 && repo.merges === 1, `D: third call must be idempotent (PRs ${repo.pulls.length}, merges ${repo.merges})`);
});

await scenario("E unexpected extra change on the PR branch blocks the merge", async () => {
  await newUser("e");
  const repo = freshSite("e.voorbeeld.test", "acme/e-shop", { mergeabilityDelay: 1 });
  const url = "https://e.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/e-shop", true, url);
  const pub = await publish(s1.body.scanId, ISSUE, "acme/e-shop", pv, "publish"); // mergeability still computing → waits
  check(pub.status === 200 && repo.merges === undefined, `E: should wait first (${pub.status}, ${repo.merges})`);
  const branch = repo.branches[repo.pulls[0].head.ref];
  branch.files["templates/about.html"] = "<p>someone else</p>"; branch.sha = repo.commit(branch.files);
  const fix = await poll(url, ISSUE, 3);
  check(repo.merges === undefined && fix?.stage === "manual" && ["HEAD_CHANGED", "UNEXPECTED_FILES"].includes(fix?.reason_code), `E: ${JSON.stringify(fix).slice(0, 300)}`);
});

await scenario("F failed deployment stops safely", async () => {
  await newUser("f");
  freshSite("f.voorbeeld.test", "acme/f-shop", { deployFails: true });
  const url = "https://f.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/f-shop", true, url);
  await publish(s1.body.scanId, ISSUE, "acme/f-shop", pv, "publish");
  const fix = await poll(url, ISSUE, 4);
  check(fix?.stage === "manual" && fix.reason_code === "DEPLOY_FAILED", `F: ${JSON.stringify(fix).slice(0, 300)}`);
});

await scenario("G blocked live page is never marked as fixed", async () => {
  await newUser("g");
  freshSite("g.voorbeeld.test", "acme/g-shop", { deployPolls: 0 });
  const url = "https://g.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/g-shop", true, url);
  await publish(s1.body.scanId, ISSUE, "acme/g-shop", pv, "publish");
  LIVE["g.voorbeeld.test"].blocked = true;
  const fix = await poll(url, ISSUE, 4);
  check(fix?.stage === "updating" && fix.reason_code === "LIVE_UNREACHABLE" && !fix.ready_for_scan, `G: ${JSON.stringify(fix).slice(0, 300)}`);
  // A rescan of the blocked page must neither confirm nor reject the fix.
  await scanSite(url);
  const after = await poll(url, ISSUE, 1);
  check(after?.status === "AWAITING_DEPLOYMENT", `G: blocked page changed status to ${after?.status}`);
});

await scenario("H AI provider down and too little page text: clear error, nothing created", async () => {
  await newUser("h");
  const repo = freshSite("h.voorbeeld.test", "acme/h-shop");
  process.env.OPENAI_API_KEY = "test-key-not-real";
  OPENAI = () => new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 });
  try {
    const ai = await call(aiFixRoute.POST, "POST", "/api/ai-fix", { url: "https://h.voorbeeld.test/", issue_id: ISSUE, type: "meta_description", current: "Kort.", context: { title: "Shop", description: "Kort.", h1: "" }, issue_status: "WARNING" });
    check(ai.status === 503 && ai.body.error === "AI_PROVIDER_ERROR" && /niets gewijzigd/.test(ai.body.message), `H: ${ai.status} ${JSON.stringify(ai.body)}`);
    check(repo.pulls.length === 0 && Object.keys(repo.branches).length === 1, "H: GitHub must be untouched");
    // AI down but enough verified page text: evidence-bound fallback still works.
    const ok = await call(aiFixRoute.POST, "POST", "/api/ai-fix", { url: "https://h.voorbeeld.test/", issue_id: ISSUE, type: "meta_description", current: SHORT, context: { title: "Voorbeeldshop | Handige spullen voor binnen en buiten", description: SHORT, h1: "Alles voor een opgeruimd en praktisch huis" }, issue_status: "WARNING" });
    check(ok.status === 200 && ok.body.mode === "rule_based_fallback", `H: fallback ${ok.status} ${JSON.stringify(ok.body).slice(0, 200)}`);
  } finally { delete process.env.OPENAI_API_KEY; OPENAI = null; }
});

await scenario("I stale source: base file changed after preview → no publication", async () => {
  await newUser("i");
  const repo = freshSite("i.voorbeeld.test", "acme/i-shop");
  const url = "https://i.voorbeeld.test/";
  const s1 = await scanSite(url);
  const { pv } = await prepare(s1.body.scanId, ISSUE, "acme/i-shop", true, url);
  repo.branches.main.files["templates/index.html"] = repo.branches.main.files["templates/index.html"].replace("<h1>", "<h1 class=\"x\">");
  repo.branches.main.sha = repo.commit(repo.branches.main.files);
  const pub = await publish(s1.body.scanId, ISSUE, "acme/i-shop", pv, "publish");
  check(pub.status === 409 && pub.body.code === "STALE_BASE" && repo.pulls.length === 0, `I: ${pub.status} ${JSON.stringify(pub.body).slice(0, 200)}`);
});

/* ------------------------------------------------------------------ cleanup */
const ids = (await db.query("SELECT id FROM users WHERE email LIKE 'fixflow-%@rankfix.test'")).rows.map((r) => r.id);
for (const id of ids) {
  await db.query("DELETE FROM fix_events WHERE user_id=$1", [id]);
  await db.query("DELETE FROM pending_fixes WHERE user_id=$1", [id]);
  await db.query("DELETE FROM fix_proposals WHERE user_id=$1", [id]);
  await db.query("DELETE FROM scans WHERE user_id=$1", [id]);
  await db.query("DELETE FROM users WHERE id=$1", [id]);
}
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}`);
for (const p of problems) console.log(" - " + p);
console.log("FIX_FLOW_RESULT " + JSON.stringify({ scenarios: results.length, failed: results.filter((r) => !r.ok).length, problems: problems.length }));
await db.end?.();
process.exit(problems.length ? 1 : 0);
