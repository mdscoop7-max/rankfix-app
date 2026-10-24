import test from "node:test";
import assert from "node:assert/strict";
import { speedFailureMessage } from "../lib/speed-display.ts";
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

test("Explicit anonymous mode checks both devices without retrying shared quota", async () => {
  const devices = [];
  const speed = await measureWebsiteSpeed("https://example.org/", {
    apiKey: "",
    allowAnonymous: true,
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
  assert.equal(speed.mobile.reasonCode, "quota_limited");
});


test("Missing key skips network calls and records an environment configuration issue", async () => {
  const speed = await measureWebsiteSpeed("https://example.org", {
    apiKey: "  ", allowAnonymous: false,
    fetcher: async () => { throw new Error("must not fetch"); },
  });
  assert.equal(speed.status, "unavailable");
  assert.equal(speed.mobile.reasonCode, "not_configured");
  assert.equal(speed.desktop.reasonCode, "not_configured");
});

test("Lighthouse runtime errors invalidate a score and preserve missing metrics", () => {
  const input = data(1);
  input.lighthouseResult.runtimeError = { code: "ERRORED_DOCUMENT_REQUEST" };
  const result = parsePageSpeed(input);
  assert.equal(result.reasonCode, "measurement_failed");
  assert.equal(result.score, null);
  assert.equal(result.lab.lcpMs, null);
});

test("Both devices retry one transient provider failure within the shared deadline", async () => {
  const calls = {};
  const result = await measureWebsiteSpeed("https://example.org", {
    apiKey: " test-key ", wait: async () => {},
    fetcher: async uri => {
      const u = new URL(uri);
      assert.equal(u.searchParams.get("key"), "test-key");
      assert.equal(u.searchParams.get("category"), "performance");
      const device = u.searchParams.get("strategy");
      calls[device] = (calls[device] || 0) + 1;
      return calls[device] === 1 ? new Response("unavailable", {status: 503}) : Response.json(data(0.8));
    },
  });
  assert.equal(result.status, "measured");
  assert.deepEqual(calls, { mobile: 2, desktop: 2 });
  assert.equal(result.mobile.attempts, 2);
});

test("Provider errors are distinguished without leaking keys or raw error text", async () => {
  for (const [status, reason, expected] of [
    [403, "SERVICE_DISABLED", "api_disabled"], [400, "API_KEY_INVALID", "key_rejected"],
    [403, "dailyLimitExceeded", "quota_limited"], [429, "rateLimitExceeded", "quota_limited"],
  ]) {
    const result = await measureWebsiteSpeed("https://example.org", {
      apiKey: "private-test-key",
      fetcher: async () => Response.json({ error: { message: "private-test-key", details: [{reason}] } }, {status}),
    });
    assert.equal(result.mobile.reasonCode, expected);
    assert.equal(result.mobile.attempts, 1);
    assert.doesNotMatch(JSON.stringify(result), /private-test-key/);
  }
});

test("Malformed provider errors retain their HTTP diagnostic", async () => {
  const result = await measureWebsiteSpeed("https://example.org", {
    apiKey: "test", wait: async () => {},
    fetcher: async () => Response.json({error:{errors: "wrong", details:[null, 42]}}, {status:503}),
  });
  assert.equal(result.mobile.reasonCode, "provider_unavailable");
  assert.equal(result.mobile.httpStatus, 503);
  assert.equal(result.mobile.attempts, 2);
});

test("Quota retries require a configured key and an explicit short Retry-After", async () => {
  for (const [header, reason, expectedAttempts] of [["0", "rateLimitExceeded", 2], ["9", "rateLimitExceeded", 1], ["0", "dailyLimitExceeded", 1]]) {
    const result = await measureWebsiteSpeed("https://example.org", {
      apiKey: "test", wait: async () => {},
      fetcher: async () => Response.json({error:{errors:[{reason}]}}, {status:429, headers:{"Retry-After":header}}),
    });
    assert.equal(result.mobile.attempts, expectedAttempts);
    assert.equal(result.desktop.attempts, expectedAttempts);
    assert.equal(result.mobile.score, null);
  }
});

test("Retries do not reset the scan deadline", async () => {
  let clock = 0;
  let calls = 0;
  const result = await measureWebsiteSpeed("https://example.org", {
    apiKey: "test", timeoutMs:2000, now: () => clock,
    wait: async () => { clock = 2001; },
    fetcher: async () => { calls++; return new Response("busy", {status:503}); },
  });
  assert.equal(calls, 2);
  assert.equal(result.mobile.reasonCode, "timeout");
  assert.equal(result.desktop.reasonCode, "provider_unavailable");
});

test("Insufficient route budget skips measurements and invalid URLs never reach Google", async () => {
  for (const [url, timeoutMs, expected] of [["https://example.org",0,"scan_budget_exhausted"], ["file:///etc/passwd",45000,"invalid_url"], ["https://user:pass@example.org",45000,"invalid_url"]]) {
    const result = await measureWebsiteSpeed(url, {apiKey:"test",timeoutMs,fetcher:async()=>{throw Error("must not fetch");}});
    assert.equal(result.mobile.reasonCode, expected);
  }
});

test("One timed-out device cannot erase the other device's real score", async () => {
  const result = await measureWebsiteSpeed("https://example.org", {
    apiKey:"test", fetcher:async uri => {
      if (new URL(uri).searchParams.get("strategy") === "mobile") throw new DOMException("late", "TimeoutError");
      return Response.json(data(1));
    },
  });
  assert.equal(result.status, "partial");
  assert.equal(result.mobile.reasonCode, "timeout");
  assert.equal(result.desktop.score, 100);
});

test("Invalid successful responses and transport failures cannot become scores", async () => {
  for (const fetcher of [async()=>new Response("not-json"), async()=>Response.json({}), async()=>{throw Error("secret-provider-address");}]) {
    const result = await measureWebsiteSpeed("https://example.org", {apiKey:"test",fetcher});
    assert.equal(result.mobile.score, null);
    assert.equal(result.desktop.score, null);
    assert.doesNotMatch(JSON.stringify(result), /secret-provider-address/);
  }
});


test("All six interface languages explain failures and saved legacy reports safely", () => {
  const setup = new Set();
  for (const locale of ["nl", "en", "de", "fr", "it", "es"]) {
    const text = speedFailureMessage({reason:null, reasonCode:"not_configured"}, locale);
    setup.add(text);
    assert.equal(speedFailureMessage({reason:"Anonieme PageSpeed-meting beperkt: API-sleutel nodig of limiet bereikt"},locale),text);
    assert.doesNotMatch(text, /API-sleutel|API-key/);
    assert.notEqual(speedFailureMessage({reason:null,reasonCode:"quota_limited"},locale),text);
    assert.notEqual(speedFailureMessage({reason:null,reasonCode:"timeout"},locale),text);
  }
  assert.equal(setup.size,6);
});


test("CrUX p75 LCP, CLS and INP are shown separately from lab values and labeled by scope", () => {
  const fixture = data(0.85, 180);
  fixture.loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS = {percentile:3200};
  fixture.loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE = {percentile:9};
  const result = parsePageSpeed(fixture);
  assert.deepEqual(result.field, {inpMs:180,lcpMs:3200,cls:0.09,scope:"url"});
  assert.equal(result.lab.lcpMs,1800);
  assert.equal(result.lab.cls,0.03);
  fixture.loadingExperience.origin_fallback = true;
  assert.equal(parsePageSpeed(fixture).field.scope,"origin");
  fixture.loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile = 0;
  assert.equal(parsePageSpeed(fixture).field.cls,0);
});

test("Insufficient real-user data does not become a fictitious success", () => {
  const result = parsePageSpeed(data(1));
  assert.equal(result.field.lcpMs,null);
  assert.equal(result.field.cls,null);
  assert.equal(result.field.inpMs,null);
  assert.equal(result.field.scope,null);
  assert.deepEqual(result.advice,[]);
});

test("Only failed Lighthouse image, script and layout audits produce grounded advice", () => {
  const fixture = data(0.7);
  fixture.lighthouseResult.audits["uses-optimized-images"]={score:0.2,details:{items:[{url:"https://example.org/hero.webp?token=private#secret"}]}};
  fixture.lighthouseResult.audits["unused-javascript"]={score:0.3,details:{items:[{url:"https://cdn.example.net/app.js?key=secret"}]}};
  fixture.lighthouseResult.audits["layout-shift-elements"]={score:0,details:{items:[{node:{selector:".hero img"}}]}};
  const advice = parsePageSpeed(fixture).advice;
  assert.deepEqual(advice.map(a=>a.kind),["images","scripts","layout"]);
  assert.deepEqual(advice.map(a=>a.target),["example.org/hero.webp","cdn.example.net/app.js",".hero img"]);
  assert.doesNotMatch(JSON.stringify(advice),/secret|private/);
  fixture.lighthouseResult.audits["uses-optimized-images"].score=1;
  assert.equal(parsePageSpeed(fixture).advice.filter(a=>a.kind==="images").length,0);
});


test("CrUX origin-only fallback is used honestly and labeled origin", () => {
  const fixture = data(0.99);
  fixture.originLoadingExperience = {metrics:{
    LARGEST_CONTENTFUL_PAINT_MS:{percentile:1800},
    CUMULATIVE_LAYOUT_SHIFT_SCORE:{percentile:12},
    INTERACTION_TO_NEXT_PAINT:{percentile:210},
  }};
  const result = parsePageSpeed(fixture);
  assert.deepEqual(result.field,{inpMs:210,lcpMs:1800,cls:0.12,scope:"origin"});
});
