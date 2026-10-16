// RankFix engine quality metrics (pure functions, no I/O).
//
// A "row" is one scanned site:
//   { id, expected: string | string[], predicted: string, confidence?: number,
//     score?: number, coverage?: number, reliability?: "high"|"medium"|"low",
//     evidenceLevel?: string, unconfirmed?: number, invariantViolations?: number,
//     scanned: boolean, ms?: number, acceptUnknown?: boolean }
//
// The metrics are deliberately strict: abstaining ("unknown") is never counted
// as correct, but it is reported separately from a confident wrong answer,
// because a wrong sector damages a report far more than an honest "unknown".

const UNKNOWN = new Set(["unknown", "general_business", null, undefined, ""]);
const asList = (v) => (Array.isArray(v) ? v : [v]);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const quantile = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

// A row has ground truth when it names a real sector. "unknown" is never a
// correct answer for such a row (not even when abstaining was acceptable), so
// strict accuracy = correct sector / scanned rows with ground truth.
const truthOf = (row) => asList(row.expected).filter((x) => !UNKNOWN.has(x));
export const hasTruth = (row) => truthOf(row).length > 0;

export function classify(row) {
  if (!row.scanned) return "not_scanned";
  if (!hasTruth(row)) return UNKNOWN.has(row.predicted) ? "no_truth_abstained" : "no_truth_guessed";
  if (UNKNOWN.has(row.predicted)) return "abstain";
  return truthOf(row).includes(row.predicted) ? "correct" : "wrong";
}

export function sectorMetrics(rows) {
  const scannedAll = rows.filter((r) => r.scanned);
  const scanned = scannedAll.filter(hasTruth);
  const out = { planned: rows.length, scannedAll: scannedAll.length, scanned: scanned.length, scanSuccessPct: pct(scannedAll.length, rows.length) };
  const k = { correct: 0, wrong: 0, abstain: 0, no_truth_abstained: 0, no_truth_guessed: 0 };
  for (const r of scannedAll) k[classify(r)]++;
  const decided = k.correct + k.wrong;
  Object.assign(out, {
    correct: k.correct, wrong: k.wrong, abstained: k.abstain,
    // Strict: only a correct sector counts; an abstention never does.
    accuracyPct: pct(k.correct, scanned.length),
    // Precision of the sector decisions that were actually made.
    decisionPrecisionPct: pct(k.correct, decided),
    abstentionPct: pct(k.abstain, scanned.length),
    wrongSectorPct: pct(k.wrong, scanned.length),
    highConfidenceWrong: scanned.filter((r) => classify(r) === "wrong" && (r.confidence ?? 100) >= 80).length,
    // Sites without a determinable sector (empty shells, ambiguous pages):
    // abstaining is the honest outcome there, a guess is reported separately.
    noTruthRows: k.no_truth_abstained + k.no_truth_guessed,
    noTruthGuessed: k.no_truth_guessed,
  });
  // Per expected sector: recall, precision, F1 (macro over sectors present).
  const sectors = [...new Set(scanned.map((r) => truthOf(r)[0]))].sort();
  out.perSector = sectors.map((s) => {
    const tp = scanned.filter((r) => truthOf(r)[0] === s && truthOf(r).includes(r.predicted)).length;
    const fn = scanned.filter((r) => truthOf(r)[0] === s && !truthOf(r).includes(r.predicted)).length;
    const fp = scanned.filter((r) => r.predicted === s && !truthOf(r).includes(s)).length;
    const precision = tp + fp ? tp / (tp + fp) : null;
    const recall = tp + fn ? tp / (tp + fn) : null;
    const f1 = precision != null && recall != null && precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { sector: s, support: tp + fn, tp, fp, fn, precisionPct: precision == null ? null : Math.round(precision * 1000) / 10, recallPct: recall == null ? null : Math.round(recall * 1000) / 10, f1: Math.round(f1 * 1000) / 1000 };
  });
  out.macroF1 = out.perSector.length ? Math.round((out.perSector.reduce((a, b) => a + b.f1, 0) / out.perSector.length) * 1000) / 1000 : null;
  out.confusion = scannedAll.filter((r) => ["wrong", "abstain", "no_truth_guessed"].includes(classify(r))).map((r) => ({ id: r.id, expected: truthOf(r)[0] ?? "(geen sector bepaalbaar)", predicted: r.predicted ?? "unknown", confidence: r.confidence ?? null, outcome: classify(r) }));
  return out;
}

// Calibration: does stated sector confidence match observed correctness?
export function calibration(rows) {
  const bins = [[90, 101, "90–100"], [80, 90, "80–89"], [60, 80, "60–79"]];
  return bins.map(([lo, hi, label]) => {
    const inBin = rows.filter((r) => r.scanned && !UNKNOWN.has(r.predicted) && typeof r.confidence === "number" && r.confidence >= lo && r.confidence < hi);
    const ok = inBin.filter((r) => classify(r) === "correct").length;
    return { bin: label, n: inBin.length, observedAccuracyPct: pct(ok, inBin.length), expectedMinPct: lo };
  });
}

// Score honesty: headline numbers that claim more than the evidence supports.
export function scoreHonesty(rows) {
  const s = rows.filter((r) => r.scanned && typeof r.score === "number");
  const lowCov = (r) => typeof r.coverage === "number" && r.coverage < 70;
  return {
    reports: s.length,
    perfectWithIncompleteEvidence: s.filter((r) => r.score >= 100 && ((r.unconfirmed ?? 0) > 0 || (typeof r.coverage === "number" && r.coverage < 100))).length,
    // A bare 98-100 headline at <70% evidence. When the report shows a range
    // headline instead (headlineKind "range"), the claim is qualified.
    score98PlusAtLowCoverage: s.filter((r) => r.score >= 98 && lowCov(r) && r.headlineKind !== "range").length,
    qualifiedHighScoreAtLowCoverage: s.filter((r) => r.score >= 98 && lowCov(r) && r.headlineKind === "range").length,
    score98PlusLowReliability: s.filter((r) => r.score >= 98 && r.reliability === "low").length,
    lowCoverageNotQualified: s.filter((r) => lowCov(r) && r.evidenceLevel !== undefined && r.evidenceLevel === "complete").length,
    medianCoveragePct: quantile(s.map((r) => r.coverage).filter((x) => typeof x === "number"), 0.5),
    coverageBelow70: s.filter(lowCov).length,
    reliability: { high: s.filter((r) => r.reliability === "high").length, medium: s.filter((r) => r.reliability === "medium").length, low: s.filter((r) => r.reliability === "low").length },
  };
}

export function consistency(rows) {
  const s = rows.filter((r) => r.scanned && typeof r.invariantViolations === "number");
  return { reports: s.length, reportsWithViolations: s.filter((r) => r.invariantViolations > 0).length, violations: s.reduce((a, r) => a + r.invariantViolations, 0) };
}

export function performance(rows) {
  const ms = rows.filter((r) => typeof r.ms === "number").map((r) => r.ms);
  return { n: ms.length, p50Ms: quantile(ms, 0.5), p95Ms: quantile(ms, 0.95), maxMs: ms.length ? Math.max(...ms) : null };
}

/**
 * Quality scorecard, 0-10, from measured values only. Each criterion has an
 * explicit target; a criterion without data is "not measured" and the total is
 * reported as an upper bound, never filled in.
 */
export function scorecard(m) {
  const crit = [
    { key: "sector_accuracy", weight: 2.5, value: m.sector?.accuracyPct, target: 95, floor: 60 },
    { key: "no_confident_wrong_sector", weight: 2, value: m.sector?.scanned ? 100 - (m.sector.wrongSectorPct ?? 100) : null, target: 99, floor: 85 },
    { key: "score_honesty", weight: 2, value: m.honesty?.reports ? 100 - pct(m.honesty.perfectWithIncompleteEvidence + m.honesty.score98PlusAtLowCoverage + m.honesty.lowCoverageNotQualified, m.honesty.reports) : null, target: 100, floor: 80 },
    { key: "report_consistency", weight: 1.5, value: m.consistency?.reports ? 100 - pct(m.consistency.reportsWithViolations, m.consistency.reports) : null, target: 100, floor: 80 },
    { key: "scan_success", weight: 1, value: m.sector?.scanSuccessPct, target: 95, floor: 60 },
    { key: "evidence_coverage", weight: 1, value: m.honesty?.medianCoveragePct, target: 90, floor: 50 },
  ];
  let total = 0; let measuredWeight = 0;
  for (const c of crit) {
    if (c.value == null) { c.points = null; continue; }
    const frac = Math.max(0, Math.min(1, (c.value - c.floor) / (c.target - c.floor)));
    c.points = Math.round(frac * c.weight * 100) / 100;
    total += c.points; measuredWeight += c.weight;
  }
  const allWeight = crit.reduce((a, c) => a + c.weight, 0);
  return { criteria: crit, score: Math.round(total * 10) / 10, measuredWeight, maxPossible: Math.round((total + (allWeight - measuredWeight)) * 10) / 10, complete: measuredWeight === allWeight };
}

export function evaluate(rows) {
  const m = { sector: sectorMetrics(rows), calibration: calibration(rows), honesty: scoreHonesty(rows), consistency: consistency(rows), performance: performance(rows) };
  m.scorecard = scorecard(m);
  return m;
}
