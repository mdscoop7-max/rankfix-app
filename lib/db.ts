import { Pool } from "pg";
import { jsonbSafeString, jsonbStringify } from "./jsonb-safe.ts";

declare global {
  var __rankfixPool: Pool | undefined;
}

function positiveInt(value:string|undefined,fallback:number,min:number,max:number){
  const parsed=Number.parseInt(value||"",10);
  return Number.isFinite(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
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
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
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
