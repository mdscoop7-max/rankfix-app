import { URL } from "node:url";

export function isPrivateHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || h === "169.254.169.254") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return true;
  return false;
}

export function validatePublicHttpUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL_PROTOCOL_BLOCKED");
  if (url.username || url.password) throw new Error("URL_CREDENTIALS_BLOCKED");
  if (isPrivateHost(url.hostname)) throw new Error("URL_HOST_BLOCKED");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("URL_PORT_BLOCKED");
  return url;
}

export async function safePublicFetch(value: string | URL, options: { timeoutMs?: number; maxRedirects?: number; userAgent?: string; accept?: string } = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxRedirects = options.maxRedirects ?? 4;
  let current = validatePublicHttpUrl(typeof value === "string" ? value : value.toString());

  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    validatePublicHttpUrl(current.toString());
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
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: current };
      current = validatePublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error("REDIRECT_LIMIT");
}
