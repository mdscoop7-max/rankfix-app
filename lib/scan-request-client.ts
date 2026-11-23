/** Keep the scan UI responsive when a hosting proxy drops the request.
 * This does not cancel work already started on the server or assert a scan failed.
 * The server normally applies its own shorter, 270-second hard limit.
 */
export async function fetchScanResponse(body: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 285_000);
  try {
    return await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("De scan heeft niet op tijd geantwoord. Controleer je scanhistorie voordat je opnieuw start.");
    }
    if (error instanceof TypeError) {
      throw new Error("De verbinding met RankFix is verbroken tijdens de scan. De scan is mogelijk nog bezig. Controleer eerst je scanhistorie.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** A scan answer that was not RankFix JSON (e.g. a hosting error page). The scan may still have been saved. */
export class ScanResponseError extends Error {
  readonly httpStatus: number;
  readonly recoverable = true;
  constructor(httpStatus: number) {
    super(`RankFix kreeg een onverwacht antwoord van de server (HTTP ${httpStatus}) in plaats van scanresultaten. De scan kan wel zijn uitgevoerd en opgeslagen.`);
    this.name = "ScanResponseError";
    this.httpStatus = httpStatus;
  }
}

/** Parse a scan answer as JSON; an HTML error page or broken body becomes a ScanResponseError, never a JSON crash. */
export async function readScanJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  const type = response.headers.get("content-type") || "";
  if (!/json/i.test(type)) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    throw new ScanResponseError(response.status);
  }
  try { return await response.json() as T; } catch { throw new ScanResponseError(response.status); }
}

/** Same audited page, ignoring protocol, www, trailing slash, query and hash. */
export function sameScanTarget(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (value: string | null | undefined) => {
    if (!value) return null;
    try { const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}`; } catch { return null; }
  };
  const ka = key(a), kb = key(b);
  return Boolean(ka && kb && ka === kb);
}

type HistoryItem = { id: string; scanned_url?: string | null; final_url?: string | null; created_at?: string | null };

/** The newest saved scan of this URL created after `sinceMs` (minus a small clock margin), from a /api/history body. */
export function pickSavedScan(history: HistoryItem[] | null | undefined, url: string, sinceMs: number): string | null {
  const found = (history || [])
    .filter((item) => item?.id && (sameScanTarget(item.scanned_url, url) || sameScanTarget(item.final_url, url)))
    .filter((item) => { const t = Date.parse(String(item.created_at || "")); return Number.isFinite(t) && t >= sinceMs - 60_000; })
    .sort((x, y) => Date.parse(String(y.created_at)) - Date.parse(String(x.created_at)));
  return found[0]?.id ?? null;
}

/**
 * After a broken or lost scan answer: look in the user's history for the scan the
 * server may have saved, for up to `waitMs` (the server can still be finishing).
 */
export async function findSavedScan(url: string, sinceMs: number, waitMs = 60_000, intervalMs = 5_000): Promise<string | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      if (response.ok && /json/i.test(response.headers.get("content-type") || "")) {
        const data = await response.json() as { history?: HistoryItem[] };
        const id = pickSavedScan(data.history, url, sinceMs);
        if (id) return id;
      }
    } catch { /* keep trying until the deadline */ }
    if (Date.now() + intervalMs > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
