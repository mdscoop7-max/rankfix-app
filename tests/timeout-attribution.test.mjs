// 3 Nov 2026: website time-outs, database time-outs and RankFix's own time limit
// are separate outcomes, and a reproducibly slow website cannot stop every
// resumed TestLab run forever.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { uncaughtScanErrorCode } from "../lib/scan-runtime-errors.ts";
import { attributeIncident } from "../lib/scan-incident.ts";
import { classifyScanAnswer, settleRepeatedScanTimeout, stopsRun } from "../lib/testlab-outcome.mjs";

const timeoutError = (message, name = "Error") => Object.assign(new Error(message), { name });

test("a target website that does not answer in time is a website/network outcome, not a RankFix outage", () => {
  for (const e of [
    timeoutError("The operation was aborted due to timeout", "TimeoutError"),
    timeoutError("Navigation timeout of 30000 ms exceeded"),
    timeoutError("connect ETIMEDOUT 203.0.113.5:443"),
    timeoutError("Headers Timeout Error UND_ERR_HEADERS_TIMEOUT"),
  ]) {
    const code = uncaughtScanErrorCode(e);
    assert.equal(code, "FETCH_TIMEOUT", e.message);
    assert.equal(attributeIncident(502, code), "network");
    const status = classifyScanAnswer({ ok: false, status: 502, data: { code, incident: { attribution: "network" } } });
    assert.equal(status, "timeout");
    assert.equal(stopsRun(status), false, "a website time-out ends that website's turn and never stops the run");
  }
});

test("database time-outs are RankFix infrastructure; other time-outs keep SCAN_TIMEOUT", () => {
  assert.equal(uncaughtScanErrorCode(timeoutError("timeout exceeded when trying to connect")), "DATABASE_TIMEOUT");
  assert.equal(uncaughtScanErrorCode(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" })), "DATABASE_TIMEOUT");
  assert.equal(attributeIncident(503, "DATABASE_TIMEOUT"), "rankfix_infrastructure");
  assert.equal(uncaughtScanErrorCode(timeoutError("render step timeout")), "SCAN_TIMEOUT");
  assert.equal(uncaughtScanErrorCode(new URIError("URI malformed")), "SCAN_URL_DECODE_ERROR");
  assert.equal(uncaughtScanErrorCode(new Error("Cannot read properties of undefined")), "SCAN_INTERNAL_ERROR");
});

test("RankFix's time limit is retried once for the same website, then becomes a final timeout", () => {
  const first = classifyScanAnswer({ ok: false, status: 503, data: { code: "SCAN_TIMEOUT", incident: { attribution: "rankfix_infrastructure" } } });
  assert.equal(first, "infrastructuur");
  assert.equal(settleRepeatedScanTimeout(undefined, first, "SCAN_TIMEOUT"), "infrastructuur", "first time: not judged, retried");
  const previous = { status: "infrastructuur", pending: true, incident: { reasonCode: "SCAN_TIMEOUT" } };
  const second = settleRepeatedScanTimeout(previous, first, "SCAN_TIMEOUT");
  assert.equal(second, "timeout");
  assert.equal(stopsRun(second), false);
  // Other RankFix-side stops are never converted.
  assert.equal(settleRepeatedScanTimeout({ pending: true, incident: { reasonCode: "DATABASE_TIMEOUT" } }, "infrastructuur", "DATABASE_TIMEOUT"), "infrastructuur");
  assert.equal(settleRepeatedScanTimeout({ pending: true, incident: { reasonCode: "AUTH_LOOKUP_UNAVAILABLE" } }, "infrastructuur", "SCAN_TIMEOUT"), "infrastructuur");
});

test("the scan route and the TestLab use these rules", () => {
  const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /const technicalCode = uncaughtScanErrorCode\(error\);/);
  assert.doesNotMatch(route, /\/timeout\|abort\/i\.test\(error\.message\) \? "SCAN_TIMEOUT"/);
  const lab = readFileSync(new URL("../components/qa-testlab.tsx", import.meta.url), "utf8");
  assert.match(lab, /settleRepeatedScanTimeout\(list\.find\(r=>r\.host===site\.host\)/);
});
