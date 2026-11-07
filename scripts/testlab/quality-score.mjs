#!/usr/bin/env node
// RankFix scan quality score (owner goal: 9/10). Transparent rubric over a
// TestLab Fresh144 evidence export (fresh144-evidence-<sha>.json).
//
//   node scripts/testlab/quality-score.mjs <evidence.json> [<baseline-evidence.json>]
//
// Per SUCCESSFUL scan, 0-10 points, only from measured fields:
//   Branche            5   exact/equivalent 5 · partial 3.5 · honestly unconfirmed 2.5 · wrong 0
//   Rapportconsistentie 1  self-check found no contradiction 1 · contradiction repaired 0.5
//   Score-eerlijkheid  2   complete evidence 2 · provisional 1.5 · high headline (>=95)
//                          on provisional evidence 1 · insufficient evidence shown as >=95 0
//   Snelheid           2   <=45 s 2 · <=90 s 1 · slower 0
// Failed scans get no quality score; they are listed with their cause, and
// failures RankFix itself may cause (timeouts, internal errors) are counted.
// NOT measured automatically (needs labelled pages): page-type accuracy,
// individual SEO/GEO check accuracy. Report them from manual review.
import { readFileSync } from "node:fs";

const SITE_CAUSE = /^(HTTP_BLOCKED|CHALLENGE_OR_INTERSTITIAL|SITE_TLS_INVALID|SITE_RATE_LIMITED|SITE_DOMAIN_NOT_FOUND|HTTP_PAYMENT_REQUIRED|HTTP_AUTH_REQUIRED|HTTP_NOT_FOUND)$/;

export function scoreRow(row) {
  const run = row.run || {}, ev = row.evidence || {};
  if (run.status !== "success") return { host: row.host, failed: true, cause: run.reason || row.failure || "onbekend", ours: !SITE_CAUSE.test(String(run.reason || "")) };
  const v = row.verdict;
  const sector = v === "exact" || v === "equivalent" ? 5 : v === "partial" ? 3.5 : v === "unconfirmed" ? 2.5 : 0;
  const corrections = ev.selfCheck?.corrections || [];
  const consistency = corrections.length ? 0.5 : 1;
  const s = ev.score || {};
  const level = s.evidenceLevel, overall = Number(s.overall);
  const honesty = level === "complete" ? 2 : level === "provisional" ? (overall >= 95 ? 1 : 1.5) : level === "insufficient" ? (overall >= 95 ? 0 : 1) : 1;
  const ms = Number(run.elapsedMs || 0);
  const speed = ms <= 45000 ? 2 : ms <= 90000 ? 1 : 0;
  return { host: row.host, failed: false, verdict: v, points: { sector, consistency, honesty, speed }, total: sector + consistency + honesty + speed, elapsedMs: ms, evidenceLevel: level, overall };
}

export function summarize(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const rows = data.rows.map(scoreRow);
  const ok = rows.filter((r) => !r.failed), failed = rows.filter((r) => r.failed);
  const avg = (k) => ok.reduce((a, r) => a + (k ? r.points[k] : r.total), 0) / Math.max(1, ok.length);
  const sorted = [...ok].sort((a, b) => a.total - b.total);
  return {
    commit: data.commitSha, scans: rows.length, successful: ok.length, failed: failed.length,
    failedPossiblyOurs: failed.filter((r) => r.ours).map((r) => `${r.host} (${r.cause})`),
    average: Number(avg().toFixed(2)),
    parts: { sector: Number(avg("sector").toFixed(2)), consistency: Number(avg("consistency").toFixed(2)), honesty: Number(avg("honesty").toFixed(2)), speed: Number(avg("speed").toFixed(2)) },
    worst: sorted.slice(0, 8).map((r) => `${r.host} ${r.total} (${r.verdict}, ${Math.round(r.elapsedMs / 1000)} s, ${r.evidenceLevel})`),
    atLeast9: ok.filter((r) => r.total >= 9).length,
    below7: ok.filter((r) => r.total < 7).length,
    notMeasured: ["paginatypes", "juistheid individuele SEO/GEO-controles"],
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("quality-score.mjs")) {
  const [file, baseline] = process.argv.slice(2);
  if (!file) { console.error("Gebruik: node scripts/testlab/quality-score.mjs <evidence.json> [<baseline.json>]"); process.exit(2); }
  const now = summarize(file);
  console.log(JSON.stringify(baseline ? { baseline: summarize(baseline), now } : now, null, 1));
}
