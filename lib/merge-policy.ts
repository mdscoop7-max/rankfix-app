/**
 * Trusted merge policy for AutoFix (Astra review of 54fab62, F1/F7, 31 Oct 2026).
 *
 * RankFix only merges automatically when GitHub ITSELF enforces the required
 * checks on the base branch, every required check is bound to the GitHub App
 * that must produce it, and the identity RankFix merges with cannot bypass those
 * rules. Anything else is PR-only. A failed read never falls back to a weaker
 * source, and a policy seen earlier for the same fix can only get stricter.
 *
 * Sources:
 *  - Rulesets: GET /repos/{repo}/rules/branches/{branch} (effective repository and
 *    organisation rules, readable with read access) + per ruleset
 *    GET /repos/{repo}/rulesets/{id}?includes_parents=true for `current_user_can_bypass`.
 *  - Classic protection: GET /repos/{repo}/branches/{branch}/protection. Only an
 *    admin can read it, and an admin bypasses it unless `enforce_admins` is on.
 *  - Recorded owner policy: an EXTRA requirement only; never a substitute for
 *    server enforcement.
 */

export type RequiredCheck = { context: string; appId: number | null; source: "ruleset" | "protection" | "recorded" };
export type ReadState = "ok" | "none" | "unreadable" | "unavailable";
export type ServerPolicy = {
  rules: ReadState;
  protection: ReadState;
  checks: RequiredCheck[];
  /** Keys (`context#appId`) that GitHub enforces and the current identity cannot bypass. */
  enforced: string[];
  mergeQueue: boolean;
};
export type RecordedPolicy = { valid: boolean; checks: RequiredCheck[]; error?: string };
export type PolicyDecision = { verdict: "ok" | "wait" | "block"; code: string; required: RequiredCheck[]; fingerprint: string };

type Gh = <T>(path: string, init?: RequestInit) => Promise<T>;

export const checkKey = (c: { context: string; appId: number | null }) => `${c.context}#${c.appId ?? "any"}`;

/** 404 = this source has no rules; 401/403 = not readable for this identity; anything else = temporarily unavailable. */
export function readErrorState(error: unknown): Exclude<ReadState, "ok"> {
  const status = Number((error as { status?: number })?.status);
  if (status === 404) return "none";
  if (status === 401 || status === 403) return "unreadable";
  return "unavailable";
}

const boundAppId = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null);
const validContext = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);

const RULE_PAGE_LIMIT = 5;

export async function readServerPolicy(gh: Gh, repo: string, baseBranch: string): Promise<ServerPolicy> {
  const policy: ServerPolicy = { rules: "none", protection: "none", checks: [], enforced: [], mergeQueue: false };
  const branch = encodeURIComponent(baseBranch);

  // 1. Effective rulesets for the base branch.
  try {
    const items: Array<{ type?: string; ruleset_id?: number; parameters?: { required_status_checks?: Array<{ context?: unknown; integration_id?: unknown }> } }> = [];
    let complete = false;
    for (let page = 1; page <= RULE_PAGE_LIMIT; page++) {
      const body = await gh<unknown>(`/repos/${repo}/rules/branches/${branch}?per_page=100&page=${page}`);
      if (!Array.isArray(body)) throw Object.assign(new Error("malformed rules"), { status: 502 });
      items.push(...(body as typeof items));
      if (body.length < 100) { complete = true; break; }
    }
    if (!complete) throw Object.assign(new Error("too many rules"), { status: 502 });
    policy.rules = "ok";
    const byRuleset = new Map<number, RequiredCheck[]>();
    for (const item of items) {
      if (item?.type === "merge_queue") policy.mergeQueue = true;
      if (item?.type !== "required_status_checks") continue;
      const id = boundAppId(item.ruleset_id);
      const list = item.parameters?.required_status_checks;
      if (id === null || !Array.isArray(list)) { policy.rules = "unavailable"; continue; }
      for (const entry of list) {
        if (!validContext(entry?.context)) { policy.rules = "unavailable"; continue; }
        const check: RequiredCheck = { context: entry.context, appId: boundAppId(entry.integration_id), source: "ruleset" };
        policy.checks.push(check);
        byRuleset.set(id, [...(byRuleset.get(id) || []), check]);
      }
    }
    // Server enforcement counts only when THIS identity can never bypass the ruleset.
    for (const [id, checks] of byRuleset) {
      try {
        const ruleset = await gh<{ enforcement?: string; current_user_can_bypass?: string }>(`/repos/${repo}/rulesets/${id}?includes_parents=true`);
        if (ruleset?.enforcement === "active" && ruleset.current_user_can_bypass === "never") policy.enforced.push(...checks.map(checkKey));
      } catch (error) {
        if (readErrorState(error) === "unavailable") policy.rules = "unavailable";
      }
    }
  } catch (error) {
    policy.rules = readErrorState(error);
  }

  // 2. Classic branch protection (admin-readable only).
  try {
    const body = await gh<{ required_status_checks?: { checks?: Array<{ context?: unknown; app_id?: unknown }>; contexts?: unknown[] } | null; enforce_admins?: { enabled?: boolean } | null }>(`/repos/${repo}/branches/${branch}/protection`);
    if (!body || typeof body !== "object") throw Object.assign(new Error("malformed protection"), { status: 502 });
    policy.protection = "ok";
    const rsc = body.required_status_checks;
    const checks: RequiredCheck[] = [];
    if (rsc) {
      for (const entry of Array.isArray(rsc.checks) ? rsc.checks : []) {
        if (!validContext(entry?.context)) { policy.protection = "unavailable"; continue; }
        checks.push({ context: entry.context, appId: boundAppId(entry.app_id), source: "protection" });
      }
      // Legacy `contexts` without a matching `checks` entry have no producer binding.
      for (const context of Array.isArray(rsc.contexts) ? rsc.contexts : []) {
        if (validContext(context) && !checks.some((c) => c.context === context)) checks.push({ context, appId: null, source: "protection" });
      }
    }
    policy.checks.push(...checks);
    // Readable protection means an admin identity; admins bypass unless enforce_admins is on.
    if (body.enforce_admins?.enabled === true) policy.enforced.push(...checks.map(checkKey));
  } catch (error) {
    policy.protection = readErrorState(error);
  }
  return policy;
}

/**
 * The owner's recorded policy (F7): an array of { context, app_id }. Every item
 * must be valid; one invalid item rejects the whole policy (never silently
 * shortened). Identical duplicates are merged. null/""/[] = no recorded policy.
 */
export function parseRecordedPolicy(value: unknown): RecordedPolicy {
  if (value === null || value === undefined || value === "") return { valid: true, checks: [] };
  let list: unknown = value;
  if (typeof value === "string") {
    try { list = JSON.parse(value); } catch { return { valid: false, checks: [], error: "Geen geldige JSON." }; }
  }
  if (!Array.isArray(list)) return { valid: false, checks: [], error: "Verwacht een lijst met controles." };
  if (list.length > 30) return { valid: false, checks: [], error: "Maximaal 30 verplichte controles." };
  const checks: RequiredCheck[] = [];
  for (const item of list) {
    const context = (item as { context?: unknown })?.context;
    const appId = boundAppId((item as { app_id?: unknown })?.app_id);
    if (!validContext(context)) return { valid: false, checks: [], error: "Elke controle heeft een naam van 1–120 tekens nodig." };
    if (appId === null) return { valid: false, checks: [], error: `Controle "${context}" heeft een GitHub-app-ID (app_id) nodig.` };
    if (!checks.some((c) => c.context === context && c.appId === appId)) checks.push({ context, appId, source: "recorded" });
  }
  return { valid: true, checks };
}

export function serializePolicy(checks: RequiredCheck[]): string {
  return JSON.stringify([...checks].map((c) => ({ context: c.context, app_id: c.appId, source: c.source })).sort((a, b) => checkKey({ context: a.context, appId: a.app_id }).localeCompare(checkKey({ context: b.context, appId: b.app_id }))));
}

export function parsePolicySnapshot(value: unknown): RequiredCheck[] | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const list = JSON.parse(value);
    if (!Array.isArray(list)) return null;
    return list.filter((x) => validContext(x?.context)).map((x) => ({ context: x.context, appId: boundAppId(x.app_id), source: x.source === "ruleset" || x.source === "protection" ? x.source : "recorded" }));
  } catch { return null; }
}

/**
 * Decides whether the policy may support an automatic merge. Fail-closed:
 * unavailable → wait; unreadable/unbound/unenforced/weakened → block (PR-only).
 */
export function evaluatePolicy(input: { server: ServerPolicy; recorded: RecordedPolicy; snapshot: RequiredCheck[] | null }): PolicyDecision {
  const { server, recorded } = input;
  const out = (verdict: PolicyDecision["verdict"], code: string, required: RequiredCheck[] = []): PolicyDecision => ({ verdict, code, required, fingerprint: required.map(checkKey).sort().join("|") });
  if (server.rules === "unavailable" || server.protection === "unavailable") return out("wait", "POLICY_UNAVAILABLE");
  if (server.mergeQueue) return out("block", "MERGE_QUEUE_REQUIRED");
  if (!recorded.valid) return out("block", "POLICY_INVALID");
  const required: RequiredCheck[] = [];
  for (const check of [...server.checks, ...recorded.checks]) if (!required.some((r) => checkKey(r) === checkKey(check))) required.push(check);
  // A policy seen earlier for this fix may only get stricter: a requirement that
  // disappeared (or can no longer be read) stops the automatic merge.
  for (const earlier of input.snapshot || []) {
    if (!required.some((r) => checkKey(r) === checkKey(earlier))) {
      const unreadable = server.rules === "unreadable" || server.protection === "unreadable";
      return out("block", unreadable ? "POLICY_UNREADABLE" : "POLICY_WEAKENED", required);
    }
  }
  if (!required.length) return out("block", "REQUIRED_CHECKS_UNDEFINED");
  if (required.some((r) => r.appId === null)) return out("block", "REQUIRED_CHECK_UNBOUND", required);
  const serverChecks = required.filter((r) => r.source !== "recorded");
  if (!serverChecks.length || serverChecks.some((c) => !server.enforced.includes(checkKey(c)))) return out("block", "NOT_SERVER_ENFORCED", required);
  return out("ok", "POLICY_OK", required);
}
