import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderOnce, representativeNeedsJavaScriptRendering } from "../lib/render-strategy.ts";
import { renderFailureCode, renderFailureText } from "../lib/report-quality.ts";

test("one scan uses one browser result even when several quality gates request it", async () => {
  let attempts = 0;
  const once = renderOnce(async () => {
    attempts++;
    await Promise.resolve();
    return { html: "<main>Real content</main>" };
  });
  const [first, second, third] = await Promise.all([once(), once(), once()]);
  assert.equal(attempts, 1);
  assert.strictEqual(first, second);
  assert.strictEqual(second, third);
  assert.strictEqual(await once(), first);
  assert.equal(attempts, 1);
});

test("failed rendering is not relaunched by later fallback gates", async () => {
  let attempts = 0;
  const once = renderOnce(async () => {
    attempts++;
    throw new Error("RENDER_TIMEOUT");
  });
  await assert.rejects(once(), /RENDER_TIMEOUT/);
  await assert.rejects(once(), /RENDER_TIMEOUT/);
  assert.equal(attempts, 1);
});

test("representative JS pages render even with substantive SSR HTML for runtime evidence", () => {
  const needs = representativeNeedsJavaScriptRendering;
  assert.equal(needs({ visibleWords: 30, scriptCount: 9, frameworkSignal: false }), true);
  assert.equal(needs({ visibleWords: 110, scriptCount: 5, frameworkSignal: true }), true);
  assert.equal(needs({ visibleWords: 1100, scriptCount: 20, frameworkSignal: true }), true);
  assert.equal(needs({ visibleWords: 1100, scriptCount: 20, frameworkSignal: true, dynamicEvidenceRelevant: true }), true);
  assert.equal(needs({ visibleWords: 600, scriptCount: 2, frameworkSignal: false }), false);
  assert.equal(needs({ visibleWords: 35, scriptCount: 1, frameworkSignal: false }), false);
});

test("capacity limits and missing Chrome become stable report messages", () => {
  assert.equal(renderFailureCode(new Error("RENDER_BUSY")), "RENDER_BUSY");
  assert.equal(renderFailureCode(new Error("RENDER_CHROME_NOT_INSTALLED")), "BROWSER_UNAVAILABLE");
  assert.equal(renderFailureCode(new Error("RENDER_TIMEOUT")), "RENDER_TIMEOUT");
  assert.match(renderFailureText("RENDER_BUSY"), /capaciteit/);
});

test("scan route reuses a single primary and representative render attempt", async () => {
  const scanner = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const headless = await readFile(new URL("../lib/headless-render.ts", import.meta.url), "utf8");
  assert.equal((scanner.match(/await renderPrimaryOnce\(\)/g) || []).length, 3);
  assert.equal((scanner.match(/await renderRepresentativeOnce\(\)/g) || []).length, 2);
  assert.match(scanner, /representativeNeedsJavaScriptRendering\(/);
  assert.match(scanner, /representativeEvidenceSource !== "rendered_html"/);
  assert.match(headless, /MAX_CONCURRENT_BROWSERS = 2/);
  assert.match(headless, /MAX_QUEUED_BROWSERS = 8/);
  assert.match(headless, /withinTimeout\(page\.content\(\), remaining\(\)\)/);
  assert.doesNotMatch(headless, /setUserAgent\("RankFixBrowser\/1\.0"\)/);
});

test("rendering: blocked images/fonts do not use up the request cap; slow pages are snapshotted; retry gets equal time", async () => {
  const renderer = await readFile(new URL("../lib/headless-render.ts", import.meta.url), "utf8");
  // The resource-type filter runs before the counter: only loaded requests count.
  const handler = renderer.slice(renderer.indexOf('page.on("request"'), renderer.indexOf("page.setDefaultNavigationTimeout"));
  assert.ok(handler.indexOf("!ALLOWED.has(req.resourceType())") < handler.indexOf("requests++"), "filter before count");
  assert.match(handler, /checkHost\(requestUrl\.hostname\)/, "one cached DNS check per host");
  assert.match(renderer, /partialNavigation = true/);
  assert.match(renderer, /remaining\(\) - SNAPSHOT_RESERVE_MS/);
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /\}, 12000, 12000\)\);/);
  assert.match(route, /renderPartial: Boolean\(javascriptExecuted && renderedDocument\?\.partialNavigation\)/);
});
