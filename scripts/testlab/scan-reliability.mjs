#!/usr/bin/env node
// Independent recomputation of the scanner reliability (0-10) from stored scan
// report JSON files. Recomputes every score from the report fields and checks that
// the stored `scanReliability.score` (when present) matches the recomputation.
//
//   node --experimental-strip-types scripts/testlab/scan-reliability.mjs <dir-or-files...> [--labels=<fixture.json.gz|catalog.json>]
//
// With --labels, also reports calibration: how often the sector was correct per
// reliability band (a high reliability must be correct more often).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { computeScanReliability } from "../../lib/scan-reliability.ts";
import { sectorVerdict } from "./labels.mjs";

const args = process.argv.slice(2);
const labelArg = args.find((a) => a.startsWith("--labels="));
const inputs = args.filter((a) => !a.startsWith("--"));
const files = inputs.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith(".json")).map((f) => join(p, f)) : [p]));
let labels = {};
if (labelArg) {
  const path = labelArg.slice(9);
  const raw = path.endsWith(".gz") ? gunzipSync(readFileSync(path)) : readFileSync(path);
  const data = JSON.parse(raw);
  for (const site of data.sites || []) for (const host of site.hosts || [site.host]) labels[String(host).replace(/^www\./, "")] = site.expected;
}
const rows = [];
let mismatches = 0;
for (const file of files) {
  const report = JSON.parse(readFileSync(file, "utf8"));
  if (!report.success) { rows.push({ file, failed: true }); continue; }
  const r = computeScanReliability(report);
  const stored = report.scanReliability?.score;
  if (stored != null && stored !== r.score) mismatches++;
  const host = new URL(report.finalUrl || report.scannedUrl).hostname.replace(/^www\./, "");
  const expected = labels[host];
  const verdict = expected ? sectorVerdict(expected, { sector: report.sectorProfile?.sector, key: report.sectorProfile?.key, websiteType: report.websiteProfile?.websiteType?.value }).verdict : null;
  rows.push({ host, score: r.score, stored: stored ?? null, caps: r.caps.map((c) => c.max), verdict, seoGeo: report.overallScore });
}
const ok = rows.filter((r) => !r.failed);
const band = (s) => (s >= 8 ? "hoog (>=8)" : s >= 6 ? "redelijk (6-8)" : "laag (<6)");
const bands = {};
for (const r of ok) {
  const b = (bands[band(r.score)] ||= { n: 0, labelled: 0, correct: 0, wrong: 0 });
  b.n++;
  if (r.verdict) { b.labelled++; if (r.verdict === "exact" || r.verdict === "equivalent") b.correct++; if (r.verdict === "mismatch") b.wrong++; }
}
const avg = ok.length ? Math.round((ok.reduce((t, r) => t + r.score, 0) / ok.length) * 100) / 100 : null;
console.log(JSON.stringify({ scans: rows.length, failed: rows.length - ok.length, average: avg, atLeast8: ok.filter((r) => r.score >= 8).length, below6: ok.filter((r) => r.score < 6).length, storedMismatches: mismatches, bands }, null, 1));
if (process.env.VERBOSE) for (const r of ok.sort((a, b) => a.score - b.score)) console.log(`${String(r.score).padStart(4)}  ${r.host.padEnd(28)} caps=${r.caps.join(",") || "-"}  sector=${r.verdict || "-"}  seo/geo=${r.seoGeo}`);
process.exitCode = mismatches ? 1 : 0;
