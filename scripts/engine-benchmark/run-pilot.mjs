// Runs a pilot plan against a RankFix deployment (normally the fixed preview),
// one site at a time, and writes files that eu81.mjs can measure directly.
// Run by the owner in their own terminal; credentials stay in environment
// variables and are never written to the output files.
//
//   RF_BASE_URL=https://<preview-host>  RF_SESSION=<value of the rankfix_session cookie>
//   [VERCEL_BYPASS=<protection bypass secret>]  [RF_LANGUAGE=nl]  [RF_DELAY_MS=5000]
//   node --experimental-strip-types scripts/engine-benchmark/run-pilot.mjs tests/fixtures/eu81/plan.json pilot1
//
// Output: pilot1.scans.json + pilot1.attempts.json (resumable: finished sites are skipped).
// Measure: node --experimental-strip-types scripts/engine-benchmark/eu81.mjs export pilot1.scans.json pilot1.attempts.json
//          (pilot 2: prefix with RF_PLAN=tests/fixtures/eu-pilot2/plan.json)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { classifyScanOutcome } from "../../lib/scan-attempts.ts";

const [planFile, outPrefix = "pilot"] = process.argv.slice(2);
const base = (process.env.RF_BASE_URL || "").replace(/\/$/, "");
const session = process.env.RF_SESSION || "";
if (!planFile || !base || !session) {
  console.error("Usage: RF_BASE_URL=… RF_SESSION=… node --experimental-strip-types scripts/engine-benchmark/run-pilot.mjs <plan.json> [outPrefix]");
  process.exit(2);
}
const sites = JSON.parse(readFileSync(planFile, "utf8")).sites;
const scansFile = `${outPrefix}.scans.json`;
const attemptsFile = `${outPrefix}.attempts.json`;
const scans = existsSync(scansFile) ? JSON.parse(readFileSync(scansFile, "utf8")) : [];
const attempts = existsSync(attemptsFile) ? JSON.parse(readFileSync(attemptsFile, "utf8")) : [];
const done = new Set(attempts.map((a) => a.requested_url));
const delay = Number(process.env.RF_DELAY_MS || 5000);
const headers = { "content-type": "application/json", cookie: `rankfix_session=${session}` };
if (process.env.VERCEL_BYPASS) headers["x-vercel-protection-bypass"] = process.env.VERCEL_BYPASS;

export async function scanOne(url, fetchImpl = fetch) {
  const started = Date.now();
  try {
    const res = await fetchImpl(`${base}/api/scan`, { method: "POST", headers, body: JSON.stringify({ url, mode: "both", language: process.env.RF_LANGUAGE || "nl", dashboard: true }), signal: AbortSignal.timeout(330_000) });
    const text = await res.text();
    let body = null; try { body = JSON.parse(text); } catch {}
    const code = body?.code || (body ? null : `NON_JSON_${res.status}`);
    return { status: res.status, body, code, error: res.ok ? null : String(body?.error || text.slice(0, 200)), ms: Date.now() - started };
  } catch (err) {
    // The client gave up (or the platform cut the connection): same meaning as a row left "running".
    return { status: 0, body: null, code: /timeout|abort/i.test(String(err)) ? "CLIENT_TIMEOUT" : "CLIENT_NETWORK", error: String(err).slice(0, 200), ms: Date.now() - started };
  }
}

let n = 0;
for (const site of sites) {
  const url = `https://${site.hosts[0]}/`;
  if (done.has(url)) continue;
  n += 1;
  const r = await scanOne(url);
  const category = r.status === 0 ? "function_timeout" : classifyScanOutcome(r.status, r.code);
  attempts.push({ requested_url: url, http_status: r.status, outcome: category === "success" ? "success" : "failed", category, error_code: r.code, error: r.error, duration_ms: r.ms, created_at: new Date().toISOString() });
  if (r.status === 200 && r.body) scans.push({ scanned_url: url, final_url: r.body.finalUrl, overall_score: r.body.overallScore, created_at: new Date().toISOString(), result: r.body });
  writeFileSync(scansFile, JSON.stringify(scans));
  writeFileSync(attemptsFile, JSON.stringify(attempts, null, 1));
  console.log(`${String(attempts.length).padStart(3)}/${sites.length} ${url} → ${r.status} ${category}${r.body?.sectorProfile?.sector ? ` · ${r.body.sectorProfile.sector} (verwacht ${site.expected})` : ""}${r.body?.overallScore != null ? ` · ${r.body.overallScore}` : ""} · ${Math.round(r.ms / 1000)}s`);
  if (n < sites.length) await new Promise((ok) => setTimeout(ok, delay));
}
console.log(`Klaar: ${scans.length} rapporten, ${attempts.filter((a) => a.outcome !== "success").length} mislukte pogingen. Meten: node --experimental-strip-types scripts/engine-benchmark/eu81.mjs export ${scansFile} ${attemptsFile}`);
