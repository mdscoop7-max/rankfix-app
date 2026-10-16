import test from "node:test";
import assert from "node:assert/strict";
import { classifyScanOutcome, effectiveCategory, fetchFailureCode } from "../lib/scan-attempts.ts";
import { readResponseTextLimited } from "../lib/safe-fetch.ts";

test("failed scans get a stable cause category", () => {
  assert.equal(classifyScanOutcome(200, null), "success");
  assert.equal(classifyScanOutcome(403, "WEBSITE_LIMIT"), "quota");
  assert.equal(classifyScanOutcome(429, "SCAN_LIMIT"), "quota");
  assert.equal(classifyScanOutcome(429, "PUBLIC_SCAN_RATE_LIMIT"), "quota");
  assert.equal(classifyScanOutcome(429, "SITE_RATE_LIMITED"), "site_blocked");
  assert.equal(classifyScanOutcome(422, "HTTP_BLOCKED"), "site_blocked");
  assert.equal(classifyScanOutcome(422, "CHALLENGE_OR_INTERSTITIAL"), "site_blocked");
  assert.equal(classifyScanOutcome(422, "HTTP_NOT_FOUND"), "site_unavailable");
  assert.equal(classifyScanOutcome(502, "FETCH_TIMEOUT"), "network");
  assert.equal(classifyScanOutcome(502, "REDIRECT_LIMIT"), "network");
  assert.equal(classifyScanOutcome(500, "SCAN_HISTORY_SAVE_FAILED"), "save_failed");
  assert.equal(classifyScanOutcome(500, "SCAN_INTERNAL_ERROR"), "engine_error");
  assert.equal(classifyScanOutcome(400, "INVALID_URL"), "input");
});

test("network errors map to codes without leaking messages", () => {
  const abort = new Error("This operation was aborted"); abort.name = "AbortError";
  assert.equal(fetchFailureCode(abort), "FETCH_TIMEOUT");
  assert.equal(fetchFailureCode(Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } })), "FETCH_DNS");
  assert.equal(fetchFailureCode(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } })), "FETCH_CONNECTION");
  assert.equal(fetchFailureCode(Object.assign(new Error("fetch failed"), { cause: { code: "CERT_HAS_EXPIRED" } })), "FETCH_TLS");
  assert.equal(fetchFailureCode(new Error("REDIRECT_LIMIT")), "REDIRECT_LIMIT");
  assert.equal(fetchFailureCode(new Error("BODY_TIMEOUT")), "BODY_TIMEOUT");
});

test("an attempt that never finished is a function timeout", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(effectiveCategory({ outcome: "running", created_at: "2026-10-17T11:50:00Z" }, 300, now), "function_timeout");
  assert.equal(effectiveCategory({ outcome: "running", created_at: "2026-10-17T11:59:00Z" }, 300, now), "running");
  assert.equal(effectiveCategory({ outcome: "failed", category: "network" }, 300, now), "network");
});

test("a body that never ends is cut off (BODY_TIMEOUT) instead of hanging the scan", async () => {
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("<html>")); } });
  const t0 = Date.now();
  await assert.rejects(readResponseTextLimited(new Response(stream), 1_000_000, 150), /BODY_TIMEOUT/);
  assert.ok(Date.now() - t0 < 2000);
});
