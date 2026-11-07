import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // axe-core builds its own injectable source with axeFunction.toString(). When the
  // package is bundled and minified, that text refers to bundler wrapper variables
  // that do not exist in the browser ("t is not defined", QA 144). Loaded with
  // native require it stays the original, self-contained script.
  serverExternalPackages: ["axe-core"],
  // Ship serverless Chromium only to the scan function; never deploy local Chrome cache.
  outputFileTracingIncludes: { "/api/scan": ["./node_modules/@sparticuz/chromium/bin/**"] },
  outputFileTracingExcludes: { "/*": ["./.cache/**", "./node_modules/puppeteer/**"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
