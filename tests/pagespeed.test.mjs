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

test("No key means unavailable, without a provider request or SEO score changes", async () => {
  const speed = await measureWebsiteSpeed("https://example.org/", {
    apiKey: "",
    fetcher: async () => { throw new Error("must not call"); },
  });
  assert.equal(speed.status, "unavailable");
  assert.equal(speed.mobile.score, null);
  assert.equal(speed.desktop.score, null);
});
