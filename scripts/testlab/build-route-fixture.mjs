// Builds a route-replay fixture (tests/scan-matrix/run-route-replay.mjs) from a
// TestLab result folder: rapport.json + scans/<host>.json. Only what TestLab
// stored is used (identity, first 3000 characters of text, sampled link labels,
// commerce evidence). No network.
//
// Usage: node scripts/testlab/build-route-fixture.mjs <resultFolder> <out.json.gz> [label]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const [folder, out, label = "TestLab run"] = process.argv.slice(2);
if (!folder || !out) throw new Error("usage: build-route-fixture.mjs <resultFolder> <out.json.gz> [label]");
const report = JSON.parse(readFileSync(join(folder, "rapport.json"), "utf8"));
const sites = [];
for (const row of report.sites) {
  const file = join(folder, "scans", `${row.host}.json`);
  if (row.status !== "success" || !existsSync(file)) continue;
  const d = JSON.parse(readFileSync(file, "utf8"));
  const audits = d.multiPage?.pageAudits || [];
  const linkLabel = (p) => {
    const ev = Array.isArray(p.evidence) ? p.evidence : [];
    const hit = ev.map(String).find((e) => e.startsWith("link-context:"));
    return hit ? hit.slice("link-context:".length).trim() : (p.title || "");
  };
  const page = (p) => ({
    url: p.url, type: p.type, status: p.status, httpStatus: Number(p.httpStatus) || null,
    title: p.title ?? null, description: p.description ?? null,
    identityHeadings: Array.isArray(p.identityHeadings) ? p.identityHeadings : [],
    schemaTypes: Array.isArray(p.schemaTypes) ? p.schemaTypes : [],
    partialHead: Boolean(p.partialHead), body: String(p.identityText || "").slice(0, 3000),
    commerce: p.commerceEvidence || null, product: p.commerceEvidence?.product || null,
  });
  const home = audits.find((p) => (Array.isArray(p.evidence) ? p.evidence : []).includes("scanned page")) || audits[0];
  if (!home) continue;
  sites.push({
    host: row.host, expected: row.expected, finalUrl: d.finalUrl, lang: d.metrics?.lang || "en",
    renderedLive: d.rendering?.mode === "javascript_rendered",
    liveOld: { sector: d.sectorProfile?.sector || "unknown", key: d.sectorProfile?.key || "unknown", score: d.overallScore ?? null },
    homeCommerce: d.evidenceLayer?.evidence?.commerce || {},
    nav: audits.filter((p) => p !== home).map((p) => [p.url, linkLabel(p)]),
    pages: [page(home), ...audits.filter((p) => p !== home).map(page)],
  });
}
writeFileSync(out, gzipSync(JSON.stringify({ source: `${label}: ${report.runtime?.commitSha?.slice(0, 8)} ${report.startedAt}`, labelStatus: "proposed_not_independently_verified", sites })));
console.log(`fixture: ${sites.length} sites → ${out}`);
