// Orchestration for one regression run. The scanner and the notifier are
// injected, so the whole flow is tested with mocks and a real PostgreSQL.
import { classifyResult } from "./compare.ts";
import { enabledPilotSites, PILOT_SITES, PILOT_SITES_VERSION, pilotSiteById, type PilotSite } from "./pilot-sites.ts";
import { buildMarkdownReport, type ReportRow } from "./report.ts";
import { emptySnapshot, snapshotFromScan, type ScanCall } from "./snapshot.ts";
import {
  claimNotification, claimSite, completeSite, consecutiveGreenRuns, ensureRegressionSchema, finishRun,
  latestBaseline, releaseNotification, runResults, startRun, validRunKey, type Query,
} from "./store.ts";

// Below the 300 s function limit, so the route can still store a timeout.
export const SCAN_BUDGET_MS = 270_000;

export type ScannerVersion = { crawler: string; rules: string; scoreModel: string; commit: string | null };
export type ScanFn = (url: string) => Promise<{ httpStatus: number; body: unknown }>;
export type NotifyFn = (input: { runKey: string; markdown: string; regressions: number }) => Promise<void>;

export type Deps = { query: Query; scan: ScanFn; notify: NotifyFn; version: ScannerVersion; sites?: PilotSite[]; budgetMs?: number };

type Fail = { ok: false; status: number; error: string };

export async function startRegressionRun(deps: Deps, runKey: unknown) {
  if (!validRunKey(runKey)) return { ok: false, status: 400, error: "Ongeldige runKey." } as Fail;
  await ensureRegressionSchema(deps.query);
  const started = await startRun(deps.query, runKey, deps.version.commit, PILOT_SITES_VERSION);
  if (!started.ok) return { ok: false, status: 409, error: `Er loopt al een regressierun (${started.activeRunKey}).` } as Fail;
  const sites = enabledPilotSites(deps.sites ?? PILOT_SITES).map((site) => ({ id: site.id, label: site.label }));
  return { ok: true as const, runKey, status: started.status, created: started.created, sites };
}

async function withBudget<T>(promise: Promise<T>, ms: number): Promise<{ value?: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), ms); });
  try {
    const raced = await Promise.race([promise.then((value) => ({ value, timedOut: false as const })), timeout]);
    return raced;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function scanRegressionSite(deps: Deps, runKey: unknown, siteId: unknown) {
  if (!validRunKey(runKey)) return { ok: false, status: 400, error: "Ongeldige runKey." } as Fail;
  const site = pilotSiteById(siteId, deps.sites ?? PILOT_SITES);
  if (!site) return { ok: false, status: 404, error: "Onbekende testsite." } as Fail;
  await ensureRegressionSchema(deps.query);
  const enabled = enabledPilotSites(deps.sites ?? PILOT_SITES).some((s) => s.id === site.id);

  const claim = await claimSite(deps.query, runKey, site.id);
  if (claim.state === "run_not_running") return { ok: false, status: 409, error: "Run is niet actief." } as Fail;
  if (claim.state === "done") return { ok: true as const, siteId: site.id, reused: true, snapshot: claim.snapshot, classification: claim.classification };
  if (claim.state === "in_progress") return { ok: false, status: 409, error: "Deze site wordt al gescand." } as Fail;
  if (claim.state === "exhausted") return { ok: false, status: 409, error: "Maximaal aantal pogingen bereikt; wordt als timeout gerapporteerd." } as Fail;

  const scanner = { crawler: deps.version.crawler, rules: deps.version.rules, scoreModel: deps.version.scoreModel, commit: deps.version.commit };
  let call: ScanCall;
  if (!enabled || !site.url) {
    const snapshot = emptySnapshot("skipped", { errorCode: site.approval === "approved" ? "SITE_DISABLED" : "AWAITING_OWNER_APPROVAL", scanner });
    const classification = classifyResult(snapshot, null, site.expect);
    await completeSite(deps.query, runKey, site.id, snapshot, classification);
    return { ok: true as const, siteId: site.id, reused: false, snapshot, classification };
  }
  const started = Date.now();
  try {
    const outcome = await withBudget(deps.scan(site.url), deps.budgetMs ?? SCAN_BUDGET_MS);
    call = outcome.timedOut || !outcome.value
      ? { httpStatus: 504, body: null, durationMs: Date.now() - started, timedOut: true, scanner }
      : { httpStatus: outcome.value.httpStatus, body: outcome.value.body, durationMs: Date.now() - started, scanner };
  } catch (error) {
    const timedOut = error instanceof Error && /timeout|abort/i.test(error.message);
    call = { httpStatus: timedOut ? 504 : 500, body: { code: timedOut ? "SCAN_TIMEOUT" : "SCAN_INTERNAL_ERROR" }, durationMs: Date.now() - started, timedOut, scanner };
  }
  const snapshot = snapshotFromScan(call);
  const baseline = await latestBaseline(deps.query, runKey, site.id);
  const classification = classifyResult(snapshot, baseline, site.expect);
  await completeSite(deps.query, runKey, site.id, snapshot, classification);
  return { ok: true as const, siteId: site.id, reused: false, snapshot, classification };
}

export async function finishRegressionRun(deps: Deps, runKey: unknown) {
  if (!validRunKey(runKey)) return { ok: false, status: 400, error: "Ongeldige runKey." } as Fail;
  await ensureRegressionSchema(deps.query);
  const sites = deps.sites ?? PILOT_SITES;
  const stored = new Map((await runResults(deps.query, runKey)).map((r) => [r.siteId, r]));
  const rows: ReportRow[] = sites.map((site) => {
    const result = stored.get(site.id);
    if (result?.status === "done" && result.snapshot && result.classification) {
      return { siteId: site.id, label: site.label, url: site.url, snapshot: result.snapshot, classification: result.classification };
    }
    // Never finished (crash, retries exhausted) → timeout; never started → skipped.
    const enabled = enabledPilotSites(sites).some((s) => s.id === site.id);
    const snapshot = result
      ? emptySnapshot("timeout", { errorCode: "SCAN_NOT_COMPLETED" })
      : emptySnapshot("skipped", { errorCode: enabled ? "NOT_ATTEMPTED" : site.approval === "approved" ? "SITE_DISABLED" : "AWAITING_OWNER_APPROVAL" });
    return { siteId: site.id, label: site.label, url: site.url, snapshot, classification: classifyResult(snapshot, null, site.expect) };
  });
  const greenBefore = await consecutiveGreenRuns(deps.query);
  const preview = buildMarkdownReport({ runKey, commit: deps.version.commit, sitesVersion: PILOT_SITES_VERSION, rows, consecutiveGreen: 0 });
  const completedNow = await finishRun(deps.query, runKey, preview.totals, preview.green);
  const consecutiveGreen = completedNow ? (preview.green ? greenBefore + 1 : 0) : await consecutiveGreenRuns(deps.query);
  const report = buildMarkdownReport({ runKey, commit: deps.version.commit, sitesVersion: PILOT_SITES_VERSION, rows, consecutiveGreen });

  // At most one bundled notification per run, and only for real regressions.
  let notified = false;
  if (report.totals.regressions > 0 && await claimNotification(deps.query, runKey)) {
    try {
      await deps.notify({ runKey, markdown: report.markdown, regressions: report.totals.regressions });
      notified = true;
    } catch (error) {
      // Allow a later finish call to retry delivery instead of losing the alert.
      await releaseNotification(deps.query, runKey);
      console.error("Regression notification failed", error instanceof Error ? error.message : "NOTIFY_FAILED");
    }
  }
  return { ok: true as const, runKey, totals: report.totals, green: report.green, consecutiveGreen, notified, markdown: report.markdown };
}
