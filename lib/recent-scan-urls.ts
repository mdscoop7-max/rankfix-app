/** Browser-only recent scan websites. Never sends the list to the server. */
export const RECENT_SCAN_KEY = "rankfix:recent-scan-websites:v1";
const MAX_RECENT = 12;

export function cleanScanUrl(value: string): string | null {
  try {
    const raw = value.trim();
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}
function identity(url: string): string {
  const u = new URL(url);
  return u.hostname.replace(/^www\./i, "").toLowerCase() + u.pathname.replace(/\/+$/, "") + u.search;
}
export function mergeRecentScanUrls(existing: string[], incoming: string): string[] {
  const normalized = cleanScanUrl(incoming);
  if (!normalized) return existing;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of [normalized, ...existing]) {
    const value = cleanScanUrl(entry);
    if (!value) continue;
    const key = identity(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= MAX_RECENT) break;
  }
  return result;
}
export function readRecentScanUrls(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SCAN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const safe = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 60) : [];
    const migrated = window.localStorage.getItem("rankfix:last-scan-url");
    // Migrate the previous single-website memory without losing older entries.
    let result: string[] = [];
    for (const item of [...safe].reverse()) result = mergeRecentScanUrls(result, item);
    if (result.length === 0 && migrated) result = mergeRecentScanUrls(result, migrated);
    return result;
  } catch { return []; }
}
export function rememberScanUrl(url: string): string[] {
  const updated = mergeRecentScanUrls(readRecentScanUrls(), url);
  try {
    window.localStorage.setItem(RECENT_SCAN_KEY, JSON.stringify(updated));
    window.localStorage.setItem("rankfix:last-scan-url", updated[0] || "");
  } catch { /* Storage can be blocked; scan still works. */ }
  return updated;
}
export function forgetRecentScanUrls(): void {
  try {
    window.localStorage.removeItem(RECENT_SCAN_KEY);
    window.localStorage.removeItem("rankfix:last-scan-url");
  } catch { /* Private browsing. */ }
}
