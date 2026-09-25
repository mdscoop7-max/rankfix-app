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
