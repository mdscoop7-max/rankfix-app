// Storage for the internal regression pilot. Own tables only: it never reads or
// writes customer scans, users, usage or fixes. All SQL takes a query function,
// so the lease and idempotency rules are tested against a real PostgreSQL in
// tests and run unchanged in production.
import type { Classification } from "./compare.ts";
import type { RegressionSnapshot } from "./snapshot.ts";

export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;

export const REGRESSION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS regression_runs (
    run_key TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed')),
    commit_sha TEXT,
    sites_version TEXT,
    lease_until TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    totals JSONB,
    green BOOLEAN,
    notified_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS regression_results (
    run_key TEXT NOT NULL REFERENCES regression_runs(run_key) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('claimed','done')),
    attempts INTEGER NOT NULL DEFAULT 1,
    lease_until TIMESTAMPTZ NOT NULL,
    snapshot JSONB,
    classification JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_key, site_id)
  )`,
  `CREATE INDEX IF NOT EXISTS regression_results_site_idx ON regression_results(site_id, updated_at DESC)`,
];

export const RUN_LEASE_MINUTES = 90;
export const SITE_LEASE_SECONDS = 330;   // > one scan (300 s function limit)
export const MAX_SITE_ATTEMPTS = 2;      // first try + one retry

const RUN_KEY = /^[a-z0-9][a-z0-9-]{2,63}$/;
export function validRunKey(value: unknown): value is string {
  return typeof value === "string" && RUN_KEY.test(value);
}

export async function ensureRegressionSchema(query: Query) {
  for (const statement of REGRESSION_SCHEMA) await query(statement);
}

export type StartResult = { ok: true; created: boolean; status: string } | { ok: false; reason: "another_run_active"; activeRunKey: string };

// One active run at a time. Re-starting the same run key is a no-op (resume).
export async function startRun(query: Query, runKey: string, commit: string | null, sitesVersion: string): Promise<StartResult> {
  const active = await query(
    "SELECT run_key FROM regression_runs WHERE status='running' AND lease_until>NOW() AND run_key<>$1 LIMIT 1",
    [runKey],
  );
  if (active.rows[0]) return { ok: false, reason: "another_run_active", activeRunKey: String(active.rows[0].run_key) };
  const inserted = await query(
    `INSERT INTO regression_runs (run_key,commit_sha,sites_version,lease_until)
     VALUES ($1,$2,$3,NOW()+make_interval(mins => $4::int))
     ON CONFLICT (run_key) DO UPDATE SET lease_until=CASE WHEN regression_runs.status='running' THEN EXCLUDED.lease_until ELSE regression_runs.lease_until END
     RETURNING status,(xmax=0) AS created`,
    [runKey, commit, sitesVersion, RUN_LEASE_MINUTES],
  );
  const row = inserted.rows[0] || {};
  return { ok: true, created: Boolean(row.created), status: String(row.status || "running") };
}

export type ClaimResult =
  | { state: "claimed"; attempt: number }
  | { state: "done"; snapshot: RegressionSnapshot; classification: Classification }
  | { state: "in_progress" }
  | { state: "exhausted" }
  | { state: "run_not_running" };

// Exactly one scan per site per run. A crashed or timed-out claim can be taken
// again after its lease expires, at most MAX_SITE_ATTEMPTS times in total.
export async function claimSite(query: Query, runKey: string, siteId: string): Promise<ClaimResult> {
  const run = await query("SELECT status FROM regression_runs WHERE run_key=$1", [runKey]);
  if (run.rows[0]?.status !== "running") return { state: "run_not_running" };
  const claimed = await query(
    `INSERT INTO regression_results (run_key,site_id,status,attempts,lease_until)
     VALUES ($1,$2,'claimed',1,NOW()+make_interval(secs => $3::int))
     ON CONFLICT (run_key,site_id) DO UPDATE
       SET attempts=regression_results.attempts+1,
           lease_until=NOW()+make_interval(secs => $3::int),
           updated_at=NOW()
     WHERE regression_results.status='claimed'
       AND regression_results.lease_until<NOW()
       AND regression_results.attempts<$4
     RETURNING attempts`,
    [runKey, siteId, SITE_LEASE_SECONDS, MAX_SITE_ATTEMPTS],
  );
  if (claimed.rows[0]) return { state: "claimed", attempt: Number(claimed.rows[0].attempts) };
  const existing = await query("SELECT status,attempts,lease_until>NOW() AS leased,snapshot,classification FROM regression_results WHERE run_key=$1 AND site_id=$2", [runKey, siteId]);
  const row = existing.rows[0];
  if (row?.status === "done") return { state: "done", snapshot: row.snapshot as RegressionSnapshot, classification: row.classification as Classification };
  if (row?.leased) return { state: "in_progress" };
  return { state: "exhausted" };
}

export async function completeSite(query: Query, runKey: string, siteId: string, snapshot: RegressionSnapshot, classification: Classification) {
  await query(
    `UPDATE regression_results SET status='done',snapshot=$3,classification=$4,lease_until=NOW(),updated_at=NOW()
     WHERE run_key=$1 AND site_id=$2 AND status='claimed'`,
    [runKey, siteId, JSON.stringify(snapshot), JSON.stringify(classification)],
  );
}

// The newest usable result for this site from an earlier run.
export async function latestBaseline(query: Query, runKey: string, siteId: string): Promise<RegressionSnapshot | null> {
  const rows = await query(
    `SELECT snapshot FROM regression_results
     WHERE site_id=$1 AND run_key<>$2 AND status='done'
       AND snapshot->>'outcome'='scanned'
       AND COALESCE((snapshot->>'botProtection')::boolean,false)=FALSE
       AND COALESCE((snapshot->>'coveragePercent')::int,0)>=70
     ORDER BY updated_at DESC LIMIT 1`,
    [siteId, runKey],
  );
  return (rows.rows[0]?.snapshot as RegressionSnapshot) || null;
}

export async function runResults(query: Query, runKey: string) {
  const rows = await query("SELECT site_id,status,snapshot,classification FROM regression_results WHERE run_key=$1", [runKey]);
  return rows.rows.map((row) => ({
    siteId: String(row.site_id),
    status: String(row.status),
    snapshot: (row.snapshot as RegressionSnapshot) || null,
    classification: (row.classification as Classification) || null,
  }));
}

// Completes the run once. Returns whether this call completed it, so only one
// caller ever sends the notification.
export async function finishRun(query: Query, runKey: string, totals: unknown, green: boolean): Promise<boolean> {
  const updated = await query(
    "UPDATE regression_runs SET status='completed',finished_at=NOW(),totals=$2,green=$3 WHERE run_key=$1 AND status='running' RETURNING run_key",
    [runKey, JSON.stringify(totals), green],
  );
  return Boolean(updated.rows[0]);
}

// Claim the single notification for this run (at most one, ever).
export async function claimNotification(query: Query, runKey: string): Promise<boolean> {
  const updated = await query("UPDATE regression_runs SET notified_at=NOW() WHERE run_key=$1 AND notified_at IS NULL RETURNING run_key", [runKey]);
  return Boolean(updated.rows[0]);
}

export async function releaseNotification(query: Query, runKey: string) {
  await query("UPDATE regression_runs SET notified_at=NULL WHERE run_key=$1", [runKey]);
}

// Consecutive green completed runs, newest first, including this one.
export async function consecutiveGreenRuns(query: Query): Promise<number> {
  const rows = await query("SELECT green FROM regression_runs WHERE status='completed' ORDER BY finished_at DESC LIMIT 30");
  let count = 0;
  for (const row of rows.rows) {
    if (row.green === true) count++;
    else break;
  }
  return count;
}
