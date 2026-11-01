#!/usr/bin/env node
// Read-only analysis of a fresh144 terminal run (QA 30 Oct). No scans.
// Usage: node scripts/testlab/analyze-evidence.mjs <run-dir> [baseline-export.json] [--out report.md]
//   <run-dir>: qa-results/fresh144-latest (needs fresh144-evidence-<sha>.json and audits-<sha>/)
//   baseline: a TestLab browser export (e.g. rankfix-testlab-144-fresh144-871aa20d.json)
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { sectorVerdict } from "./labels.mjs";
import { auditReportClaims } from "../../lib/report-claim-audit.mjs";

export function analyzeRun({ evidence, audits, baseline }) {
  const rows = evidence.rows || [];
  const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)} %` : "—";
  const ok = rows.filter((r) => r.evidenceState === "available");
  const verdicts = {}; for (const r of ok) verdicts[r.verdict || "none"] = (verdicts[r.verdict || "none"] || 0) + 1;
  const failures = {}; for (const r of rows.filter((r) => r.run && r.evidenceState !== "available")) { const k = `${r.failure?.code || r.run.reason || "?"}${r.failure?.httpStatus ? " (HTTP " + r.failure.httpStatus + ")" : ""}`; failures[k] = (failures[k] || 0) + 1; }
  const base = new Map((baseline?.sites || []).map((s) => [s.host, s]));
  const changes = [];
  for (const r of rows) {
    const b = base.get(r.host)?.result; if (!b) continue;
    const before = b.status === "succes" ? sectorVerdict(r.expected, { sector: b.sector, key: b.sectorKey, websiteType: b.websiteType }).verdict : `niet_geslaagd:${b.status}`;
    const after = r.evidenceState === "available" ? r.verdict : `niet_geslaagd:${r.failure?.code || r.run?.status}`;
    const sectorBefore = b.sector ? `${b.sector}/${b.sectorKey}` : null; const sectorAfter = r.evidence?.sectorProfile ? `${r.evidence.sectorProfile.sector}/${r.evidence.sectorProfile.key}` : null;
    if (before !== after || sectorBefore !== sectorAfter) changes.push({ host: r.host, expected: r.expected, before, after, sectorBefore, sectorAfter });
  }
  const rank = { exact: 3, equivalent: 3, unconfirmed: 1, mismatch: 0 };
  const better = changes.filter((c) => (rank[c.after] ?? -1) > (rank[c.before] ?? -1));
  const worse = changes.filter((c) => (rank[c.after] ?? -1) < (rank[c.before] ?? -1));
  const violations = {};
  for (const [host, report] of audits) for (const v of auditReportClaims(report)) (violations[v.code] ||= []).push(`${host}: ${v.detail}`);
  const sampleH1 = { pass: 0, warning: 0, unconfirmed: 0 };
  for (const r of ok) for (const p of r.evidence?.sample?.pages || []) for (const c of p.checks || []) if (c.key === "h1") sampleH1[c.status === "PASS" ? "pass" : c.status === "WARNING" ? "warning" : "unconfirmed"]++;
  const review = ok.filter((r) => r.verdict === "mismatch" || r.verdict === "unconfirmed").map((r) => ({ host: r.host, expected: r.expected, verdict: r.verdict, got: `${r.evidence?.sectorProfile?.sector}/${r.evidence?.sectorProfile?.key} ${r.evidence?.sectorProfile?.confidenceScore ?? ""}`, title: r.evidence?.page?.title, description: r.evidence?.page?.description, h1: (r.evidence?.page?.h1s || []).slice(0, 2), nav: (r.evidence?.page?.navigationLabels || []).slice(0, 15), schema: r.evidence?.page?.schemaTypes, evidence: (r.evidence?.sectorProfile?.evidence || []).slice(0, 2) }));
  const levels = {}; for (const r of ok) { const l = r.evidence?.score?.evidenceLevel || "?"; levels[l] = (levels[l] || 0) + 1; }
  return { commit: evidence.commitSha, total: rows.length, success: ok.length, successPct: pct(ok.length, rows.length), verdicts, failures, levels, sampleH1, changes, better, worse, violations, review };
}

export function toMarkdown(a) {
  const L = [];
  L.push(`# fresh144 bewijsanalyse @${String(a.commit).slice(0, 12)}`, "", `Geslaagd: ${a.success}/${a.total} (${a.successPct}) · oordelen: ${JSON.stringify(a.verdicts)} · bewijsniveau: ${JSON.stringify(a.levels)}`, "");
  L.push(`## Vergelijking met nulmeting`, `Verbeterd: ${a.better.length} · Verslechterd: ${a.worse.length} · Gewijzigd totaal: ${a.changes.length}`, "");
  for (const c of a.worse) L.push(`- **REGRESSIE** ${c.host} (${c.expected}): ${c.before} → ${c.after} · ${c.sectorBefore} → ${c.sectorAfter}`);
  for (const c of a.better) L.push(`- verbeterd ${c.host} (${c.expected}): ${c.before} → ${c.after} · ${c.sectorBefore} → ${c.sectorAfter}`);
  L.push("", `## Niet geslaagd`, ...Object.entries(a.failures).map(([k, v]) => `- ${k}: ${v}`));
  L.push("", `## Claim-audit op volledige rapporten`, ...(Object.keys(a.violations).length ? Object.entries(a.violations).map(([k, v]) => `- ${k}: ${v.length} (${v.slice(0, 3).join("; ")})`) : ["- geen overtredingen"]));
  L.push("", `## H1 op steekproefpagina's`, `pass ${a.sampleH1.pass} · waarschuwing ${a.sampleH1.warning} · niet te bevestigen ${a.sampleH1.unconfirmed}`);
  L.push("", `## Te beoordelen sectoren (${a.review.length})`);
  for (const r of a.review) L.push(`- ${r.host} [${r.verdict}] verwacht ${r.expected}, kreeg ${r.got} · titel: ${r.title} · omschrijving: ${(r.description || "").slice(0, 160)} · H1: ${JSON.stringify(r.h1)} · nav: ${JSON.stringify(r.nav)} · schema: ${JSON.stringify(r.schema)}`);
  return L.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2]; if (!dir) { console.error("Gebruik: node scripts/testlab/analyze-evidence.mjs <run-dir> [baseline.json] [--out report.md]"); process.exit(1); }
  const evFile = readdirSync(dir).filter((f) => /^fresh144-evidence-.*\.json$/.test(f)).sort().pop();
  if (!evFile) { console.error("Geen fresh144-evidence-*.json in " + dir); process.exit(1); }
  const evidence = JSON.parse(readFileSync(join(dir, evFile), "utf8"));
  const auditDir = join(dir, `audits-${String(evidence.commitSha).slice(0, 12)}`);
  const audits = existsSync(auditDir) ? readdirSync(auditDir).filter((f) => f.endsWith(".json.gz")).map((f) => [f.replace(/\.json\.gz$/, ""), JSON.parse(gunzipSync(readFileSync(join(auditDir, f))).toString("utf8"))]).filter(([, r]) => r?.success) : [];
  const baseArg = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : null;
  const a = analyzeRun({ evidence, audits, baseline: baseArg ? JSON.parse(readFileSync(baseArg, "utf8")) : null });
  const md = toMarkdown(a);
  const outIdx = process.argv.indexOf("--out");
  if (outIdx > 0) writeFileSync(process.argv[outIdx + 1], md); else process.stdout.write(md);
}
