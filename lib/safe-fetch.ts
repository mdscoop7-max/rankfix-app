import { URL } from "node:url";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { Readable } from "node:stream";

/**
 * SSRF-safe public fetcher used for every customer-supplied URL.
 *
 * Guarantees
 * - Only http/https on ports 80/443, no credentials in the URL.
 * - Every hostname is resolved once per connection and the socket connects to
 *   exactly that validated address (DNS pinning). A second, attacker-controlled
 *   DNS answer between "check" and "connect" (DNS rebinding) cannot redirect the
 *   request to an internal address.
 * - Private, loopback, link-local, CGNAT, multicast, reserved and documentation
 *   ranges are blocked, including IPv4-mapped / NAT64 / 6to4 IPv6 forms and
 *   cloud metadata endpoints.
 * - Redirects are followed manually, validated hop by hop, capped and checked
 *   for loops.
 * - A deadline covers the response headers and a separate deadline covers the
 *   body, so a slow or endless body cannot stall a scan.
 *
 * Errors are thrown as SafeFetchError whose message is a stable machine code
 * (e.g. URL_DNS_BLOCKED, DNS_NOT_FOUND, TLS_CERT_INVALID, TIMEOUT). Callers that
 * matched on error.message keep working.
 */

export type SafeFetchErrorCode =
  | "URL_PROTOCOL_BLOCKED" | "URL_CREDENTIALS_BLOCKED" | "URL_HOST_BLOCKED" | "URL_PORT_BLOCKED"
  | "URL_IP_BLOCKED" | "URL_DNS_BLOCKED" | "URL_INVALID"
  | "DNS_NOT_FOUND" | "DNS_TEMPORARY_FAILURE"
  | "TLS_CERT_EXPIRED" | "TLS_CERT_INVALID" | "TLS_HANDSHAKE_FAILED"
  | "CONNECTION_REFUSED" | "CONNECTION_RESET" | "HOST_UNREACHABLE"
  | "TIMEOUT" | "BODY_TIMEOUT"
  | "REDIRECT_LIMIT" | "REDIRECT_LOOP"
  | "PROTOCOL_ERROR" | "FETCH_FAILED";

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;
  readonly detail: string | null;
  constructor(code: SafeFetchErrorCode, detail?: string | null) {
    super(code);
    this.name = "SafeFetchError";
    this.code = code;
    this.detail = detail ? String(detail).slice(0, 200) : null;
  }
}

// ---------------------------------------------------------------------------
// Address policy
// ---------------------------------------------------------------------------

const ipv4ToInt = (ip: string) => ip.split(".").reduce((acc, part) => (acc * 256) + Number(part), 0);

/** [network, prefix] pairs that are never public scan targets. */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],        // "this" network
  ["10.0.0.0", 8],       // private
  ["100.64.0.0", 10],    // carrier-grade NAT
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local incl. 169.254.169.254 cloud metadata
  ["172.16.0.0", 12],    // private
  ["192.0.0.0", 24],     // IETF protocol assignments (incl. 192.0.0.192 metadata on some clouds)
  ["192.0.2.0", 24],     // documentation
  ["192.88.99.0", 24],   // deprecated 6to4 relay
  ["192.168.0.0", 16],   // private
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // documentation
  ["203.0.113.0", 24],   // documentation
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved + broadcast
];
const BLOCKED_V4_RANGES = BLOCKED_V4.map(([net, prefix]) => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base: (ipv4ToInt(net) & mask) >>> 0, mask };
});

function isBlockedIpv4(ip: string) {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return true;
  const value = ipv4ToInt(ip) >>> 0;
  return BLOCKED_V4_RANGES.some(range => ((value & range.mask) >>> 0) === range.base);
}

/** Expands an IPv6 literal to eight 16-bit groups; returns null when malformed. */
function expandIpv6(input: string): number[] | null {
  let ip = input.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  // Rewrite a trailing dotted IPv4 (e.g. ::ffff:127.0.0.1) into two hex groups.
  const v4Match = ip.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4Match) {
    const octets = v4Match.slice(2, 6).map(Number);
    if (octets.some(octet => octet > 255)) return null;
    ip = `${v4Match[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => part ? part.split(":").map(group => /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN) : [];
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const explicit = head.length + tail.length;
  if ([...head, ...tail].some(Number.isNaN)) return null;
  if (halves.length === 1 && explicit !== 8) return null;
  if (halves.length === 2 && explicit > 7) return null;
  return halves.length === 2 ? [...head, ...new Array(8 - explicit).fill(0), ...tail] : head;
}

const groupsToV4 = (high: number, low: number) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;

function isBlockedIpv6(ip: string) {
  const g = expandIpv6(ip);
  if (!g) return true;
  const allZeroUntil = (index: number) => g.slice(0, index).every(value => value === 0);
  if (allZeroUntil(8)) return true;                                   // ::
  if (allZeroUntil(7) && g[7] === 1) return true;                     // ::1
  if (allZeroUntil(5) && g[5] === 0xffff) return isBlockedIpv4(groupsToV4(g[6], g[7])); // ::ffff:a.b.c.d
  if (allZeroUntil(6)) return true;                                   // deprecated IPv4-compatible ::a.b.c.d
  if (g[0] === 0x0064 && g[1] === 0xff9b) return g.slice(2, 6).every(value => value === 0) ? isBlockedIpv4(groupsToV4(g[6], g[7])) : true; // NAT64
  if (g[0] === 0x2002) return isBlockedIpv4(groupsToV4(g[1], g[2]));  // 6to4 embeds an IPv4 address
  if (g[0] === 0x2001 && g[1] === 0x0000) return true;                // Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only
  if ((g[0] & 0xfe00) === 0xfc00) return true;                        // unique local fc00::/7 (incl. fd00:ec2::254)
  if ((g[0] & 0xffc0) === 0xfe80) return true;                        // link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;                        // site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true;                        // multicast
  return false;
}

/** True when an IP address must never be contacted by the scanner. */
export function isBlockedAddress(address: string) {
  const ip = address.trim().replace(/^\[|\]$/g, "");
  const family = isIP(ip.split("%")[0]);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true;
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".localdomain"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata", "metadata.google.internal", "instance-data", "kubernetes.default", "kubernetes.default.svc"]);

export function isPrivateHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return true;
  if (isIP(h)) return isBlockedAddress(h);
  if (BLOCKED_HOSTS.has(h) || BLOCKED_HOST_SUFFIXES.some(suffix => h.endsWith(suffix))) return true;
  return false;
}

export type SafeFetchPolicy = {
  /** Resolves a hostname to all of its addresses. */
  resolve: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  /** Address policy applied to every resolved and literal address. */
  isBlockedAddress: (address: string) => boolean;
  /** Hostname policy applied before any DNS lookup. */
  isBlockedHost: (hostname: string) => boolean;
  allowedPorts: ReadonlySet<string>;
};

export const PUBLIC_FETCH_POLICY: SafeFetchPolicy = {
  resolve: async (hostname) => lookup(hostname, { all: true, verbatim: true }),
  isBlockedAddress,
  isBlockedHost: isPrivateHost,
  allowedPorts: new Set(["", "80", "443"]),
};

function validateUrlWithPolicy(value: string, policy: SafeFetchPolicy) {
  let url: URL;
  try { url = new URL(value); } catch { throw new SafeFetchError("URL_INVALID"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new SafeFetchError("URL_PROTOCOL_BLOCKED");
  if (url.username || url.password) throw new SafeFetchError("URL_CREDENTIALS_BLOCKED");
  if (policy.isBlockedHost(url.hostname)) throw new SafeFetchError("URL_HOST_BLOCKED");
  if (!policy.allowedPorts.has(url.port)) throw new SafeFetchError("URL_PORT_BLOCKED");
  return url;
}

export function validatePublicHttpUrl(value: string) {
  return validateUrlWithPolicy(value, PUBLIC_FETCH_POLICY);
}

async function resolveAllowed(hostname: string, policy: SafeFetchPolicy) {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (policy.isBlockedAddress(bare)) throw new SafeFetchError("URL_IP_BLOCKED");
    return [{ address: bare, family: isIP(bare) }];
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await policy.resolve(bare);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EAI_AGAIN" || code === "ETIMEOUT" || code === "ESERVFAIL" || code === "ECONNREFUSED") throw new SafeFetchError("DNS_TEMPORARY_FAILURE", code);
    throw new SafeFetchError("DNS_NOT_FOUND", code || null);
  }
  if (!records.length) throw new SafeFetchError("DNS_NOT_FOUND", "NO_RECORDS");
  // Any internal answer poisons the whole name: never pick "the public one" from a mixed set.
  if (records.some(record => policy.isBlockedAddress(record.address))) throw new SafeFetchError("URL_DNS_BLOCKED");
  return records;
}

export async function assertPublicDns(hostname: string) {
  await resolveAllowed(hostname, PUBLIC_FETCH_POLICY);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const TLS_EXPIRED = new Set(["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID"]);
const TLS_INVALID = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_SIGNATURE_FAILURE", "CERT_REVOKED", "CERT_UNTRUSTED", "CERT_REJECTED", "INVALID_CA",
]);

export function toSafeFetchError(error: unknown): SafeFetchError {
  if (error instanceof SafeFetchError) return error;
  const err = error as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
  const code = String(err?.code || err?.cause?.code || "");
  if (TLS_EXPIRED.has(code)) return new SafeFetchError("TLS_CERT_EXPIRED", code);
  if (TLS_INVALID.has(code)) return new SafeFetchError("TLS_CERT_INVALID", code);
  if (code === "EPROTO" || code.startsWith("ERR_SSL") || code.startsWith("ERR_TLS")) return new SafeFetchError("TLS_HANDSHAKE_FAILED", code);
  if (code === "ENOTFOUND") return new SafeFetchError("DNS_NOT_FOUND", code);
  if (code === "EAI_AGAIN") return new SafeFetchError("DNS_TEMPORARY_FAILURE", code);
  if (code === "ECONNREFUSED") return new SafeFetchError("CONNECTION_REFUSED", code);
  if (code === "ECONNRESET" || code === "EPIPE" || code === "ECONNABORTED" || code === "UND_ERR_SOCKET") return new SafeFetchError("CONNECTION_RESET", code);
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "EADDRNOTAVAIL") return new SafeFetchError("HOST_UNREACHABLE", code);
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return new SafeFetchError("TIMEOUT", code);
  if (code === "HPE_INVALID_CONSTANT" || code.startsWith("HPE_")) return new SafeFetchError("PROTOCOL_ERROR", code);
  return new SafeFetchError("FETCH_FAILED", code || (err instanceof Error ? err.message : null));
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  /** Maximum time to read the body after the headers arrived. Defaults to timeoutMs. */
  bodyTimeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  accept?: string;
  acceptLanguage?: string;
  method?: "GET" | "HEAD";
};

export type SafeFetchResult = {
  response: Response;
  finalUrl: URL;
  redirectChain: Array<{ from: string; to: string; status: number }>;
  /** The validated IP address the final response came from. */
  remoteAddress: string | null;
};

const DEFAULT_USER_AGENT = "RankFixBot/2.1 (+https://rankfix-app.onrender.com)";

function decodedBody(res: http.IncomingMessage): Readable {
  const encoding = String(res.headers["content-encoding"] || "").trim().toLowerCase();
  const onError = (stream: Readable) => { stream.on("error", () => {}); return stream; };
  if (encoding === "gzip" || encoding === "x-gzip") return onError(res.pipe(zlib.createGunzip({ finishFlush: zlib.constants.Z_SYNC_FLUSH })));
  if (encoding === "deflate") return onError(res.pipe(zlib.createInflate({ finishFlush: zlib.constants.Z_SYNC_FLUSH })));
  if (encoding === "br") return onError(res.pipe(zlib.createBrotliDecompress()));
  return res;
}

function toWebResponse(res: http.IncomingMessage, url: URL, method: string, bodyTimeoutMs: number): Response {
  const headers = new Headers();
  for (const [name, raw] of Object.entries(res.headers)) {
    if (raw === undefined) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      try { headers.append(name, String(value)); } catch { /* invalid header value: skip */ }
    }
  }
  const status = res.statusCode || 0;
  const noBody = method === "HEAD" || status === 204 || status === 205 || status === 304;
  let body: ReadableStream<Uint8Array> | null = null;
  if (noBody) {
    res.resume();
  } else {
    const stream = decodedBody(res);
    // Body deadline: an endless or trickling body cannot stall a scan.
    const timer = setTimeout(() => {
      const error = new SafeFetchError("BODY_TIMEOUT");
      res.destroy(error);
      if (stream !== res) stream.destroy(error);
    }, bodyTimeoutMs);
    timer.unref?.();
    const clear = () => clearTimeout(timer);
    stream.once("end", clear);
    stream.once("close", clear);
    stream.once("error", clear);
    body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
  }
  const safeStatus = status >= 200 && status <= 599 ? status : 599;
  const response = new Response(body, { status: safeStatus, statusText: res.statusMessage || "", headers });
  // Response only accepts 200-599; keep the real status (e.g. LinkedIn's 999) visible to callers.
  if (safeStatus !== status) {
    Object.defineProperty(response, "status", { value: status });
    Object.defineProperty(response, "ok", { value: false });
  }
  Object.defineProperty(response, "url", { value: url.toString() });
  return response;
}

function requestOnce(url: URL, policy: SafeFetchPolicy, options: Required<Pick<SafeFetchOptions, "timeoutMs" | "bodyTimeoutMs" | "userAgent" | "accept" | "acceptLanguage" | "method">>, pinned: Array<{ address: string; family: number }>) {
  return new Promise<{ response: Response; remoteAddress: string | null }>((resolve, reject) => {
    // DNS pinning: the socket may only connect to an address validated above.
    const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
      const preferred = pinned.find(record => !lookupOptions?.family || record.family === lookupOptions.family) || pinned[0];
      if (!preferred || policy.isBlockedAddress(preferred.address)) {
        const error = new SafeFetchError("URL_DNS_BLOCKED") as unknown as NodeJS.ErrnoException;
        (callback as (error: NodeJS.ErrnoException | null, address: string, family: number) => void)(error, "", 0);
        return;
      }
      if (lookupOptions?.all) {
        (callback as unknown as (error: null, addresses: Array<{ address: string; family: number }>) => void)(null, [{ address: preferred.address, family: preferred.family }]);
      } else {
        (callback as (error: null, address: string, family: number) => void)(null, preferred.address, preferred.family);
      }
    };
    const transport = url.protocol === "https:" ? https : http;
    let settled = false;
    const fail = (error: unknown) => { if (!settled) { settled = true; reject(toSafeFetchError(error)); } };
    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname || "/"}${url.search}`,
      method: options.method,
      agent: false,
      lookup: pinnedLookup,
      servername: isIP(url.hostname.replace(/^\[|\]$/g, "")) ? undefined : url.hostname,
      headers: {
        "User-Agent": options.userAgent,
        Accept: options.accept,
        "Accept-Language": options.acceptLanguage,
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "close",
      },
    }, (res) => {
      clearTimeout(headerTimer);
      if (settled) { res.destroy(); return; }
      const remoteAddress = res.socket?.remoteAddress || null;
      // Belt and braces: never return content from a blocked peer.
      if (remoteAddress && policy.isBlockedAddress(remoteAddress.replace(/^::ffff:(?=\d)/, ""))) {
        res.destroy();
        fail(new SafeFetchError("URL_DNS_BLOCKED", "PEER_ADDRESS"));
        return;
      }
      settled = true;
      try {
        resolve({ response: toWebResponse(res, url, options.method, options.bodyTimeoutMs), remoteAddress });
      } catch (error) {
        res.destroy();
        reject(toSafeFetchError(error));
      }
    });
    const headerTimer = setTimeout(() => {
      req.destroy(new SafeFetchError("TIMEOUT"));
    }, options.timeoutMs);
    headerTimer.unref?.();
    req.on("error", (error) => { clearTimeout(headerTimer); fail(error); });
    req.end();
  });
}

export function createSafeFetch(policy: SafeFetchPolicy) {
  return async function safeFetch(value: string | URL, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const timeoutMs = Math.max(500, options.timeoutMs ?? 10000);
    const settings = {
      timeoutMs,
      bodyTimeoutMs: Math.max(500, options.bodyTimeoutMs ?? timeoutMs),
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      accept: options.accept ?? "text/html,application/xhtml+xml",
      acceptLanguage: options.acceptLanguage ?? "nl-NL,nl;q=0.9,en;q=0.8",
      method: options.method ?? "GET" as const,
    };
    const maxRedirects = Math.max(0, Math.min(10, options.maxRedirects ?? 4));
    let current = validateUrlWithPolicy(typeof value === "string" ? value : value.toString(), policy);
    const redirectChain: Array<{ from: string; to: string; status: number }> = [];
    const visited = new Set<string>([current.toString()]);

    for (let hop = 0; ; hop++) {
      validateUrlWithPolicy(current.toString(), policy);
      const pinned = await resolveAllowed(current.hostname, policy);
      const { response, remoteAddress } = await requestOnce(current, policy, settings, pinned);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { response, finalUrl: current, redirectChain, remoteAddress };
        try { await response.body?.cancel(); } catch {}
        let next: URL;
        try { next = new URL(location, current); } catch { throw new SafeFetchError("URL_INVALID", "BAD_LOCATION"); }
        next.hash = "";
        next = validateUrlWithPolicy(next.toString(), policy);
        redirectChain.push({ from: current.toString(), to: next.toString(), status: response.status });
        if (visited.has(next.toString())) throw new SafeFetchError("REDIRECT_LOOP", next.toString());
        if (hop + 1 > maxRedirects) throw new SafeFetchError("REDIRECT_LIMIT");
        visited.add(next.toString());
        current = next;
        continue;
      }
      return { response, finalUrl: current, redirectChain, remoteAddress };
    }
  };
}

export const safePublicFetch = createSafeFetch(PUBLIC_FETCH_POLICY);

export async function readResponseTextLimited(response: Response, maxBytes = 2_000_000) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("RESPONSE_LIMIT_INVALID");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("RESPONSE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
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
    const declaredCharset = response.headers.get("content-type")?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]?.toLowerCase() || "";
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
