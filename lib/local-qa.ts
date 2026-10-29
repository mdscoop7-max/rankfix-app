import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "rankfix_local_qa";
export function localQaEnabled() {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL && /^[a-f0-9]{64}$/i.test(process.env.RF_LOCAL_QA_TOKEN || "");
}
export function loopbackRequest(request: Request) {
  const host = new URL(request.url).hostname;
  const headerHost = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  return ["127.0.0.1", "localhost", "[::1]"].includes(host) && ["127.0.0.1", "localhost", "[::1]"].includes(headerHost);
}
function equals(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x,y);
}
export async function hasLocalQaSession(request: Request) {
  if (!localQaEnabled() || !loopbackRequest(request)) return false;
  const cookie = (await cookies()).get(COOKIE)?.value || "";
  return equals(cookie, process.env.RF_LOCAL_QA_TOKEN || "");
}
export function validLocalQaToken(token: string) {
  return localQaEnabled() && equals(token, process.env.RF_LOCAL_QA_TOKEN || "");
}
export const localQaCookieName = COOKIE;
