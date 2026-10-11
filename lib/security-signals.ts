// Passive security signals from response headers and fetched HTML. Pure functions
// so each rule is regression-tested; the scan route only turns them into checks.

// Mixed content is an http:// subresource loaded by an https:// page. Plain links
// (<a href>), canonical/alternate <link>s and form actions are not subresources.
const SUBRESOURCE_SRC = /<(?:img|script|iframe|frame|source|video|audio|track|embed|input)\b[^>]*?\s(?:src|srcset|poster)\s*=\s*["']\s*(http:\/\/[^"'\s>]+)/gi;
const OBJECT_DATA = /<object\b[^>]*?\sdata\s*=\s*["']\s*(http:\/\/[^"'\s>]+)/gi;
const LINK_TAG = /<link\b[^>]*>/gi;
const LOADED_LINK_REL = /\brel\s*=\s*["']?[^"'>]*\b(?:stylesheet|preload|modulepreload|icon|apple-touch-icon|manifest)\b/i;

export function findMixedContent(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(SUBRESOURCE_SRC)) found.add(match[1]);
  for (const match of html.matchAll(OBJECT_DATA)) found.add(match[1]);
  for (const match of html.matchAll(LINK_TAG)) {
    const href = match[0].match(/\bhref\s*=\s*["']\s*(http:\/\/[^"'\s>]+)/i)?.[1];
    if (href && LOADED_LINK_REL.test(match[0])) found.add(href);
  }
  return [...found];
}

// A joined Set-Cookie header separates cookies with commas, but Expires dates
// contain one too ("Wed, 21 Oct 2026 ..."). Split only on commas that start a new
// name=value pair and do not follow a weekday name.
export function splitSetCookieHeader(header: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < header.length; i++) {
    if (header[i] !== ",") continue;
    if (/(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i.test(header.slice(Math.max(0, i - 9), i))) continue;
    if (!/^\s*[^;,=\s]+=/.test(header.slice(i + 1))) continue;
    out.push(header.slice(from, i).trim());
    from = i + 1;
  }
  out.push(header.slice(from).trim());
  return out.filter(Boolean);
}

// Prefer the runtime's separate Set-Cookie values; fall back to splitting the joined header.
export function setCookieValues(headers: Headers): string[] {
  const separate = typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
    ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
    : [];
  if (separate.length) return separate.map((value) => value.trim()).filter(Boolean);
  const joined = headers.get("set-cookie") || "";
  return joined ? splitSetCookieHeader(joined) : [];
}

export type CookieObservation = { name: string; raw: string; secure: boolean; httpOnly: boolean; sameSite: string; sessionLike: boolean };

export function observeCookie(raw: string): CookieObservation {
  const name = (raw.split(";")[0] || "").split("=")[0]?.trim() || "cookie";
  const attributes = raw.split(";").slice(1).map((part) => part.trim().toLowerCase());
  const sameSite = attributes.find((part) => part.startsWith("samesite="))?.slice(9);
  const antiCsrf = /(?:csrf|xsrf|verification[-_]?token|requestverificationtoken)/i.test(name);
  return {
    name,
    raw,
    secure: attributes.includes("secure"),
    httpOnly: attributes.includes("httponly"),
    sameSite: sameSite && ["lax", "strict", "none"].includes(sameSite) ? sameSite : "missing",
    sessionLike: !antiCsrf && /(?:^|[-_.])(session|sess|auth|jwt|login|sid)(?:$|[-_.])/i.test(name),
  };
}

export function findForms(html: string): { count: number; passwordForm: boolean; insecureActions: number } {
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((match) => match[0]);
  return {
    count: forms.length,
    passwordForm: forms.some((form) => /<input[^>]+type\s*=\s*["']?password\b/i.test(form)),
    insecureActions: forms.filter((form) => /<form\b[^>]*\saction\s*=\s*["']\s*http:\/\//i.test(form)).length,
  };
}

// Documentation shows example credentials inside <pre>/<code>; real leaks sit in
// inline scripts or JSON. Example and placeholder values are never reported.
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\s*[A-Za-z0-9+/=\r\n]{64,}/ },
  { label: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g },
  { label: "generic bearer token", re: /authorization["']?\s*[:=]\s*["']?bearer\s+([A-Za-z0-9._~-]{20,})/gi },
];
const PLACEHOLDER = /example|sample|dummy|placeholder|your[_-]?|x{6,}|0{8,}|1234567890|abcdef/i;

export function findExposedSecrets(html: string): string[] {
  const searchable = html
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, " ")
    .replace(/<code\b[\s\S]*?<\/code>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const found: string[] = [];
  for (const { label, re } of SECRET_PATTERNS) {
    const matches = re.global ? [...searchable.matchAll(re)].map((match) => match[1] || match[0]) : (searchable.match(re) ? [searchable.match(re)![0]] : []);
    if (matches.some((value) => !PLACEHOLDER.test(value))) found.push(label);
  }
  return found;
}

// SRI only works for immutable files. Versioned URLs (…@1.2.3/…, /1.2.3/, ?v=1.2.3)
// are actionable; dynamic loaders (tag managers, analytics, payment SDKs) cannot use it.
export function analyzeScriptIntegrity(html: string, pageUrl: string): { crossOrigin: number; missingVersioned: string[]; missingDynamic: string[] } {
  const page = new URL(pageUrl);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => ({ tag: match[0], src: match[1] }));
  const crossOrigin = scripts.filter((item) => { try { return new URL(item.src, page).origin !== page.origin; } catch { return false; } });
  const missing = crossOrigin.filter((item) => !/\bintegrity\s*=/i.test(item.tag));
  const versioned = (src: string) => /(?:@|\/|[?&]v(?:er(?:sion)?)?=)v?\d+\.\d+(?:\.\d+)?(?:[-.][\w.]+)?(?:\/|\.(?:min\.)?js\b|$|[?&#])/i.test(src);
  return {
    crossOrigin: crossOrigin.length,
    missingVersioned: missing.filter((item) => versioned(item.src)).map((item) => item.src),
    missingDynamic: missing.filter((item) => !versioned(item.src)).map((item) => item.src),
  };
}

export type SecurityStatus = "pass" | "warning" | "fail" | "not_applicable" | "unable_to_confirm";
export type SecuritySignalResult = { status: SecurityStatus; points: number; maxPoints: number };
export type PassiveSecurityAssessment = {
  mixedContent: SecuritySignalResult & { urls: string[] };
  cookieFlags: SecuritySignalResult & { cookies: CookieObservation[]; issues: number; missingSecure: string[]; missingSameSite: string[]; sessionMissingHttpOnly: string[] };
  forms: SecuritySignalResult & ReturnType<typeof findForms>;
  exposedSecrets: SecuritySignalResult & { labels: string[] };
  scriptIntegrity: SecuritySignalResult & ReturnType<typeof analyzeScriptIntegrity>;
};

// Same awarding rule as the scan route's securityCheck: warnings get partial credit.
function result(status: SecurityStatus, points: number, maxPoints: number): SecuritySignalResult {
  const awarded = status === "pass" ? Math.min(points, maxPoints) : status === "warning" ? Math.min(points, Math.max(0, maxPoints - 1)) : 0;
  return { status, points: awarded, maxPoints };
}

// The decision for each HTML/cookie-based security check. The scan route only adds wording.
export function assessPassiveSecurity(input: { isHttps: boolean; html: string; pageUrl: string; setCookies: string[] }): PassiveSecurityAssessment {
  const urls = input.isHttps ? findMixedContent(input.html).slice(0, 5) : [];
  const mixedContent = { ...(!input.isHttps ? result("not_applicable", 0, 4) : urls.length === 0 ? result("pass", 4, 4) : result("fail", 4, 4)), urls };

  const cookies = input.setCookies.map(observeCookie);
  const missingSecure = cookies.filter((cookie) => input.isHttps && !cookie.secure).map((cookie) => cookie.name);
  const missingSameSite = cookies.filter((cookie) => cookie.sameSite === "missing").map((cookie) => cookie.name);
  const sessionMissingHttpOnly = cookies.filter((cookie) => cookie.sessionLike && !cookie.httpOnly).map((cookie) => cookie.name);
  const issues = missingSecure.length + missingSameSite.length + sessionMissingHttpOnly.length;
  const cookieFlags = {
    ...(!cookies.length ? result("unable_to_confirm", 0, 5) : issues === 0 ? result("pass", 5, 5) : result("warning", Math.max(1, 5 - Math.min(4, issues)), 5)),
    cookies, issues, missingSecure, missingSameSite, sessionMissingHttpOnly,
  };

  const formSignals = findForms(input.html);
  const forms = {
    ...(formSignals.count === 0 ? result("not_applicable", 0, 5) : formSignals.insecureActions > 0 ? result("fail", 5, 5) : input.isHttps ? result("pass", 5, 5) : result("warning", 2, 5)),
    ...formSignals,
  };

  const labels = findExposedSecrets(input.html);
  const exposedSecrets = { ...(labels.length ? result("fail", 8, 8) : result("pass", 8, 8)), labels };

  const integrity = analyzeScriptIntegrity(input.html, input.pageUrl);
  const scriptIntegrity = { ...(integrity.missingVersioned.length ? result("warning", 2, 4) : result("pass", 4, 4)), ...integrity };

  return { mixedContent, cookieFlags, forms, exposedSecrets, scriptIntegrity };
}

// Security score over assessed checks only, as in the scan route.
export function securityScore(results: SecuritySignalResult[]): number {
  const applicable = results.filter((item) => item.status !== "not_applicable" && item.status !== "unable_to_confirm");
  const max = applicable.reduce((sum, item) => sum + item.maxPoints, 0);
  return max ? Math.round((applicable.reduce((sum, item) => sum + item.points, 0) / max) * 100) : 0;
}
