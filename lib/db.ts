import { Pool } from "pg";
import { jsonbSafeString, jsonbStringify } from "./jsonb-safe.ts";

declare global {
  var __rankfixPool: Pool | undefined;
}

function positiveInt(value:string|undefined,fallback:number,min:number,max:number){
  const parsed=Number.parseInt(value||"",10);
  return Number.isFinite(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
}

/**
 * Next.js sets NODE_ENV=production for `next start`, including when QA runs on
 * a laptop. PostgreSQL on loopback often has SSL disabled by default.
 * Do not force SSL for that *local* connection; remote production behaviour
 * stays unchanged.
 */
export function postgresSslOptions(databaseUrl: string, nodeEnv: string | undefined):
  false | {rejectUnauthorized: false} | undefined {
  try {
    const host = new URL(databaseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  } catch {
    // Invalid URLs remain the PostgreSQL client's responsibility to reject.
  }
  return nodeEnv === "production" ? {rejectUnauthorized: false} : undefined;
}

export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ontbreekt.");
  if (!global.__rankfixPool) {
    global.__rankfixPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Keep a deliberately small pool per web instance. This prevents a traffic
      // spike from exhausting PostgreSQL connections; capacity can be raised via
      // DB_POOL_MAX after the production database plan is upgraded.
      max: positiveInt(process.env.DB_POOL_MAX,5,1,20),
      connectionTimeoutMillis: positiveInt(process.env.DB_CONNECT_TIMEOUT_MS,8000,1000,30000),
      idleTimeoutMillis: positiveInt(process.env.DB_IDLE_TIMEOUT_MS,30000,5000,120000),
      allowExitOnIdle: false,
      ssl: postgresSslOptions(process.env.DATABASE_URL, process.env.NODE_ENV),
    });
    // Every query passes through one parameter guard: PostgreSQL rejects NUL in
    // text and lone UTF-16 surrogates / \u0000 escapes in jsonb. One cut emoji
    // in a scan report must never make a completed scan unsavable.
    const pool = global.__rankfixPool;
    const query = pool.query.bind(pool) as (...args: unknown[]) => unknown;
    (pool as unknown as { query: (...args: unknown[]) => unknown }).query = (text: unknown, params?: unknown, ...rest: unknown[]) => {
      const safeParams = Array.isArray(params) ? params.map(safeQueryParam) : params;
      // Callback-style calls keep their original behaviour.
      if (rest.some((arg) => typeof arg === "function") || typeof params === "function") return query(text, safeParams, ...rest);
      // A failure while ESTABLISHING the connection means the statement never
      // reached the server, so one retry cannot duplicate a write. Errors after
      // the statement was sent are never retried here.
      return (query(text, safeParams, ...rest) as Promise<unknown>).catch(async (error: unknown) => {
        if (!isConnectPhaseError(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 400));
        return query(text, safeParams, ...rest);
      });
    };
    global.__rankfixPool.on("error",(error)=>{
      // A failed idle client must never crash the whole Node process.
      console.error("PostgreSQL idle client error",error.message);
    });
  }
  return global.__rankfixPool;
}

// JSON text that escapes a NUL or a UTF-16 surrogate may be invalid for jsonb;
// re-serialise only those. Plain strings lose NUL bytes (invalid in PostgreSQL text).
const RISKY_JSON_ESCAPE = /\\u(?:0000|d[89a-f][0-9a-f]{2})/i;
export function safeQueryParam(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const first = value.trimStart()[0];
  if ((first === "{" || first === "[") && RISKY_JSON_ESCAPE.test(value)) {
    try { return jsonbStringify(JSON.parse(value)); } catch { /* not JSON: treat as text */ }
  }
  return jsonbSafeString(value);
}

/** Errors raised before a statement reached PostgreSQL (safe to retry once). */
export function isConnectPhaseError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code || "");
  const message = String((error as { message?: unknown })?.message || "");
  return ["53300", "57P03", "08001", "08004", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code)
    || /timeout exceeded when trying to connect|Connection terminated due to connection timeout|connect ECONNREFUSED|too many clients already|the database system is starting up/i.test(message);
}

/**
 * Errors after which the SAME statement can be sent again without a wrong result,
 * PROVIDED the statement is idempotent (a read, or an insert with a client-chosen
 * primary key and ON CONFLICT DO NOTHING): the connection broke, the server
 * restarted, or PostgreSQL aborted the statement (deadlock, serialization, lock
 * timeout). Never used for plain writes.
 */
export function isTransientDbError(error: unknown): boolean {
  if (isConnectPhaseError(error)) return true;
  const code = String((error as { code?: unknown })?.code || "");
  const message = String((error as { message?: unknown })?.message || "");
  return ["40P01", "40001", "55P03", "57P01", "57P02", "08000", "08003", "08006", "ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(code)
    || /Connection terminated unexpectedly|Client has encountered a connection error|Connection terminated|socket hang up|read ECONNRESET|server closed the connection unexpectedly|terminating connection/i.test(message);
}

/**
 * Runs an IDEMPOTENT database step and repeats it after a transient failure
 * (at most `attempts` times in total, short backoff). The caller guarantees
 * that repeating the step cannot duplicate or corrupt data.
 */
export async function withDbRetry<T>(step: () => Promise<T>, options: { attempts?: number; backoffMs?: number[]; wait?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const backoff = options.backoffMs ?? [300, 900];
  const wait = options.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await step(); }
    catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientDbError(error)) throw error;
      await wait(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 500);
    }
  }
  throw lastError;
}

/** Short, non-secret text of a database error (PostgreSQL messages carry no credentials). */
export function databaseFailureDetail(error: unknown): string | null {
  const message = String((error as { message?: unknown })?.message || "").replace(/postgres(?:ql)?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim();
  return message ? message.slice(0, 120) : null;
}

/** Non-secret classification of a failed save, for the response and attempt logs. */
export function databaseFailureCode(error: unknown): string | null {
  const code = String((error as { code?: unknown })?.code || "");
  if (/^[0-9A-Z]{5}$/.test(code)) return code;
  if (/^E[A-Z]+$/.test(code)) return code;
  const message = String((error as { message?: unknown })?.message || "");
  if (/Connection terminated/i.test(message)) return "CONNECTION_TERMINATED";
  if (/timeout/i.test(message)) return "TIMEOUT";
  return error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? "ENGINE_ERROR" : null;
}
