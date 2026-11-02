import type { RequiredCheck } from "./merge-policy.ts";
type Gh = <T>(path:string, init?:RequestInit)=>Promise<T>;
const CI_PAGE_LIMIT = 5;
export type CheckRun = { id?: number; name?: string; status?: string; conclusion?: string | null; head_sha?: string; app?: { id?: number } | null; check_suite?: { id?: number } | null };
export type CommitStatus = { id?: number; context?: string; state?: string };
export type CiEvidenceInput = {
  headSha: string | null | undefined;
  required: { checks: RequiredCheck[] };
  checkRuns: { ok: boolean; runs: CheckRun[]; totalCount: number | null };
  statuses: { ok: boolean; sha: string | null; statuses: CommitStatus[]; totalCount: number | null };
  /**
   * Per check suite that has several runs with the same name: the check-run ids of
   * the LATEST attempt of every job (GitHub Actions jobs API, filter=latest).
   * Absent = not proven. ok:false = could not be read.
   */
  attempts?: Record<string, { ok: boolean; latestRunIds: number[] }>;
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

  // A higher id alone proves no re-run. Within one check suite several runs with
  // the same name are either re-run attempts of ONE job or DIFFERENT jobs that
  // share a name (31 Oct). Only GitHub's own "latest attempt per job" list can
  // tell them apart; without it the group is ambiguous and never green.
  const groups = new Map<string, CheckRun[]>();
  for (const run of checkRuns.runs) {
    const key = `${run.name}#${run.app?.id}#${run.check_suite?.id}`;
    groups.set(key, [...(groups.get(key) || []), run]);
  }
  const latestRuns = new Map<string, CheckRun>();
  for (const [key, group] of groups) {
    if (group.length === 1) { latestRuns.set(key, group[0]); continue; }
    const proof = input.attempts?.[String(group[0].check_suite?.id)];
    if (proof && !proof.ok) return { verdict: "unavailable", code: "CI_UNAVAILABLE" };
    if (!proof) return { verdict: "untrusted", code: "CI_AMBIGUOUS", missing: [String(group[0].name)] };
    const latest = group.filter((run) => proof.latestRunIds.includes(Number(run.id)));
    if (latest.length === 0) return { verdict: "unavailable", code: "CI_UNRELIABLE" };
    if (latest.length > 1) return { verdict: "untrusted", code: "CI_AMBIGUOUS", missing: [String(group[0].name)] };
    latestRuns.set(key, latest[0]);
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

export async function fetchCheckRuns(gh: Gh, repo: string, sha: string): Promise<CiEvidenceInput["checkRuns"]> {
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

/**
 * For every check suite with several same-named runs: the check-run ids of the
 * latest attempt of each job, from GitHub Actions (filter=latest). Non-Actions
 * suites or anything unreadable are not proof (ambiguous / unavailable).
 */
export async function fetchLatestAttempts(gh: Gh, repo: string, sha: string, runs: CheckRun[]): Promise<NonNullable<CiEvidenceInput["attempts"]>> {
  const counts = new Map<string, number>();
  for (const run of runs) { const key = `${run.name}#${run.app?.id}#${run.check_suite?.id}`; counts.set(key, (counts.get(key) || 0) + 1); }
  const suites = [...new Set(runs.filter((run) => (counts.get(`${run.name}#${run.app?.id}#${run.check_suite?.id}`) || 0) > 1).map((run) => Number(run.check_suite?.id)))].slice(0, 5);
  const out: NonNullable<CiEvidenceInput["attempts"]> = {};
  for (const suite of suites) {
    try {
      const wr = await gh<{ total_count?: number; workflow_runs?: Array<{ id?: number; head_sha?: string }> }>(`/repos/${repo}/actions/runs?check_suite_id=${suite}&per_page=5`);
      if (!wr || typeof wr.total_count !== "number" || !Array.isArray(wr.workflow_runs)) { out[String(suite)] = { ok: false, latestRunIds: [] }; continue; }
      // Not a GitHub Actions suite, or not exactly one workflow run for it: no proof.
      if (wr.total_count !== 1 || wr.workflow_runs.length !== 1 || wr.workflow_runs[0].head_sha !== sha || typeof wr.workflow_runs[0].id !== "number") continue;
      const ids: number[] = [];
      let complete = false;
      for (let page = 1; page <= 5; page++) {
        const jobs = await gh<{ total_count?: number; jobs?: Array<{ check_run_url?: string; head_sha?: string }> }>(`/repos/${repo}/actions/runs/${wr.workflow_runs[0].id}/jobs?filter=latest&per_page=100&page=${page}`);
        if (!jobs || typeof jobs.total_count !== "number" || !Array.isArray(jobs.jobs)) break;
        for (const job of jobs.jobs) {
          const match = /\/check-runs\/(\d+)$/.exec(String(job.check_run_url || ""));
          if (!match || job.head_sha !== sha) { ids.length = 0; page = 99; break; }
          ids.push(Number(match[1]));
        }
        if (page === 99) break;
        if (ids.length >= jobs.total_count) { complete = true; break; }
        if (!jobs.jobs.length) break;
      }
      out[String(suite)] = complete ? { ok: true, latestRunIds: ids } : { ok: false, latestRunIds: [] };
    } catch {
      out[String(suite)] = { ok: false, latestRunIds: [] };
    }
  }
  return out;
}

/** Combined commit status of one commit, every page. Any error or malformed page → not ok. */
export async function fetchCommitStatuses(gh: Gh, repo: string, sha: string): Promise<CiEvidenceInput["statuses"]> {
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
