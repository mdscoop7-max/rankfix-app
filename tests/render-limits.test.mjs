import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { claimRender, createRenderBudget, hardenedServerlessArgs, launchSourceFor } from "../lib/render-limits.ts";
import { renderFailureCode, renderFailureText } from "../lib/report-quality.ts";

test("a scan has a bounded number of renders and a render deadline", () => {
  const budget = createRenderBudget(2, 60_000, 1_000);
  claimRender(budget, 2_000);
  claimRender(budget, 3_000);
  assert.throws(() => claimRender(budget, 4_000), /RENDER_BUDGET_EXHAUSTED/);
  const late = createRenderBudget(5, 10_000, 0);
  assert.throws(() => claimRender(late, 10_000), /RENDER_DEADLINE_REACHED/);
  assert.equal(late.remaining, 5, "a refused render does not consume budget");
  // No budget (other callers) keeps the old unbounded behaviour.
  assert.doesNotThrow(() => claimRender(undefined));
});

test("budget refusals become a readable report reason, not an error", () => {
  assert.equal(renderFailureCode(new Error("RENDER_BUDGET_EXHAUSTED")), "RENDER_LIMIT_REACHED");
  assert.equal(renderFailureCode(new Error("RENDER_DEADLINE_REACHED")), "RENDER_LIMIT_REACHED");
  assert.equal(renderFailureCode(new Error("BROWSER_UNAVAILABLE: recent launch failure")), "BROWSER_UNAVAILABLE");
  assert.match(renderFailureText("RENDER_LIMIT_REACHED"), /tijds- en geheugenlimiet/);
});

test("Vercel and Lambda use serverless Chromium; an explicit executable wins", () => {
  assert.equal(launchSourceFor({ VERCEL: "1" }), "serverless");
  assert.equal(launchSourceFor({ AWS_LAMBDA_FUNCTION_NAME: "x" }), "serverless");
  assert.equal(launchSourceFor({ RANKFIX_SERVERLESS_CHROMIUM: "1" }), "serverless");
  assert.equal(launchSourceFor({ VERCEL: "1", PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium" }), "executable");
  assert.equal(launchSourceFor({}), "local");
});

test("serverless Chromium flags are hardened", () => {
  const sparticuz = ["--no-sandbox", "--single-process", "--disable-web-security", "--allow-running-insecure-content", "--no-zygote", "--headless='shell'"];
  assert.deepEqual(hardenedServerlessArgs(sparticuz, false), ["--no-sandbox", "--no-zygote", "--headless='shell'"]);
  // Single-process fallback keeps only --single-process, never the web-security flags.
  assert.deepEqual(hardenedServerlessArgs(sparticuz, true), ["--no-sandbox", "--single-process", "--no-zygote", "--headless='shell'"]);
});

test("render wiring: puppeteer-core in production, Chromium traced, scan bounded", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.dependencies["@sparticuz/chromium"]);
  assert.ok(pkg.dependencies["puppeteer-core"]);
  assert.equal(pkg.dependencies.puppeteer, undefined, "full puppeteer (170 MB Chrome) is dev-only");
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /"\/api\/scan": \["\.\/node_modules\/@sparticuz\/chromium\/bin\/\*\*"\]/);
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /export const maxDuration = 300;/);
  assert.match(route, /const renderBudget = createRenderBudget\(\);/);
  // Every render in the scan uses the budget.
  const calls = [...route.matchAll(/renderPublicPage\(([^;]*)\);/g)].map((m) => m[1]);
  assert.ok(calls.length >= 6);
  assert.ok(calls.every((args) => /renderBudget\)?$/.test(args.trim())), calls.join("\n"));
  const render = await readFile(new URL("../lib/headless-render.ts", import.meta.url), "utf8");
  // Security filter stays: public HTTP(S) only, DNS checked, heavy resources aborted.
  assert.match(render, /validatePublicHttpUrl\(req\.url\(\)\)/);
  assert.match(render, /await assertPublicDns\(requestUrl\.hostname\)/);
  assert.match(render, /const ALLOWED = new Set\(\["document", "script", "stylesheet", "xhr", "fetch"\]\)/);
  assert.match(render, /createBrowserContext\(\)/);
});
