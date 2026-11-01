export type AuditIssueStatus =
  | "PASS"
  | "FAIL"
  | "WARNING"
  | "INFO"
  | "NOT_APPLICABLE"
  | "UNABLE_TO_CONFIRM";

export type ScorableAuditCheck = {
  issue_status: AuditIssueStatus;
  points: number;
  maxPoints: number;
  confidence?: "high" | "medium" | "low";
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  rootCause?: string;
  fix_status?: "WAITING" | "AWAITING_MERGE" | "STILL_PRESENT" | "DONE";
};

export const SCORE_MODEL_VERSION = "3.5-evidence-gated";

// Fixed SEO/GEO core: adding sector-specific checks may increase report coverage
// without silently changing the headline score on the same website.
const CORE_SEO = new Set(["broken_links","internal_redirects","semantic_link_destination","title","description","h1","headings","canonical","viewport","lang","indexability","alt","content","https","status","response","social","robots_txt","sitemap","twitter_card","hreflang","duplicate_path","html_escape","image_sources"]);
const CORE_GEO = new Set(["schema","organization_website","entity","breadcrumbs","faq","author","trust","answer","identity"]);
export function stableCoreChecks<T extends ScorableAuditCheck & {key?:string}>(checks:T[], group:"seo"|"geo"):T[] {
  const keys = group==="seo" ? CORE_SEO : CORE_GEO;
  return checks.filter(item=>keys.has(item.key||""));
}


export function weightedCoverage(items: ScorableAuditCheck[]) {
  const relevant = items.filter((item) => item.issue_status !== "NOT_APPLICABLE");
  const totalWeight = relevant.reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  const assessed = relevant.filter((item) => item.issue_status !== "UNABLE_TO_CONFIRM");
  const assessedWeight = assessed.reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  const highConfidenceWeight = assessed
    .filter((item) => item.confidence === "high")
    .reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  return {
    relevant: relevant.length,
    confirmed: assessed.length,
    unableToConfirm: relevant.length - assessed.length,
    totalWeight,
    assessedWeight,
    coveragePercent: totalWeight ? Math.round((assessedWeight / totalWeight) * 100) : 0,
    highConfidencePercent: assessedWeight ? Math.round((highConfidenceWeight / assessedWeight) * 100) : 0,
  };
}

export function scoreRange(items: ScorableAuditCheck[]) {
  const applicable = items.filter((item) => item.issue_status !== "NOT_APPLICABLE");
  const assessed = applicable.filter((item) => item.issue_status !== "UNABLE_TO_CONFIRM");
  const unverified = applicable.filter((item) => item.issue_status === "UNABLE_TO_CONFIRM");
  const assessedWeight = assessed.reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  const unverifiedWeight = unverified.reduce((sum, item) => sum + Math.max(0, item.maxPoints), 0);
  const applicableWeight = assessedWeight + unverifiedWeight;
  // Same formula as the score itself (severity weighting, root-cause dedupe):
  // low = every unconfirmed check would fail, high = every one would pass.
  // The score, which leaves unconfirmed checks out, therefore always lies in range.
  const asOutcome = (pass: boolean) => applicable.map((item) => item.issue_status !== "UNABLE_TO_CONFIRM" ? item
    : { ...item, issue_status: pass ? "PASS" as const : "WARNING" as const, points: pass ? item.maxPoints : 0, rootCause: undefined, severity: "LOW" as const, confidence: "high" as const });
  return {
    low: applicableWeight ? scoreApplicableChecks(asOutcome(false)) : 0,
    high: applicableWeight ? scoreApplicableChecks(asOutcome(true)) : 0,
    assessedWeight,
    unverifiedWeight,
    applicableWeight,
  };
}

/** Overall range on the same 0.6 × SEO + 0.4 × GEO basis as the overall score. */
export function combinedScoreRange(seo: ReturnType<typeof scoreRange>, geo: ReturnType<typeof scoreRange>, weights = { seo: 0.6, geo: 0.4 }) {
  return {
    low: Math.round(seo.low * weights.seo + geo.low * weights.geo),
    high: Math.round(seo.high * weights.seo + geo.high * weights.geo),
    assessedWeight: seo.assessedWeight + geo.assessedWeight,
    unverifiedWeight: seo.unverifiedWeight + geo.unverifiedWeight,
    applicableWeight: seo.applicableWeight + geo.applicableWeight,
  };
}

export function scoreApplicableChecks(items: ScorableAuditCheck[]): number {
  const applicable = items.filter(
    (item) => item.issue_status !== "NOT_APPLICABLE" && item.issue_status !== "UNABLE_TO_CONFIRM"
  );
  const max = applicable.reduce((sum, item) => sum + item.maxPoints, 0);
  if (!max) return 0;

  // A low-confidence result must never masquerade as a proven hard failure.
  // Callers should normally emit UNABLE_TO_CONFIRM for weak evidence; this
  // safeguard prevents an accidental low-confidence FAIL from lowering scores.
  const confidenceSafe = applicable.map((item) =>
    item.issue_status === "FAIL" && item.confidence === "low"
      ? { ...item, points: item.maxPoints, issue_status: "INFO" as const }
      : item
  );

  // Score each proven root cause once. Dependent checks stay visible for
  // explanation, but cannot multiply the same underlying penalty.
  const rootCausePenalty = new Map<string, number>();
  let earnedWithoutRootCause = 0;
  let maxWithoutRootCause = 0;
  for (const item of confidenceSafe) {
    if (!item.rootCause || item.issue_status === "PASS" || item.issue_status === "INFO") {
      earnedWithoutRootCause += item.points;
      maxWithoutRootCause += item.maxPoints;
      continue;
    }
    const rawPenalty = Math.max(0, item.maxPoints - item.points);
    const severityMultiplier =
      item.severity === "CRITICAL" ? 1.75 :
      item.severity === "HIGH" ? 1.5 :
      item.severity === "MEDIUM" ? 1.2 : 1;
    const confidenceMultiplier = item.confidence === "medium" ? 0.9 : 1;
    const penalty = Math.min(item.maxPoints, rawPenalty * severityMultiplier * confidenceMultiplier);
    rootCausePenalty.set(item.rootCause, Math.max(rootCausePenalty.get(item.rootCause) || 0, penalty));
    maxWithoutRootCause += item.maxPoints;
    earnedWithoutRootCause += item.maxPoints;
  }
  const dedupedPenalty = [...rootCausePenalty.values()].reduce((sum, penalty) => sum + penalty, 0);
  return Math.max(0, Math.round(((earnedWithoutRootCause - dedupedPenalty) / maxWithoutRootCause) * 100));
}

export function summarizeAuditChecks(items: ScorableAuditCheck[]) {
  const actionable = items.filter((item) => item.issue_status === "FAIL" || item.issue_status === "WARNING");
  const severityOf = (item: ScorableAuditCheck) =>
    "severity" in item ? String((item as ScorableAuditCheck & { severity?: string }).severity || "INFO") : "INFO";
  const confidenceOf = (item: ScorableAuditCheck) =>
    "confidence" in item ? String((item as ScorableAuditCheck & { confidence?: string }).confidence || "low") : "low";
  return {
    passed: items.filter((item) => item.issue_status === "PASS").length,
    issues: actionable.length,
    // Priority buckets are evidence-aware: only confirmed FAILs can be critical/high
    // priorities. Warnings remain important/advice so optimization guidance never
    // outranks a proven technical problem.
    critical: actionable.filter((item) => item.issue_status === "FAIL" && severityOf(item) === "CRITICAL" && confidenceOf(item) === "high").length,
    important: actionable.filter((item) =>
      (item.issue_status === "FAIL" && ["HIGH","MEDIUM"].includes(severityOf(item)) && confidenceOf(item) !== "low") ||
      (item.issue_status === "WARNING" && severityOf(item) === "HIGH" && confidenceOf(item) === "high")
    ).length,
    advice: actionable.filter((item) =>
      !(item.issue_status === "FAIL" && severityOf(item) === "CRITICAL" && confidenceOf(item) === "high") &&
      !((item.issue_status === "FAIL" && ["HIGH","MEDIUM"].includes(severityOf(item)) && confidenceOf(item) !== "low") ||
        (item.issue_status === "WARNING" && severityOf(item) === "HIGH" && confidenceOf(item) === "high"))
    ).length,
    notApplicable: items.filter((item) => item.issue_status === "NOT_APPLICABLE").length,
    unableToConfirm: items.filter((item) => item.issue_status === "UNABLE_TO_CONFIRM").length,
    pendingFixes: items.filter((item) => item.fix_status === "WAITING" || item.fix_status === "AWAITING_MERGE" || item.fix_status === "STILL_PRESENT").length,
  };
}


export type ScoreCapCheck = {
  maxPoints: number;
  issue_status: AuditIssueStatus;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  confidence: "high" | "medium" | "low";
};

export function applyEvidenceBasedScoreCap(score: number, items: ScoreCapCheck[]): number {
  const provenCritical = items.some(
    (item) => item.issue_status === "FAIL" && item.severity === "CRITICAL" && item.confidence === "high"
  );
  if (provenCritical) return Math.min(score, 70);

  const provenHigh = items.some(
    (item) => item.issue_status === "FAIL" && item.severity === "HIGH" && item.confidence !== "low"
  );
  if (provenHigh) return Math.min(score, 88);
  // 100 means "nothing to improve": any confirmed warning or failure caps the
  // rounded score at 99 so a report never shows 100/100 next to an open issue.
  if (items.some((item) => item.issue_status === "WARNING" || item.issue_status === "FAIL")) return Math.min(score, 99);
  // Unknown signals must never be an invisible numeric penalty. The fixed
  // core result is stable when additional modules become unconfirmed. Missing
  // evidence is shown through coverage and a provisional score range instead.
  return score;
}

/**
 * 100/100 means "nothing left to improve". The numeric score uses the stable
 * core checks, but sector/trust checks outside the core can still report a
 * confirmed issue; any scored WARNING/FAIL in the full report keeps the
 * rounded score at most 99 so the headline never contradicts the issue list.
 */
export function capPerfectScore(score: number, items: Array<Pick<ScoreCapCheck, "issue_status" | "maxPoints">>): number {
  return items.some((item) => item.maxPoints > 0 && (item.issue_status === "WARNING" || item.issue_status === "FAIL")) ? Math.min(score, 99) : score;
}

/**
 * 100/100 is a claim that nothing is left to improve. That claim needs complete
 * evidence: with any applicable check still unconfirmed, the score stays at
 * most 99 and the report says why (issue #151: 100/100 at 53-55% coverage).
 * Unconfirmed checks still never cost more than that single point.
 */
export function requireCompleteEvidenceForPerfect(score: number, items: Array<Pick<ScorableAuditCheck, "issue_status" | "maxPoints">>): number {
  return score >= 100 && items.some((item) => item.maxPoints > 0 && item.issue_status === "UNABLE_TO_CONFIRM") ? 99 : score;
}

/**
 * Uncertainty range over EVERY applicable check (core and sector modules), not
 * only the stable core. Previously a report could show "mogelijk bereik
 * 100-100" next to twelve unconfirmed sector checks because those checks were
 * outside the core set. low = every unconfirmed check fails, high = every one
 * passes; the range always contains the displayed score.
 */
export function evidenceRange(score: number, coreRange: { low: number; high: number }, allItems: ScorableAuditCheck[]) {
  const full = scoreRange(allItems);
  const hasUnverified = full.unverifiedWeight > 0;
  // Each unconfirmed weight point can move the headline at most its share of the
  // applicable weight; this keeps the band interpretable for core-based scores.
  const share = full.applicableWeight ? full.unverifiedWeight / full.applicableWeight : 0;
  const lowFromShare = Math.round(score * (1 - share));
  const low = Math.min(score, coreRange.low, hasUnverified ? Math.min(full.low, lowFromShare) : coreRange.low);
  const high = Math.max(score, coreRange.high, hasUnverified ? Math.min(100, Math.max(full.high, score + Math.round((100 - score) * share))) : coreRange.high);
  return { low: Math.max(0, low), high: Math.min(100, high), unverifiedWeight: full.unverifiedWeight, applicableWeight: full.applicableWeight, assessedWeight: full.assessedWeight, basis: "all_applicable_checks" as const };
}

export type EvidenceLevel = "complete" | "provisional" | "insufficient";

/**
 * Below this share of confirmed weight a dimension's number describes only part
 * of the site. Same boundary as the overall "insufficient" level (coverage < 60).
 */
export const MIN_DIMENSION_COVERAGE_PERCENT = 60;

/**
 * Evidence behind ONE dimension's number (SEO or GEO), judged on the stable core
 * checks that actually produce the score. fresh144 (29 Oct 2026): a GEO score of
 * 99 could rest on one confirmed 5-point check while overall coverage looked fine.
 *
 * This never changes a score. It only says whether the number may be read as a
 * grade (`determinable`) or only as an indication. Sector confidence plays no
 * part here: an unknown sector does not make SEO/GEO evidence weak, and thin
 * SEO/GEO evidence is not a sector problem.
 */
export function dimensionEvidence(items: Array<ScorableAuditCheck & { key?: string }>, group: "seo" | "geo") {
  const core = stableCoreChecks(items, group);
  const coverage = weightedCoverage(core);
  const level: EvidenceLevel = coverage.totalWeight === 0 || coverage.coveragePercent < MIN_DIMENSION_COVERAGE_PERCENT
    ? "insufficient"
    : coverage.unableToConfirm > 0 ? "provisional" : "complete";
  return {
    group,
    level,
    coveragePercent: coverage.coveragePercent,
    confirmedWeight: coverage.assessedWeight,
    applicableWeight: coverage.totalWeight,
    unconfirmed: coverage.unableToConfirm,
    determinable: level !== "insufficient",
  };
}

/**
 * One qualifier for the headline score, from coverage, rendering and sector
 * certainty. "insufficient" means the number describes only part of the site
 * evidence and must be presented as an indication, never as a final grade.
 */
export function evidenceLevel(input: { coveragePercent: number; javascriptRequiredButNotRendered: boolean; renderDegraded?: boolean; renderPartial?: boolean; sectorConfidence?: number; sectorUnknown?: boolean; unconfirmed: number; importantUnconfirmed?: string[]; pageSample?: { selected: number; fetched: number }; dimensions?: Array<{ name: "SEO" | "GEO"; coveragePercent: number }> }): { level: EvidenceLevel; reasons: string[] } {
  const reasons: string[] = [];
  // Check coverage (weighted applicable checks) is not page coverage: a report
  // whose representative sample mostly failed to load (1 of 16 pages) cannot
  // present site-wide conclusions as definitive, whatever the check coverage.
  const sample = input.pageSample;
  const thinSample = Boolean(sample && sample.selected >= 4 && sample.fetched / sample.selected < 0.5);
  if (thinSample && sample) reasons.push(`Steekproef: ${sample.fetched} van ${sample.selected} geselecteerde pagina's opgehaald`);
  if (input.coveragePercent < 60) reasons.push(`Bewijsdekking ${input.coveragePercent}% (onder 60%)`);
  else if (input.coveragePercent < 90) reasons.push(`Bewijsdekking ${input.coveragePercent}% (onder 90%)`);
  if (input.javascriptRequiredButNotRendered) reasons.push("JavaScript-pagina niet volledig gerenderd");
  if (input.renderDegraded) reasons.push("Browser-rendering leverde minder inhoud dan de ruwe HTML");
  if (input.renderPartial) reasons.push("Pagina laadde niet volledig binnen de tijdslimiet; een momentopname van de browser is gebruikt");
  if (input.unconfirmed > 0) reasons.push(`${input.unconfirmed} toepasselijke controle(s) niet te bevestigen`);
  // Fewer than a quarter of a real sample (8+ pages) loaded: the report rests on
  // one or two pages, so it is an indication only (TestLab 23-10: 1 of 16 pages).
  const severelyThinSample = Boolean(sample && sample.selected >= 8 && sample.fetched / sample.selected < 0.25);
  // One thin dimension is enough: the headline blends SEO and GEO, so a well
  // evidenced SEO score must not carry a GEO score built on a few checks.
  const thinDimensions = (input.dimensions || []).filter((dimension) => dimension.coveragePercent < MIN_DIMENSION_COVERAGE_PERCENT);
  for (const dimension of thinDimensions) reasons.push(`${dimension.name}-bewijsdekking ${dimension.coveragePercent}% (onder ${MIN_DIMENSION_COVERAGE_PERCENT}%): de ${dimension.name}-score rust op te weinig bevestigde controles`);
  const insufficient = input.coveragePercent < 60 || (input.javascriptRequiredButNotRendered && input.coveragePercent < 75) || severelyThinSample || thinDimensions.length > 0;
  // An ambiguous primary sector changes which modules apply: never "definitief".
  const sectorAmbiguous = typeof input.sectorConfidence === "number" && input.sectorConfidence > 0 && input.sectorConfidence < 75;
  if (sectorAmbiguous) reasons.push(`Hoofdsector niet eenduidig (zekerheid ${input.sectorConfidence}%)`);
  // No primary sector at all: the sector modules could not be chosen, so the score
  // covers only the generic checks and is never "definitief".
  const sectorUnknown = Boolean(input.sectorUnknown);
  if (sectorUnknown) reasons.push("Hoofdsector niet vastgesteld: alleen algemene controles toegepast");
  const important = input.importantUnconfirmed || [];
  if (important.length) reasons.push(`Belangrijke controle(s) niet bevestigd: ${important.slice(0, 3).join(", ")}`);
  // "Complete" (shown as "Definitief") is a claim that every applicable check was
  // confirmed. One unconfirmed check, however light, leaves an uncertainty range
  // above or below the score, so the score is provisional (field report 16-10:
  // 98/100 "definitief" next to 3 unconfirmed checks and a stored range 90-99).
  const level: EvidenceLevel = insufficient ? "insufficient" : input.coveragePercent < 90 || input.unconfirmed > 0 || input.javascriptRequiredButNotRendered || input.renderDegraded || input.renderPartial || important.length > 0 || sectorAmbiguous || sectorUnknown || thinSample ? "provisional" : "complete";
  return { level, reasons };
}

/**
 * What the big headline number shows. Whenever the evidence is not complete
 * (provisional or insufficient) and the unconfirmed checks really leave room
 * (low < high), the headline is the range ("82–99") and the point score moves to
 * the detail line: a single number such as 99 claims more than the scan can
 * support. Complete evidence, or a range of one value, shows the plain score.
 * Only presentation changes; the score itself is never recalculated here.
 */
export function headlineScore(score: number, range: { low: number; high: number } | null | undefined, _coveragePercent: number, level: EvidenceLevel) {
  const asRange = Boolean(range) && level !== "complete" && range!.low < range!.high;
  return { numeric: score, kind: asRange ? "range" as const : "score" as const, display: asRange ? `${range!.low}–${range!.high}` : String(score) };
}
