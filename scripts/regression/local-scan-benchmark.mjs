#!/usr/bin/env node
// Scanner benchmark against a locally started RankFix server (`next start`).
// Runs the normal public /api/scan for each URL, one at a time, and measures
// per scan: wall time, CPU seconds and peak memory of the whole server process
// tree (Node + Chromium), the closest local proxy for Vercel "Active CPU" and
// "Provisioned Memory". Read-only: anonymous scans, throwaway database.
//
// Also records independent ground truth from the raw homepage HTML (platform
// markers), so the scanner's platform detection can be checked against it.
//
// Usage: SERVER_PID=<pid of next start> BASE_URL=http://127.0.0.1:3100 \
//        node --experimental-strip-types scripts/regression/local-scan-benchmark.mjs sites.json out.json
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import { snapshotFromScan } from "../../lib/regression/snapshot.ts";

const [sitesFile, outFile] = process.argv.slice(2);
const base = (process.env.BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const serverPid = Number(process.env.SERVER_PID);
const pauseMs = Number(process.env.PAUSE_MS ?? 15000);
const TICKS = 100; // USER_HZ on Linux runners
const PAGE_KB = 4;

function procStat(pid) {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
    const rest = raw.slice(raw.lastIndexOf(")") + 2).split(" ");
    // fields after comm: state(0) ppid(1) ... utime(11) stime(12) cutime(13) cstime(14) ... rss(21)
    return { ppid: Number(rest[1]), cpu: Number(rest[11]) + Number(rest[12]) + Number(rest[13]) + Number(rest[14]), rssKb: Number(rest[21]) * PAGE_KB };
  } catch { return null; }
}

// Live process tree under the server: CPU includes reaped children (cutime),
// so Chromium processes that already exited are still counted.
function treeUsage(root) {
  const stats = new Map();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    const s = procStat(Number(name));
    if (s) stats.set(Number(name), s);
  }
  const inTree = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, s] of stats) if (!inTree.has(pid) && inTree.has(s.ppid)) { inTree.add(pid); grew = true; }
  }
  let cpu = 0, rssKb = 0, processes = 0;
  for (const pid of inTree) { const s = stats.get(pid); if (s) { cpu += s.cpu; rssKb += s.rssKb; processes++; } }
  return { cpuSeconds: cpu / TICKS, rssMb: rssKb / 1024, processes };
}

async function groundTruth(url) {
  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; RankFixBenchmark/1.0)", accept: "text/html" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    const html = (await response.text()).slice(0, 3_000_000);
    return {
      httpStatus: response.status,
      bytes: html.length,
      markers: {
        woocommerce: /woocommerce|wc-block|\/wc-ajax|wp-content\/plugins\/woocommerce/i.test(html),
        wordpress: /wp-content\/|wp-includes\//i.test(html),
        shopify: /cdn\.shopify\.com|\/cdn\/shop\/|Shopify\.theme|meta-shopify|shopify-digital-wallet/i.test(html),
        nextjs: /__NEXT_DATA__|\/_next\/static\//.test(html),
        nuxt: /__NUXT__|\/_nuxt\//.test(html),
        productSchema: /"@type"\s*:\s*"Product"/.test(html),
        articleSchema: /"@type"\s*:\s*"(?:News)?Article"|"@type"\s*:\s*"BlogPosting"/.test(html),
      },
    };
  } catch (error) {
    return { httpStatus: 0, bytes: 0, error: error instanceof Error ? error.name : "FETCH_FAILED", markers: {} };
  }
}

const sites = JSON.parse(await readFile(sitesFile, "utf8"));
const results = [];
for (const [index, site] of sites.entries()) {
  const truth = await groundTruth(site.url);
  const before = treeUsage(serverPid);
  let peakMb = before.rssMb, peakProcesses = before.processes;
  const sampler = setInterval(() => {
    const now = treeUsage(serverPid);
    peakMb = Math.max(peakMb, now.rssMb);
    peakProcesses = Math.max(peakProcesses, now.processes);
  }, 250);
  const started = Date.now();
  let httpStatus = 0, body = null, note = "";
  try {
    const response = await fetch(`${base}/api/scan`, {
      method: "POST",
      // Distinct local test address per scan: the throwaway server's public
      // per-network limit (8/hour) would otherwise stop the benchmark.
      headers: { "content-type": "application/json", "x-forwarded-for": `10.99.0.${index + 1}` },
      body: JSON.stringify({ url: site.url, mode: "both", language: "nl" }),
      signal: AbortSignal.timeout(300000),
    });
    httpStatus = response.status;
    body = await response.json().catch(() => null);
  } catch (error) {
    note = error instanceof Error ? error.name : "NETWORK";
  }
  const wallMs = Date.now() - started;
  clearInterval(sampler);
  // Let Chromium children finish and be reaped before reading the final CPU.
  await new Promise((r) => setTimeout(r, 1500));
  const after = treeUsage(serverPid);
  const snapshot = snapshotFromScan({ httpStatus, body, durationMs: wallMs, timedOut: note === "TimeoutError" });
  const technology = body?.technologyProfile || null;
  const checks = Array.isArray(body?.checks) ? body.checks : [];
  results.push({
    ...site,
    httpStatus,
    note,
    error: typeof body?.error === "string" ? body.error : null,
    wallSeconds: Math.round(wallMs / 100) / 10,
    cpuSeconds: Math.round((after.cpuSeconds - before.cpuSeconds) * 10) / 10,
    peakMemoryMb: Math.round(peakMb),
    peakProcesses,
    truth,
    technology: technology ? { siteType: technology.siteType, cms: technology.cms, commercePlatform: technology.commercePlatform, framework: technology.framework, confidence: technology.confidence } : null,
    rendering: body?.rendering ? { mode: body.rendering.mode, fallbackReason: body.rendering.fallbackReason, elapsedMs: body.rendering.elapsedMs, botProtection: body.rendering.botProtection } : null,
    multiPage: body?.multiPage?.counts || null,
    scoreRange: body?.scoreModel?.range ? { low: body.scoreModel.range.low, high: body.scoreModel.range.high } : null,
    commerceApplicability: body?.commerceApplicability?.applicable ?? body?.commerceApplicability?.state ?? null,
    snapshot,
    // Full actionable findings with evidence text, for false-positive review.
    issues: checks.filter((c) => c.issue_status === "FAIL" || c.issue_status === "WARNING").map((c) => ({
      rule: c.rule_id || c.key, status: c.issue_status, confidence: c.confidence, title: c.title,
      message: String(c.message || "").slice(0, 300), found: c.evidence?.found ?? null, url: c.evidence?.url || null,
    })),
    unconfirmed: checks.filter((c) => c.issue_status === "UNABLE_TO_CONFIRM").map((c) => c.rule_id || c.key),
  });
  console.log(`[${index + 1}/${sites.length}] ${site.url}: HTTP ${httpStatus} ${snapshot.outcome} · ${Math.round(wallMs / 1000)} s wall · ${results.at(-1).cpuSeconds} s CPU · ${Math.round(peakMb)} MB peak${note ? " · " + note : ""}`);
  await writeFile(outFile, JSON.stringify({ base, results }, null, 2));
  if (index < sites.length - 1) await new Promise((r) => setTimeout(r, pauseMs));
}
