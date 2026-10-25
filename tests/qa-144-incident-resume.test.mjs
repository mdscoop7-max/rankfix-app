// QA 144-site test (24 Oct 2026): incident evidence, session vs infrastructure,
// and TestLab resume that never skips a website RankFix itself failed on.
import test from "node:test";
import assert from "node:assert/strict";
import { attachScanIncident, attributeIncident, buildScanIncident, createScanTrace } from "../lib/scan-incident.ts";
import { resolveScanUser } from "../lib/scan-session.ts";
import { classifyScanOutcome } from "../lib/scan-attempts.ts";
import { classifyScanAnswer, isFinalResult, resumeQueue, stopsRun, upsertResult } from "../lib/testlab-outcome.mjs";
import { failureCategory } from "../scripts/testlab/labels.mjs";

const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("website 403 behind API 422: origin and API status are reported separately", async () => {
  const trace = createScanTrace("https://www.bol.example/", new Date("2026-10-24T10:00:00Z"), "rf-test-1");
  trace.phase = "browser_render";
  trace.originHttpStatus = 403;
  trace.finalUrl = "https://www.bol.example/nl/";
  trace.redirects = [{ from: "https://www.bol.example/", to: "https://www.bol.example/nl/", status: 301 }];
  trace.browserRender = { attempted: true, outcome: "not_substantive", reason: "HTTP_403_RECOVERY" };
  const res = await attachScanIncident(json({ code: "HTTP_BLOCKED", httpStatus: 403, error: "geblokkeerd" }, 422), trace);
  assert.equal(res.status, 422);
  assert.equal(res.headers.get("x-rankfix-trace-id"), "rf-test-1");
  const body = await res.json();
  assert.equal(body.incident.apiHttpStatus, 422);
  assert.equal(body.incident.originHttpStatus, 403);
  assert.equal(body.incident.reasonCode, "HTTP_BLOCKED");
  assert.equal(body.incident.attribution, "target_site");
  assert.equal(body.incident.rankfixSide, false);
  assert.equal(body.incident.phase, "browser_render");
  assert.equal(body.incident.finalUrl, "https://www.bol.example/nl/");
  assert.equal(body.incident.redirects.length, 1);
  assert.equal(body.incident.browserRender.outcome, "not_substantive");
  assert.equal(body.incident.requestedUrl, "https://www.bol.example/");
  assert.ok(body.incident.at);
});

test("challenge with HTTP 200 keeps origin 200; site 429 is the website, not a RankFix quota", () => {
  const t = createScanTrace("https://x.example/"); t.originHttpStatus = 200;
  assert.equal(buildScanIncident(t, 422, { code: "CHALLENGE_OR_INTERSTITIAL" }).originHttpStatus, 200);
  t.originHttpStatus = 429;
  const rate = buildScanIncident(t, 429, { code: "SITE_RATE_LIMITED" });
  assert.equal(rate.attribution, "target_site");
  assert.equal(rate.originHttpStatus, 429);
  assert.equal(attributeIncident(429, "ACCOUNT_SCAN_RATE_LIMIT"), "rankfix_quota");
  assert.equal(attributeIncident(429, "FREE_SCAN_RATE_LIMIT"), "rankfix_quota");
  assert.equal(attributeIncident(429, "SCAN_LIMIT"), "rankfix_quota");
});

test("expired RankFix session and infrastructure are never attributed to the website", () => {
  const t = createScanTrace("https://nexi.example/");
  for (const [status, code, who] of [[401, "SESSION_EXPIRED", "rankfix_session"], [503, "AUTH_LOOKUP_UNAVAILABLE", "rankfix_infrastructure"], [503, "DATABASE_QUOTA_EXCEEDED", "rankfix_infrastructure"], [500, "SCAN_HISTORY_SAVE_FAILED", "rankfix_infrastructure"], [500, "SCAN_INTERNAL_ERROR", "rankfix_engine"]]) {
    const inc = buildScanIncident(t, status, { code });
    assert.equal(inc.attribution, who, code);
    assert.equal(inc.rankfixSide, true, code);
    assert.equal(inc.retrySameSite, true, code);
    assert.equal(inc.originHttpStatus, null, `${code}: website was never contacted`);
    assert.match(inc.explanation, /RankFix/);
  }
});

test("timeout/DNS: no website status is invented", () => {
  const t = createScanTrace("https://ing.example/"); t.originHttpStatus = 504; // internal placeholder must not leak
  const inc = buildScanIncident(t, 502, { code: "FETCH_TIMEOUT" });
  assert.equal(inc.attribution, "network");
  assert.equal(inc.originHttpStatus, null);
  assert.equal(buildScanIncident(createScanTrace("https://h.example/"), 502, { code: "FETCH_DNS" }).attribution, "network");
  assert.equal(buildScanIncident(createScanTrace("https://o.example/"), 422, { code: "HTTP_NOT_FOUND", httpStatus: 404 }).originHttpStatus, 404);
});

test("successful responses only get the trace id", async () => {
  const res = await attachScanIncident(json({ success: true, overallScore: 80 }, 200), createScanTrace("https://a.example/", new Date(), "rf-ok"));
  const body = await res.json();
  assert.equal(body.traceId, "rf-ok");
  assert.equal(body.incident, undefined);
});

test("session lookup: database failure is retried and reported as lookupFailed, not as no session", async () => {
  let calls = 0;
  const flaky = async () => { calls++; if (calls === 1) throw Object.assign(new Error("Connection terminated"), { code: "ECONNRESET" }); return { id: "u1" }; };
  const ok = await resolveScanUser(flaky, { sleep: async () => {} });
  assert.deepEqual(ok, { user: { id: "u1" }, lookupFailed: false, cause: null });
  const down = await resolveScanUser(async () => { throw Object.assign(new Error("secret dsn postgres://x"), { code: "57P01" }); }, { sleep: async () => {} });
  assert.equal(down.user, null);
  assert.equal(down.lookupFailed, true);
  assert.equal(down.cause, "57P01");
  const none = await resolveScanUser(async () => null);
  assert.deepEqual(none, { user: null, lookupFailed: false, cause: null });
  assert.equal(classifyScanOutcome(503, "AUTH_LOOKUP_UNAVAILABLE"), "infrastructure");
});

test("TestLab: a website RankFix failed on is retried on resume, finished ones are kept, no duplicates", () => {
  const sites = ["a", "b", "c", "d", "e"].map((h) => ({ host: `${h}.example` }));
  let results = [];
  results = upsertResult(results, { host: "a.example", status: "succes" });
  results = upsertResult(results, { host: "b.example", status: "site_geblokkeerd" });
  // Run stopped on c: expired session. Stored as pending, never as final.
  const status = classifyScanAnswer({ ok: false, status: 401, data: { code: "SESSION_EXPIRED", incident: { attribution: "rankfix_session" } } });
  assert.equal(status, "login");
  assert.equal(stopsRun(status), true);
  results = upsertResult(results, { host: "c.example", status, pending: true });
  assert.equal(isFinalResult(results[2]), false);
  assert.deepEqual(resumeQueue(sites, results).map((s) => s.host), ["c.example", "d.example", "e.example"]);
  // Resume: c succeeds; the row is replaced, not duplicated.
  results = upsertResult(results, { host: "c.example", status: "succes" });
  assert.equal(results.filter((r) => r.host === "c.example").length, 1);
  assert.deepEqual(resumeQueue(sites, results).map((s) => s.host), ["d.example", "e.example"]);
  // Duplicate catalogue entries are processed once.
  assert.equal(resumeQueue([...sites, sites[3]], results).length, 2);
});

test("TestLab classification follows incident attribution", () => {
  assert.equal(classifyScanAnswer({ ok: false, status: 0, clientError: "Failed to fetch" }), "verbinding_rankfix");
  assert.equal(stopsRun("verbinding_rankfix"), true);
  assert.equal(classifyScanAnswer({ ok: false, status: 429, data: { code: "SITE_RATE_LIMITED", incident: { attribution: "target_site" } } }), "site_geblokkeerd");
  assert.equal(classifyScanAnswer({ ok: false, status: 429, data: { code: "SITE_RATE_LIMITED" } }), "site_geblokkeerd");
  assert.equal(classifyScanAnswer({ ok: false, status: 422, data: { code: "HTTP_NOT_FOUND", incident: { attribution: "target_site" } } }), "site_onbereikbaar");
  assert.equal(classifyScanAnswer({ ok: false, status: 502, data: { code: "FETCH_TIMEOUT", incident: { attribution: "network" } } }), "timeout");
  assert.equal(classifyScanAnswer({ ok: false, status: 502, data: { code: "FETCH_DNS", incident: { attribution: "network" } } }), "netwerk_website");
  assert.equal(classifyScanAnswer({ ok: false, status: 503, data: { code: "AUTH_LOOKUP_UNAVAILABLE" } }), "infrastructuur");
  assert.equal(classifyScanAnswer({ ok: true, status: 200, data: { success: true } }), "succes");
  assert.equal(failureCategory(401, "SESSION_EXPIRED", "rankfix_session"), "auth");
  assert.equal(failureCategory(503, "AUTH_LOOKUP_UNAVAILABLE"), "infrastructure");
});

test("scan route wires the trace into every error answer and no longer swallows session lookup errors", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(src, /attachScanIncident\(rawResponse, trace\)/);
  assert.doesNotMatch(src, /try \{ (?:usageUser|user) = await getCurrentUser\(\); \} catch \{\}/);
  assert.match(src, /trace\.originHttpStatus = timeoutRecovery \? null : response\.status/);
  const lab = readFileSync(new URL("../components/qa-testlab.tsx", import.meta.url), "utf8");
  assert.match(lab, /resumeQueue\(scoped,results\)/);
  assert.doesNotMatch(lab, /scoped\.filter\(s=>!byHost\.has\(s\.host\)\)/);
});
