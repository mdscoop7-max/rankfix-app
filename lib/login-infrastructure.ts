/**
 * Only infrastructure failures are classified here. Wrong credentials are
 * handled explicitly as HTTP 401 before this function is called.
 * Do not log or return raw database error messages.
 */
export function classifyLoginInfrastructureFailure(error:unknown):
  "quota" | "database_unavailable" | null {
  const data = error && typeof error === "object"
    ? error as {code?:unknown;message?:unknown;cause?:unknown} : null;
  const code = typeof data?.code === "string" ? data.code : "";
  const message = typeof data?.message === "string" ? data.message : typeof error === "string" ? error : "";
  const cause = data?.cause && typeof data.cause === "object"
    ? data.cause as {code?:unknown;message?:unknown} : null;
  const causeCode = typeof cause?.code === "string" ? cause.code : "";
  const causeMessage = typeof cause?.message === "string" ? cause.message : "";
  const combined = (message+" "+causeMessage).slice(0,1000);
  if (code === "53000" || causeCode === "53000" ||
      /\b(?:quota exceeded|exceeded the quota|database quota|HTTP status 402)\b/i.test(combined)) {
    return "quota";
  }
  if (["08001","08003","08006","57P01","57P03"].includes(code) ||
      ["08001","08003","08006","57P01","57P03"].includes(causeCode) ||
      /\b(?:DATABASE_URL (?:ontbreekt|missing)|database unavailable|connection (?:refused|timed out|timeout)|ECONNREFUSED|ENOTFOUND)\b/i.test(combined)) {
    return "database_unavailable";
  }
  return null;
}
