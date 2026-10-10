// JavaScript rendering safety: availability, circuit breaker, deadlines, concurrency,
// SSRF interception and process cleanup. A fake browser is injected, so these tests
// run without Chromium (as on Vercel serverless).
import test from "node:test";
import assert from "node:assert/strict";
import { renderPublicPage, headlessStatus, __setHeadlessLauncherForTests } from "../lib/headless-render.ts";

const TARGET = "http://93.184.215.14/"; // public IP literal: no DNS needed in the test sandbox

function fakeBrowser({ html = "<html><head><title>Rendered</title></head><body>JS content</body></html>", gotoDelayMs = 0, hang = false, peerIp = "93.184.215.14", requests = [] } = {}) {
  const calls = { closed: 0, killed: 0, aborted: [], continued: [] };
  const handlers = { request: [], response: [] };
  const page = {
    async setUserAgent() {}, async setRequestInterception() {},
    on(event, handler) { handlers[event].push(handler); },
    setDefaultNavigationTimeout() {},
    async goto() {
      if (hang) await new Promise(() => {});
      if (gotoDelayMs) await new Promise(resolve => setTimeout(resolve, gotoDelayMs));
      for (const req of requests) {
        const request = { url: () => req.url, resourceType: () => req.type, abort: async () => { calls.aborted.push(req.url); }, continue: async () => { calls.continued.push(req.url); } };
        handlers.request.forEach(handler => handler(request));
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      handlers.response.forEach(handler => handler({ remoteAddress: () => ({ ip: peerIp }) }));
      return { remoteAddress: () => ({ ip: peerIp }) };
    },
    async waitForNetworkIdle() {},
    url: () => TARGET,
    async content() { return html; },
  };
  const browser = {
    async newPage() { return page; },
    async close() { calls.closed += 1; },
    process: () => ({ kill: () => { calls.killed += 1; return true; } }),
  };
  return { browser, calls };
}

test.afterEach(() => {
  delete process.env.RANKFIX_HEADLESS;
  delete process.env.VERCEL;
  delete process.env.RANKFIX_HEADLESS_CONCURRENCY;
  __setHeadlessLauncherForTests(null);
});

test("rendering can be disabled by configuration and fails fast", async () => {
  process.env.RANKFIX_HEADLESS = "off";
  await assert.rejects(renderPublicPage(TARGET), /HEADLESS_DISABLED/);
  assert.equal(headlessStatus().enabled, false);
});

test("serverless without a Chromium build reports HEADLESS_UNAVAILABLE immediately (no launch attempt)", async () => {
  __setHeadlessLauncherForTests(null);
  process.env.VERCEL = "1";
  const started = Date.now();
  await assert.rejects(renderPublicPage(TARGET), /HEADLESS_UNAVAILABLE/);
  assert.ok(Date.now() - started < 200);
  assert.equal(headlessStatus().reason, "serverless_without_chromium");
});

test("a missing Chromium trips the circuit breaker so later pages skip rendering", async () => {
  let launches = 0;
  __setHeadlessLauncherForTests(async () => { launches += 1; throw new Error("Could not find Chrome (ver. 140). This can occur if ..."); });
  await assert.rejects(renderPublicPage(TARGET), /HEADLESS_UNAVAILABLE/);
  await assert.rejects(renderPublicPage(TARGET), /HEADLESS_UNAVAILABLE/);
  assert.equal(launches, 1, "second render does not relaunch");
  assert.equal(headlessStatus().available, false);
});

test("successful render returns HTML and always closes the browser", async () => {
  const fake = fakeBrowser();
  __setHeadlessLauncherForTests(async () => fake.browser);
  const page = await renderPublicPage(TARGET, 2000);
  assert.match(page.html, /Rendered/);
  assert.equal(fake.calls.closed, 1);
  assert.equal(headlessStatus().available, true);
  assert.equal(headlessStatus().active, 0);
});

test("requests to internal addresses, non-http schemes and heavy resources are aborted", async () => {
  const fake = fakeBrowser({ requests: [
    { url: "http://127.0.0.1:8080/admin", type: "xhr" },
    { url: "http://169.254.169.254/latest/meta-data/", type: "fetch" },
    { url: "file:///etc/passwd", type: "document" },
    { url: "http://93.184.215.14/image.jpg", type: "image" },
    { url: "http://93.184.215.14/app.js", type: "script" },
  ] });
  __setHeadlessLauncherForTests(async () => fake.browser);
  await renderPublicPage(TARGET, 2000);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(fake.calls.continued, ["http://93.184.215.14/app.js"]);
  assert.equal(fake.calls.aborted.length, 4);
});

test("a response served from an internal address discards the whole render (browser DNS rebinding guard)", async () => {
  const fake = fakeBrowser({ peerIp: "10.0.0.8" });
  __setHeadlessLauncherForTests(async () => fake.browser);
  await assert.rejects(renderPublicPage(TARGET, 2000), /HEADLESS_BLOCKED_ADDRESS/);
  assert.equal(fake.calls.closed, 1);
});

test("a hanging page hits the hard deadline, the browser process is killed and the slot is released", async () => {
  const fake = fakeBrowser({ hang: true });
  __setHeadlessLauncherForTests(async () => fake.browser);
  const started = Date.now();
  await assert.rejects(renderPublicPage(TARGET, 100, { deadlineMs: 300 }), /HEADLESS_TIMEOUT/);
  assert.ok(Date.now() - started < 2500);
  assert.ok(fake.calls.killed >= 1);
  assert.equal(headlessStatus().active, 0);
});

test("concurrency is bounded per instance; excess renders wait and then fail with HEADLESS_BUSY", async () => {
  process.env.RANKFIX_HEADLESS_CONCURRENCY = "1";
  const slow = fakeBrowser({ gotoDelayMs: 400 });
  __setHeadlessLauncherForTests(async () => slow.browser);
  const first = renderPublicPage(TARGET, 2000);
  await new Promise(resolve => setTimeout(resolve, 20));
  await assert.rejects(renderPublicPage(TARGET, 2000, { queueTimeoutMs: 100 }), /HEADLESS_BUSY/);
  await first;
  const third = await renderPublicPage(TARGET, 2000, { queueTimeoutMs: 1000 });
  assert.match(third.html, /Rendered/);
});

test("render targets are validated before any browser starts", async () => {
  let launches = 0;
  __setHeadlessLauncherForTests(async () => { launches += 1; return fakeBrowser().browser; });
  await assert.rejects(renderPublicPage("http://localhost/"), /URL_HOST_BLOCKED/);
  await assert.rejects(renderPublicPage("http://10.0.0.1/"), /URL_HOST_BLOCKED/);
  assert.equal(launches, 0);
});
