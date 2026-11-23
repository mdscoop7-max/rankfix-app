import test from "node:test";
import assert from "node:assert/strict";
import { pickSavedScan, readScanJson, sameScanTarget, ScanResponseError } from "../lib/scan-request-client.ts";

const html = (status) => new Response("<!DOCTYPE html><html><body>Bad Gateway</body></html>", { status, headers: { "content-type": "text/html; charset=utf-8" } });

test("an HTML error page is a clear ScanResponseError, never 'Unexpected token <'", async () => {
  for (const status of [502, 503, 404, 200]) {
    await assert.rejects(readScanJson(html(status)), (error) => {
      assert.ok(error instanceof ScanResponseError);
      assert.equal(error.httpStatus, status);
      assert.doesNotMatch(error.message, /Unexpected token|DOCTYPE|JSON/);
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      return true;
    });
  }
});

test("a JSON body is returned unchanged; a broken JSON body is a ScanResponseError", async () => {
  const ok = new Response(JSON.stringify({ success: true, scanId: "abc" }), { headers: { "content-type": "application/json" } });
  assert.deepEqual(await readScanJson(ok), { success: true, scanId: "abc" });
  const err = new Response(JSON.stringify({ error: "Login vereist." }), { status: 401, headers: { "content-type": "application/json" } });
  assert.deepEqual(await readScanJson(err), { error: "Login vereist." });
  const broken = new Response("{\"success\":tr", { headers: { "content-type": "application/json" } });
  await assert.rejects(readScanJson(broken), ScanResponseError);
});

test("saved-scan recovery finds only a new scan of the same page", () => {
  const since = Date.parse("2026-11-23T00:07:31Z");
  assert.equal(sameScanTarget("https://www.nuvemixa.example/", "nuvemixa.example"), true);
  assert.equal(sameScanTarget("https://nuvemixa.example/shop", "https://nuvemixa.example/"), false);
  const history = [
    { id: "old", scanned_url: "https://nuvemixa.example/", created_at: "2026-11-22T23:54:44Z" },
    { id: "other", scanned_url: "https://andere-site.example/", created_at: "2026-11-23T00:07:40Z" },
    { id: "new", scanned_url: "https://nuvemixa.example/", final_url: "https://nuvemixa.example/", created_at: "2026-11-23T00:07:45Z" },
  ];
  assert.equal(pickSavedScan(history, "https://nuvemixa.example", since), "new");
  assert.equal(pickSavedScan(history, "https://elders.example/", since), null);
  assert.equal(pickSavedScan([history[0]], "https://nuvemixa.example/", since), null);
  assert.equal(pickSavedScan(null, "https://nuvemixa.example/", since), null);
});

test("every scan screen reads the answer through readScanJson", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of ["app/dashboard/scan/page.tsx", "app/[locale]/scan/scan-client.tsx", "app/dashboard/page.tsx", "app/dashboard/audit/[id]/page.tsx"]) {
    const src = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.match(src, /readScanJson</, file);
  }
  const dash = await readFile(new URL("../app/dashboard/scan/page.tsx", import.meta.url), "utf8");
  assert.match(dash, /findSavedScan\(normalized,scanStarted\)/);
});
