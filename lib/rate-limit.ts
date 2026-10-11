import { createHash } from "node:crypto";
import { getDb } from "./db";
import { clientIpFromHeaders, retryAfterSeconds } from "./scan-access";

function key(value:string){ return createHash("sha256").update(value).digest("hex"); }

export function requestIp(request:Request){
  return clientIpFromHeaders(request.headers);
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export async function checkRateLimit(scope:string,identity:string,limit:number,windowSeconds:number):Promise<RateLimitResult>{
  const bucket=scope+":"+key(identity||"unknown");
  const result=await getDb().query(
    `INSERT INTO api_rate_limits (bucket,window_start,hits) VALUES ($1,NOW(),1)
     ON CONFLICT (bucket) DO UPDATE SET
       window_start=CASE WHEN api_rate_limits.window_start < NOW()-make_interval(secs => $2::int) THEN NOW() ELSE api_rate_limits.window_start END,
       hits=CASE WHEN api_rate_limits.window_start < NOW()-make_interval(secs => $2::int) THEN 1 ELSE api_rate_limits.hits+1 END
     RETURNING hits,window_start,NOW() AS now`,
    [bucket,windowSeconds]
  );
  const row=result.rows[0];
  // Use the database clock for both ends so app/server clock skew cannot distort the wait.
  const wait=row?.window_start ? retryAfterSeconds(new Date(row.window_start),windowSeconds,new Date(row.now).getTime()) : windowSeconds;
  return { allowed: Number(row?.hits||1)<=limit, retryAfterSeconds: wait };
}

export async function consumeRateLimit(scope:string,identity:string,limit:number,windowSeconds:number){
  return (await checkRateLimit(scope,identity,limit,windowSeconds)).allowed;
}
