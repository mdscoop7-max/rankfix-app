#!/usr/bin/env node
// AI sector trial (owner request 7 Nov 2026): scan a small set of hard websites
// against the LOCAL RankFix server with AI sector verification switched on, and
// measure accuracy, AI cost and scan time.
//
// 1. In .env.local: RANKFIX_AI_SECTOR=1 (OPENAI_API_KEY is already set).
// 2. Start RankFix (Start-RankFix-TestLab.cmd or `npm run dev`).
// 3. node scripts/testlab/ai-sector-trial.mjs
//    Optional: BASE_URL=http://localhost:3000  PRICE_IN=… PRICE_OUT=… (USD per 1M tokens)
//              SITES=host=expectedSector,…   OUT=qa-results/ai-sector-trial.json
//
// "expected" is an engine sector (or sector:key). The AI never decides alone:
// RankFix verifies every quote; see lib/ai-sector-verifier.ts.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PRICE_IN = Number(process.env.PRICE_IN || 0), PRICE_OUT = Number(process.env.PRICE_OUT || 0);
const OUT = process.env.OUT || "qa-results/ai-sector-trial.json";
const DEFAULT_SITES = [
  ["nl.edreams.com", "transport_travel:travel"], // booking platform, not hotel or airline
  ["growrijopleidingen.nl", "education:driving_school"],
  ["www.anwb.nl", "unknown_or_nonprofit"], // membership organisation with many activities: must not be "financial"
  ["getmoss.com", "saas_b2b"],
  ["www.kwik-fit.nl", "automotive:car_repair"],
  ["www.royalairmaroc.com", "transport_travel:passenger_transport"],
  ["www.treatwell.nl", "service_marketplace"],
  ["www.stedin.net", "energy_utilities:grid_operator"],
  ["www.hutten.eu", "hospitality:catering"],
  ["www.welkoop.nl", "ecommerce"],
];
const sites = process.env.SITES ? process.env.SITES.split(",").map((x) => x.split("=")) : DEFAULT_SITES;

function verdict(expected, profile) {
  const [sector, key] = String(expected).split(":");
  if (expected === "unknown_or_nonprofit") return ["unknown", "nonprofit", "membership_organisation"].includes(profile.sector) ? "ok" : "wrong";
  if (!profile.sector || profile.sector === "unknown") return "unconfirmed";
  if (profile.sector !== sector) return "wrong";
  return !key || profile.key === key ? "ok" : "partial";
}

const rows = [];
for (const [host, expected] of sites) {
  const t0 = Date.now();
  let data = {}, httpStatus = 0;
  try {
    const res = await fetch(`${BASE}/api/scan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }), signal: AbortSignal.timeout(285000) });
    httpStatus = res.status; data = await res.json();
  } catch (e) { data = { error: String(e) }; }
  const ms = Date.now() - t0;
  const sp = data.sectorProfile || {}, ai = sp.aiVerification || {}, rule = ai.ruleOutcome || {};
  const usage = ai.usage || {};
  const cost = (Number(usage.promptTokens || 0) * PRICE_IN + Number(usage.completionTokens || 0) * PRICE_OUT) / 1e6;
  const row = {
    host, expected, httpStatus, scanMs: ms,
    rule: { sector: rule.sector ?? sp.sector, key: rule.key ?? sp.key, label: rule.label ?? sp.label, confidence: rule.confidenceScore ?? sp.confidenceScore },
    final: { sector: sp.sector, key: sp.key, label: sp.label, confidence: sp.confidenceScore },
    ai: { status: ai.status || "absent", reason: ai.reason, proposal: ai.option?.key || ai.proposal?.key || null, role: ai.role || ai.proposal?.role || null, quotes: ai.quotes || [], model: ai.model, aiMs: usage.durationMs ?? null, promptTokens: usage.promptTokens ?? null, completionTokens: usage.completionTokens ?? null, costUsd: PRICE_IN || PRICE_OUT ? Number(cost.toFixed(5)) : null },
  };
  row.verdictRules = verdict(expected, row.rule);
  row.verdictFinal = verdict(expected, row.final);
  rows.push(row);
  console.log(`${host.padEnd(26)} ${String(ms).padStart(6)} ms  regels: ${String(row.rule.label || "-").slice(0, 30).padEnd(30)} ${row.verdictRules.padEnd(11)} -> eind: ${String(row.final.label || "-").slice(0, 30).padEnd(30)} ${row.verdictFinal.padEnd(11)} AI: ${row.ai.status}${row.ai.promptTokens != null ? ` ${row.ai.promptTokens + (row.ai.completionTokens || 0)} tok ${row.ai.aiMs} ms` : ""}`);
}

const count = (field, v) => rows.filter((r) => r[field] === v).length;
const called = rows.filter((r) => r.ai.promptTokens != null);
const summary = {
  sites: rows.length,
  rules: { ok: count("verdictRules", "ok"), partial: count("verdictRules", "partial"), unconfirmed: count("verdictRules", "unconfirmed"), wrong: count("verdictRules", "wrong") },
  withAi: { ok: count("verdictFinal", "ok"), partial: count("verdictFinal", "partial"), unconfirmed: count("verdictFinal", "unconfirmed"), wrong: count("verdictFinal", "wrong") },
  aiCalls: called.length,
  aiStatus: Object.fromEntries([...new Set(rows.map((r) => r.ai.status))].map((s) => [s, rows.filter((r) => r.ai.status === s).length])),
  avgAiMs: called.length ? Math.round(called.reduce((a, r) => a + (r.ai.aiMs || 0), 0) / called.length) : null,
  avgTokens: called.length ? Math.round(called.reduce((a, r) => a + r.ai.promptTokens + (r.ai.completionTokens || 0), 0) / called.length) : null,
  totalCostUsd: PRICE_IN || PRICE_OUT ? Number(rows.reduce((a, r) => a + (r.ai.costUsd || 0), 0).toFixed(4)) : "zet PRICE_IN/PRICE_OUT",
  avgScanMs: Math.round(rows.reduce((a, r) => a + r.scanMs, 0) / Math.max(1, rows.length)),
};
console.log("\nSAMENVATTING", JSON.stringify(summary, null, 1));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ createdAt: new Date().toISOString(), base: BASE, summary, rows }, null, 1));
console.log(`\nResultaat opgeslagen in ${OUT}`);
