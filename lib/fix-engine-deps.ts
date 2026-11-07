/** Production wiring for the Fix Engine: real database, GitHub API and SSRF-safe live probe. */
import { getDb } from "./db";
import { githubFetch } from "./github";
import { safePublicFetch, readResponseTextLimited } from "./safe-fetch";
import { classifyLiveResponse, type EngineDeps, type LiveProbe } from "./fix-engine";

export async function probeLivePage(url: string): Promise<LiveProbe> {
  try {
    const { response } = await safePublicFetch(url, { timeoutMs: 15000, maxRedirects: 4 });
    const html = await readResponseTextLimited(response, 2_000_000, 15_000).catch(() => "");
    return classifyLiveResponse(response.status, response.headers.get("content-type") || "", typeof html === "string" ? html : String(html || ""));
  } catch {
    return { reachable: false, httpStatus: null, blocked: false, html: "" };
  }
}

export function createEngineDeps(token: string | null): EngineDeps {
  return {
    db: getDb(),
    github: token ? <T,>(path: string, init?: RequestInit) => githubFetch<T>(token, path, init) : null,
    probe: probeLivePage,
  };
}
