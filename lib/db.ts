import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
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
    global.__rankfixPool.on("error",(error)=>{
      // A failed idle client must never crash the whole Node process.
      console.error("PostgreSQL idle client error",error.message);
    });
  }
  return global.__rankfixPool;
}
