/** Safely name a complete real QA audit exported in the browser (no database storage). */
export function qaAuditFilename(url: string | undefined, scannedAt?: string): string {
  let hostname = "website";
  try {
    const parsed = new URL(url || "");
    if (parsed.protocol === "https:" || parsed.protocol === "http:") hostname = parsed.hostname;
  } catch {}
  const host = hostname.toLowerCase().replace(/[^a-z0-9.-]/g, "-").slice(0, 100) || "website";
  const day = scannedAt && /^\d{4}-\d{2}-\d{2}/.test(scannedAt) ? scannedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return `rankfix-audit-${host}-${day}.json`;
}
