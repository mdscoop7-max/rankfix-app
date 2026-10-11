// Single public origin for canonical URLs, hreflang, Open Graph, sitemap and robots.
// Order: explicit SITE_URL, then the Vercel production domain (follows a future
// custom domain automatically), then the current production host.
const DEFAULT_SITE_URL = "https://rankfix-app.vercel.app";

export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.SITE_URL || env.NEXT_PUBLIC_SITE_URL;
  const vercelProduction = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  for (const candidate of [explicit, vercelProduction, DEFAULT_SITE_URL]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {}
  }
  return DEFAULT_SITE_URL;
}

export const SITE_URL = resolveSiteUrl();
