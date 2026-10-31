import { getDb } from "./db.ts";

let initialized = false;
let initializing: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    customer_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_id TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_code TEXT NOT NULL DEFAULT 'free'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_customer_id TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_subscription_id TEXT`,
  `CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    website_host TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('SCAN','AI_FIX','GITHUB_FIX','COMPETITOR_SCAN','LOCAL_SEO')),
    ip_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS usage_events_user_month_idx ON usage_events(user_id, event_type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS usage_events_host_month_idx ON usage_events(website_host, event_type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS usage_events_ip_month_idx ON usage_events(ip_hash, event_type, created_at DESC)`,
  `UPDATE users SET customer_id='RF-' || UPPER(REPLACE(id::text,'-','')) WHERE customer_id IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_customer_id_idx ON users(customer_id)`,
  `ALTER TABLE users ALTER COLUMN customer_id SET NOT NULL`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    scanned_url TEXT NOT NULL,
    final_url TEXT,
    overall_score INTEGER,
    seo_score INTEGER,
    geo_score INTEGER,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS scans_user_created_idx ON scans(user_id, created_at DESC)`,
  `ALTER TABLE scans ADD COLUMN IF NOT EXISTS crawler_version TEXT`,
  `ALTER TABLE scans ADD COLUMN IF NOT EXISTS rules_version TEXT`,
  `ALTER TABLE scans ADD COLUMN IF NOT EXISTS fix_policy_version TEXT`,
  `ALTER TABLE scans ADD COLUMN IF NOT EXISTS ai_policy_version TEXT`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id)`,
  `CREATE TABLE IF NOT EXISTS github_connections (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    github_user_id BIGINT NOT NULL,
    github_login TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    scopes TEXT,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS pending_fixes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scanned_url TEXT NOT NULL,
    issue_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PREPARED',
    repository TEXT,
    file_path TEXT,
    pr_number INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
  )`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS branch TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS pr_url TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS merge_error TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS verification_scan_id UUID REFERENCES scans(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS pending_fixes_lookup_idx ON pending_fixes(user_id, scanned_url, issue_id, status)`,
  `WITH ranked_pending_fixes AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, scanned_url, issue_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
    FROM pending_fixes
    WHERE status IN ('PROPOSED','PR_CREATED','AWAITING_MERGE','AWAITING_DEPLOYMENT','AWAITING_VERIFICATION','STILL_PRESENT','PREPARED','NEEDS_ATTENTION')
  )
  UPDATE pending_fixes
  SET status = 'SUPERSEDED', updated_at = NOW()
  WHERE id IN (SELECT id FROM ranked_pending_fixes WHERE row_number > 1)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pending_fixes_active_issue_idx ON pending_fixes(user_id, scanned_url, issue_id) WHERE status IN ('PROPOSED','PR_CREATED','AWAITING_MERGE','AWAITING_VERIFICATION','STILL_PRESENT','PREPARED')`,
  // Fix Engine lifecycle (QA): deployment tracking, live check and safe stops.
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS base_branch TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS proposal_id UUID`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS auto_publish BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS expected_value TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS head_sha TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS base_blob_sha TEXT`,
  // P0 (31 Oct): snapshot of the owner's explicitly recorded required CI checks (JSON array).
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS required_checks TEXT`,
  // Astra F1: trusted policy seen for this fix (JSON); may only get stricter.
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS required_policy TEXT`,
  // Astra F4: SHA-256 of the approved file content, checked at the immutable head commit.
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS approved_content_sha256 TEXT`,
  // Astra F6: root cause of the latest stop/wait (JSON: code, missing checks, timedOut, head, time).
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS stop_detail TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS merge_commit_sha TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS deploy_state TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS deploy_success_at TIMESTAMPTZ`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS live_seen_at TIMESTAMPTZ`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS merge_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS last_error_code TEXT`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE pending_fixes ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pending_fixes_active_issue_v2_idx ON pending_fixes(user_id, scanned_url, issue_id) WHERE status IN ('PROPOSED','PR_CREATED','AWAITING_MERGE','AWAITING_DEPLOYMENT','AWAITING_VERIFICATION','STILL_PRESENT','PREPARED','NEEDS_ATTENTION')`,
  `DROP INDEX IF EXISTS pending_fixes_active_issue_idx`,
  `CREATE TABLE IF NOT EXISTS fix_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    issue_id TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    repository TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    base_commit_sha TEXT NOT NULL,
    file_path TEXT NOT NULL,
    base_blob_sha TEXT NOT NULL,
    original_content TEXT NOT NULL,
    proposed_content TEXT NOT NULL,
    proposal_hash TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PREVIEW_READY',
    approved_hash TEXT,
    approved_at TIMESTAMPTZ,
    branch TEXT,
    pr_number INTEGER,
    pr_url TEXT,
    failure JSONB,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS fix_proposals_lookup_idx ON fix_proposals(user_id,scan_id,issue_id,created_at DESC)`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS policy_version TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS base_commit_sha TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS base_blob_sha TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS base_file_sha TEXT`,
  `UPDATE fix_proposals SET base_file_sha = COALESCE(base_file_sha, base_blob_sha, 'legacy-unknown') WHERE base_file_sha IS NULL`,
  `ALTER TABLE fix_proposals ALTER COLUMN base_file_sha DROP NOT NULL`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS original_content TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS proposed_content TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS proposal_hash TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PREVIEW_READY'`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS approved_hash TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS branch TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS pr_number INTEGER`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS pr_url TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS failure JSONB`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `CREATE UNIQUE INDEX IF NOT EXISTS fix_proposals_hash_idx ON fix_proposals(user_id,proposal_hash)`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS generator TEXT`,
  `ALTER TABLE fix_proposals ADD COLUMN IF NOT EXISTS expected_value TEXT`,
  `CREATE TABLE IF NOT EXISTS fix_events (
    id BIGSERIAL PRIMARY KEY,
    proposal_id UUID REFERENCES fix_proposals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    reason_code TEXT,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS fix_events_proposal_idx ON fix_events(proposal_id,created_at DESC)`,
  `ALTER TABLE fix_events ADD COLUMN IF NOT EXISTS pending_fix_id UUID`,
  `CREATE INDEX IF NOT EXISTS fix_events_pending_idx ON fix_events(pending_fix_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS website_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    website_host TEXT NOT NULL,
    repository TEXT NOT NULL,
    base_branch TEXT NOT NULL DEFAULT 'main',
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, website_host)
  )`,
  `CREATE INDEX IF NOT EXISTS website_repositories_user_idx ON website_repositories(user_id, website_host)`,
  `ALTER TABLE website_repositories ADD COLUMN IF NOT EXISTS autofix_publish BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE website_repositories ADD COLUMN IF NOT EXISTS autofix_repository TEXT`,
  `ALTER TABLE website_repositories ADD COLUMN IF NOT EXISTS autofix_branch TEXT`,
  `ALTER TABLE website_repositories ADD COLUMN IF NOT EXISTS autofix_consented_at TIMESTAMPTZ`,
  `ALTER TABLE website_repositories ADD COLUMN IF NOT EXISTS autofix_required_checks TEXT`,
  `CREATE TABLE IF NOT EXISTS website_health_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    website_host TEXT NOT NULL,
    scanned_url TEXT NOT NULL,
    scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('SCAN','REGRESSION','IMPROVEMENT','FIX_PREPARED','FIX_CONFIRMED','RECHECK')),
    rule_id TEXT,
    previous_status TEXT,
    current_status TEXT,
    severity TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS website_health_events_lookup_idx ON website_health_events(user_id, website_host, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS website_health_events_rule_idx ON website_health_events(user_id, website_host, rule_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS fix_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    website_host TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    scanned_url TEXT NOT NULL,
    repository TEXT,
    file_path TEXT,
    pr_number INTEGER,
    verification_scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
    fix_summary TEXT NOT NULL DEFAULT '',
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recurrence_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, website_host, rule_id)
  )`,
  `ALTER TABLE fix_memory DROP CONSTRAINT IF EXISTS fix_memory_user_id_website_host_rule_id_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS fix_memory_page_rule_idx ON fix_memory(user_id, website_host, scanned_url, rule_id)`,
  `CREATE INDEX IF NOT EXISTS fix_memory_lookup_idx ON fix_memory(user_id, website_host, scanned_url, rule_id, last_confirmed_at DESC)`,
  `ALTER TABLE fix_memory ADD COLUMN IF NOT EXISTS recurrence_open BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE fix_memory ADD COLUMN IF NOT EXISTS last_recurred_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS website_monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    website_host TEXT NOT NULL,
    website_url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    interval_hours INTEGER NOT NULL DEFAULT 168 CHECK (interval_hours >= 24),
    last_checked_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ,
    last_status TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, website_host)
  )`,
  `CREATE INDEX IF NOT EXISTS website_monitors_due_idx ON website_monitors(enabled, next_check_at) WHERE enabled=TRUE`,
  `CREATE TABLE IF NOT EXISTS monitor_alert_preferences (\n    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n    website_host TEXT NOT NULL,\n    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,\n    regressions_only BOOLEAN NOT NULL DEFAULT TRUE,\n    last_alert_at TIMESTAMPTZ,\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    PRIMARY KEY(user_id, website_host)\n  )`,
  `CREATE TABLE IF NOT EXISTS google_connections (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_encrypted TEXT NOT NULL,
    scopes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS search_console_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_url TEXT NOT NULL,
    permission_level TEXT,
    selected BOOLEAN NOT NULL DEFAULT FALSE,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,site_url)
  )`,
  `CREATE INDEX IF NOT EXISTS search_console_properties_user_idx ON search_console_properties(user_id,selected)`,
  `CREATE TABLE IF NOT EXISTS search_console_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES search_console_properties(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    page TEXT NOT NULL DEFAULT '',
    query TEXT NOT NULL DEFAULT '',
    clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
    impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
    ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    UNIQUE(property_id,metric_date,page,query)
  )`,
  `CREATE TABLE IF NOT EXISTS search_console_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES search_console_properties(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    error_message TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'nl' CHECK (language IN ('nl','en','fr','es','it','de')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT NOT NULL,
    company_name TEXT,
    website TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS reviews_status_created_idx ON reviews(status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS rankfix_health_runs (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    overall_level TEXT NOT NULL CHECK (overall_level IN ('green','orange','red')),\n    checks JSONB NOT NULL DEFAULT '[]'::jsonb,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n  )`,
  `CREATE INDEX IF NOT EXISTS rankfix_health_runs_created_idx ON rankfix_health_runs(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS rankfix_capacity_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    overall_level TEXT NOT NULL CHECK (overall_level IN ('green','orange','red')),
    signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS rankfix_capacity_runs_created_idx ON rankfix_capacity_runs(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS rankfix_health_incidents (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    incident_key TEXT UNIQUE NOT NULL,\n    status TEXT NOT NULL CHECK (status IN ('open','resolved')),\n    failure_count INTEGER NOT NULL DEFAULT 0,\n    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    alerted_at TIMESTAMPTZ,\n    resolved_at TIMESTAMPTZ,\n    recovery_alerted_at TIMESTAMPTZ,\n    details JSONB NOT NULL DEFAULT '{}'::jsonb\n  )`,
  `CREATE INDEX IF NOT EXISTS rankfix_health_incidents_status_idx ON rankfix_health_incidents(status,last_seen_at DESC)`,
  `CREATE TABLE IF NOT EXISTS api_rate_limits (\n    bucket TEXT PRIMARY KEY,\n    window_start TIMESTAMPTZ NOT NULL,\n    hits INTEGER NOT NULL DEFAULT 1\n  )`,
  `CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx ON api_rate_limits(window_start)`,
  `CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN ('SCAN','AI_FIX','GITHUB_FIX','SEARCH_CONSOLE_SYNC')),
    dedupe_key TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','RETRY','FAILED')),
    priority INTEGER NOT NULL DEFAULT 100,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 4 CHECK (max_attempts BETWEEN 1 AND 10),
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS background_jobs_claim_idx ON background_jobs(status,available_at,priority,created_at) WHERE status IN ('QUEUED','RETRY')`,
  `CREATE INDEX IF NOT EXISTS background_jobs_user_idx ON background_jobs(user_id,created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_dedupe_idx ON background_jobs(job_type,dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('QUEUED','RUNNING','RETRY')`,
  // Every logged-in scan attempt, successful or not, so scan success can be
  // measured (a failed scan never reaches the scans table).
  `CREATE TABLE IF NOT EXISTS scan_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    requested_url TEXT NOT NULL,
    http_status INTEGER,
    outcome TEXT NOT NULL,
    error TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS scan_attempts_user_idx ON scan_attempts(user_id, created_at DESC)`,
  // Upgrade an earlier scan_attempts table in place (idempotent).
  `ALTER TABLE scan_attempts ALTER COLUMN http_status DROP NOT NULL`,
  `ALTER TABLE scan_attempts ADD COLUMN IF NOT EXISTS category TEXT`,
  `ALTER TABLE scan_attempts ADD COLUMN IF NOT EXISTS error_code TEXT`,
  `ALTER TABLE scan_attempts ADD COLUMN IF NOT EXISTS final_url TEXT`,
  `ALTER TABLE scan_attempts ADD COLUMN IF NOT EXISTS scan_id UUID`,
  `ALTER TABLE scan_attempts ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS scan_attempts_category_idx ON scan_attempts(category, created_at DESC)`
];

// Run after the statements, under the same advisory lock (legacy Fix Engine lifecycle).
const reconcile = [
  "ALTER TABLE fix_proposals DROP CONSTRAINT IF EXISTS fix_proposals_status_check",
  "ALTER TABLE fix_proposals ALTER COLUMN status SET DEFAULT 'PREVIEW_READY'",
  "UPDATE fix_proposals SET status = 'PREVIEW_READY' WHERE status = 'PREVIEWED'",
  "ALTER TABLE fix_proposals ADD CONSTRAINT fix_proposals_status_check CHECK (status IN ('PREVIEW_READY','APPROVED','PUBLISHED','FAILED','EXPIRED','INVALIDATED'))",
];

/**
 * Fingerprint of the exact schema SQL above. Every new serverless instance used
 * to run all statements (ALTER TABLE takes ACCESS EXCLUSIVE locks on users,
 * scans, ...) inside one transaction. Concurrent requests then waited on those
 * locks, and a scan insert (which also locks users through its foreign key)
 * could be chosen as deadlock victim. Once a fingerprint has been applied, a new
 * instance only reads it; the full migration runs again only when the SQL changes.
 */
export function schemaFingerprint(sql: string[] = [...statements, ...reconcile]): string {
  let hash = 0x811c9dc5;
  for (const char of sql.join("\u0000")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `v1-${sql.length}-${hash.toString(16).padStart(8, "0")}`;
}

async function schemaAlreadyApplied(version: string): Promise<boolean> {
  try {
    const result = await getDb().query("SELECT 1 FROM rankfix_schema_versions WHERE version=$1", [version]);
    return result.rows.length > 0;
  } catch {
    // Table missing (first run) or not readable: run the full migration.
    return false;
  }
}

export async function ensureDatabase() {
  if (initialized) return;
  if (!initializing) {
    initializing = (async () => {
      const version = schemaFingerprint();
      if (await schemaAlreadyApplied(version)) { initialized = true; return; }
      const client = await getDb().connect();
      try {
        await client.query("BEGIN");
        // Serverless instances can initialize at the same time. Serialize schema
        // upgrades on a single connection to avoid duplicate constraint errors.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('rankfix_schema_init'), 1)");

        for (const statement of statements) await client.query(statement);
        for (const statement of reconcile) await client.query(statement);

        await client.query("CREATE TABLE IF NOT EXISTS rankfix_schema_versions (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
        await client.query("INSERT INTO rankfix_schema_versions (version) VALUES ($1) ON CONFLICT (version) DO NOTHING", [version]);
        await client.query("COMMIT");
        initialized = true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })().finally(() => {
      initializing = null;
    });
  }
  await initializing;
}
