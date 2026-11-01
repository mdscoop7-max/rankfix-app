// 1 Nov 2026 (security 5): cookies received during ONE redirect chain, handled
// with the browser rules of RFC 6265 instead of "same last two labels": host-only
// cookies stay on their host, Domain must cover the host and may not be a public
// suffix (co.uk, com.au …), Path and Secure are respected, expired cookies are
// removed. The jar lives only for one safePublicFetch call.

type StoredCookie = { name: string; value: string; domain: string; hostOnly: boolean; path: string; secure: boolean };

// Public suffixes of more than one label that a site must never set cookies for
// (subset of the Public Suffix List covering the markets RankFix scans).
const MULTI_LABEL_SUFFIX = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk", "net.uk", "sch.uk", "nhs.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.nz", "org.nz", "net.nz", "govt.nz",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "co.kr", "or.kr", "com.br", "net.br", "org.br", "com.ar", "com.mx", "com.tr", "com.cn", "com.hk", "com.sg", "com.tw",
  "co.za", "org.za", "co.in", "net.in", "org.in", "co.il", "org.il",
  "gv.at", "or.at", "ac.at", "co.at", "com.pl", "net.pl", "org.pl", "com.pt", "org.pt", "com.es", "org.es", "nom.es", "gob.es", "edu.es",
  "co.it", "gov.it", "com.gr", "org.gr", "com.cy", "com.mt", "org.mt", "co.hu", "org.hu", "com.ro", "org.ro", "com.ua", "org.ua", "co.ua",
]);
const isPublicSuffix = (domain: string) => !domain.includes(".") || MULTI_LABEL_SUFFIX.has(domain);

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
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
      let domain: string | null = null, path: string | null = null, secure = false, expired = false;
      for (const attr of parts) {
        const i = attr.indexOf("=");
        const key = (i < 0 ? attr : attr.slice(0, i)).trim().toLowerCase();
        const val = i < 0 ? "" : attr.slice(i + 1).trim();
        if (key === "domain" && val) domain = val.replace(/^\./, "").toLowerCase();
        else if (key === "path" && val.startsWith("/")) path = val;
        else if (key === "secure") secure = true;
        else if (key === "max-age" && /^-?\d+$/.test(val)) expired = Number(val) <= 0;
        else if (key === "expires" && !parts.some((p) => /^\s*max-age\s*=/i.test(p))) { const t = Date.parse(val); if (Number.isFinite(t) && t <= this.now()) expired = true; }
      }
      // A Secure cookie can only be set over HTTPS.
      if (secure && url.protocol !== "https:") continue;
      if (domain) {
        if (isPublicSuffix(domain) || !domainMatches(host, domain)) continue;
      }
      const cookie: StoredCookie = { name, value, domain: domain || host, hostOnly: !domain, path: path || defaultPath(url.pathname), secure };
      this.cookies = this.cookies.filter((c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path));
      if (!expired) this.cookies.push(cookie);
    }
    if (this.cookies.length > 50) this.cookies = this.cookies.slice(-50);
  }

  /** The Cookie header for a request to `url`, or null. */
  header(url: URL): string | null {
    const host = url.hostname.toLowerCase();
    const matching = this.cookies.filter((c) =>
      (c.hostOnly ? host === c.domain : domainMatches(host, c.domain))
      && pathMatches(url.pathname || "/", c.path)
      && (!c.secure || url.protocol === "https:"));
    // Longer paths first, as browsers send them.
    matching.sort((a, b) => b.path.length - a.path.length);
    return matching.length ? matching.map((c) => `${c.name}=${c.value}`).join("; ") : null;
  }

  /** Stable key of what would be sent to `url` (loop detection). */
  key(url: URL): string { return this.header(url) || ""; }
}
