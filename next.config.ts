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
  // @sparticuz/chromium and puppeteer-core are external server packages by default.
  // The compressed Chromium binary is read from disk at runtime, so the scan route's
  // trace must include it explicitly; the local puppeteer download never ships.
  // The internal regression route runs the same scanner in-process, so it needs it too.
  outputFileTracingIncludes: {
    "/api/scan": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/internal/regression/scan": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  outputFileTracingExcludes: {
    "/*": ["./.cache/**", "./node_modules/puppeteer/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
