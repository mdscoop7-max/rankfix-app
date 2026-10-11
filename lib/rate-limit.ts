import { createHash } from "node:crypto";
import { getDb } from "./db";

function key(value:string){ return createHash("sha256").update(value).digest("hex"); }

export function requestIp(request:Request){
  const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function consumeRateLimit(scope:string,identity:string,limit:number,windowSeconds:number){
  const bucket=scope+":"+key(identity||"unknown");
  const result=await getDb().query(
    `INSERT INTO api_rate_limits (bucket,window_start,hits) VALUES ($1,NOW(),1)
     ON CONFLICT (bucket) DO UPDATE SET
       window_start=CASE WHEN api_rate_limits.window_start < NOW()-make_interval(secs => $2::int) THEN NOW() ELSE api_rate_limits.window_start END,
       hits=CASE WHEN api_rate_limits.window_start < NOW()-make_interval(secs => $2::int) THEN 1 ELSE api_rate_limits.hits+1 END
     RETURNING hits,window_start`,
    [bucket,windowSeconds]
  );
  return Number(result.rows[0]?.hits||1)<=limit;
}

/**
 * True only on a Vercel Preview deployment that has no database configured.
 * Production (Render, Vercel Production) never matches: VERCEL_ENV is not "preview" there.
 * Used solely so an isolated, Vercel-login-protected preview can run public scans
 * without being pointed at any database. Nothing is stored in that mode.
 */
export function isPreviewWithoutDatabase(env: Record<string, string | undefined> = process.env){
  return env.VERCEL_ENV === "preview" && !String(env.DATABASE_URL || "").trim();
}

const memoryBuckets = new Map<string, { windowStart: number; hits: number }>();
const MEMORY_BUCKET_LIMIT = 5000;

/** Same fixed-window semantics as consumeRateLimit, kept per server instance in memory. */
export function consumeMemoryRateLimit(scope:string,identity:string,limit:number,windowSeconds:number,now:number=Date.now()){
  const bucket=scope+":"+key(identity||"unknown");
  const windowMs=windowSeconds*1000;
  const current=memoryBuckets.get(bucket);
  if(!current || current.windowStart < now-windowMs){
    if(!current && memoryBuckets.size>=MEMORY_BUCKET_LIMIT){
      for(const [name,entry] of memoryBuckets){ if(entry.windowStart < now-windowMs) memoryBuckets.delete(name); }
      // Fail closed when the table is full of active buckets.
      if(memoryBuckets.size>=MEMORY_BUCKET_LIMIT) return false;
    }
    memoryBuckets.set(bucket,{windowStart:now,hits:1});
    return 1<=limit;
  }
  current.hits+=1;
  return current.hits<=limit;
}

export function __resetMemoryRateLimitForTests(){ memoryBuckets.clear(); }
