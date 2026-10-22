import test from "node:test";
import assert from "node:assert/strict";
import { measureWebsiteSpeed, parsePageSpeed } from "../lib/pagespeed.ts";

const data = (score, inp = null) => ({
  lighthouseResult: {
    categories: { performance: { score } },
    audits: {
      "first-contentful-paint": { numericValue: 950 },
      "largest-contentful-paint": { numericValue: 1800 },
      "cumulative-layout-shift": { numericValue: 0.03 },
      "total-blocking-time": { numericValue: 45 },
    },
  },
  loadingExperience: { metrics: inp == null ? {} : { INTERACTION_TO_NEXT_PAINT: { percentile: inp } } },
});

test("PageSpeed supports actual 0 and 100, lab metrics and separate field INP", () => {
  assert.equal(parsePageSpeed(data(0)).score, 0);
  const result = parsePageSpeed(data(1, 180));
  assert.equal(result.score, 100);
  assert.equal(result.lab.lcpMs, 1800);
  assert.equal(result.lab.cls, 0.03);
  assert.equal(result.field.inpMs, 180);
  assert.equal(parsePageSpeed(data(1)).field.inpMs, null);
});

test("Non-numeric, missing or out-of-range scores never become a fake success", () => {
  for (const value of [-1, 1.5, "1", null, NaN, Infinity]) {
    assert.equal(parsePageSpeed(data(value)).status, "unavailable");
    assert.equal(parsePageSpeed(data(value)).score, null);
  }
});

test("The existing scan requests both devices, even if just one succeeds", async () => {
  const called = [];
  const speed = await measureWebsiteSpeed("https://example.org/path#private", {
    apiKey: "test-only",
    fetcher: async (uri) => {
      const query = new URL(String(uri));
      called.push(query.searchParams.get("strategy"));
      assert.equal(query.searchParams.get("url"), "https://example.org/path");
      const strategy = query.searchParams.get("strategy");
      if (strategy === "mobile") return new Response(JSON.stringify(data(0.82)), { status: 200 });
      return new Response("rate limited", { status: 429 });
    },
  });
  assert.deepEqual(called.sort(), ["desktop", "mobile"]);
  assert.equal(speed.status, "partial");
  assert.equal(speed.mobile.score, 82);
  assert.equal(speed.desktop.score, null);
});

test("Without an API key both anonymous strategies are still checked, with honest missing scores", async () => {
  const devices = [];
  const speed = await measureWebsiteSpeed("https://example.org/", {
    apiKey: "",
    fetcher: async (uri) => {
      const u = new URL(String(uri));
      assert.equal(u.searchParams.has("key"), false);
      devices.push(u.searchParams.get("strategy"));
      return new Response("quota", { status: 429 });
    },
  });
  assert.deepEqual(devices.sort(), ["desktop", "mobile"]);
  assert.equal(speed.status, "unavailable");
  assert.equal(speed.mobile.score, null);
  assert.equal(speed.desktop.score, null);
  assert.match(speed.mobile.reason, /API-sleutel|limiet/i);
});


test("Public free scan displays PageSpeed from the shared scan response (mobile and desktop)", async () => {
  const { readFile } = await import("node:fs/promises");
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const scanRoute = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const fullReport = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../components/speed-audit.tsx", import.meta.url), "utf8");
  assert.match(home, /<SpeedAudit locale=\{language\} speed=\{result\.websiteSpeed\}/);
  assert.match(scanRoute, /websiteSpeed = response\.status === 200 \? await measureWebsiteSpeed\(finalUrl\.toString\(\)\)/);
  assert.match(card, /value=\{speed\?\.mobile\}/);
  assert.match(card, /value=\{speed\?\.desktop\}/);
  assert.match(fullReport, /r\.websiteSpeed\?\.\[device\]/);
});
