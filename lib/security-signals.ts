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

// Commas inside Expires must stay inside the cookie; attributes are evaluated
// only on their own cookie record.
export function splitSetCookieHeader(header: string): string[] {
  const out: string[] = [];
  let from = 0;
  let inExpires = false;
  for (let i = 0; i < header.length; i++) {
    if (header.slice(i, i + 8).toLowerCase() === "expires=") inExpires = true;
    if (inExpires && header[i] === ";") inExpires = false;
    if (!inExpires && header[i] === "," && /^\s*[^;,=\s]+=[^;,]*/.test(header.slice(i + 1))) {
      out.push(header.slice(from, i).trim());
      from = i + 1;
    }
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
  { label: "generic bearer token", re: /authorization\s*[:=]\s*["']?bearer\s+([A-Za-z0-9._~-]{20,})/gi },
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
