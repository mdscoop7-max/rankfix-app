/** Per-fetch cookie jar. Deliberately origin-host bound: without a Public Suffix
 * List, sharing Domain cookies across hosts is unsafe (a.co.uk != b.co.uk).
 * These anonymous crawl cookies never persist across scans or users. */
export function createRedirectCookies() {
  const jar = new Map<string, { host: string; path: string; pair: string; secure: boolean; expires: number | null }>();
  return {
    accept(url: URL, values: string[], now = Date.now()) {
      for (const raw of values.slice(0, 20)) {
        if (raw.length > 4096) continue;
        const [pair, ...parts] = raw.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        if (!name || /[\s,;\x00-\x1f\x7f]/.test(name)) continue;
        const attrs = new Map(parts.map(p => { const i = p.indexOf("="); return i < 0 ? [p.trim().toLowerCase(), ""] : [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()]; }));
        const domain = attrs.get("domain")?.replace(/^\./, "").toLowerCase();
        if (domain && url.hostname !== domain && !url.hostname.endsWith("." + domain)) continue;
        const fallbackPath = url.pathname.slice(0, url.pathname.lastIndexOf("/")) || "/";
        const path = attrs.get("path")?.startsWith("/") ? attrs.get("path")! : fallbackPath;
        const secure = attrs.has("secure");
        if (secure && url.protocol !== "https:") continue;
        if (name.startsWith("__Secure-") && !secure) continue;
        if (name.startsWith("__Host-") && (!secure || domain || path !== "/")) continue;
        const age = attrs.get("max-age");
        const maxAge = age && /^-?\d+$/.test(age) ? Number(age) : null;
        const date = attrs.has("expires") ? Date.parse(attrs.get("expires")!) : NaN;
        const expires = maxAge !== null ? now + maxAge * 1000 : Number.isFinite(date) ? date : null;
        const key = `${url.hostname}|${path}|${name}`;
        if (expires !== null && expires <= now) { jar.delete(key); continue; }
        if (jar.size >= 100 && !jar.has(key)) continue;
        jar.set(key, { host: url.hostname, path, pair: `${name}=${pair.slice(eq + 1).trim()}`, secure, expires });
      }
    },
    header(url: URL, now = Date.now()) {
      return [...jar.values()].filter(c => c.host === url.hostname && (!c.secure || url.protocol === "https:") && (c.expires === null || c.expires > now)
        && (url.pathname === c.path || url.pathname.startsWith(c.path.endsWith("/") ? c.path : c.path + "/")))
        .sort((a, b) => b.path.length - a.path.length).map(c => c.pair).join("; ");
    },
  };
}
