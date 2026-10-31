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
  // P0 (31 Oct): CI evidence is mandatory. Before, an empty check list with
  // "pending/0" was treated as SAFE (merge without any CI).
  ci: { verdict: "ok", code: "CI_GREEN" },
  expected: { branch: "rankfix/x", baseBranch: "main", path: "templates/index.html", headSha: "h1", baseBlobSha: "b1" },
  baseFileSha: "b1",
});
test("merge safety: merges only a clean, single-file, small, unchanged PR with proven green CI", () => {
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
    [(x) => { x.ci = { verdict: "failed", code: "CHECKS_FAILED" }; }, "block", "CHECKS_FAILED"],
    [(x) => { x.ci = { verdict: "failed", code: "REQUIRED_CHECK_NOT_SUCCESSFUL" }; }, "block", "REQUIRED_CHECK_NOT_SUCCESSFUL"],
    [(x) => { x.ci = { verdict: "untrusted", code: "REQUIRED_CHECKS_UNDEFINED" }; }, "block", "REQUIRED_CHECKS_UNDEFINED"],
    [(x) => { x.ci = { verdict: "pending", code: "CHECKS_PENDING" }; }, "wait", "CHECKS_PENDING"],
    [(x) => { x.ci = { verdict: "unavailable", code: "CI_UNAVAILABLE" }; }, "wait", "CI_UNAVAILABLE"],
    [(x) => { x.ci = undefined; }, "block", "CI_UNAVAILABLE"],
    [(x) => { x.expected.headSha = null; }, "block", "EVIDENCE_MISSING"],
    [(x) => { x.expected.baseBlobSha = null; }, "block", "EVIDENCE_MISSING"],
    [(x) => { x.pr.head.sha = ""; }, "block", "EVIDENCE_MISSING"],
    [(x) => { x.baseFileSha = null; }, "wait", "BASE_UNAVAILABLE"],
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
  const row = { id: "1", user_id: "u", issue_id: "META_DESCRIPTION_GUIDANCE", scanned_url: "https://a.test/", status: "AWAITING_MERGE", repository: "o/r", pr_number: 3, auto_publish: true, head_sha: "h1", base_blob_sha: "b1", phase_started_at: new Date() };
  const db = memoryDb(row);
  const err = Object.assign(new Error("Service Unavailable"), { status: 503 });
  await E.advanceFix({ db, github: async () => { throw err; }, probe: async () => ({ reachable: false, httpStatus: null, blocked: false, html: "" }) }, row);
  assert.equal(row.status, "AWAITING_MERGE");
  assert.equal(row.last_error_code, "GITHUB_UNAVAILABLE");
});

test("advance: a legacy fix without the approved SHA evidence is never merged", async () => {
  const row = { id: "1", user_id: "u", issue_id: "META_DESCRIPTION_GUIDANCE", scanned_url: "https://a.test/", status: "AWAITING_MERGE", repository: "o/r", pr_number: 3, auto_publish: true, phase_started_at: new Date() };
  const calls = [];
  await E.advanceFix({ db: memoryDb(row), github: async (path, init = {}) => { calls.push((init.method || "GET") + " " + path); return {}; }, probe: async () => ({ reachable: false, httpStatus: null, blocked: false, html: "" }) }, row);
  assert.equal(row.status, "NEEDS_ATTENTION");
  assert.equal(row.last_error_code, "EVIDENCE_MISSING");
  assert.equal(calls.some((c) => c.startsWith("PUT")), false);
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

test("assistant Fix action never reloads current Fix route and errors do not reopen overlay", () => {
  const code=readFileSync(new URL("../components/ai-assistant.tsx",import.meta.url),"utf8");
  assert.match(code,/const alreadyOnFixPage = pathname\.startsWith\("\/dashboard\/github"\)/);
  assert.match(code,/if \(alreadyOnFixPage\) \{[\s\S]*?setOpen\(false\);[\s\S]*?scrollIntoView/);
  assert.match(code,/alreadyOnFixPage \? "Bekijk huidige Fix"/);
  assert.doesNotMatch(code,/if \(!dashboard \|\| !errorContext\) return;\s*setOpen\(true\)/);
  assert.match(code,/window\.location\.assign\("\/dashboard\/github\?scan_id="/);
});

test("social metadata without verified image evidence is explicitly blocked before creating a PR", () => {
  const api=readFileSync(new URL("../app/api/github/fix/route.ts",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
  assert.match(api,/if\(issueId==="SOCIAL_METADATA_INCOMPLETE"\)/);
  assert.match(api,/SOCIAL_IMAGE_EVIDENCE_REQUIRED/);
  const guard=api.indexOf('code:"SOCIAL_IMAGE_EVIDENCE_REQUIRED"');
  const connection=api.indexOf('const connection=await getDb().query');
  assert.ok(guard>0 && connection>guard, "reject unsupported image before fetching GitHub credentials");
  assert.match(ui,/const socialImageMissing=issueId==="SOCIAL_METADATA_INCOMPLETE" && !hasTrustedSocialImage/);
  assert.match(ui,/socialImageMissing\s*\? <div role="status"/);
  assert.match(ui,/Array\.isArray\(pd\.validation\?\.errors\)/);
  assert.match(ui,/Automatisch publiceren wordt niet gestart/);
});

test("a social metadata Fix is visible live only with title, description and a real absolute OG image", () => {
  const tags=(image="") => '<meta property="og:title" content="TrendMix">'+
    '<meta property="og:description" content="Gadgets en slimme oplossingen">'+image;
  const image=(url)=>'<meta property="og:image" content="'+url+'">';
  assert.equal(E.liveFixApplied("SOCIAL_METADATA_INCOMPLETE",tags(),null),"not_yet","no image is not a completed fix");
  assert.equal(E.liveFixApplied("SOCIAL_METADATA_INCOMPLETE",tags(image("/images/banner.jpg")),null),"not_yet","relative image cannot prove a public OG image");
  assert.equal(E.liveFixApplied("SOCIAL_METADATA_INCOMPLETE",tags(image("https://trendmix-q6fx.vercel.app/favicon.svg")),null),"not_yet","favicon is not a marketing preview");
  assert.equal(E.liveFixApplied("SOCIAL_METADATA_INCOMPLETE",tags(image("javascript:alert(1)")),null),"not_yet","unsafe protocol must not count");
  assert.equal(E.liveFixApplied("SOCIAL_METADATA_INCOMPLETE",tags(image("https://cdn.example.com/preview.webp")),null),"applied","verified URL and metadata justify proceeding to full rescan");
  assert.equal(E.liveFixApplied("SOCIAL_METADATA_INCOMPLETE",'<meta property="og:image" content="https://cdn.example.com/preview.webp">',null),"not_yet","title/description missing");
});

test("newly reintroduced defects cannot be hidden by older confirmed Fix statuses",()=>{
  const row={issue_id:"META_DESCRIPTION_GUIDANCE",status:"VERIFIED_RESOLVED",verified_at:"2026-10-18T17:27:15Z"};
  const scan=(date,status="warning",id="META_DESCRIPTION_GUIDANCE")=>({created_at:date,result:{seo:{checks:[{issue_id:id,status}]}}});
  assert.equal(E.confirmedFixIsStale(row,scan("2026-10-19T12:00:00Z")),true);
  assert.equal(E.confirmedFixIsStale(row,scan("2026-10-18T17:00:00Z")),false);
  assert.equal(E.confirmedFixIsStale(row,scan("2026-10-19T12:00:00Z","pass")),false);
  assert.equal(E.confirmedFixIsStale(row,scan("2026-10-19T12:00:00Z","warning","SOME_OTHER_RULE")),false);
  assert.equal(E.confirmedFixIsStale({...row,status:"AWAITING_DEPLOYMENT"},scan("2026-10-19T12:00:00Z")),false);
});
test("Fix controls retain selected scan context and the assistant selects only allowed fixes",()=>{
  const status=readFileSync(new URL("../app/api/fixes/status/route.ts",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
  const audit=readFileSync(new URL("../app/dashboard/audit/[id]/page.tsx",import.meta.url),"utf8");
  const assistant=readFileSync(new URL("../components/ai-assistant.tsx",import.meta.url),"utf8");
  assert.match(status,/confirmedFixIsStale\(row,contextScan\)/);
  assert.match(status,/SELECT created_at,scanned_url,final_url,result FROM scans WHERE id=\$1 AND user_id=\$2/);
  assert.match(ui,/if\(r\.ok\)\s*\{\s*setFix\(current\);\s*setLatestScanInfo\(d\.latest_scan\|\|null\);\s*\}/);
  assert.match(ui,/scan_id=\$\{encodeURIComponent\(scanId\)\}/);
  assert.match(audit,/scan_id="\+encodeURIComponent\(String\(id\)\)/);
  assert.match(assistant,/policy\.action==="github_fix" && Boolean\(policy\.safe_type\)/);
  assert.match(assistant,/Bekijk verbeterpunten/);
});

test("old reports must not show their historic Fix as currently resolved after a newer regression", () => {
  const status=readFileSync(new URL("../app/api/fixes/status/route.ts",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
  const audit=readFileSync(new URL("../app/dashboard/audit/[id]/page.tsx",import.meta.url),"utf8");
  assert.match(status,/ORDER BY created_at DESC LIMIT 1/);
  assert.match(status,/confirmedFixIsStale\(row,latestScan\)/);
  assert.match(status,/latest_scan:latestScanInfo/);
  assert.match(ui,/const historicalScan=Boolean\(latestScanInfo\?\.id/);
  assert.match(ui,/Je bekijkt een oudere scan/);
  assert.match(ui,/Automatisch publiceren wordt niet gestart vanuit een oudere scan/);
  assert.match(audit,/Dit is een eerder scanrapport/);
});

test("Fix and audit states retain legible mobile and desktop presentation",()=>{
  const ui=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
  const audit=readFileSync(new URL("../app/dashboard/audit/[id]/page.tsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("../app/dashboard/dashboard.css",import.meta.url),"utf8");
  const auditCss=readFileSync(new URL("../app/dashboard/audit/[id]/audit.css",import.meta.url),"utf8");
  assert.match(ui,/rf-fix-status-panel/);
  assert.match(ui,/data-done=\{done \? "true" : "false"\}/);
  assert.match(ui,/rf-fix-alert/);
  assert.match(audit,/rf-audit-stale-banner/);
  assert.match(css,/rf-fix-status-panel dd\{min-width:0;overflow-wrap:anywhere\}/);
  assert.match(css,/rf-fix-progress-step\[data-done="true"\]/);
  assert.match(css,/@media\(min-width:651px\)/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.match(auditCss,/rf-audit-stale-banner/);
});

test("QA: status is shared between desktop and mobile and historical successes cannot mask a quality failure",()=>{
  const status=readFileSync(new URL("../app/api/fixes/status/route.ts",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
  const audit=readFileSync(new URL("../app/dashboard/audit/[id]/page.tsx",import.meta.url),"utf8");
  assert.match(status,/const metaQualityIssue=isTransientSeoCopy/);
  assert.match(status,/alreadyReported=new Set/);
  assert.match(status,/row\.status==="VERIFIED_RESOLVED" && row\.issue_id==="META_DESCRIPTION_GUIDANCE" && metaQualityIssue/);
  assert.match(ui,/latestScanInfo\?\.meta_quality_issue && !historicalScan && isMeta/);
  assert.match(audit,/latestScanInfo\.meta_quality_issue/);
});

test("QA Fixes menu routes mobile and desktop into a usable scan inbox",()=>{
 const nav=readFileSync(new URL("../app/dashboard/nav.tsx",import.meta.url),"utf8");
 const home=readFileSync(new URL("../app/dashboard/page.tsx",import.meta.url),"utf8");
 const inbox=readFileSync(new URL("../app/dashboard/fixes/page.tsx",import.meta.url),"utf8");
 const fix=readFileSync(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
 assert.match(nav,/const desktop=\[[^\n]*"\/dashboard\/fixes"/);
 assert.match(nav,/const mobileIndexes=\[0,1,2,3,5\]/);
 assert.doesNotMatch(home,/href="\/dashboard\/github"/);
 assert.match(home,/href="\/dashboard\/fixes"/);
 assert.match(inbox,/latestBySite=new Set/);
 assert.match(inbox,/\/dashboard\/audit\//);
 assert.match(fix,/if\(!scanId\|\|!issueId\)/);
 assert.match(fix,/href="\/dashboard\/fixes"/);
});

test("QA public metadata preview routes missing evidence to secure Fix instead of dead end",()=>{
 const ui=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.match(ui,/Open beveiligde Fix/);
 assert.match(ui,/echte paginatekst in je gekoppelde bronbestand/);
 assert.match(ui,/createGithubFix\(item\)/);
});

/* ---------------------------------------------------------------- P0: fail-closed CI evidence */
const H = "a".repeat(40);
const run = (name, conclusion, extra = {}) => ({ id: extra.id ?? Math.floor(Math.random() * 1e9), name, status: "completed", conclusion, head_sha: H, app: { id: 15368 }, ...extra });
const ciInput = (over = {}) => ({
  headSha: H,
  required: { source: "branch_protection", checks: [{ context: "build", appId: 15368 }] },
  checkRuns: { ok: true, runs: [run("build", "success", { id: 1 })], totalCount: 1 },
  statuses: { ok: true, sha: H, statuses: [], totalCount: 0 },
  ...over,
});
test("CI evidence: only every trusted required check, completed and successful on this exact SHA, is ok", () => {
  assert.deepEqual(E.evaluateCiEvidence(ciInput()), { verdict: "ok", code: "CI_GREEN" });
  const cases = [
    ["no checks at all", { checkRuns: { ok: true, runs: [], totalCount: 0 } }, "pending", "REQUIRED_CHECK_MISSING"],
    ["check-runs API error", { checkRuns: { ok: false, runs: [], totalCount: null } }, "unavailable", "CI_UNAVAILABLE"],
    ["status API error", { statuses: { ok: false, sha: null, statuses: [], totalCount: null } }, "unavailable", "CI_UNAVAILABLE"],
    ["incomplete list", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1 })], totalCount: 3 } }, "unavailable", "CI_INCOMPLETE"],
    ["unknown total", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1 })], totalCount: null } }, "unavailable", "CI_INCOMPLETE"],
    ["incomplete statuses", { statuses: { ok: true, sha: H, statuses: [], totalCount: 2 } }, "unavailable", "CI_INCOMPLETE"],
    ["run on another SHA", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1, head_sha: "b".repeat(40) })], totalCount: 1 } }, "unavailable", "CI_SHA_MISMATCH"],
    ["statuses of another SHA", { statuses: { ok: true, sha: "b".repeat(40), statuses: [], totalCount: 0 } }, "unavailable", "CI_SHA_MISMATCH"],
    ["run without status", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1, status: undefined })], totalCount: 1 } }, "unavailable", "CI_UNRELIABLE"],
    ["no head SHA", { headSha: "" }, "unavailable", "EVIDENCE_MISSING"],
    ["no trusted required set", { required: { source: "none", checks: [] } }, "untrusted", "REQUIRED_CHECKS_UNDEFINED"],
    ["required skipped", { checkRuns: { ok: true, runs: [run("build", "skipped", { id: 1 })], totalCount: 1 } }, "failed", "REQUIRED_CHECK_NOT_SUCCESSFUL"],
    ["required neutral", { checkRuns: { ok: true, runs: [run("build", "neutral", { id: 1 })], totalCount: 1 } }, "failed", "REQUIRED_CHECK_NOT_SUCCESSFUL"],
    ["required stale", { checkRuns: { ok: true, runs: [run("build", "stale", { id: 1 })], totalCount: 1 } }, "failed", "CHECKS_FAILED"],
    ["required failed", { checkRuns: { ok: true, runs: [run("build", "failure", { id: 1 })], totalCount: 1 } }, "failed", "CHECKS_FAILED"],
    ["other check failed", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1 }), run("lint", "failure", { id: 2 })], totalCount: 2 } }, "failed", "CHECKS_FAILED"],
    ["status error", { statuses: { ok: true, sha: H, statuses: [{ id: 1, context: "ci/x", state: "error" }], totalCount: 1 } }, "failed", "CHECKS_FAILED"],
    ["required still running", { checkRuns: { ok: true, runs: [run("build", null, { id: 1, status: "in_progress" })], totalCount: 1 } }, "pending", "CHECKS_PENDING"],
    ["only a random green check", { checkRuns: { ok: true, runs: [run("lint", "success", { id: 2 })], totalCount: 1 } }, "pending", "REQUIRED_CHECK_MISSING"],
    ["required check from an untrusted app", { checkRuns: { ok: true, runs: [run("build", "success", { id: 1, app: { id: 999 } })], totalCount: 1 } }, "pending", "REQUIRED_CHECK_MISSING"],
  ];
  for (const [name, over, verdict, code] of cases) {
    const got = E.evaluateCiEvidence(ciInput(over));
    assert.equal(got.verdict, verdict, name); assert.equal(got.code, code, name);
    assert.notEqual(got.verdict, "ok", name);
  }
  // A re-run supersedes an earlier failed attempt of the same check.
  assert.equal(E.evaluateCiEvidence(ciInput({ checkRuns: { ok: true, runs: [run("build", "failure", { id: 1 }), run("build", "success", { id: 2 })], totalCount: 2 } })).verdict, "ok");
  // A required commit status (legacy CI) counts when it is success.
  assert.equal(E.evaluateCiEvidence(ciInput({ required: { source: "recorded", checks: [{ context: "ci/legacy" }] }, checkRuns: { ok: true, runs: [], totalCount: 0 }, statuses: { ok: true, sha: H, statuses: [{ id: 1, context: "ci/legacy", state: "success" }], totalCount: 1 } })).verdict, "ok");
});

test("recorded required checks: only a clean list of names is trusted", () => {
  assert.deepEqual(E.parseRecordedChecks('["build"," test ","build"]'), ["build", "test"]);
  for (const bad of [null, "", "build", "{}", "[1,2]", 42, {}]) assert.deepEqual(E.parseRecordedChecks(bad), [], String(bad));
});

// tryAutoMerge against a scripted GitHub: never PUT /merge without proof.
function fakeGithub(over = {}) {
  const calls = [];
  let pullReads = 0;
  const state = { head: H, protection: { contexts: ["build"], checks: [{ context: "build", app_id: 15368 }] }, runs: [run("build", "success", { id: 1 })], total: null, ...over };
  const gh = async (path, init = {}) => {
    const method = init.method || "GET"; calls.push(method + " " + path);
    const fail = (status) => { const e = new Error("GitHub " + status); e.status = status; throw e; };
    if (/\/pulls\/7$/.test(path)) { pullReads++; const sha = state.headAfter && pullReads >= 2 ? state.headAfter : state.head; return { state: "open", merged: false, mergeable: true, mergeable_state: "clean", head: { sha, ref: "rankfix/x" }, base: { ref: "main" } }; }
    if (/\/pulls\/7\/files/.test(path)) return [{ filename: "templates/index.html", additions: 1, deletions: 1, status: "modified" }];
    if (/\/pulls\/7\/merge$/.test(path)) return { merged: true };
    if (/protection\/required_status_checks$/.test(path)) return state.protectionError ? fail(state.protectionError) : state.protection;
    if (/check-runs/.test(path)) { if (state.checksError) fail(state.checksError); const page = Number(new URL("http://x" + path).searchParams.get("page")); return { total_count: state.total ?? state.runs.length, check_runs: page === 1 ? state.runs : [] }; }
    if (/\/status\?/.test(path)) { if (state.statusError) fail(state.statusError); return { sha: state.head, state: "pending", total_count: 0, statuses: [] }; }
    if (/\/contents\//.test(path)) return state.baseError ? fail(state.baseError) : { sha: "b1" };
    return fail(404);
  };
  return { gh, calls };
}
const fixRow = (over = {}) => ({ id: "1", user_id: "u", issue_id: "META_DESCRIPTION_GUIDANCE", scanned_url: "https://x.test/", status: "AWAITING_MERGE", repository: "o/r", pr_number: 7, branch: "rankfix/x", base_branch: "main", file_path: "templates/index.html", auto_publish: true, head_sha: H, base_blob_sha: "b1", ...over });
const attempt = async (ghOver = {}, rowOver = {}) => { const { gh, calls } = fakeGithub(ghOver); const result = await E.tryAutoMerge({ github: gh, db: null, probe: null }, fixRow(rowOver)); return { result, merged: calls.some((c) => c.startsWith("PUT ") && c.endsWith("/merge")), calls }; };

test("tryAutoMerge: proven green required CI on the approved SHA merges, re-reading the PR first", async () => {
  const ok = await attempt();
  assert.deepEqual(ok.result, { decision: "merged", code: "MERGED" });
  assert.equal(ok.merged, true);
  const reads = ok.calls.filter((c) => /GET \/repos\/o\/r\/pulls\/7$/.test(c)).length;
  assert.equal(reads, 2, "PR must be re-read right before the merge");
});

test("tryAutoMerge is fail-closed: no merge on missing, failing, unreadable or untrusted CI evidence", async () => {
  const cases = [
    ["missing CI", { runs: [] }, {}, "REQUIRED_CHECK_MISSING"],
    ["check-runs API 500", { checksError: 500 }, {}, "CI_UNAVAILABLE"],
    ["check-runs API 404", { checksError: 404 }, {}, "CI_UNAVAILABLE"],
    ["status API 502", { statusError: 502 }, {}, "CI_UNAVAILABLE"],
    ["incomplete pagination", { total: 4 }, {}, "CI_INCOMPLETE"],
    ["skipped required check", { runs: [run("build", "skipped", { id: 1 })] }, {}, "REQUIRED_CHECK_NOT_SUCCESSFUL"],
    ["protection unreadable, no recorded set", { protectionError: 403 }, {}, "REQUIRED_CHECKS_UNDEFINED"],
    ["protection unreadable, random green check", { protectionError: 404, runs: [run("lint", "success", { id: 3 })] }, {}, "REQUIRED_CHECKS_UNDEFINED"],
    ["protection unreadable, recorded check absent", { protectionError: 404, runs: [run("lint", "success", { id: 3 })] }, { required_checks: '["build"]' }, "REQUIRED_CHECK_MISSING"],
    ["head SHA changed since approval", { head: "c".repeat(40) }, {}, "HEAD_CHANGED"],
    ["head SHA changes right before merge", { headAfter: "d".repeat(40) }, {}, "HEAD_CHANGED"],
    ["approved head SHA not stored", {}, { head_sha: null }, "EVIDENCE_MISSING"],
    ["approved base blob not stored", {}, { base_blob_sha: null }, "EVIDENCE_MISSING"],
    ["base file unreadable", { baseError: 500 }, {}, "BASE_UNAVAILABLE"],
  ];
  for (const [name, ghOver, rowOver, code] of cases) {
    const { result, merged } = await attempt(ghOver, rowOver);
    assert.equal(merged, false, name + ": PUT /merge was called");
    assert.equal(result.code, code, name);
    assert.notEqual(result.decision, "merge", name);
  }
  // An explicitly recorded set is trusted when branch protection is unreadable.
  const recorded = await attempt({ protectionError: 404 }, { required_checks: '["build"]' });
  assert.equal(recorded.merged, true);
});

test("source guard: CI lookups never fall back to an empty or pending result", () => {
  const src = readFileSync(new URL("../lib/fix-engine.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /check-runs[^\n]*\.catch\(\s*\(\)\s*=>\s*\(\{\s*check_runs:\s*\[\]/);
  assert.doesNotMatch(src, /\/status[^\n]*\.catch\(\s*\(\)\s*=>\s*\(\{\s*state:\s*"pending"/);
  assert.match(src, /const ci = evaluateCiEvidence\(/);
  // The only merge call sits behind the fail-closed evaluation and a fresh PR read.
  assert.equal((src.match(/\/merge`/g) || []).length, 1);
  assert.ok(src.indexOf("const fresh = await gh") < src.indexOf("/merge`"));
});
