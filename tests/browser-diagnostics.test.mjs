import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerHooks } from "node:module";
import { compareBrowserUrls, browserRequestFailure, createBrowserDiagnostics } from "../lib/browser-diagnostics.ts";
import { structuredDataAbsence, validJsonLdBlockTexts } from "../lib/structured-data-evidence.ts";

const root = "https://shop.test/";
const failure = (errorText, extra = {}) => browserRequestFailure({ url: "https://metrics.test/collect", resourceType: "fetch", errorText, ...extra }, root);

test("browser failures retain the URL, resource, browser code and only supported causes", () => {
  for (const [code, category] of [["ERR_BLOCKED_BY_CLIENT", "blocked"], ["ERR_BLOCKED_BY_RESPONSE", "blocked"], ["ERR_ABORTED", "cancelled"], ["ERR_CONNECTION_RESET", "network_error"], ["ERR_NAME_NOT_RESOLVED", "network_error"], ["ERR_CERT_AUTHORITY_INVALID", "network_error"], ["ERR_TIMED_OUT", "timeout"], ["ERR_CONNECTION_TIMED_OUT", "timeout"], ["ERR_FAILED", "unknown"]]) {
    const d = failure(`net::${code}`);
    assert.equal(d.errorCode, code);
    assert.equal(d.category, category);
    assert.equal(d.url, "https://metrics.test/collect");
    assert.equal(d.resourceType, "fetch");
    assert.equal(d.sameSite, false);
    assert.equal(d.tracking, "unconfirmed");
  }
  assert.match(failure("net::ERR_BLOCKED_BY_CLIENT").cause, /tracking_unconfirmed/);
  assert.equal(failure(null).errorCode, null);
  assert.equal(failure("unknown browser message").category, "unknown");
  assert.equal(failure("net::ERR_ABORTED").cause, "browser_cancelled");
  for (const abortCause of ["request_cap", "public_url_guard", "interception_error"]) {
    assert.equal(failure("net::ERR_FAILED", { abortCause }).cause, abortCause);
    assert.equal(failure("net::ERR_FAILED", { abortCause }).category, "scanner_blocked");
  }
});

test("www redirects and HTTPS upgrades are distinguishable from another page, query or site", () => {
  for (const [a, b] of [["http://shop.test/", "https://www.shop.test/"], ["https://www.shop.test/", root]]) {
    const d = compareBrowserUrls(a, b);
    assert.equal(d.sameSite, true);
    assert.equal(d.comparableDocument, true);
    assert.equal(d.wwwChanged, true);
  }
  assert.equal(compareBrowserUrls("http://shop.test/", root).protocolChanged, true);
  assert.equal(compareBrowserUrls(root, root + "#details").comparableDocument, true);
  for (const url of [root + "login", root + "?view=other", "https://other.test/", "https://shop.test.evil.test/", "https://sub.shop.test/", "https://shop.test:444/"]) {
    assert.equal(compareBrowserUrls(root, url).comparableDocument, false, url);
  }
  assert.equal(compareBrowserUrls(root, root + "login").pathChanged, true);
  assert.equal(compareBrowserUrls(root, root + "?view=other").queryChanged, true);
});

test("diagnostics bound storage but keep complete counts; snapshots cannot grow during browser close", () => {
  const d = createBrowserDiagnostics(root);
  for (let i = 0; i < 65; i++) d.failed({ url: root + i, resourceType: "script", errorText: "net::ERR_CONNECTION_RESET" });
  for (let i = 0; i < 24; i++) d.redirected(root, root + i, 302);
  d.filtered();
  const snapshot = d.snapshot(root);
  d.failed({ url: root, resourceType: "fetch" });
  assert.equal(snapshot.requestFailures.length, 50);
  assert.equal(snapshot.failuresTruncated, 15);
  assert.equal(snapshot.failureCounts.network_error, 65);
  assert.equal(snapshot.failureCounts.unknown, 0);
  assert.equal(snapshot.redirects.length, 20);
  assert.equal(snapshot.redirectsTruncated, 4);
  assert.equal(snapshot.filteredRequests, 1);
});

test("a later empty window or request failures cannot erase five valid JSON-LD blocks", () => {
  const short = Array.from({ length: 5 }, (_, i) => `<script type="application/ld+json">{"@type":"Thing","name":"${i}"}</script>`).join("");
  const positive = validJsonLdBlockTexts(short);
  assert.equal(positive.length, 5);
  assert.equal(validJsonLdBlockTexts("<html>later empty view</html>").length, 0);
  assert.equal(structuredDataAbsence({ validJsonLd: positive.length, rendered: false, renderedIncomplete: true, clientRenderedRisk: true, injectors: [] }).observation, "present");
  assert.equal(structuredDataAbsence({ validJsonLd: 0, rendered: false, renderedIncomplete: true, clientRenderedRisk: false, injectors: [] }).observation, "not_observed");
});

// Exercise the real renderer's event handlers, without Chromium, DNS or websites.
// Only its browser transport and public-DNS lookup are replaced.
test("real renderer records redirects, failures, scanner aborts and navigation timeout", async () => {
  const rendererUrl = new URL("../lib/headless-render.ts", import.meta.url).href;
  const safeUrl = new URL("../lib/safe-fetch.ts", import.meta.url).href;
  const hooks = registerHooks({
    resolve(spec, ctx, next) {
      if (ctx.parentURL === rendererUrl && spec === "@/lib/safe-fetch") return { url: safeUrl, shortCircuit: true };
      if (ctx.parentURL === rendererUrl && spec === "@/lib/render-limits") return { url: new URL("../lib/render-limits.ts", import.meta.url).href, shortCircuit: true };
      if (spec === "puppeteer-core") return { url: "data:text/javascript,export default globalThis.__RF_DIAGNOSTIC_BROWSER", shortCircuit: true };
      return next(spec, ctx);
    },
    load(url, ctx, next) {
      if (url === safeUrl) return { format: "module", source: `export function validatePublicHttpUrl(v){const u=new URL(v);if(u.hostname==='private.test')throw new Error('URL_DNS_BLOCKED');return u} export async function assertPublicDns(){}`, shortCircuit: true };
      return next(url, ctx);
    },
  });
  const saved = { executable: process.env.PUPPETEER_EXECUTABLE_PATH, vercel: process.env.VERCEL };
  process.env.PUPPETEER_EXECUTABLE_PATH = process.execPath;
  delete process.env.VERCEL;
  let closed = 0, navigationTimeout = false;
  const frame = {};
  class Page extends EventEmitter {
    async setUserAgent() {} async setRequestInterception() {} setDefaultNavigationTimeout() {}
    mainFrame() { return frame; } url() { return "https://www.shop.test/"; }
    async goto() {
      const request = (type, url, code = null) => {
        const req = { resourceType: () => type, url: () => url, failure: () => code ? { errorText: code } : null,
          continue: async () => {}, abort: async () => { code = "net::ERR_FAILED"; this.emit("requestfailed", req); } };
        this.emit("request", req);
        return req;
      };
      for (let i = 0; i < 180; i++) request("image", root + i + ".jpg");
      const cases = [["fetch", "ERR_BLOCKED_BY_CLIENT"], ["xhr", "ERR_ABORTED"], ["script", "ERR_NAME_NOT_RESOLVED"], ["fetch", "ERR_TIMED_OUT"]];
      for (const [type, code] of cases) {
        const req = request(type, "https://metrics.test/" + code, "net::" + code);
        this.emit("requestfailed", req);
      }
      request("script", "https://private.test/app.js");
      for (let i = 0; i < 150; i++) request("script", root + i + ".js");
      const response = (from, to, status, top = true) => this.emit("response", {
        request: () => ({ isNavigationRequest: () => true, frame: () => top ? frame : {} }),
        status: () => status, url: () => from, headers: () => ({ location: to }),
      });
      response(root, "https://www.shop.test/", 301);
      response("https://iframe.test/", "/other", 302, false);
      await new Promise(resolve => setImmediate(resolve));
      if (navigationTimeout === "fatal") throw new Error("net::ERR_NAME_NOT_RESOLVED");
      if (navigationTimeout) throw new Error("Navigation timeout exceeded");
    }
    async waitForNetworkIdle() {} async content() { return "<html><head><title>Shop</title></head><body>Content</body></html>"; }
    async evaluate() { return { titlePixelWidth: 30, domAccessibility: null }; }
  }
  globalThis.__RF_DIAGNOSTIC_BROWSER = { launch: async () => ({ userAgent: async () => "Chrome", newPage: async () => new Page(), close: async () => { closed++; } }) };
  try {
    const { renderPublicPage } = await import(rendererUrl);
    for (const partial of [false, true]) {
      navigationTimeout = partial;
      const page = await renderPublicPage(root, 12000, undefined, { mode: "structured_data", settleMs: 0 });
      const d = page.diagnostics;
      assert.equal(d.requestedUrl, root);
      assert.equal(d.finalUrl, "https://www.shop.test/");
      assert.equal(d.urlComparison.wwwChanged, true);
      assert.deepEqual(d.redirects, [{ from: root, to: "https://www.shop.test/", status: 301 }]);
      assert.equal(d.filteredRequests, 180);
      assert.deepEqual(d.failureCounts, { blocked: 1, cancelled: 1, network_error: 1, timeout: 1, scanner_blocked: 6, unknown: 0 });
      assert.equal(page.observation.failedRequests, 10);
      assert.equal(page.observation.abortedRequests, 5);
      assert.equal(d.requestFailures.find(x => x.url.includes("private.test")).cause, "public_url_guard");
      assert.equal(d.requestFailures.find(x => x.url.includes("private.test")).interceptionError, "URL_DNS_BLOCKED");
      assert.equal(Boolean(d.navigationError), partial);
      assert.equal(page.observation.loadReached, !partial);
      assert.equal(page.partialNavigation || false, partial);
    }
    navigationTimeout = false;
    const defaultPage = await renderPublicPage(root, 12000);
    assert.equal(defaultPage.observation, undefined);
    assert.equal(defaultPage.diagnostics.failureCounts.blocked, 1);
    assert.equal(defaultPage.diagnostics.failureCounts.scanner_blocked, 66);
    assert.equal(defaultPage.diagnostics.failuresTruncated, 20);
    navigationTimeout = "fatal";
    await assert.rejects(renderPublicPage(root, 12000, undefined, { mode: "structured_data" }), error => {
      assert.match(error.message, /ERR_NAME_NOT_RESOLVED/);
      assert.equal(error.browserDiagnostics.requestFailures.length, 10);
      assert.equal(error.browserDiagnostics.navigationError.category, "other");
      return true;
    });
    assert.equal(closed, 4);
  } finally {
    hooks.deregister();
    delete globalThis.__RF_DIAGNOSTIC_BROWSER;
    if (saved.executable === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH; else process.env.PUPPETEER_EXECUTABLE_PATH = saved.executable;
    if (saved.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = saved.vercel;
  }
});
