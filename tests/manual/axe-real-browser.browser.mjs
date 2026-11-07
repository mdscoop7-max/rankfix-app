// Real-browser check of the axe-core rule run used by lib/headless-render.ts.
// Same libraries the scanner uses: puppeteer-core + axe-core, injected with
// page.evaluate(axeCore.source), then the rule run with page.evaluate(AXE_RUN_SCRIPT).
//
// Also reproduces the QA 144 failure mode ("t is not defined"): a function
// whose compiled body calls a module-scope helper works in Node but throws in
// the page, because page.evaluate(fn) only sends fn.toString().
//
// Run: CHROME_EXECUTABLE_PATH=/path/to/chrome node --experimental-strip-types tests/manual/axe-real-browser.browser.mjs
import http from "node:http";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";
import { AXE_RUN_SCRIPT } from "../../lib/axe-script.ts";

const executablePath = process.env.CHROME_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
if (!executablePath) throw new Error("Set CHROME_EXECUTABLE_PATH");

// Known violations: image without alt, button without name, input without label,
// missing <html lang>. Plus one passing control.
const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Axe test</title></head><body>
<main><h1>Test</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<button></button><input type="text" name="q"><label for="ok">Naam</label><input id="ok" type="text"></main></body></html>`;
const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(HTML); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const results = {};
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(axeCore.source);
  results.version = await page.evaluate("window.axe && window.axe.version");

  // 1. The new path (string script).
  const report = await page.evaluate(AXE_RUN_SCRIPT);
  results.newPath = report;
  assert.equal(report.scope, "hydrated_wcag_a_aa");
  const ids = report.violations.map((v) => v.id).sort();
  for (const id of ["button-name", "html-has-lang", "image-alt", "label"]) assert.ok(ids.includes(id), `expected violation ${id}, got ${ids.join(",")}`);
  assert.ok(report.passes > 0);

  // 2. Failure mode: a function that references a helper outside its own body
  //    (what a bundler's helper injection produces) throws "<name> is not defined".
  const t = (value) => value; // stands in for a minified module-scope helper
  const bundledLike = async () => { const axe = window.axe; const r = await axe.run(document, {}); return t(r.violations.length); };
  let oldError = null;
  try { await page.evaluate(bundledLike); } catch (error) { oldError = String(error?.message || error); }
  results.functionWithOuterHelper = oldError;
  assert.match(oldError || "", /t is not defined/);
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(results, null, 1));
console.log("AXE_REAL_BROWSER_OK");
