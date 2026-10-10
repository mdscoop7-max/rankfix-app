// Health Guard / monitoring: only real downtime alerts the customer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decideMonitorOutcome } from "../lib/monitor-outcome.ts";
import { classifyHttpStatus, classifyFetchError } from "../lib/scan-failure.ts";
import { SafeFetchError } from "../lib/safe-fetch.ts";

// Mirrors the status mapping in app/api/internal/monitor/run/route.ts.
const statusFor = (httpStatus) => {
  const failure = classifyHttpStatus(httpStatus);
  return failure ? (failure.category === "access_blocked" ? "SCANNER_BLOCKED" : failure.category === "temporary" ? "TEMPORARY" : "HTTP_ERROR") : "OK";
};

test("a 403/401/451 that only affects RankFix is never reported as downtime", () => {
  for (const code of [401, 403, 405, 451, 999]) {
    assert.equal(statusFor(code), "SCANNER_BLOCKED");
    assert.equal(decideMonitorOutcome({ status: "SCANNER_BLOCKED", previousStatus: "OK", previousConsecutiveFailures: 0 }).becameUnavailable, false);
  }
});

test("a single temporary failure (429/503/timeout) does not alert; a second consecutive one alerts once", () => {
  assert.equal(statusFor(429), "TEMPORARY");
  assert.equal(statusFor(503), "TEMPORARY");
  const first = decideMonitorOutcome({ status: "TEMPORARY", previousStatus: "OK", previousConsecutiveFailures: 0 });
  assert.equal(first.becameUnavailable, false);
  const second = decideMonitorOutcome({ status: "TEMPORARY", previousStatus: "TEMPORARY", previousConsecutiveFailures: 1 });
  assert.equal(second.becameUnavailable, true);
  const third = decideMonitorOutcome({ status: "TEMPORARY", previousStatus: "TEMPORARY", previousConsecutiveFailures: 2 });
  assert.equal(third.becameUnavailable, false, "no duplicate alert");
});

test("real outages (404/500, DNS, expired certificate, refused connection) alert once on transition", () => {
  assert.equal(statusFor(500), "HTTP_ERROR");
  assert.equal(statusFor(404), "HTTP_ERROR");
  assert.equal(classifyFetchError(new SafeFetchError("DNS_NOT_FOUND")).category, "site_error");
  assert.equal(classifyFetchError(new SafeFetchError("TLS_CERT_EXPIRED")).category, "site_error");
  assert.equal(decideMonitorOutcome({ status: "HTTP_ERROR", previousStatus: "OK", previousConsecutiveFailures: 0 }).becameUnavailable, true);
  assert.equal(decideMonitorOutcome({ status: "ERROR", previousStatus: "SCANNER_BLOCKED", previousConsecutiveFailures: 0 }).becameUnavailable, true);
  assert.equal(decideMonitorOutcome({ status: "HTTP_ERROR", previousStatus: "HTTP_ERROR", previousConsecutiveFailures: 3 }).becameUnavailable, false);
  assert.equal(decideMonitorOutcome({ status: "OK", previousStatus: "HTTP_ERROR", previousConsecutiveFailures: 3 }).becameUnavailable, false);
});

test("monitor route uses the classifier, never counts scanner blocks as failures and sends no mail without configuration", async () => {
  const route = await readFile(new URL("../app/api/internal/monitor/run/route.ts", import.meta.url), "utf8");
  assert.match(route, /classifyHttpStatus/);
  assert.match(route, /decideMonitorOutcome/);
  assert.match(route, /WHEN \$2='SCANNER_BLOCKED' THEN consecutive_failures/);
  const email = await readFile(new URL("../lib/email.ts", import.meta.url), "utf8");
  assert.match(email, /if\(!apiKey\|\|!from\) throw new Error\("Email configuration missing\."\)/, "without RESEND_API_KEY no alert e-mail can leave the system");
});
