#!/usr/bin/env node
// Manual preview check: runs the normal, anonymous public scan (the same path a
// visitor uses) against a preview deployment for a short URL list, one site at
// a time, and prints a Markdown table with the evidence fields the pilot uses.
// Read-only: no login, no history, no fixes. Respects the public limit of
// 8 scans per hour per network: never pass more than 7 URLs.
//
// Usage: PREVIEW_URL=https://... node --experimental-strip-types scripts/regression/preview-smoke.mjs <url> [url...]
// Optional: VERCEL_AUTOMATION_BYPASS_SECRET for protected previews, OUTPUT_FILE.
import { writeFile } from "node:fs/promises";
import { snapshotFromScan } from "../../lib/regression/snapshot.ts";

const preview = (process.env.PREVIEW_URL || "").replace(/\/$/, "");
const urls = process.argv.slice(2);
const pauseMs = Number(process.env.PAUSE_MS ?? 20000);

if (!/^https:\/\//.test(preview) || !urls.length || urls.length > 7) {
  console.error("PREVIEW_URL (https) en 1–7 URL's vereist.");
  process.exit(2);
}

const headers = { "content-type": "application/json" };
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const rows = [];
for (const [index, url] of urls.entries()) {
  const started = Date.now();
  let httpStatus = 0, body = null, note = "";
  try {
    const response = await fetch(`${preview}/api/scan`, {
      method: "POST", headers, body: JSON.stringify({ url, mode: "both", language: "nl" }),
      signal: AbortSignal.timeout(310000),
    });
    httpStatus = response.status;
    const text = await response.text();
    try { body = JSON.parse(text); } catch { note = `geen JSON (${text.slice(0, 80).replace(/\s+/g, " ")})`; }
  } catch (error) {
    note = error instanceof Error ? error.name : "NETWORK";
  }
  const durationMs = Date.now() - started;
  const s = snapshotFromScan({ httpStatus, body, durationMs, timedOut: note === "TimeoutError" });
  const failures = s.findings.filter((f) => f.status === "FAIL").map((f) => `${f.rule}${f.confidence === "low" ? "?" : ""}`);
  rows.push({ url, httpStatus, s, failures, note, error: body?.error || body?.code || "" });
  console.log(`${url}: HTTP ${httpStatus} ${s.outcome} ${Math.round(durationMs / 1000)}s ${note}`);
  if (index < urls.length - 1) await new Promise((r) => setTimeout(r, pauseMs));
}

const cell = (v) => String(v ?? "—").replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "—";
const lines = [
  `### Preview-scan ${new Date().toISOString().slice(0, 16)}Z — \`${preview.replace(/^https:\/\//, "")}\``,
  "",
  "| URL | HTTP | Uitkomst | Totaal | SEO | GEO | Security | Dekking | Sector | Websitetype | Paginatype | Rendering | Bot | Duur | FAIL (? = lage zekerheid) |",
  "|---|---:|---|---:|---:|---:|---:|---:|---|---|---|---|---|---:|---|",
  ...rows.map(({ url, httpStatus, s, failures, note, error }) => `| ${cell(url.replace(/^https:\/\//, ""))} | ${httpStatus} | ${cell(s.outcome + (note ? ` (${note})` : error && s.outcome !== "scanned" ? ` (${error})` : ""))} | ${cell(s.overallScore)} | ${cell(s.seoScore)} | ${cell(s.geoScore)} | ${cell(s.securityScore)} | ${s.coveragePercent === null ? "—" : s.coveragePercent + "%"} | ${s.sector ? cell(`${s.sector.key} ${s.sector.confidenceScore ?? "?"}%`) : "—"} | ${cell(s.websiteType)} | ${cell(s.pageType?.type)} | ${cell(s.renderer ? s.renderer + (s.renderFallbackReason ? ` (${s.renderFallbackReason})` : "") : null)} | ${s.botProtection ? "ja" : "nee"} | ${Math.round((s.durationMs || 0) / 1000)} s | ${cell(failures.join(", ") || "geen")} |`),
];
const markdown = lines.join("\n");
console.log("\n" + markdown);
if (process.env.OUTPUT_FILE) await writeFile(process.env.OUTPUT_FILE, markdown + "\n");
