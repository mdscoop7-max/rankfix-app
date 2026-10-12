#!/usr/bin/env node
// Runner for the internal RankFix regression pilot (issue #128).
// Calls the secret-protected internal routes one site at a time (max one
// browser in use), waits between sites, retries once on transient failures and
// prints one report. It never calls the public scan endpoint and never fixes,
// merges or deploys anything.
//
// Env: RANKFIX_BASE_URL (default production), REGRESSION_SECRET (required),
//      RUN_KEY (default: nightly-YYYY-MM-DD in Europe/Amsterdam),
//      PAUSE_MS (default 15000), GITHUB_STEP_SUMMARY (optional).
import { appendFile } from "node:fs/promises";

const base = (process.env.RANKFIX_BASE_URL || "https://rankfix-app.vercel.app").replace(/\/$/, "");
const secret = process.env.REGRESSION_SECRET || "";
const pauseMs = Number(process.env.PAUSE_MS ?? 15000);
const callTimeoutMs = Number(process.env.CALL_TIMEOUT_MS ?? 295000);
const amsterdamDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
const runKey = process.env.RUN_KEY || `nightly-${amsterdamDate}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function call(path, body, { fetchImpl = fetch, timeoutMs = callTimeoutMs } = {}) {
  const response = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let json = null;
  try { json = await response.json(); } catch {}
  return { status: response.status, json };
}

// Transient: network error, function timeout or platform error. The server
// side is idempotent per (run, site), so a retry never scans twice.
const transient = (status) => status === 0 || status === 502 || status === 503 || status === 504;

async function scanWithRetry(siteId) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try { result = await call("/api/internal/regression/scan", { runKey, siteId }); }
    catch (error) { result = { status: 0, json: { error: error instanceof Error ? error.name : "NETWORK" } }; }
    if (!transient(result.status) || attempt === 2) return result;
    await sleep(Number(process.env.RETRY_DELAY_MS ?? 30000));
  }
}

async function main() {
  if (secret.length < 32) {
    console.error("REGRESSION_SECRET ontbreekt of is te kort.");
    process.exit(2);
  }
  const started = await call("/api/internal/regression/start", { runKey }, { timeoutMs: 60000 });
  if (started.status !== 200) {
    console.error(`Start mislukt (HTTP ${started.status}): ${started.json?.error || "onbekend"}`);
    process.exit(started.status === 409 ? 0 : 1);
  }
  console.log(`Run ${runKey}: ${started.json.sites.length} sites`);
  for (const [index, site] of started.json.sites.entries()) {
    const began = Date.now();
    const result = await scanWithRetry(site.id);
    const c = result.json?.classification;
    console.log(`- ${site.label}: HTTP ${result.status} · ${c?.result || result.json?.error || "geen resultaat"} · ${Math.round((Date.now() - began) / 1000)} s`);
    if (index < started.json.sites.length - 1) await sleep(pauseMs);
  }
  const finished = await call("/api/internal/regression/finish", { runKey }, { timeoutMs: 120000 });
  if (finished.status !== 200) {
    console.error(`Afronden mislukt (HTTP ${finished.status}): ${finished.json?.error || "onbekend"}`);
    process.exit(1);
  }
  console.log("\n" + finished.json.markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, finished.json.markdown + "\n");
  // Regressions are reported through the single bundled e-mail; the job itself
  // stays green so GitHub does not send a second, separate alarm.
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Regressierunner gestopt:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
