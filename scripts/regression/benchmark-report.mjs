#!/usr/bin/env node
// Turns local-scan-benchmark output into one Markdown report: results per
// site, platform detection versus raw-HTML ground truth, all FAIL/WARNING
// findings for false-positive review, and a Vercel Hobby projection.
// Usage: node scripts/regression/benchmark-report.mjs out.json report.md "<context line>"
import { readFile, writeFile } from "node:fs/promises";

const [inFile, outFile, context = ""] = process.argv.slice(2);
const { results } = JSON.parse(await readFile(inFile, "utf8"));
const cell = (v) => String(v ?? "—").replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "—";
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Vercel Hobby (docs, 2026): 4 h Active CPU and 360 GB-h provisioned memory per
// month, 300 s max duration; default function memory 2 GB.
const HOBBY_CPU_HOURS = 4;
const HOBBY_GB_HOURS = 360;
const FUNCTION_GB = Number(process.env.FUNCTION_MEMORY_GB ?? 2);

const lines = [];
lines.push(`## Scanner-benchmark — ${new Date().toISOString().slice(0, 16)}Z`);
if (context) lines.push("", context);
lines.push("");
lines.push("| # | Type | URL | HTTP | Uitkomst | Totaal | SEO | GEO | Sec | Dekking | Sector | Websitetype | Paginatype | Platform (scanner) | Platform (HTML) | Render | Bot | Pagina's | Wall | CPU | Piek-RAM |");
lines.push("|---:|---|---|---:|---|---:|---:|---:|---:|---:|---|---|---|---|---|---|---|---:|---:|---:|---:|");
results.forEach((r, i) => {
  const s = r.snapshot;
  const m = r.truth?.markers || {};
  const htmlPlatform = [m.shopify && "Shopify", m.woocommerce && "WooCommerce", !m.woocommerce && m.wordpress && "WordPress", m.nextjs && "Next.js", m.nuxt && "Nuxt"].filter(Boolean).join("+") || (r.truth?.httpStatus ? `geen (HTTP ${r.truth.httpStatus})` : "niet opgehaald");
  const scannerPlatform = r.technology ? [r.technology.commercePlatform, r.technology.cms, r.technology.framework].filter(Boolean).join("+") || "—" : "—";
  const render = r.rendering ? `${r.rendering.mode === "javascript_rendered" ? "JS" : "raw"}${r.rendering.fallbackReason ? ` (${r.rendering.fallbackReason})` : ""}` : "—";
  lines.push(`| ${i + 1} | ${cell(r.kind)} | ${cell(r.url.replace(/^https?:\/\//, "").slice(0, 60))} | ${r.httpStatus} | ${cell(s.outcome + (r.note ? ` (${r.note})` : s.errorCode ? ` (${s.errorCode})` : ""))} | ${cell(s.overallScore)} | ${cell(s.seoScore)} | ${cell(s.geoScore)} | ${cell(s.securityScore)} | ${s.coveragePercent === null ? "—" : s.coveragePercent + "%"} | ${s.sector ? cell(`${s.sector.key} ${s.sector.confidenceScore ?? "?"}%`) : "—"} | ${cell(s.websiteType)} | ${cell(s.pageType ? `${s.pageType.type} (${s.pageType.confidence})` : null)} | ${cell(scannerPlatform)} | ${cell(htmlPlatform)} | ${cell(render)} | ${s.botProtection ? "ja" : "nee"} | ${cell(r.multiPage ? `${r.multiPage.audited}/${r.multiPage.audited + r.multiPage.unableToConfirm}` : null)} | ${r.wallSeconds} s | ${r.cpuSeconds} s | ${r.peakMemoryMb} MB |`);
});

const scanned = results.filter((r) => r.snapshot.outcome === "scanned");
const wall = sum(results.map((r) => r.wallSeconds));
const cpu = sum(results.map((r) => r.cpuSeconds));
lines.push("");
lines.push(`**Totaal:** ${results.length} URL's · ${scanned.length} gescand · ${results.length - scanned.length} niet gescand · wall ${Math.round(wall)} s (gem. ${Math.round(wall / results.length)} s, max ${Math.max(...results.map((r) => r.wallSeconds))} s) · CPU ${Math.round(cpu)} s (gem. ${Math.round(cpu / results.length)} s, max ${Math.max(...results.map((r) => r.cpuSeconds))} s) · piek-RAM max ${Math.max(...results.map((r) => r.peakMemoryMb))} MB`);

// Hobby projection for the 7-site pilot and the 29-site expansion.
const perSiteCpu = cpu / results.length;
const perSiteWall = wall / results.length;
const project = (n) => {
  const cpuHours = (perSiteCpu * n * 30) / 3600;
  const gbHours = (FUNCTION_GB * perSiteWall * n * 30) / 3600;
  return `${n} sites/nacht → ${cpuHours.toFixed(2)} CPU-uur (${Math.round((cpuHours / HOBBY_CPU_HOURS) * 100)} % van ${HOBBY_CPU_HOURS} u) en ${gbHours.toFixed(1)} GB-uur (${Math.round((gbHours / HOBBY_GB_HOURS) * 100)} % van ${HOBBY_GB_HOURS}) per maand`;
};
lines.push("");
lines.push("### Projectie Vercel Hobby (gemeten gemiddelde per scan × 30 nachten)");
lines.push(`- ${project(7)}`);
lines.push(`- ${project(29)}`);
lines.push(`- Aanname: functiegeheugen ${FUNCTION_GB} GB × wall-tijd; CPU gemeten op een GitHub-runner (Node + Chromium samen). Vercel-CPU kan afwijken; de Hobby-limieten worden gedeeld met al het andere productieverkeer.`);

lines.push("");
lines.push("### Bevindingen per site (FAIL / WARNING, voor controle op valse fouten)");
for (const r of results) {
  if (!r.issues?.length && r.snapshot.outcome === "scanned") { lines.push(`- **${r.url}** — geen FAIL/WARNING${r.unconfirmed?.length ? ` · niet te bevestigen: ${r.unconfirmed.join(", ")}` : ""}`); continue; }
  if (r.snapshot.outcome !== "scanned") { lines.push(`- **${r.url}** — niet gescand: ${cell(r.error || r.note || r.snapshot.errorCode)}`); continue; }
  lines.push(`- **${r.url}**${r.unconfirmed?.length ? ` · niet te bevestigen: ${r.unconfirmed.join(", ")}` : ""}`);
  for (const f of r.issues) lines.push(`  - \`${f.status}\` ${cell(f.rule)} (${cell(f.confidence)}) — ${cell(f.title)}: ${cell(f.message).slice(0, 220)}${f.found !== null && f.found !== undefined ? ` · gevonden: ${cell(String(f.found)).slice(0, 80)}` : ""}`);
}
await writeFile(outFile, lines.join("\n") + "\n");
console.log(lines.slice(0, results.length + 12).join("\n"));
