/**
 * RankFix Fix Engine lifecycle (QA).
 *
 * A Pull Request is not a fix. A fix is only "confirmed" after a fresh, reliable
 * live scan reports the exact same rule as PASS. In between, every step is a
 * persisted, resumable state so a customer can close the page and come back:
 *
 *   PREPARED/PROPOSED      → "Oplossing voorbereiden"
 *   AWAITING_MERGE         → "Fix veilig uitvoeren"      (merge only with explicit consent)
 *   AWAITING_DEPLOYMENT    → "Website wordt bijgewerkt"  (merged; follow deployment + live page)
 *   AWAITING_VERIFICATION  → "Live resultaat controleren" (live page changed; full rescan due)
 *   STILL_PRESENT          → "Live resultaat controleren" (rescan did not confirm yet)
 *   VERIFIED_RESOLVED      → "Fix bevestigd"
 *   NEEDS_ATTENTION        → "Handmatige actie nodig"     (safe stop with a reason code)
 *
 * Nothing here is specific to a website, repository or framework. Network access
 * (GitHub, live page) is injected so every transition is testable offline.
 */
import { getFixPolicy } from "./fix-policy.ts";
import { normalizeDescriptionText, checkDescriptionCandidate } from "./meta-description-fix.ts";
import { evaluatePolicy, parsePolicySnapshot, parseRecordedPolicy, readServerPolicy, serializePolicy, type RequiredCheck } from "./merge-policy.ts";

export const ACTIVE_FIX_STATUSES = ["PROPOSED", "PR_CREATED", "AWAITING_MERGE", "AWAITING_DEPLOYMENT", "AWAITING_VERIFICATION", "STILL_PRESENT", "PREPARED", "NEEDS_ATTENTION"] as const;
export const ACTIVE_FIX_STATUS_SQL = ACTIVE_FIX_STATUSES.map((s) => `'${s}'`).join(",");

/* --------------------------------------------------------------------------
 * What can be fixed automatically
 * ------------------------------------------------------------------------ */

export type AutofixLevel = "auto" | "review" | "manual";
export type FixGenerator = "meta_description_v1" | "verified_schema_v1" | "deterministic_og_v1" | "ai_rewrite";

const META_DESCRIPTION = new Set(["META_DESCRIPTION_GUIDANCE", "META_DESCRIPTION_MISSING", "SITE_DESCRIPTION_MISSING"]);
const SCHEMA = new Set(["STRUCTURED_DATA_MISSING", "ORGANIZATION_WEBSITE_SCHEMA", "SITE_STRUCTURED_DATA_MISSING"]);
const SOCIAL = new Set(["SOCIAL_METADATA_INCOMPLETE"]);

/** Generator that a supported issue type must use to be publishable without code review. */
export function expectedGenerator(issueId: string): FixGenerator | null {
  if (META_DESCRIPTION.has(issueId)) return "meta_description_v1";
  if (SCHEMA.has(issueId)) return "verified_schema_v1";
  if (SOCIAL.has(issueId)) return "deterministic_og_v1";
  return null;
}

/**
 * auto   – RankFix knows the exact, bounded change (deterministic generator) and can
 *          publish it after explicit consent and all safety checks.
 * review – RankFix can prepare a proposal, but a human must review the code.
 * manual – needs business facts, permissions or technical judgement.
 */
export function autofixLevel(issueId: string): AutofixLevel {
  const policy = getFixPolicy(issueId);
  if (policy.action !== "github_fix" || !policy.safe_type) return "manual";
  return expectedGenerator(issueId) ? "auto" : "review";
}

export function autoPublishSupported(issueId: string, generator: string | null | undefined): boolean {
  const expected = expectedGenerator(issueId);
  return Boolean(expected && generator === expected && autofixLevel(issueId) === "auto");
}

/** A standing AutoFix consent only applies to the exact repository + branch it was given for. */
export function siteConsentValid(mapping: { repository?: string | null; base_branch?: string | null; autofix_publish?: boolean | null; autofix_repository?: string | null; autofix_branch?: string | null } | null | undefined): boolean {
  if (!mapping?.autofix_publish) return false;
  const repo = String(mapping.repository || "").toLowerCase();
  return Boolean(repo && repo === String(mapping.autofix_repository || "").toLowerCase() && mapping.base_branch && mapping.base_branch === mapping.autofix_branch);
}

/* --------------------------------------------------------------------------
 * Customer-facing stages
 * ------------------------------------------------------------------------ */

export type CustomerStage = "preparing" | "executing" | "updating" | "checking" | "confirmed" | "manual";

export const STAGE_ORDER: CustomerStage[] = ["preparing", "executing", "updating", "checking", "confirmed"];
export const STAGE_LABEL_NL: Record<CustomerStage, string> = {
  preparing: "Oplossing voorbereiden",
  executing: "Fix veilig uitvoeren",
  updating: "Website wordt bijgewerkt",
  checking: "Live resultaat controleren",
  confirmed: "Fix bevestigd",
  manual: "Handmatige actie nodig",
};

export function customerStage(row: { status: string; auto_publish?: boolean | null }): CustomerStage {
  switch (row.status) {
    case "PREPARED": case "PROPOSED": return "preparing";
    case "PR_CREATED": case "AWAITING_MERGE": return row.auto_publish ? "executing" : "manual";
    case "AWAITING_DEPLOYMENT": return "updating";
    case "AWAITING_VERIFICATION": case "STILL_PRESENT": return "checking";
    case "VERIFIED_RESOLVED": return "confirmed";
    default: return "manual";
  }
}

export const REASON_NL: Record<string, string> = {
  PR_AWAITING_OWNER: "De wijziging staat klaar als Pull Request. Zonder jouw toestemming voor automatische publicatie wacht RankFix tot de Pull Request is samengevoegd.",
  PR_CLOSED: "De Pull Request is gesloten zonder samenvoegen. Er is niets gepubliceerd.",
  BASE_MISMATCH: "De Pull Request wijst naar een andere branch dan de gekoppelde website-branch. RankFix publiceert dit niet automatisch.",
  HEAD_MISMATCH: "De Pull Request hoort niet bij deze RankFix-fix. RankFix publiceert dit niet automatisch.",
  HEAD_CHANGED: "Er zijn na RankFix nog andere wijzigingen aan de Pull Request toegevoegd. RankFix publiceert die niet automatisch.",
  UNEXPECTED_FILES: "De Pull Request wijzigt meer of andere bestanden dan goedgekeurd. RankFix publiceert dit niet automatisch.",
  DIFF_TOO_LARGE: "De wijziging is groter dan de veilige grens voor automatische publicatie.",
  STALE_BASE: "Het bronbestand is intussen op de website-branch gewijzigd. Maak een nieuwe scan en een nieuw voorstel.",
  CHECKS_FAILED: "Een automatische controle in GitHub is mislukt. RankFix publiceert niet.",
  CHECKS_PENDING: "GitHub-controles lopen nog.",
  MERGEABILITY_PENDING: "GitHub controleert nog of de wijziging samengevoegd kan worden.",
  MERGE_CONFLICT: "De wijziging botst met andere wijzigingen. RankFix publiceert niet automatisch.",
  BRANCH_PROTECTED: "De repository vereist een extra goedkeuring of review voordat er gepubliceerd mag worden.",
  BASE_ADVANCED: "De website-branch is intussen veranderd; GitHub vereist eerst een update van de Pull Request.",
  MERGE_TIMEOUT: "GitHub stond het samenvoegen niet binnen de wachttijd toe.",
  MERGE_REJECTED: "GitHub weigerde het samenvoegen.",
  AUTOFIX_NOT_AUTHORIZED: "Automatische publicatie is voor deze website of dit probleemtype niet toegestaan.",
  DEPLOY_FAILED: "De publicatie (deployment) van de website is mislukt. De live website is niet bijgewerkt.",
  DEPLOY_TIMEOUT: "De website is na de publicatie niet binnen de wachttijd bijgewerkt.",
  LIVE_NOT_UPDATED: "De publicatie is geslaagd, maar de live pagina toont de wijziging nog niet (mogelijk cache of een ander bronbestand).",
  LIVE_UNREACHABLE: "De live pagina is nu niet bereikbaar of blokkeert automatische controles. RankFix markeert de fix daarom niet als opgelost.",
  VERIFY_UNCONFIRMED: "Meerdere nieuwe scans konden de oplossing niet bevestigen. RankFix voert geen nieuwe wijzigingen uit; controleer de oorzaak.",
  GITHUB_UNAVAILABLE: "GitHub is tijdelijk niet bereikbaar. RankFix probeert het later opnieuw; er is niets gewijzigd.",
  GITHUB_NOT_CONNECTED: "De GitHub-koppeling ontbreekt of is verlopen. Verbind GitHub opnieuw om verder te gaan.",
  CI_UNAVAILABLE: "De GitHub-controles konden niet (volledig) worden opgehaald. Zonder bewijs van geslaagde controles publiceert RankFix niet.",
  CI_INCOMPLETE: "GitHub gaf een onvolledige lijst van controles. Zonder volledig bewijs publiceert RankFix niet.",
  CI_SHA_MISMATCH: "De controles horen niet bij exact deze versie van de wijziging. RankFix publiceert niet.",
  CI_UNRELIABLE: "Een controle in GitHub gaf een onbetrouwbaar resultaat. RankFix publiceert niet.",
  EVIDENCE_CHANGED: "Tussen de laatste twee controles veranderde de situatie in GitHub (base, controles of regels). RankFix publiceert niet automatisch.",
  CI_AMBIGUOUS: "Meerdere afzonderlijke workflows leveren een verplichte controle met dezelfde naam. Niet vast te stellen welke telt; RankFix publiceert niet automatisch.",
  REQUIRED_CHECKS_UNDEFINED: "Voor deze repository is geen vertrouwde set verplichte controles vastgesteld (branch protection niet leesbaar en geen vastgelegde set). RankFix publiceert niet automatisch.",
  REQUIRED_CHECK_MISSING: "Een verplichte GitHub-controle is (nog) niet uitgevoerd voor deze wijziging.",
  REQUIRED_CHECK_NOT_SUCCESSFUL: "Een verplichte GitHub-controle is niet geslaagd (bijvoorbeeld overgeslagen of neutraal). RankFix publiceert niet.",
  EVIDENCE_MISSING: "Het bewijs van de goedgekeurde versie (commit of bronbestand) ontbreekt. RankFix publiceert niet automatisch.",
  BASE_UNAVAILABLE: "Het bronbestand op de website-branch kon niet worden gecontroleerd. RankFix publiceert niet.",
};

/* --------------------------------------------------------------------------
 * Merge safety (pure)
 * ------------------------------------------------------------------------ */

export const MAX_AUTOPUBLISH_LINES = 8;

export type PullInfo = { state?: string; merged?: boolean; merged_at?: string | null; mergeable?: boolean | null; mergeable_state?: string; merge_commit_sha?: string | null; head?: { sha?: string; ref?: string }; base?: { ref?: string; sha?: string } };
export type PullFile = { filename?: string; additions?: number; deletions?: number; status?: string };
export type CheckRun = { id?: number; name?: string; status?: string; conclusion?: string | null; head_sha?: string; app?: { id?: number } | null; check_suite?: { id?: number } | null };
export type CommitStatus = { id?: number; context?: string; state?: string };
export type { RequiredCheck } from "./merge-policy.ts";

export type MergeDecision = { decision: "merge" | "wait" | "block" | "merged"; code: string; /** Trusted policy seen in this evaluation (stored once per fix; may only get stricter). */ policy?: string };

/**
 * CI evidence for exactly one head commit (P0, 31 Oct). Fail-closed: only a
 * complete, readable result in which every check of a TRUSTED required set ran
 * on this exact SHA and concluded "success" is "ok". Missing, failed, skipped,
 * neutral, stale, unreadable or incomplete evidence never counts as passed.
 * The required set comes from evaluatePolicy (lib/merge-policy.ts): server-
 * enforced, app-bound checks. A required check is satisfied ONLY by a check run
 * of exactly its GitHub App; a commit status (no producer identity) or a run of
 * another app never satisfies it (Astra F1).
 */
export type CiEvidenceInput = {
  headSha: string | null | undefined;
  required: { checks: RequiredCheck[] };
  checkRuns: { ok: boolean; runs: CheckRun[]; totalCount: number | null };
  statuses: { ok: boolean; sha: string | null; statuses: CommitStatus[]; totalCount: number | null };
};
export type CiEvidence = { verdict: "ok" | "pending" | "failed" | "unavailable" | "untrusted"; code: string; missing?: string[] };

const FAILED_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"]);

export function evaluateCiEvidence(input: CiEvidenceInput): CiEvidence {
  const sha = String(input.headSha || "");
  if (!sha) return { verdict: "unavailable", code: "EVIDENCE_MISSING" };
  const { checkRuns, statuses } = input;
  if (!checkRuns.ok || !statuses.ok) return { verdict: "unavailable", code: "CI_UNAVAILABLE" };
  if (typeof checkRuns.totalCount !== "number" || !Array.isArray(checkRuns.runs) || checkRuns.runs.length < checkRuns.totalCount) return { verdict: "unavailable", code: "CI_INCOMPLETE" };
  if (typeof statuses.totalCount !== "number" || !Array.isArray(statuses.statuses) || statuses.statuses.length < statuses.totalCount) return { verdict: "unavailable", code: "CI_INCOMPLETE" };
  if (statuses.sha !== sha) return { verdict: "unavailable", code: "CI_SHA_MISMATCH" };
  if (checkRuns.runs.some((run) => run.head_sha !== sha)) return { verdict: "unavailable", code: "CI_SHA_MISMATCH" };
  if (checkRuns.runs.some((run) => !run.name || !run.status || typeof run.app?.id !== "number" || typeof run.check_suite?.id !== "number")) return { verdict: "unavailable", code: "CI_UNRELIABLE" };
  const required = (input.required.checks || []).filter((check) => check && typeof check.context === "string" && check.context.trim());
  if (!required.length) return { verdict: "untrusted", code: "REQUIRED_CHECKS_UNDEFINED" };
  if (required.some((check) => !(typeof check.appId === "number" && check.appId > 0))) return { verdict: "untrusted", code: "REQUIRED_CHECK_UNBOUND" };

  // Astra F2: a higher id alone proves no re-run. Only a newer attempt in the SAME
  // check suite (a re-run of the same workflow run) supersedes an earlier one;
  // independent workflows with the same job name are separate checks.
  const latestRuns = new Map<string, CheckRun>();
  for (const run of checkRuns.runs) {
    const key = `${run.name}#${run.app?.id}#${run.check_suite?.id}`;
    const prev = latestRuns.get(key);
    if (!prev || Number(run.id || 0) > Number(prev.id || 0)) latestRuns.set(key, run);
  }
  const latestStatus = new Map<string, CommitStatus>();
  for (const status of statuses.statuses) {
    const key = String(status.context || "");
    const prev = latestStatus.get(key);
    if (!prev || Number(status.id || 0) > Number(prev.id || 0)) latestStatus.set(key, status);
  }
  const runs = [...latestRuns.values()];
  const states = [...latestStatus.values()];
  if (runs.some((run) => run.status === "completed" && FAILED_CONCLUSIONS.has(String(run.conclusion || "")))) return { verdict: "failed", code: "CHECKS_FAILED" };
  if (states.some((status) => status.state === "failure" || status.state === "error")) return { verdict: "failed", code: "CHECKS_FAILED" };

  const missing: string[] = [];
  let pending = false;
  for (const need of required) {
    const candidates = runs.filter((r) => r.name === need.context && r.app?.id === need.appId);
    if (!candidates.length) { missing.push(need.context); continue; }
    // The same required name from more than one check suite is ambiguous: which
    // one GitHub would count cannot be proven, so it is never treated as green.
    if (new Set(candidates.map((r) => r.check_suite?.id)).size > 1) return { verdict: "untrusted", code: "CI_AMBIGUOUS", missing: [need.context] };
    const run = candidates[0];
    if (run.status !== "completed") { pending = true; continue; }
    if (run.conclusion !== "success") return { verdict: "failed", code: "REQUIRED_CHECK_NOT_SUCCESSFUL", missing: [need.context] };
  }
  if (missing.length) return { verdict: "pending", code: "REQUIRED_CHECK_MISSING", missing };
  if (pending || runs.some((run) => run.status !== "completed") || states.some((status) => status.state === "pending")) return { verdict: "pending", code: "CHECKS_PENDING" };
  return { verdict: "ok", code: "CI_GREEN" };
}

export function evaluateMergeSafety(input: {
  pr: PullInfo; files: PullFile[]; ci: CiEvidence;
  expected: { branch: string; baseBranch: string; path: string; headSha?: string | null; baseBlobSha?: string | null };
  baseFileSha: string | null;
}): MergeDecision {
  const { pr, files, expected } = input;
  if (pr.merged || pr.merged_at) return { decision: "merged", code: "MERGED" };
  if (pr.state !== "open") return { decision: "block", code: "PR_CLOSED" };
  if (pr.base?.ref !== expected.baseBranch) return { decision: "block", code: "BASE_MISMATCH" };
  if (pr.head?.ref !== expected.branch) return { decision: "block", code: "HEAD_MISMATCH" };
  // The approved head commit and source blob are mandatory evidence (P0).
  if (!expected.headSha || !expected.baseBlobSha || !pr.head?.sha) return { decision: "block", code: "EVIDENCE_MISSING" };
  if (pr.head.sha !== expected.headSha) return { decision: "block", code: "HEAD_CHANGED" };
  if (files.length !== 1 || files[0].filename !== expected.path || (files[0].status && files[0].status !== "modified")) return { decision: "block", code: "UNEXPECTED_FILES" };
  if (Number(files[0].additions || 0) > MAX_AUTOPUBLISH_LINES || Number(files[0].deletions || 0) > MAX_AUTOPUBLISH_LINES) return { decision: "block", code: "DIFF_TOO_LARGE" };
  if (input.baseFileSha === null) return { decision: "wait", code: "BASE_UNAVAILABLE" };
  if (input.baseFileSha !== expected.baseBlobSha) return { decision: "block", code: "STALE_BASE" };
  // Fail-closed: anything but proven green CI on this exact SHA prevents a merge.
  const ci = input.ci;
  if (!ci || ci.verdict === "failed" || ci.verdict === "untrusted") return { decision: "block", code: ci?.code || "CI_UNAVAILABLE" };
  if (ci.verdict !== "ok") return { decision: "wait", code: ci.code || "CI_UNAVAILABLE" };
  if (pr.mergeable === null || pr.mergeable === undefined || pr.mergeable_state === "unknown") return { decision: "wait", code: "MERGEABILITY_PENDING" };
  if (pr.mergeable === false || pr.mergeable_state === "dirty") return { decision: "block", code: "MERGE_CONFLICT" };
  if (pr.mergeable_state === "blocked") return { decision: "block", code: "BRANCH_PROTECTED" };
  if (pr.mergeable_state === "behind") return { decision: "block", code: "BASE_ADVANCED" };
  if (pr.mergeable_state === "unstable") return { decision: "block", code: "CHECKS_FAILED" };
  if (pr.mergeable_state === "clean" || pr.mergeable_state === "has_hooks") return { decision: "merge", code: "SAFE" };
  return { decision: "wait", code: "MERGEABILITY_PENDING" };
}

/* --------------------------------------------------------------------------
 * Deployment + live page (pure helpers)
 * ------------------------------------------------------------------------ */

export type DeploymentInfo = { environment?: string; production_environment?: boolean; statuses: Array<{ state?: string }> };

/** Latest state of the production deployment(s) for a commit, if the host reports one to GitHub. */
export function deploymentState(deployments: DeploymentInfo[]): "success" | "failure" | "pending" | "none" {
  if (!deployments.length) return "none";
  const production = deployments.filter((d) => d.production_environment || /prod/i.test(String(d.environment || "")));
  const relevant = production.length ? production : deployments;
  const states = relevant.map((d) => String(d.statuses[0]?.state || "pending"));
  if (states.some((s) => s === "success")) return "success";
  if (states.every((s) => s === "failure" || s === "error" || s === "inactive")) return states.some((s) => s === "failure" || s === "error") ? "failure" : "pending";
  return "pending";
}

const CHALLENGE = /\b(?:checking your browser|just a moment|verify (?:you are|that you are) human|enable javascript and cookies to continue|performing security verification|attention required|access denied|request unsuccessful|pardon our interruption|are you a robot|request rejected)\b/i;

export type LiveProbe = { reachable: boolean; httpStatus: number | null; blocked: boolean; html: string };

export function classifyLiveResponse(httpStatus: number, contentType: string, html: string): LiveProbe {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const blocked = httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || httpStatus === 503
    || CHALLENGE.test(title) || (visible.length < 600 && CHALLENGE.test(visible));
  const reachable = httpStatus >= 200 && httpStatus < 300 && /html/i.test(contentType || "text/html") && !blocked;
  return { reachable, httpStatus, blocked, html: reachable ? html : "" };
}

function metaContent(html: string, name: string, attr: "name" | "property" = "name"): string | null {
  const tags = html.match(new RegExp(`<meta\\b[^>]*\\b${attr}\\s*=\\s*["']${name}["'][^>]*>`, "gi")) || [];
  if (!tags[0]) return null;
  return tags[0].match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] ?? "";
}

/** Whether the live HTML already shows the applied change (not yet proof: a full rescan decides). */
export function liveFixApplied(issueId: string, html: string, expectedValue: string | null | undefined): "applied" | "not_yet" | "unknown" {
  if (!html) return "unknown";
  if (META_DESCRIPTION.has(issueId)) {
    const tags = html.match(/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/gi) || [];
    // Missing or duplicated descriptions are never "applied".
    if (tags.length !== 1) return "not_yet";
    const live = normalizeDescriptionText(metaContent(html, "description") || "");
    // Do not confirm a meta-description repair based on length alone.
    if(!checkDescriptionCandidate(live).ok) return "not_yet";
    if (expectedValue) return live.toLowerCase() === normalizeDescriptionText(expectedValue).toLowerCase() ? "applied" : "not_yet";
    return "applied";
  }
  if (SCHEMA.has(issueId)) {
    const blocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    return blocks.some((b) => /"@type"\s*:/.test(b[1])) ? "applied" : "not_yet";
  }
  if (SOCIAL.has(issueId)) {
    // This finding requires the COMPLETE social preview: title, description,
    // and an actual public image URL. A partial fix cannot advance to a
    // verifying scan, let alone be described as confirmed to the customer.
    const title = metaContent(html, "og:title", "property");
    const description = metaContent(html, "og:description", "property");
    const image = metaContent(html, "og:image", "property");
    if (!title?.trim() || !description?.trim() || !image?.trim()) return "not_yet";
    try {
      const parsed = new URL(image);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return "not_yet";
      const path = parsed.pathname.toLowerCase();
      if (/(?:^|[\\/_-])(?:favicon|touch-icon|apple-touch-icon|mask-icon|site-icon|browserconfig)(?:[.\\/_-]|$)/.test(path)) return "not_yet";
    } catch { return "not_yet"; }
    return "applied";
  }
  return "unknown";
}

/* --------------------------------------------------------------------------
 * Lifecycle (state machine)
 * ------------------------------------------------------------------------ */

export type FixRow = {
  id: string; user_id: string; issue_id: string; scanned_url: string; status: string;
  repository?: string | null; pr_number?: number | null; pr_url?: string | null; branch?: string | null; base_branch?: string | null; file_path?: string | null;
  auto_publish?: boolean | null; expected_value?: string | null; head_sha?: string | null; base_blob_sha?: string | null; required_checks?: string | string[] | null; required_policy?: string | null;
  merge_commit_sha?: string | null; merged_at?: string | Date | null; deploy_state?: string | null; deploy_success_at?: string | Date | null;
  live_seen_at?: string | Date | null; merge_attempts?: number | null; verification_attempts?: number | null;
  last_error_code?: string | null; phase_started_at?: string | Date | null; next_check_at?: string | Date | null; proposal_id?: string | null;
};

export type EngineDeps = {
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> };
  github: (<T>(path: string, init?: RequestInit) => Promise<T>) | null;
  probe: (url: string) => Promise<LiveProbe>;
  now?: () => Date;
};

export const LIMITS = {
  mergeWaitMs: 15 * 60_000,
  deployWaitMs: 45 * 60_000,
  liveAfterDeployMs: 10 * 60_000,
  maxVerificationScans: 3,
  minRecheckMs: 8_000,
};

const ms = (v: string | Date | null | undefined) => (v ? new Date(v).getTime() : 0);

async function logEvent(deps: EngineDeps, row: FixRow, stage: string, code: string | null, detail: Record<string, unknown> = {}) {
  try {
    await deps.db.query("INSERT INTO fix_events (proposal_id,pending_fix_id,user_id,stage,reason_code,detail) VALUES ($1,$2,$3,$4,$5,$6::jsonb)", [row.proposal_id || null, row.id, row.user_id, stage, code, JSON.stringify(detail)]);
  } catch { /* logging must never break the lifecycle */ }
}

async function transition(deps: EngineDeps, row: FixRow, status: string, fields: Record<string, unknown> = {}, code: string | null = null) {
  const sets = ["status=$3", "updated_at=NOW()", "last_error_code=$4", "next_check_at=NULL"];
  const params: unknown[] = [row.id, row.user_id, status, code];
  if (status !== row.status) sets.push("phase_started_at=NOW()");
  for (const [key, value] of Object.entries(fields)) { params.push(value); sets.push(`${key}=$${params.length}`); }
  // Optimistic: only move from the state we read, so parallel polls cannot double-merge.
  params.push(row.status);
  const result = await deps.db.query(`UPDATE pending_fixes SET ${sets.join(",")} WHERE id=$1 AND user_id=$2 AND status=$${params.length} RETURNING *`, params);
  if (result.rowCount) {
    if (status !== row.status) await logEvent(deps, row, status, code, fields);
    Object.assign(row, result.rows[0]);
  }
  return Boolean(result.rowCount);
}

async function keep(deps: EngineDeps, row: FixRow, code: string | null, delayMs: number, extra: Record<string, unknown> = {}) {
  const sets = ["last_error_code=$3", `next_check_at=NOW() + ($4::int * INTERVAL '1 millisecond')`, "updated_at=NOW()"];
  const params: unknown[] = [row.id, row.user_id, code, Math.round(delayMs)];
  for (const [key, value] of Object.entries(extra)) { params.push(value); sets.push(`${key}=$${params.length}`); }
  await deps.db.query(`UPDATE pending_fixes SET ${sets.join(",")} WHERE id=$1 AND user_id=$2`, params);
  if (code && code !== row.last_error_code) await logEvent(deps, row, row.status, code);
  row.last_error_code = code;
  Object.assign(row, extra);
}

const CI_PAGE_LIMIT = 10;

/** All check runs of one commit, every page. Any error or malformed page → not ok. */
export async function fetchCheckRuns(gh: NonNullable<EngineDeps["github"]>, repo: string, sha: string): Promise<CiEvidenceInput["checkRuns"]> {
  try {
    const runs: CheckRun[] = [];
    let total: number | null = null;
    for (let page = 1; page <= CI_PAGE_LIMIT; page++) {
      const body = await gh<{ total_count?: number; check_runs?: CheckRun[] }>(`/repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`);
      if (!body || typeof body.total_count !== "number" || !Array.isArray(body.check_runs)) return { ok: false, runs: [], totalCount: null };
      if (total !== null && body.total_count !== total) return { ok: false, runs: [], totalCount: null };
      // Every run must have a unique id: repeated or anonymous runs cannot fill the count.
      for (const run of body.check_runs) { if (typeof run?.id !== "number" || runs.some((r) => r.id === run.id)) return { ok: false, runs: [], totalCount: null }; runs.push(run); }
      total = body.total_count;
      if (runs.length >= total || !body.check_runs.length) break;
    }
    return { ok: true, runs, totalCount: total };
  } catch { return { ok: false, runs: [], totalCount: null }; }
}

/** Combined commit status of one commit, every page. Any error or malformed page → not ok. */
export async function fetchCommitStatuses(gh: NonNullable<EngineDeps["github"]>, repo: string, sha: string): Promise<CiEvidenceInput["statuses"]> {
  try {
    const statuses: CommitStatus[] = [];
    let total: number | null = null; let commit: string | null = null;
    for (let page = 1; page <= CI_PAGE_LIMIT; page++) {
      const body = await gh<{ sha?: string; total_count?: number; statuses?: CommitStatus[] }>(`/repos/${repo}/commits/${sha}/status?per_page=100&page=${page}`);
      if (!body || typeof body.total_count !== "number" || !Array.isArray(body.statuses) || typeof body.sha !== "string") return { ok: false, sha: null, statuses: [], totalCount: null };
      if (commit && body.sha !== commit) return { ok: false, sha: null, statuses: [], totalCount: null };
      if (total !== null && body.total_count !== total) return { ok: false, sha: null, statuses: [], totalCount: null };
      for (const status of body.statuses) { if (typeof status?.id !== "number" || statuses.some((x) => x.id === status.id)) return { ok: false, sha: null, statuses: [], totalCount: null }; statuses.push(status); }
      commit = body.sha; total = body.total_count;
      if (statuses.length >= total || !body.statuses.length) break;
    }
    return { ok: true, sha: commit, statuses, totalCount: total };
  } catch { return { ok: false, sha: null, statuses: [], totalCount: null }; }
}

type Evaluation = { decision: MergeDecision; fingerprint: string | null };

/**
 * One complete, fresh evaluation of everything a merge depends on: PR state and
 * mergeability, head and base commit, changed files, trusted policy, CI on the
 * exact head SHA and the approved base blob. Fail-closed at every step.
 */
async function evaluateForMerge(gh: NonNullable<EngineDeps["github"]>, row: FixRow): Promise<Evaluation> {
  const repo = row.repository!;
  const stop = (decision: MergeDecision): Evaluation => ({ decision, fingerprint: null });
  const pr = await gh<PullInfo & { number?: number }>(`/repos/${repo}/pulls/${Number(row.pr_number)}`);
  if (pr.merged || pr.merged_at) return stop({ decision: "merged", code: "MERGED" });
  const headSha = pr.head?.sha || "";
  const baseSha = pr.base?.sha || "";
  if (!headSha || !baseSha) return stop({ decision: "block", code: "EVIDENCE_MISSING" });
  if (headSha !== row.head_sha) return stop({ decision: "block", code: "HEAD_CHANGED" });
  const files = await gh<PullFile[]>(`/repos/${repo}/pulls/${Number(row.pr_number)}/files?per_page=10`);
  // Trusted policy first (Astra F1): server-enforced, app-bound, not bypassable,
  // never weaker than earlier seen for this fix. No fallback on read errors.
  const policy = evaluatePolicy({ server: await readServerPolicy(gh, repo, String(row.base_branch || "")), recorded: parseRecordedPolicy(row.required_checks), snapshot: parsePolicySnapshot(row.required_policy) });
  if (policy.verdict !== "ok") return stop({ decision: policy.verdict === "wait" ? "wait" : "block", code: policy.code });
  const seenPolicy = serializePolicy(policy.required);
  const [checkRuns, statuses, baseFile] = await Promise.all([
    fetchCheckRuns(gh, repo, headSha),
    fetchCommitStatuses(gh, repo, headSha),
    gh<{ sha?: string }>(`/repos/${repo}/contents/${row.file_path}?ref=${encodeURIComponent(String(row.base_branch || ""))}`).then((f) => (typeof f?.sha === "string" ? f.sha : null)).catch(() => null),
  ]);
  const ci = evaluateCiEvidence({ headSha, required: { checks: policy.required }, checkRuns, statuses });
  const decision = evaluateMergeSafety({
    pr, files: Array.isArray(files) ? files : [], ci,
    expected: { branch: String(row.branch || ""), baseBranch: String(row.base_branch || ""), path: String(row.file_path || ""), headSha: row.head_sha, baseBlobSha: row.base_blob_sha },
    baseFileSha: baseFile,
  });
  if (decision.decision !== "merge") return { decision: { ...decision, policy: seenPolicy }, fingerprint: null };
  const filesSig = (Array.isArray(files) ? files : []).map((f) => `${f.filename}:${f.status}:${f.additions}:${f.deletions}`).join(",");
  return { decision: { ...decision, policy: seenPolicy }, fingerprint: [headSha, baseSha, pr.base?.ref, pr.mergeable_state, baseFile, policy.fingerprint, ci.code, filesSig].join("\u0000") };
}

/**
 * Tries to merge an authorised, deterministic fix (Astra F3). The complete
 * evaluation runs twice; only when both are positive and describe exactly the
 * same state (head, base commit, mergeability, files, policy, CI, base blob) is
 * PUT /merge called, still pinned to the head SHA. Server-side enforcement
 * without bypass (required by the policy) is the last line of defence for
 * anything that changes after the second read.
 */
export async function tryAutoMerge(deps: EngineDeps, row: FixRow): Promise<MergeDecision> {
  const gh = deps.github!;
  const repo = row.repository!;
  if (!row.head_sha || !row.base_blob_sha) return { decision: "block", code: "EVIDENCE_MISSING" };
  const first = await evaluateForMerge(gh, row);
  if (first.decision.decision !== "merge") return first.decision;
  const second = await evaluateForMerge(gh, row);
  if (second.decision.decision !== "merge") return second.decision;
  if (first.fingerprint !== second.fingerprint) return { decision: "block", code: "EVIDENCE_CHANGED", policy: second.decision.policy };
  const headSha = String(row.head_sha);
  try {
    await gh(`/repos/${repo}/pulls/${Number(row.pr_number)}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash", sha: headSha, commit_title: `RankFix: ${row.issue_id} (#${row.pr_number})` }) });
    return { decision: "merged", code: "MERGED", policy: second.decision.policy };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 409) return { decision: "block", code: "HEAD_CHANGED" };
    // GitHub refused the merge (protection, rulesets, hooks): never retried blindly.
    if (status === 405 || status === 403 || status === 422) return { decision: "block", code: "MERGE_REJECTED" };
    throw error;
  }
}

/**
 * Advances one fix by at most one step. Safe to call repeatedly (polling, page reloads,
 * parallel tabs): transitions are optimistic and every external failure keeps the state.
 */
export async function advanceFix(deps: EngineDeps, row: FixRow): Promise<FixRow> {
  const now = (deps.now || (() => new Date()))().getTime();
  if (ms(row.next_check_at) > now) return row;
  const phaseAge = now - (ms(row.phase_started_at) || now);
  try {
    if (row.status === "AWAITING_MERGE" || row.status === "PR_CREATED") {
      if (!row.repository || !row.pr_number) return row;
      if (!deps.github) { await keep(deps, row, "GITHUB_NOT_CONNECTED", 60_000); return row; }
      if (row.auto_publish) {
        const result = await tryAutoMerge(deps, row);
        // The policy seen for this fix is kept; a later evaluation may only be stricter.
        const policyField = result.policy && result.policy !== row.required_policy ? { required_policy: result.policy } : {};
        if (result.decision === "merged") {
          const pr = await deps.github<PullInfo>(`/repos/${row.repository}/pulls/${Number(row.pr_number)}`).catch(() => ({} as PullInfo));
          await transition(deps, row, "AWAITING_DEPLOYMENT", { merged_at: new Date(now).toISOString(), merge_commit_sha: pr.merge_commit_sha || null });
        } else if (result.decision === "block") {
          await transition(deps, row, "NEEDS_ATTENTION", policyField, result.code);
        } else if (phaseAge > LIMITS.mergeWaitMs) {
          await transition(deps, row, "NEEDS_ATTENTION", policyField, "MERGE_TIMEOUT");
        } else {
          await keep(deps, row, result.code, 10_000, { merge_attempts: Number(row.merge_attempts || 0) + 1, ...policyField });
        }
        return row;
      }
      const pr = await deps.github<PullInfo>(`/repos/${row.repository}/pulls/${Number(row.pr_number)}`);
      if (pr.merged || pr.merged_at) await transition(deps, row, "AWAITING_DEPLOYMENT", { merged_at: pr.merged_at || new Date(now).toISOString(), merge_commit_sha: pr.merge_commit_sha || null });
      else if (pr.state === "closed") await transition(deps, row, "NEEDS_ATTENTION", {}, "PR_CLOSED");
      else await keep(deps, row, "PR_AWAITING_OWNER", 30_000);
      return row;
    }

    if (row.status === "AWAITING_DEPLOYMENT") {
      let deploy: "success" | "failure" | "pending" | "none" = "none";
      if (deps.github && row.repository && row.merge_commit_sha) {
        const list = await deps.github<Array<{ id: number; environment?: string; production_environment?: boolean }>>(`/repos/${row.repository}/deployments?sha=${row.merge_commit_sha}&per_page=10`).catch(() => []);
        const withStatuses: DeploymentInfo[] = [];
        for (const d of (Array.isArray(list) ? list : []).slice(0, 5)) {
          const statuses = await deps.github<Array<{ state?: string }>>(`/repos/${row.repository}/deployments/${d.id}/statuses?per_page=1`).catch(() => []);
          withStatuses.push({ environment: d.environment, production_environment: d.production_environment, statuses: Array.isArray(statuses) ? statuses : [] });
        }
        deploy = deploymentState(withStatuses);
      }
      if (deploy === "failure") { await transition(deps, row, "NEEDS_ATTENTION", { deploy_state: deploy }, "DEPLOY_FAILED"); return row; }
      const deploySuccessAt = deploy === "success" ? (ms(row.deploy_success_at) || now) : 0;
      const probe = await deps.probe(row.scanned_url);
      const applied = probe.reachable ? liveFixApplied(row.issue_id, probe.html, row.expected_value) : "unknown";
      if (applied === "applied") {
        await transition(deps, row, "AWAITING_VERIFICATION", { deploy_state: deploy, live_seen_at: new Date(now).toISOString(), verification_attempts: 0 });
        return row;
      }
      if (deploySuccessAt && now - deploySuccessAt > LIMITS.liveAfterDeployMs && probe.reachable) {
        await transition(deps, row, "NEEDS_ATTENTION", { deploy_state: deploy }, "LIVE_NOT_UPDATED"); return row;
      }
      if (phaseAge > LIMITS.deployWaitMs) {
        await transition(deps, row, "NEEDS_ATTENTION", { deploy_state: deploy }, probe.reachable ? "DEPLOY_TIMEOUT" : "LIVE_UNREACHABLE"); return row;
      }
      await keep(deps, row, probe.reachable ? null : "LIVE_UNREACHABLE", 15_000, { deploy_state: deploy, ...(deploySuccessAt && !row.deploy_success_at ? { deploy_success_at: new Date(deploySuccessAt).toISOString() } : {}) });
      return row;
    }

    if ((row.status === "AWAITING_VERIFICATION" || row.status === "STILL_PRESENT") && Number(row.verification_attempts || 0) >= LIMITS.maxVerificationScans) {
      await transition(deps, row, "NEEDS_ATTENTION", {}, "VERIFY_UNCONFIRMED");
    }
    return row;
  } catch (error) {
    const status = (error as { status?: number }).status;
    await keep(deps, row, status === 401 ? "GITHUB_NOT_CONNECTED" : "GITHUB_UNAVAILABLE", 30_000).catch(() => {});
    return row;
  }
}

/** A full live rescan is due only after the change is visibly live (prevents premature "not fixed"). */
export function readyForVerificationScan(row: FixRow, now = Date.now()): boolean {
  if (row.status !== "AWAITING_VERIFICATION" && row.status !== "STILL_PRESENT") return false;
  if (Number(row.verification_attempts || 0) >= LIMITS.maxVerificationScans) return false;
  return now - ms(row.phase_started_at) >= (row.status === "STILL_PRESENT" ? 60_000 : 0);
}


/** Historic success does not override a new, proven regression in a later scan. */
export function confirmedFixIsStale(
  row: Pick<FixRow,"status"|"issue_id"> & {verified_at?:string|Date|null},
  scan: {created_at?:string|Date|null;result?:{seo?:{checks?:Array<{issue_id?:string;rule_id?:string;status?:string;issue_status?:string}>};geo?:{checks?:Array<{issue_id?:string;rule_id?:string;status?:string;issue_status?:string}>}}}|null
): boolean {
  if(row.status!=="VERIFIED_RESOLVED" || !scan?.created_at || !row.verified_at) return false;
  const scanTime=new Date(scan.created_at).getTime(),verifiedTime=new Date(row.verified_at).getTime();
  if(!Number.isFinite(scanTime)||!Number.isFinite(verifiedTime)||scanTime<=verifiedTime) return false;
  const checks=[...(scan.result?.seo?.checks||[]),...(scan.result?.geo?.checks||[])];
  return checks.some(c=>String(c.issue_id||c.rule_id||"").toUpperCase()===row.issue_id.toUpperCase()
    && ["WARNING","FAIL"].includes(String(c.issue_status||c.status||"").toUpperCase()));
}

export function publicFixView(row: FixRow) {
  const stage = customerStage(row);
  const code = row.status === "AWAITING_MERGE" && !row.auto_publish ? "PR_AWAITING_OWNER" : row.last_error_code || null;
  return {
    issue_id: row.issue_id,
    status: row.status,
    stage,
    stage_label: STAGE_LABEL_NL[stage],
    reason_code: stage === "manual" || code === "LIVE_UNREACHABLE" ? code : null,
    reason: (stage === "manual" || code === "LIVE_UNREACHABLE") && code ? REASON_NL[code] || null : null,
    ready_for_scan: readyForVerificationScan(row),
    technical: {
      repository: row.repository || null, file: row.file_path || null, branch: row.branch || null,
      pr_number: row.pr_number ? Number(row.pr_number) : null, pr_url: row.pr_url || null,
      merge_commit: row.merge_commit_sha || null, deployment: row.deploy_state || null,
      merged_at: row.merged_at || null, live_seen_at: row.live_seen_at || null, verification_attempts: Number(row.verification_attempts || 0),
    },
  };
}
