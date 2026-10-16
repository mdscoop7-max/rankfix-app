// RankFix 3.5 scorecard v2 — FROZEN before evaluation (16 Oct 2026).
// Method, weights and acceptance limits are documented in docs/SCORECARD-3.5.md.
// Pure functions: rows (from eu81.mjs exportRows), attempts summary and an
// optional manual review file. A criterion without data is "not measured";
// it is never filled in, and an incomplete scorecard can never reach 9/10.
import { classify, hasTruth } from "./metrics.mjs";

export const SCORECARD_V2 = Object.freeze({
  version: "3.5-v2",
  frozenAt: "2026-10-16",
  criteria: Object.freeze([
    { key: "sector", label: "Sectorherkenning (strikt)", weight: 2.0, target: 95, floor: 70 },
    { key: "page_type", label: "Paginatypeherkenning", weight: 1.0, target: 95, floor: 75 },
    { key: "platform", label: "CMS- en platformherkenning", weight: 1.0, target: 95, floor: 75 },
    { key: "seo_geo", label: "SEO/GEO-correctheid van bevindingen", weight: 1.5, target: 98, floor: 85 },
    { key: "modules", label: "Moduletoepasbaarheid", weight: 1.0, target: 95, floor: 75 },
    { key: "evidence", label: "Betrouwbaarheid van bewijs", weight: 0.5, target: 100, floor: 90 },
    { key: "calibration", label: "Zekerheidskalibratie", weight: 1.0, target: 99, floor: 90 },
    { key: "international", label: "Internationale prestaties (slechtste land/taal)", weight: 0.5, target: 90, floor: 60 },
    { key: "consistency", label: "Rapportconsistentie", weight: 0.5, target: 100, floor: 90 },
    { key: "stability", label: "Stabiliteit (scan geslaagd)", weight: 1.0, target: 95, floor: 70 },
  ]),
  acceptance: Object.freeze({ minTotal: 9.0, allMeasured: true, noCriterionBelowFloor: true, minSectorAccuracyPct: 80, minSectorSupport: 3, maxConfidentWrongPerSector: 0, confidentAt: 85 }),
});

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

/** Report invariants recomputed from a stored result (criterion 9). */
export function reportInvariantViolations(result) {
  if (!result) return null;
  const checks = result.checks?.length ? result.checks : [...(result.seo?.checks || []), ...(result.geo?.checks || [])];
  const v = [];
  for (const c of checks) {
    if (!c || !(c.maxPoints > 0)) continue;
    if ((c.status === "warning" || c.status === "fail") && !(c.points < c.maxPoints)) v.push(`${c.key}: ${c.status} zonder aftrek`);
    if (c.status === "pass" && c.points !== c.maxPoints) v.push(`${c.key}: geslaagd met aftrek`);
    if (c.status === "unable_to_confirm" && c.points > 0) v.push(`${c.key}: onbevestigd met punten`);
  }
  const score = result.overallScore;
  const range = result.scoreModel?.range;
  if (typeof score === "number" && range && (score < range.low || score > range.high)) v.push(`score ${score} buiten bereik ${range.low}–${range.high}`);
  if (score >= 100 && checks.some((c) => c?.status === "unable_to_confirm" && c.maxPoints > 0)) v.push("100 met onbevestigde controles");
  if (result.rendering?.javascriptExecuted && checks.some((c) => /opnieuw met geslaagde JavaScript-rendering/i.test(`${c?.message} ${c?.fix || ""}`))) v.push("render-advies na geslaagde rendering");
  v.push(...(result.selfCheck?.corrections || []).map((x) => `zelfcontrole: ${x.code || x.reason || "correctie"}`));
  return v;
}

/** Share of scored checks carrying a source URL and a recorded finding (criterion 6). */
export function evidenceCoverage(result) {
  const checks = result?.checks?.length ? result.checks : [...(result?.seo?.checks || []), ...(result?.geo?.checks || [])];
  const scored = checks.filter((c) => ["pass", "warning", "fail"].includes(c?.status) && c.maxPoints > 0);
  return { scored: scored.length, withEvidence: scored.filter((c) => c.evidence?.url && c.evidence.found !== null && c.evidence.found !== undefined).length };
}

const fraction = (value, c) => Math.max(0, Math.min(1, (value - c.floor) / (c.target - c.floor)));

/**
 * rows: per site { id, expected, predicted, confidence, scanned, country, result? }
 * attempts: { attemptedSites, sitesWithSuccess } (from eu81 attemptSummary) or null
 * review: { sites: { [id]: { pages: {correct, total}, platformCorrect: bool, findings: {correct, total}, modulesCorrect: bool } } } or null
 */
export function scorecardV2(rows, attempts = null, review = null) {
  const truthRows = rows.filter((r) => r.scanned && hasTruth(r));
  const values = {};
  // 1. Sector: correct / scanned sites with ground truth (unknown never counts).
  values.sector = truthRows.length ? pct(truthRows.filter((r) => classify(r) === "correct").length, truthRows.length) : null;
  // 2–5. Manual review of a pre-defined sample (docs/SCORECARD-3.5.md §3).
  const rv = review?.sites ? Object.values(review.sites) : [];
  const sum = (k) => rv.reduce((a, s) => ({ c: a.c + (s[k]?.correct || 0), t: a.t + (s[k]?.total || 0) }), { c: 0, t: 0 });
  const pages = sum("pages"); values.page_type = pages.t ? pct(pages.c, pages.t) : null;
  const plat = rv.filter((s) => typeof s.platformCorrect === "boolean"); values.platform = plat.length ? pct(plat.filter((s) => s.platformCorrect).length, plat.length) : null;
  const finds = sum("findings"); values.seo_geo = finds.t ? pct(finds.c, finds.t) : null;
  const mods = rv.filter((s) => typeof s.modulesCorrect === "boolean"); values.modules = mods.length ? pct(mods.filter((s) => s.modulesCorrect).length, mods.length) : null;
  // 6. Evidence: scored checks with recorded evidence.
  const ev = rows.filter((r) => r.result).map((r) => evidenceCoverage(r.result)).reduce((a, b) => ({ s: a.s + b.scored, e: a.e + b.withEvidence }), { s: 0, e: 0 });
  values.evidence = ev.s ? pct(ev.e, ev.s) : null;
  // 7. Calibration: 100 − share of confident-wrong sectors; and the 90–100 bin must hold up.
  const confAt = SCORECARD_V2.acceptance.confidentAt;
  if (truthRows.length) {
    const confidentWrong = truthRows.filter((r) => classify(r) === "wrong" && (r.confidence ?? 100) >= confAt).length;
    const top = truthRows.filter((r) => (r.confidence ?? 0) >= 90 && classify(r) !== "abstain");
    // The frozen protocol requires at least five high-confidence predictions.
    // With fewer than five, calibration is unmeasured — never assume 100%.
    const topAcc = top.length >= 5 ? pct(top.filter((r) => classify(r) === "correct").length, top.length) : null;
    values.calibration = topAcc == null ? null : Math.min(100 - pct(confidentWrong, truthRows.length), topAcc);
  } else values.calibration = null;
  // 8. International: worst country/language group with at least 3 sites.
  const groups = {};
  for (const r of truthRows) { const g = r.language || r.country || "?"; (groups[g] ||= []).push(r); }
  const groupAcc = Object.entries(groups).filter(([, xs]) => xs.length >= 3).map(([g, xs]) => ({ group: g, n: xs.length, accuracyPct: pct(xs.filter((r) => classify(r) === "correct").length, xs.length) }));
  values.international = groupAcc.length ? Math.min(...groupAcc.map((g) => g.accuracyPct)) : null;
  // 9. Consistency: reports without invariant violations.
  const inv = rows.filter((r) => r.result).map((r) => reportInvariantViolations(r.result));
  values.consistency = inv.length ? pct(inv.filter((v) => v.length === 0).length, inv.length) : null;
  // 10. Stability: sites with a stored report / attempted sites (blocked = failed).
  // Planned sites are not scan attempts. Without attempt logs the stability
  // denominator is unknown; do not infer a successful run from stored reports.
  values.stability = attempts?.attemptedSites ? pct(attempts.sitesWithSuccess, attempts.attemptedSites) : null;

  const criteria = SCORECARD_V2.criteria.map((c) => {
    const value = values[c.key];
    const points = value == null ? null : Math.round(fraction(value, c) * c.weight * 100) / 100;
    return { ...c, value, points, belowFloor: value != null && value < c.floor };
  });
  const total = Math.round(criteria.reduce((a, c) => a + (c.points || 0), 0) * 10) / 10;
  const unmeasured = criteria.filter((c) => c.value == null).map((c) => c.key);
  // Per sector: support, accuracy and confident-wrong (serious errors must stay visible).
  const perSector = {};
  for (const r of truthRows) { const s = [].concat(r.expected)[0]; const o = (perSector[s] ||= { n: 0, correct: 0, confidentWrong: 0 }); o.n++; if (classify(r) === "correct") o.correct++; if (classify(r) === "wrong" && (r.confidence ?? 100) >= confAt) o.confidentWrong++; }
  for (const o of Object.values(perSector)) o.accuracyPct = pct(o.correct, o.n);
  const a = SCORECARD_V2.acceptance;
  const sectorFailures = Object.entries(perSector).filter(([, o]) => (o.n >= a.minSectorSupport && o.accuracyPct < a.minSectorAccuracyPct) || o.confidentWrong > a.maxConfidentWrongPerSector).map(([s]) => s);
  const accepted = total >= a.minTotal && unmeasured.length === 0 && !criteria.some((c) => c.belowFloor) && sectorFailures.length === 0;
  return { version: SCORECARD_V2.version, total, maxPossible: Math.round((total + criteria.filter((c) => c.value == null).reduce((x, c) => x + c.weight, 0)) * 10) / 10, accepted, unmeasured, sectorFailures, criteria, perSector, perGroup: groupAcc };
}
