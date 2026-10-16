// Runs a pilot plan against a RankFix deployment (normally the fixed preview),
// one site at a time, and writes files that eu81.mjs can measure directly.
// Run by the owner in their own terminal; credentials stay in environment
// variables and are never written to the output files.
//
//   RF_BASE_URL=https://<preview-host>  RF_SESSION=<value of the rankfix_session cookie>
//   RF_DEPLOYMENT_SHA=<commit of that preview>  [VERCEL_BYPASS=<protection bypass secret>]
//   [RF_LANGUAGE=nl] [RF_DELAY_MS=5000] [RF_MAX_TRIES=2]
//   node --experimental-strip-types scripts/engine-benchmark/run-pilot.mjs tests/fixtures/eu81/plan.json pilot1
//
// Use a separate test account (and preferably an isolated preview database): every
// scan is stored like a normal scan (see issue #154).
//
// Output: pilot1.scans.json + pilot1.attempts.json + pilot1.run.json (run metadata).
// Resumable: sites with a stored report, or with a final failure (blocked, quota,
// input, not found), are skipped; transient failures (network, timeout, 5xx) are
// retried up to RF_MAX_TRIES attempts per site in total, with backoff.
// Measure: RF_PLAN=<plan> node --experimental-strip-types scripts/engine-benchmark/eu81.mjs v2 pilot1.scans.json pilot1.attempts.json [review.json]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { classifyScanOutcome } from "../../lib/scan-attempts.ts";

/** Categories worth one more try. Blocked sites, quota and input errors are final. */
export const RETRYABLE = new Set(["network", "function_timeout"]);
export const isRetryable = (a) => RETRYABLE.has(a.category) || (a.category === "site_unavailable" && a.http_status >= 500);

export function attemptCategory(status, code) {
  return status === 0 ? "function_timeout" : classifyScanOutcome(status, code);
}

/** Sites still to run: no success yet, last failure retryable, tries left. */
export function pendingSites(sites, attempts, maxTries = 2) {
  return sites.filter((site) => {
    const url = `https://${site.hosts[0]}/`;
    const mine = attempts.filter((a) => a.requested_url === url);
    if (mine.some((a) => a.outcome === "success")) return false;
    if (!mine.length) return true;
    if (mine.length >= maxTries) return false;
    return isRetryable(mine.at(-1));
  });
}

/** The stored result without raw page content: no HTML, no cookies, no headers. */
export function sanitizeResult(body) {
  if (!body || typeof body !== "object") return body;
  const { rawHtml, html, renderedHtml, headers, cookies, responseHeaders, ...rest } = body;
  return rest;
}

async function main() {
  const [planFile, outPrefix = "pilot"] = process.argv.slice(2);
  const base = (process.env.RF_BASE_URL || "").replace(/\/$/, "");
  const session = process.env.RF_SESSION || "";
  if (!planFile || !base || !session) {
    console.error("Usage: RF_BASE_URL=… RF_SESSION=… RF_DEPLOYMENT_SHA=… node --experimental-strip-types scripts/engine-benchmark/run-pilot.mjs <plan.json> [outPrefix]");
    process.exit(2);
  }
  const sites = JSON.parse(readFileSync(planFile, "utf8")).sites;
  const scansFile = `${outPrefix}.scans.json`;
  const attemptsFile = `${outPrefix}.attempts.json`;
  const runFile = `${outPrefix}.run.json`;
  const scans = existsSync(scansFile) ? JSON.parse(readFileSync(scansFile, "utf8")) : [];
  const attempts = existsSync(attemptsFile) ? JSON.parse(readFileSync(attemptsFile, "utf8")) : [];
  const run = existsSync(runFile) ? JSON.parse(readFileSync(runFile, "utf8")) : { plan: planFile, baseHost: new URL(base).host, deploymentSha: process.env.RF_DEPLOYMENT_SHA || null, runs: [] };
  if (process.env.RF_DEPLOYMENT_SHA && run.deploymentSha && run.deploymentSha !== process.env.RF_DEPLOYMENT_SHA) {
    console.error(`Deze uitvoer hoort bij deployment ${run.deploymentSha}; start een nieuwe prefix voor ${process.env.RF_DEPLOYMENT_SHA} (oude en nieuwe motor niet mengen).`);
    process.exit(2);
  }
  const thisRun = { startedAt: new Date().toISOString(), endedAt: null };
  run.runs.push(thisRun);
  const delay = Number(process.env.RF_DELAY_MS || 5000);
  const maxTries = Math.max(1, Number(process.env.RF_MAX_TRIES || 2));
  const headers = { "content-type": "application/json", cookie: `rankfix_session=${session}` };
  if (process.env.VERCEL_BYPASS) headers["x-vercel-protection-bypass"] = process.env.VERCEL_BYPASS;

  const scanOne = async (url) => {
    const started = Date.now();
    try {
      const res = await fetch(`${base}/api/scan`, { method: "POST", headers, body: JSON.stringify({ url, mode: "both", language: process.env.RF_LANGUAGE || "nl", dashboard: true }), signal: AbortSignal.timeout(330_000) });
      const text = await res.text();
      let body = null; try { body = JSON.parse(text); } catch {}
      const code = body?.code || (body ? null : `NON_JSON_${res.status}`);
      return { status: res.status, body, code, error: res.ok ? null : String(body?.error || "").slice(0, 200), ms: Date.now() - started };
    } catch (err) {
      // The client gave up (or the platform cut the connection): same meaning as a row left "running".
      return { status: 0, body: null, code: /timeout|abort/i.test(String(err)) ? "CLIENT_TIMEOUT" : "CLIENT_NETWORK", error: String(err).slice(0, 200), ms: Date.now() - started };
    }
  };

  for (let round = 0; round < maxTries; round++) {
    const todo = pendingSites(sites, attempts, maxTries);
    if (!todo.length) break;
    if (round > 0) await new Promise((ok) => setTimeout(ok, delay * 6)); // backoff before a retry round
    for (const site of todo) {
      const url = `https://${site.hosts[0]}/`;
      const r = await scanOne(url);
      const category = attemptCategory(r.status, r.code);
      // 429 from RankFix itself means the account limit: stop instead of hammering.
      if (category === "quota") console.error(`Quotum bereikt bij ${url} (${r.code}); pilot gestopt. Hervat later met dezelfde prefix.`);
      attempts.push({ requested_url: url, http_status: r.status, outcome: category === "success" ? "success" : "failed", category, error_code: r.code, error: r.error, duration_ms: r.ms, created_at: new Date().toISOString(), try: attempts.filter((a) => a.requested_url === url).length + 1 });
      if (r.status === 200 && r.body) scans.push({ scanned_url: url, final_url: r.body.finalUrl, overall_score: r.body.overallScore, created_at: new Date().toISOString(), deployment_sha: run.deploymentSha, result: sanitizeResult(r.body) });
      writeFileSync(scansFile, JSON.stringify(scans));
      writeFileSync(attemptsFile, JSON.stringify(attempts, null, 1));
      console.log(`${url} → ${r.status} ${category}${r.body?.sectorProfile?.sector ? ` · ${r.body.sectorProfile.sector} (verwacht ${[].concat(site.expected).join("/")})` : ""}${r.body?.overallScore != null ? ` · ${r.body.overallScore}` : ""} · ${Math.round(r.ms / 1000)}s`);
      if (category === "quota") { round = maxTries; break; }
      await new Promise((ok) => setTimeout(ok, delay));
    }
  }
  thisRun.endedAt = new Date().toISOString();
  writeFileSync(runFile, JSON.stringify(run, null, 1));
  const failed = new Set(attempts.filter((a) => a.outcome !== "success").map((a) => a.requested_url));
  for (const s of scans) failed.delete(s.scanned_url);
  console.log(`Klaar: ${scans.length} rapporten, ${failed.size} sites zonder rapport. Meten: RF_PLAN=${planFile} node --experimental-strip-types scripts/engine-benchmark/eu81.mjs v2 ${scansFile} ${attemptsFile}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
