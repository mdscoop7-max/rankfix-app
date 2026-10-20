/**
 * Temporary QA-only mode for a real, database-free SEO/GEO scan.
 * Never active on production or on other preview branches.
 * No accounts, subscriptions, history or user data are altered.
 */
export function isDatabaseFreeQaPreview(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "fix/dashboard-login-resilience-20261020") return true;
  return env.NODE_ENV === "development" && env.RANKFIX_QA_NO_DB === "1";
}

type Bucket = { started: number; hits: number };
const qaBuckets = new Map<string, Bucket>();

/** Best-effort in-instance throttle only. Preview deployment protection remains important. */
export function checkDatabaseFreeQaLimit(ip: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const windowMs = 60 * 60 * 1000;
  const bucketId = ip.trim() || "unknown";
  const stored = qaBuckets.get(bucketId);
  const current = !stored || now - stored.started >= windowMs ? { started: now, hits: 0 } : stored;
  current.hits += 1;
  qaBuckets.set(bucketId, current);
  if (qaBuckets.size > 500) {
    for (const [key, value] of qaBuckets) {
      if (now - value.started >= windowMs || qaBuckets.size > 500) qaBuckets.delete(key);
      if (qaBuckets.size <= 500) break;
    }
  }
  return { allowed: current.hits <= 8, retryAfterSeconds: Math.max(1, Math.ceil((current.started + windowMs - now) / 1000)) };
}
