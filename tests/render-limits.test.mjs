import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { claimRender, createRenderBudget, hardenedServerlessArgs, launchSourceFor } from "../lib/render-limits.ts";
import { renderFailureCode, renderFailureText } from "../lib/report-quality.ts";

test("render budget limits the page count and deadline", () => {
  const budget=createRenderBudget(2,60000,1000);
  claimRender(budget,2000);
  claimRender(budget,3000);
  assert.throws(()=>claimRender(budget,4000),/RENDER_BUDGET_EXHAUSTED/);
  const expired=createRenderBudget(5,10000,0);
  assert.throws(()=>claimRender(expired,10000),/RENDER_DEADLINE_REACHED/);
  assert.equal(expired.remaining,5);
});
test("renderer failures are safe and informative", () => {
  assert.equal(renderFailureCode(new Error("BROWSER_UNAVAILABLE: recent launch failure")),"BROWSER_UNAVAILABLE");
  assert.equal(renderFailureCode(new Error("RENDER_BUDGET_EXHAUSTED")),"RENDER_LIMIT_REACHED");
  assert.equal(renderFailureCode(new Error("RENDER_DEADLINE_REACHED")),"RENDER_LIMIT_REACHED");
  assert.match(renderFailureText("RENDER_LIMIT_REACHED"),/tijd[s-].*geheugenlimiet/);
});
test("Vercel uses serverless Chromium and drops unsafe web-security flags",()=>{
  assert.equal(launchSourceFor({VERCEL:"1"}),"serverless");
  assert.equal(launchSourceFor({}),"local");
  assert.equal(launchSourceFor({VERCEL:"1",PUPPETEER_EXECUTABLE_PATH:"/usr/bin/chromium"}),"executable");
  assert.deepEqual(hardenedServerlessArgs(["--single-process","--disable-web-security","--allow-running-insecure-content","--no-zygote"],false),["--no-zygote"]);
});
test("scan routing enforces a bounded serverless browser",async()=>{
  const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
  assert.ok(pkg.dependencies["@sparticuz/chromium"]);
  assert.ok(pkg.dependencies["puppeteer-core"]);
  assert.equal(pkg.dependencies.puppeteer,undefined);
  const config=await readFile(new URL("../next.config.ts",import.meta.url),"utf8");
  assert.match(config,/outputFileTracingIncludes/);
  const route=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.match(route,/export const maxDuration = 300;/);
  assert.match(route,/const renderBudget = createRenderBudget\(\);/);
  const calls=[...route.matchAll(/renderPublicPage\(([^;]*)\);/g)].map(m=>m[1]);
  assert.equal(calls.length,6);
  assert.ok(calls.every(args=>/renderBudget$/.test(args.trim())));
});
