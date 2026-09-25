import { getDb } from "./db";

let initialized = false;
let initializing: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 25,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
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
  `CREATE INDEX IF NOT EXISTS pending_fixes_lookup_idx ON pending_fixes(user_id, scanned_url, issue_id, status)`,
  `CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'nl' CHECK (language IN ('nl','en','fr','es','it','de')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
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
