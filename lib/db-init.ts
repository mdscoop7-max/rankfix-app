import { getDb } from "./db";

let initialized = false;
let initializing: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    customer_id TEXT UNIQUE,
    credits INTEGER NOT NULL DEFAULT 25,
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
  `CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS credit_transactions_user_created_idx ON credit_transactions(user_id, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_idempotency_idx ON credit_transactions(user_id, reference_id) WHERE reference_id IS NOT NULL`,
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
    WHERE status IN ('PROPOSED','PR_CREATED','AWAITING_MERGE','AWAITING_VERIFICATION','STILL_PRESENT','PREPARED')
  )
  UPDATE pending_fixes
  SET status = 'SUPERSEDED', updated_at = NOW()
  WHERE id IN (SELECT id FROM ranked_pending_fixes WHERE row_number > 1)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pending_fixes_active_issue_idx ON pending_fixes(user_id, scanned_url, issue_id) WHERE status IN ('PROPOSED','PR_CREATED','AWAITING_MERGE','AWAITING_VERIFICATION','STILL_PRESENT','PREPARED')`,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_dedupe_idx ON background_jobs(job_type,dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('QUEUED','RUNNING','RETRY')`
];

export async function ensureDatabase() {
  if (initialized) return;
  if (!initializing) {
    initializing = (async () => {
      const db = getDb();
      for (const statement of statements) await db.query(statement);
      initialized = true;
    })().finally(() => {
      initializing = null;
    });
  }
  await initializing;
}
