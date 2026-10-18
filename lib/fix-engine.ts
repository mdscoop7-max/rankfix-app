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
import { normalizeDescriptionText } from "./meta-description-fix.ts";

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
};

/* --------------------------------------------------------------------------
 * Merge safety (pure)
 * ------------------------------------------------------------------------ */

export const MAX_AUTOPUBLISH_LINES = 8;

export type PullInfo = { state?: string; merged?: boolean; merged_at?: string | null; mergeable?: boolean | null; mergeable_state?: string; merge_commit_sha?: string | null; head?: { sha?: string; ref?: string }; base?: { ref?: string } };
export type PullFile = { filename?: string; additions?: number; deletions?: number; status?: string };
export type CheckRun = { status?: string; conclusion?: string | null };

export type MergeDecision = { decision: "merge" | "wait" | "block" | "merged"; code: string };

export function evaluateMergeSafety(input: {
  pr: PullInfo; files: PullFile[]; checkRuns: CheckRun[]; combinedState: string; combinedCount: number;
  expected: { branch: string; baseBranch: string; path: string; headSha?: string | null; baseBlobSha?: string | null };
  baseFileSha: string | null;
}): MergeDecision {
  const { pr, files, expected } = input;
  if (pr.merged || pr.merged_at) return { decision: "merged", code: "MERGED" };
  if (pr.state !== "open") return { decision: "block", code: "PR_CLOSED" };
  if (pr.base?.ref !== expected.baseBranch) return { decision: "block", code: "BASE_MISMATCH" };
  if (pr.head?.ref !== expected.branch) return { decision: "block", code: "HEAD_MISMATCH" };
  if (expected.headSha && pr.head?.sha !== expected.headSha) return { decision: "block", code: "HEAD_CHANGED" };
  if (files.length !== 1 || files[0].filename !== expected.path || (files[0].status && files[0].status !== "modified")) return { decision: "block", code: "UNEXPECTED_FILES" };
  if (Number(files[0].additions || 0) > MAX_AUTOPUBLISH_LINES || Number(files[0].deletions || 0) > MAX_AUTOPUBLISH_LINES) return { decision: "block", code: "DIFF_TOO_LARGE" };
  if (expected.baseBlobSha && input.baseFileSha !== expected.baseBlobSha) return { decision: "block", code: "STALE_BASE" };
  const bad = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure"]);
  if (input.checkRuns.some((c) => bad.has(String(c.conclusion || "")))) return { decision: "block", code: "CHECKS_FAILED" };
  if (["failure", "error"].includes(input.combinedState)) return { decision: "block", code: "CHECKS_FAILED" };
  if (input.checkRuns.some((c) => c.status && c.status !== "completed")) return { decision: "wait", code: "CHECKS_PENDING" };
  if (input.combinedState === "pending" && input.combinedCount > 0) return { decision: "wait", code: "CHECKS_PENDING" };
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
    if (expectedValue) return live.toLowerCase() === normalizeDescriptionText(expectedValue).toLowerCase() ? "applied" : "not_yet";
    return live.length >= 120 && live.length <= 160 ? "applied" : "not_yet";
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
  auto_publish?: boolean | null; expected_value?: string | null; head_sha?: string | null; base_blob_sha?: string | null;
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

/** Tries to merge an authorised, deterministic fix. Never merges when any check is uncertain. */
export async function tryAutoMerge(deps: EngineDeps, row: FixRow): Promise<MergeDecision> {
  const gh = deps.github!;
  const repo = row.repository!;
  const pr = await gh<PullInfo & { number?: number }>(`/repos/${repo}/pulls/${Number(row.pr_number)}`);
  if (pr.merged || pr.merged_at) return { decision: "merged", code: "MERGED" };
  const files = await gh<PullFile[]>(`/repos/${repo}/pulls/${Number(row.pr_number)}/files?per_page=10`);
  const headSha = pr.head?.sha || "";
  const [checks, combined, baseFile] = await Promise.all([
    gh<{ check_runs?: CheckRun[] }>(`/repos/${repo}/commits/${headSha}/check-runs?per_page=50`).catch(() => ({ check_runs: [] })),
    gh<{ state?: string; total_count?: number }>(`/repos/${repo}/commits/${headSha}/status`).catch(() => ({ state: "pending", total_count: 0 })),
    gh<{ sha?: string }>(`/repos/${repo}/contents/${row.file_path}?ref=${encodeURIComponent(String(row.base_branch || ""))}`).catch(() => ({ sha: undefined })),
  ]);
  const decision = evaluateMergeSafety({
    pr, files: Array.isArray(files) ? files : [], checkRuns: checks.check_runs || [], combinedState: String(combined.state || "pending"), combinedCount: Number(combined.total_count || 0),
    expected: { branch: String(row.branch || ""), baseBranch: String(row.base_branch || ""), path: String(row.file_path || ""), headSha: row.head_sha, baseBlobSha: row.base_blob_sha },
    baseFileSha: baseFile.sha || null,
  });
  if (decision.decision !== "merge") return decision;
  try {
    await gh(`/repos/${repo}/pulls/${Number(row.pr_number)}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash", sha: headSha, commit_title: `RankFix: ${row.issue_id} (#${row.pr_number})` }) });
    return { decision: "merged", code: "MERGED" };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 409) return { decision: "block", code: "HEAD_CHANGED" };
    if (status === 405) return { decision: "block", code: "MERGE_REJECTED" };
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
        if (result.decision === "merged") {
          const pr = await deps.github<PullInfo>(`/repos/${row.repository}/pulls/${Number(row.pr_number)}`).catch(() => ({} as PullInfo));
          await transition(deps, row, "AWAITING_DEPLOYMENT", { merged_at: new Date(now).toISOString(), merge_commit_sha: pr.merge_commit_sha || null });
        } else if (result.decision === "block") {
          await transition(deps, row, "NEEDS_ATTENTION", {}, result.code);
        } else if (phaseAge > LIMITS.mergeWaitMs) {
          await transition(deps, row, "NEEDS_ATTENTION", {}, "MERGE_TIMEOUT");
        } else {
          await keep(deps, row, result.code, 10_000, { merge_attempts: Number(row.merge_attempts || 0) + 1 });
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
