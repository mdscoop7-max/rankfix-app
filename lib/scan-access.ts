// Scan access rules kept free of I/O so every role can be regression-tested.

type Env = Record<string, string | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Internal testers are bound to immutable account IDs configured server-side.
// An e-mail address alone is not enough: registration does not verify that the
// person owns the address, so an unclaimed configured address could be taken.
export function internalTesterIds(env: Env = process.env): Set<string> {
  const raw = [env.RANKFIX_INTERNAL_TEST_USER_ID, env.RANKFIX_INTERNAL_TEST_USER_IDS].filter(Boolean).join(",");
  return new Set(raw.split(",").map((id) => id.trim().replace(/^["']|["']$/g, "").toLowerCase()).filter((id) => UUID.test(id)));
}

export function isInternalTester(userId: unknown, env: Env = process.env): boolean {
  return typeof userId === "string" && internalTesterIds(env).has(userId.trim().toLowerCase());
}

// Client IP for rate limiting. Vercel overwrites X-Forwarded-For and X-Real-IP
// with the connecting client, so those are trusted there. Behind any other proxy
// the client can prepend its own values, so only the right-most entry (added by
// the proxy in front of the app) is used.
export function clientIpFromHeaders(headers: Headers, env: Env = process.env): string {
  const forwarded = (headers.get("x-forwarded-for") || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (env.VERCEL === "1") return headers.get("x-real-ip")?.trim() || forwarded[0] || "unknown";
  return forwarded[forwarded.length - 1] || headers.get("x-real-ip")?.trim() || "unknown";
}

export type ScanRateLimit = { scope: string; key: "ip" | "user"; limit: number; windowSeconds: number; code: string };

// null means no hourly network limit applies (monthly plan quotas still do).
export function scanRateLimitPolicy(input: { dashboardScan: boolean; userId: string | null; paidPlan: boolean; tester: boolean }): ScanRateLimit | null {
  if (input.tester) return null;
  if (!input.dashboardScan) {
    // A signed-in paying customer is limited per account, not per shared network.
    if (input.userId && input.paidPlan) return { scope: "paid-public-scan", key: "user", limit: 30, windowSeconds: 3600, code: "ACCOUNT_SCAN_RATE_LIMIT" };
    // Visitors and Free accounts share the per-network limit, so extra Free
    // accounts do not add capacity.
    return { scope: "public-scan", key: "ip", limit: 8, windowSeconds: 3600, code: "PUBLIC_SCAN_RATE_LIMIT" };
  }
  if (!input.paidPlan) return { scope: "free-scan", key: "ip", limit: 8, windowSeconds: 3600, code: "FREE_SCAN_RATE_LIMIT" };
  return null;
}

export function retryAfterSeconds(windowStart: Date, windowSeconds: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now) / 1000));
}

type Lang = "nl" | "en" | "de" | "fr" | "it" | "es";

export function scanRateLimitMessage(language: string, seconds: number, perAccount: boolean): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const lang: Lang = (["nl", "en", "de", "fr", "it", "es"] as const).includes(language as Lang) ? language as Lang : "nl";
  const wait: Record<Lang, string> = {
    nl: minutes === 1 ? "ongeveer 1 minuut" : `ongeveer ${minutes} minuten`,
    en: minutes === 1 ? "about 1 minute" : `about ${minutes} minutes`,
    de: minutes === 1 ? "etwa 1 Minute" : `etwa ${minutes} Minuten`,
    fr: minutes === 1 ? "environ 1 minute" : `environ ${minutes} minutes`,
    it: minutes === 1 ? "circa 1 minuto" : `circa ${minutes} minuti`,
    es: minutes === 1 ? "aproximadamente 1 minuto" : `aproximadamente ${minutes} minutos`,
  };
  const reason: Record<Lang, string> = perAccount
    ? { nl: "Er zijn met dit account veel scans kort na elkaar gestart.", en: "Many scans were started from this account in a short time.", de: "Mit diesem Konto wurden kurz hintereinander viele Scans gestartet.", fr: "De nombreuses analyses ont été lancées depuis ce compte en peu de temps.", it: "Da questo account sono state avviate molte scansioni in poco tempo.", es: "Se han iniciado muchos análisis desde esta cuenta en poco tiempo." }
    : { nl: "Er zijn vanaf dit netwerk veel gratis scans uitgevoerd.", en: "Many free scans have been run from this network.", de: "Von diesem Netzwerk wurden viele kostenlose Scans ausgeführt.", fr: "De nombreuses analyses gratuites ont été lancées depuis ce réseau.", it: "Da questa rete sono state eseguite molte scansioni gratuite.", es: "Se han realizado muchos análisis gratuitos desde esta red." };
  const retry: Record<Lang, string> = {
    nl: `Probeer het over ${wait.nl} opnieuw.`, en: `Please try again in ${wait.en}.`, de: `Bitte versuche es in ${wait.de} erneut.`,
    fr: `Réessayez dans ${wait.fr}.`, it: `Riprova tra ${wait.it}.`, es: `Vuelve a intentarlo dentro de ${wait.es}.`,
  };
  return `${reason[lang]} ${retry[lang]}`;
}
