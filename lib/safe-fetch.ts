import { URL } from "node:url";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isPrivateHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || h === "169.254.169.254") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return true;
  return false;
}

function isPrivateIp(address: string) {
  const ip=address.toLowerCase().replace(/^\[|\]$/g,"");
  if(isIP(ip)===4){
    const parts=ip.split(".").map(Number);
    return parts[0]===10 || parts[0]===127 || (parts[0]===169&&parts[1]===254) || (parts[0]===172&&parts[1]>=16&&parts[1]<=31) || (parts[0]===192&&parts[1]===168) || parts[0]===0;
  }
  if(isIP(ip)===6){
    const mapped=ip.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
    if(mapped){
      const parts=mapped.slice(1).map(Number);
      return parts.some(part=>part>255) || parts[0]===10 || parts[0]===127 || (parts[0]===169&&parts[1]===254) || (parts[0]===172&&parts[1]>=16&&parts[1]<=31) || (parts[0]===192&&parts[1]===168) || parts[0]===0;
    }
    return ip==="::1" || ip==="::" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/i.test(ip);
  }
  return true;
}

export async function assertPublicDns(hostname:string){
  if(isIP(hostname)){
    if(isPrivateIp(hostname)) throw new Error("URL_IP_BLOCKED");
    return;
  }
  const records=await lookup(hostname,{all:true,verbatim:true});
  if(!records.length || records.some(record=>isPrivateIp(record.address))) throw new Error("URL_DNS_BLOCKED");
}

export function validatePublicHttpUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL_PROTOCOL_BLOCKED");
  if (url.username || url.password) throw new Error("URL_CREDENTIALS_BLOCKED");
  if (isPrivateHost(url.hostname)) throw new Error("URL_HOST_BLOCKED");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("URL_PORT_BLOCKED");
  return url;
}

// Cookies set during a redirect chain (consent or session redirects) are sent back
// on the next hop to the same site, as any browser or standard HTTP client does.
// Without this, sites that redirect "set cookie → come back" loop until
// REDIRECT_LIMIT. The jar lives only for one safePublicFetch call.
function registrableTail(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
}

export async function safePublicFetch(value: string | URL, options: { timeoutMs?: number; maxRedirects?: number; userAgent?: string; accept?: string; acceptLanguage?: string } = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxRedirects = options.maxRedirects ?? 4;
  let current = validatePublicHttpUrl(typeof value === "string" ? value : value.toString());
  const redirectChain: Array<{ from: string; to: string; status: number }> = [];
  const cookieJar = new Map<string, string>();
  // A consent/session redirect may return to the same URL once with a new cookie.
  // Returning to a URL with an unchanged cookie jar is a loop: stop immediately
  // instead of spending the remaining redirect budget (and scan time) on it.
  const visited = new Set<string>();
  const visitKey = (url: URL) => `${url.protocol}//${url.host.toLowerCase()}${url.pathname}${url.search}|${[...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).sort().join(";")}`;

  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    validatePublicHttpUrl(current.toString());
    const key = visitKey(current);
    if (visited.has(key)) throw new Error("REDIRECT_LOOP");
    visited.add(key);
    await assertPublicDns(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
        headers: {
          "User-Agent": options.userAgent ?? "RankFixBot/2.1 (+https://rankfix-app.onrender.com)",
          Accept: options.accept ?? "text/html,application/xhtml+xml",
          // Standard request headers; a request without a language preference is
          // treated as suspicious by several European CDNs.
          "Accept-Language": options.acceptLanguage ?? "en;q=0.9,nl;q=0.8,de;q=0.7,fr;q=0.6,*;q=0.5",
          ...(cookieJar.size && [...cookieJar.keys()].length ? { Cookie: [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const setCookies = typeof (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
        ? (response.headers as Headers & { getSetCookie: () => string[] }).getSetCookie() : [];
      for (const raw of setCookies.slice(0, 20)) {
        const pair = raw.split(";")[0]; const eq = pair.indexOf("=");
        if (eq > 0 && pair.length < 4096) cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: current, redirectChain };
      const next = validatePublicHttpUrl(new URL(location, current).toString());
      // Never carry cookies to another site.
      if (registrableTail(next.hostname) !== registrableTail(current.hostname)) cookieJar.clear();
      redirectChain.push({ from: current.toString(), to: next.toString(), status: response.status });
      current = next;
      continue;
    }
    return { response, finalUrl: current, redirectChain };
  }
  throw new Error("REDIRECT_LIMIT");
}


export async function readResponseTextLimited(response: Response, maxBytes = 2_000_000, bodyTimeoutMs = 20_000) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("RESPONSE_LIMIT_INVALID");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("RESPONSE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    // A body that trickles in must not hold the scan until the platform kills it.
    const deadline = Date.now() + bodyTimeoutMs;
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { await reader.cancel().catch(() => {}); throw new Error("BODY_TIMEOUT"); }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("BODY_TIMEOUT")), remaining); }),
      ]).finally(() => clearTimeout(timer)).catch(async (error) => { if (String(error?.message) === "BODY_TIMEOUT") await reader.cancel().catch(() => {}); throw error; });
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // Header first, then the document's own <meta charset> / http-equiv in the
    // first bytes. Many EU sites still serve windows-1250/-1257/-1253 or
    // ISO-8859-2; reading those as UTF-8 breaks every accented identity word.
    const declaredCharset = response.headers.get("content-type")?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]?.toLowerCase()
      || sniffMetaCharset(bytes) || "";
    const charset = /^(?:iso-8859-1|latin1|latin-1|windows-1252|cp1252)$/.test(declaredCharset) ? "windows-1252" : declaredCharset || "utf-8";
    const decode = (label: string) => {
      try { return new TextDecoder(label).decode(bytes); }
      catch { return new TextDecoder("utf-8").decode(bytes); }
    };
    let text = decode(charset);
    if ((!declaredCharset || charset === "utf-8") && text.includes("\uFFFD")) {
      const legacy = decode("windows-1252");
      const replacements = (value: string) => (value.match(/\uFFFD/g) || []).length;
      if (replacements(legacy) < replacements(text)) text = legacy;
    }
    return text;
  } finally {
    reader.releaseLock();
  }
}

/** <meta charset="..."> or <meta http-equiv="content-type" content="...charset=..."> in the first 4 kB. */
export function sniffMetaCharset(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const label = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_:.-]{2,40})/i)?.[1]?.toLowerCase() || "";
  if (!label) return "";
  try { new TextDecoder(label); return label; } catch { return ""; }
}

// Reads at most maxBytes of a response body and stops there instead of failing.
// For bounded sampling of large documents (e.g. product sitemaps), never for
// documents that must be read completely.
export async function readResponsePrefix(response: Response, maxBytes = 1_500_000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = value.subarray(0, Math.max(0, maxBytes - total));
      chunks.push(take);
      total += take.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8").decode(bytes);
}

// For huge representative pages, keep their complete HTML head instead of
// dropping the whole URL. Body-dependent checks must remain unconfirmed when
// partial=true; this helper never claims to have fetched the entire document.
export async function readHtmlSampleHeadFirst(response: Response, maxBytes = 2_000_000): Promise<{
  html:string; partial:boolean; headComplete:boolean;
}> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 0 && declared <= maxBytes) {
    const html = await readResponseTextLimited(response, maxBytes);
    return {html,partial:false,headComplete:/<\/head\s*>/i.test(html)};
  }
  // Prefix sampling is intentionally byte-bounded even without Content-Length.
  const prefix = await readResponsePrefix(response, maxBytes);
  const partial = declared > maxBytes || Buffer.byteLength(prefix, "utf8") >= maxBytes - 4;
  if (!partial) return {html:prefix,partial:false,headComplete:/<\/head\s*>/i.test(prefix)};
  const end = prefix.search(/<\/head\s*>/i);
  if (end < 0) throw new Error("RESPONSE_TOO_LARGE_NO_HEAD");
  const endTag = prefix.slice(end).match(/^<\/head\s*>/i)?.[0] || "</head>";
  // Retain the complete head AND the first body bytes. This permits positive
  // evidence from early H1/prices/forms without claiming that absent body
  // elements are defects; callers receive partial=true for that distinction.
  return {html:prefix,partial:true,headComplete:true};
}
