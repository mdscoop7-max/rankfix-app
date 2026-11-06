#!/usr/bin/env node
// Converts stored, real /api/scan responses (gzipped JSON per host, as archived
// under docs/qa/**/audits-*) into the route-replay fixture format used by
// tests/scan-matrix/run-route-replay.mjs. No network; read-only on the inputs.
//
// What is reconstructed per site: final URL, language, homepage title,
// description, H1s, schema types, navigation labels, the homepage identity text
// and commerce evidence, and every sampled page (title, description, identity
// text, HTTP outcome). Bodies beyond the stored identity text are not available,
// so FIDELITY must be measured: the replay of a site counts only when the
// current engine on the reconstruction reproduces the stored live sector.
//
// Usage: node scripts/testlab/audits-to-replay.mjs <out.json.gz> <catalog.json> <auditsDir> [<auditsDir> ...]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join, basename } from "node:path";

const [out, catalogPath, ...dirs] = process.argv.slice(2);
if (!out || !catalogPath || !dirs.length) { console.error("usage: audits-to-replay.mjs <out.json.gz> <catalog.json> <auditsDir...>"); process.exit(2); }
const catalogRaw = JSON.parse(readFileSync(catalogPath, "utf8"));
const catalog = new Map((catalogRaw.sites || catalogRaw.targets || catalogRaw).map((s) => [s.host, s]));
const sites = [];
const seen = new Set();
for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json.gz")).sort()) {
    const host = basename(file, ".json.gz");
    if (seen.has(host)) continue;
    const d = JSON.parse(gunzipSync(readFileSync(join(dir, file))).toString("utf8"));
    if (!d.success || !d.finalUrl) continue;
    seen.add(host);
    const m = d.metrics || {};
    const audits = d.multiPage?.pageAudits || [];
    const home = audits.find((p) => p.url === d.finalUrl) || audits[0] || {};
    const nav = (m.navigationLabels || []).slice(0, 60).map((label, i) => [new URL(`/nav-${i}`, d.finalUrl).toString(), label]);
    const pages = [{
      url: d.finalUrl, title: m.title || home.title || "", description: m.description || "", identityHeadings: m.h1s || [],
      schemaTypes: m.schemaTypes || [], body: String(home.identityText || "").slice(0, 3000), status: "audited",
    }];
    for (const p of audits) {
      if (!p.url || p.url === d.finalUrl) continue;
      pages.push({ url: p.url, title: p.title || "", description: p.description || "", identityHeadings: [], schemaTypes: [], body: String(p.identityText || "").slice(0, 3000), status: p.status === "audited" ? "audited" : "failed", httpStatus: p.httpStatus || null });
    }
    sites.push({
      host, expected: catalog.get(host)?.expected || null, finalUrl: d.finalUrl, lang: m.lang || "en", renderedLive: Boolean(d.rendering?.javascriptExecuted),
      liveOld: { sector: d.sectorProfile?.sector, key: d.sectorProfile?.key, score: d.overallScore, websiteType: d.websiteProfile?.websiteType?.value, commit: d.runtime?.commitSha },
      homeCommerce: d.evidenceLayer?.evidence?.commerce || {}, nav, pages,
    });
  }
}
writeFileSync(out, gzipSync(JSON.stringify({ source: "stored real /api/scan responses (" + dirs.join(", ") + ")", labelStatus: "catalog labels proposed_not_independently_verified", sites })));
console.log(`wrote ${sites.length} sites to ${out}`);
