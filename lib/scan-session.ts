/**
 * Session lookup for scans that tells "no valid session" apart from "the
 * session could not be read" (database/connection failure).
 *
 * QA 144-site test (24 Oct 2026): five websites ended as SESSION_EXPIRED
 * (HTTP 401) although sessions slide for 30 days. The route swallowed every
 * lookup error (`try { user = await getCurrentUser() } catch {}`), so a
 * transient database error became an expired session. A failed lookup is
 * retried once; if it still fails it is reported as RankFix infrastructure.
 */
export type ScanUserLookup<U> = { user: U | null; lookupFailed: boolean; cause: string | null };

export async function resolveScanUser<U>(
  lookup: () => Promise<U | null>,
  options: { retries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ScanUserLookup<U>> {
  const retries = Math.max(0, options.retries ?? 1);
  const delayMs = Math.max(0, options.delayMs ?? 400);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let cause: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return { user: (await lookup()) ?? null, lookupFailed: false, cause: null };
    } catch (error) {
      // Stable, secret-free cause: error class/code only, never the message.
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
      cause = code || (error instanceof Error ? error.name : "unknown");
      if (attempt < retries) await sleep(delayMs * (attempt + 1));
    }
  }
  return { user: null, lookupFailed: true, cause };
}
