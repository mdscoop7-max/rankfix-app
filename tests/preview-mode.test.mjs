// Isolated Vercel Preview without a database: public scans keep a per-network limit in memory.
// Production must never take this path, and no database is touched in that mode.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { consumeMemoryRateLimit, isPreviewWithoutDatabase, __resetMemoryRateLimitForTests } from "../lib/rate-limit.ts";

test("preview-without-database mode only matches a Vercel Preview with no DATABASE_URL", () => {
  assert.equal(isPreviewWithoutDatabase({ VERCEL_ENV: "preview" }), true);
  assert.equal(isPreviewWithoutDatabase({ VERCEL_ENV: "preview", DATABASE_URL: "   " }), true);
  assert.equal(isPreviewWithoutDatabase({ VERCEL_ENV: "preview", DATABASE_URL: "postgres://x" }), false, "a preview with its own test database uses it");
  assert.equal(isPreviewWithoutDatabase({ VERCEL_ENV: "production" }), false, "Vercel Production never");
  assert.equal(isPreviewWithoutDatabase({ VERCEL_ENV: "development" }), false);
  assert.equal(isPreviewWithoutDatabase({ RENDER: "true" }), false, "Render never");
  assert.equal(isPreviewWithoutDatabase({}), false, "local/self-hosted never");
});

test("memory rate limit allows 8 public scans per network per hour, then refuses, then resets", () => {
  __resetMemoryRateLimitForTests();
  const t0 = 1_000_000;
  const results = Array.from({ length: 9 }, (_, i) => consumeMemoryRateLimit("public-scan", "203.0.113.7", 8, 3600, t0 + i));
  assert.deepEqual(results, [true, true, true, true, true, true, true, true, false]);
  assert.equal(consumeMemoryRateLimit("public-scan", "198.51.100.2", 8, 3600, t0 + 10), true, "other networks are independent");
  assert.equal(consumeMemoryRateLimit("public-scan", "203.0.113.7", 8, 3600, t0 + 3_600_001), true, "new window after an hour");
});

test("memory rate limit fails closed when its bounded table is full of active buckets", () => {
  __resetMemoryRateLimitForTests();
  const t0 = 5_000_000;
  for (let i = 0; i < 5000; i++) consumeMemoryRateLimit("public-scan", `ip-${i}`, 8, 3600, t0);
  assert.equal(consumeMemoryRateLimit("public-scan", "ip-new", 8, 3600, t0 + 1), false);
  assert.equal(consumeMemoryRateLimit("public-scan", "ip-new", 8, 3600, t0 + 3_600_001), true, "expired buckets are pruned");
  __resetMemoryRateLimitForTests();
});

test("scan route: only the public path may use the memory limit; dashboard scans always need login and the database", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const publicBlock = route.slice(route.indexOf("if (!dashboardScan) {\n      const publicIp"), route.indexOf("// Dashboard allowances are enforced server-side"));
  assert.match(publicBlock, /if \(isPreviewWithoutDatabase\(\)\) \{\n\s+publicAllowed=consumeMemoryRateLimit\("public-scan",publicIp,8,3600\);/);
  assert.match(publicBlock, /\} else \{\n\s+await ensureDatabase\(\);\n\s+publicAllowed=await consumeRateLimit\("public-scan",publicIp,8,3600\);/);
  assert.equal((route.match(/isPreviewWithoutDatabase\(/g) || []).length, 1, "used in exactly one place");
  const dashboardBlock = route.slice(route.indexOf("// Dashboard allowances are enforced server-side"), route.indexOf("const started = Date.now();"));
  assert.doesNotMatch(dashboardBlock, /isPreviewWithoutDatabase|consumeMemoryRateLimit/);
  assert.match(dashboardBlock, /if \(!usageUser\) return NextResponse\.json\(\{ error: scanError\.session \}, \{ status: 401 \}\);/);
});
