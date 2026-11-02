// Cookies received during ONE redirect chain (one safePublicFetch call), handled
// with the browser rules of RFC 6265 where they are safe to apply without a full
// Public Suffix List:
// - Integration 2 Nov 2026 (security 5 + PR #219): the jar is deliberately
//   host-bound. A cookie is only ever sent back to the exact host that set it.
//   A Domain attribute is accepted only when it equals the setting host; parent,
//   sibling and public-suffix domains (co.uk, com.au …) are withheld, because a
//   guessed registrable domain could leak a cookie to another site.
// - Path and Secure are respected, Max-Age/Expires are enforced over time,
//   Max-Age=0 deletes. Max 20 cookies per response and 50 per jar.

type StoredCookie = { name: string; value: string; host: string; path: string; secure: boolean; expires: number };

const COOKIE_NAME = /^[!#$%&'*+.^_`|~\w-]+$/;

function defaultPath(pathname: string): string {
  if (!pathname.startsWith("/")) return "/";
  const last = pathname.lastIndexOf("/");
  return last <= 0 ? "/" : pathname.slice(0, last);
}
function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

export class RedirectCookieJar {
  private cookies: StoredCookie[] = [];
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }

  /** Store the Set-Cookie headers of a response for `url` (max 20 per response). */
  store(url: URL, setCookies: string[]): void {
    const host = url.hostname.toLowerCase();
    for (const raw of setCookies.slice(0, 20)) {
      const parts = raw.split(";");
      const first = parts.shift() || "";
      const eq = first.indexOf("=");
      if (eq <= 0 || first.length >= 4096) continue;
      const name = first.slice(0, eq).trim(), value = first.slice(eq + 1).trim();
      if (!COOKIE_NAME.test(name) || /[\r\n;]/.test(value)) continue;
      let domain: string | null = null, path: string | null = null, secure = false;
      let maxAge: number | null = null, expiresAt: number | null = null;
      for (const attr of parts) {
        const i = attr.indexOf("=");
        const key = (i < 0 ? attr : attr.slice(0, i)).trim().toLowerCase();
        const val = i < 0 ? "" : attr.slice(i + 1).trim();
        if (key === "domain" && val) domain = val.replace(/^\./, "").toLowerCase();
        else if (key === "path" && val.startsWith("/")) path = val;
        else if (key === "secure") secure = true;
        else if (key === "max-age" && /^-?\d+$/.test(val)) maxAge = Number(val);
        else if (key === "expires") { const t = Date.parse(val); if (Number.isFinite(t)) expiresAt = t; }
      }
      // Host-bound: a Domain that is not exactly the setting host is withheld.
      if (domain && domain !== host) continue;
      // A Secure cookie can only be set over HTTPS.
      if (secure && url.protocol !== "https:") continue;
      // Max-Age takes precedence over Expires (RFC 6265 §5.3).
      const expires = maxAge !== null ? this.now() + maxAge * 1000 : expiresAt !== null ? expiresAt : Infinity;
      const cookie: StoredCookie = { name, value, host, path: path || defaultPath(url.pathname), secure, expires };
      this.cookies = this.cookies.filter((c) => !(c.name === cookie.name && c.host === cookie.host && c.path === cookie.path));
      if (expires > this.now()) this.cookies.push(cookie);
    }
    if (this.cookies.length > 50) this.cookies = this.cookies.slice(-50);
  }

  /** The Cookie header for a request to `url`, or null. */
  header(url: URL): string | null {
    const now = this.now();
    this.cookies = this.cookies.filter((c) => c.expires > now);
    const host = url.hostname.toLowerCase();
    const matching = this.cookies.filter((c) =>
      host === c.host
      && pathMatches(url.pathname || "/", c.path)
      && (!c.secure || url.protocol === "https:"));
    // Longer paths first, as browsers send them.
    matching.sort((a, b) => b.path.length - a.path.length);
    return matching.length ? matching.map((c) => `${c.name}=${c.value}`).join("; ") : null;
  }

  /** Stable key of what would be sent to `url` (loop detection). */
  key(url: URL): string { return this.header(url) || ""; }
}
