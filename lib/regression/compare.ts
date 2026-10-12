// Classifies one site's nightly result against its baseline. Pure.
//
// Separates three things that must never be mixed up:
//  - real regressions: the page is unchanged (same content fingerprint) or an
//    evidence-bound invariant broke, yet RankFix now reports something worse;
//  - changed website content: the fingerprint differs, so a difference may be
//    the site's own change and is reported as a warning only;
//  - insufficient evidence: blocked, timed out, low coverage or reduced bot
//    pages. Never a regression and never an alarm.
import type { PilotSiteExpectation } from "./pilot-sites.ts";
import type { Finding, RegressionSnapshot } from "./snapshot.ts";

export type ResultClass =
  | "passed"            // scanned, invariants hold, no worse than baseline
  | "baseline_created"  // first usable scan for this site
  | "warning"           // needs a look, not proven to be RankFix
  | "unconfirmed"       // scanned, but evidence too thin to compare
  | "blocked"           // site refused automated access
  | "timeout"
  | "skipped"
  | "regression";       // proven: unchanged page, worse RankFix result

export type Classification = {
  result: ResultClass;
  reasons: string[];
  invariantViolations: string[];
  newFindings: Finding[];
  resolvedFindings: Finding[];
  scoreDelta: { overall: number | null; seo: number | null; geo: number | null };
  contentChanged: boolean | null;
  scannerChanged: boolean | null;
};

// An overall drop of this size on an unchanged page is a regression; smaller
// movements are reported as a difference only.
export const SCORE_DROP_REGRESSION = 8;
export const SCORE_DROP_WARNING = 3;
export const MIN_COVERAGE_PERCENT = 70;

const delta = (current: number | null, baseline: number | null | undefined) =>
  current === null || baseline === null || baseline === undefined ? null : current - baseline;

export function usableBaseline(snapshot: RegressionSnapshot | null | undefined): boolean {
  return Boolean(snapshot && snapshot.outcome === "scanned" && !snapshot.botProtection
    && (snapshot.coveragePercent ?? 0) >= MIN_COVERAGE_PERCENT);
}

export function invariantViolations(snapshot: RegressionSnapshot, expect: PilotSiteExpectation): string[] {
  if (snapshot.outcome !== "scanned") return [];
  const out: string[] = [];
  // A reduced bot response cannot prove a classification either way.
  if (snapshot.botProtection) return snapshot.pageTypeContradictions.map((c) => `paginatype-tegenstrijdigheid: ${c}`);
  if (expect.sectors?.length && snapshot.sector && !expect.sectors.includes(snapshot.sector.key)
    && (snapshot.sector.confidenceScore ?? 0) >= 60) {
    out.push(`sector ${snapshot.sector.key} (${snapshot.sector.confidenceScore ?? "?"}%) valt buiten verwacht: ${expect.sectors.join("/")}`);
  }
  if (expect.websiteTypes?.length && snapshot.websiteType && !expect.websiteTypes.includes(snapshot.websiteType)) {
    out.push(`websitetype ${snapshot.websiteType} valt buiten verwacht: ${expect.websiteTypes.join("/")}`);
  }
  if (expect.forbiddenWebsiteTypes?.length && snapshot.websiteType && expect.forbiddenWebsiteTypes.includes(snapshot.websiteType)) {
    out.push(`websitetype ${snapshot.websiteType} is voor deze site een onterechte claim`);
  }
  if (expect.pageTypes?.length && snapshot.pageType && !expect.pageTypes.includes(snapshot.pageType.type)) {
    out.push(`paginatype ${snapshot.pageType.type} valt buiten verwacht: ${expect.pageTypes.join("/")}`);
  }
  for (const contradiction of snapshot.pageTypeContradictions) out.push(`paginatype-tegenstrijdigheid: ${contradiction}`);
  return out;
}

const confirmedFailures = (snapshot: RegressionSnapshot | null | undefined) =>
  new Map((snapshot?.findings || []).filter((f) => f.status === "FAIL" && f.confidence !== "low").map((f) => [f.rule, f]));
const anyFinding = (snapshot: RegressionSnapshot | null | undefined) =>
  new Map((snapshot?.findings || []).map((f) => [f.rule, f]));

export function classifyResult(
  current: RegressionSnapshot,
  baseline: RegressionSnapshot | null | undefined,
  expect: PilotSiteExpectation,
): Classification {
  const base: Classification = {
    result: "passed", reasons: [], invariantViolations: [], newFindings: [], resolvedFindings: [],
    scoreDelta: { overall: null, seo: null, geo: null }, contentChanged: null, scannerChanged: null,
  };
  if (current.outcome === "skipped") return { ...base, result: "skipped", reasons: [current.errorCode || "overgeslagen"] };
  if (current.outcome === "timeout") return { ...base, result: "timeout", reasons: ["scan niet binnen tijdsbudget afgerond"] };
  if (current.outcome === "blocked") {
    return { ...base, result: "blocked", reasons: [`website weigerde geautomatiseerde toegang (${current.errorCode || "onbekend"})${expect.botProtectionExpected ? " — verwacht voor deze site" : ""}`] };
  }
  if (current.outcome === "http_error") return { ...base, result: "unconfirmed", reasons: [`website niet bruikbaar opgehaald (${current.errorCode || "HTTP-fout"})`] };
  if (current.outcome === "scan_error") {
    // RankFix itself failed on a site that scanned fine before: that is ours.
    if (usableBaseline(baseline)) return { ...base, result: "regression", reasons: [`RankFix-scanner gaf een interne fout (${current.errorCode}) waar de vorige scan slaagde`] };
    return { ...base, result: "warning", reasons: [`RankFix-scanner gaf een interne fout (${current.errorCode})`] };
  }

  const violations = invariantViolations(current, expect);
  const baselineViolations = new Set(baseline && baseline.outcome === "scanned" ? invariantViolations(baseline, expect) : []);
  const contentChanged = baseline?.fingerprint && current.fingerprint ? baseline.fingerprint !== current.fingerprint : null;
  const scannerChanged = baseline ? (baseline.scanner.rules !== current.scanner.rules || baseline.scanner.crawler !== current.scanner.crawler || baseline.scanner.commit !== current.scanner.commit) : null;
  const scoreDelta = { overall: delta(current.overallScore, baseline?.overallScore), seo: delta(current.seoScore, baseline?.seoScore), geo: delta(current.geoScore, baseline?.geoScore) };

  const baseFailures = confirmedFailures(baseline);
  const currentFailures = confirmedFailures(current);
  const baseAll = anyFinding(baseline);
  const currentAll = anyFinding(current);
  const newFindings = [...currentFailures.values()].filter((f) => !baseFailures.has(f.rule));
  const resolvedFindings = [...baseAll.values()].filter((f) => !currentAll.has(f.rule));
  const result: Classification = { ...base, invariantViolations: violations, newFindings, resolvedFindings, scoreDelta, contentChanged, scannerChanged };

  const reasons: string[] = [];
  const newViolations = violations.filter((v) => !baselineViolations.has(v));
  const knownViolations = violations.filter((v) => baselineViolations.has(v));

  // Thin evidence: report, but never call it a regression.
  if (current.botProtection || (current.coveragePercent ?? 0) < MIN_COVERAGE_PERCENT) {
    reasons.push(current.botProtection
      ? "botbeveiliging leverde een gereduceerde pagina; afhankelijke controles blijven Niet te bevestigen"
      : `scoredekking ${current.coveragePercent ?? 0}% < ${MIN_COVERAGE_PERCENT}% — resultaat voorlopig`);
    // An invariant broken on a non-reduced page is still a hard, evidence-bound signal.
    if (!current.botProtection && newViolations.length && usableBaseline(baseline)) {
      return { ...result, result: "regression", reasons: [...reasons, ...newViolations] };
    }
    return { ...result, result: "unconfirmed", reasons: [...reasons, ...violations] };
  }

  if (!usableBaseline(baseline)) {
    if (violations.length) return { ...result, result: "warning", reasons: ["eerste bruikbare scan (baseline)", ...violations] };
    return { ...result, result: "baseline_created", reasons: ["eerste bruikbare scan vastgelegd als baseline"] };
  }

  if (newViolations.length) reasons.push(...newViolations);
  const drop = scoreDelta.overall !== null && scoreDelta.overall <= -SCORE_DROP_REGRESSION;
  const smallDrop = scoreDelta.overall !== null && scoreDelta.overall <= -SCORE_DROP_WARNING;

  if (contentChanged === true) {
    // The site changed: differences are reported, not blamed on RankFix. A new
    // invariant violation is still a regression: content changes do not turn
    // a practice website into a webshop.
    if (newViolations.length) return { ...result, result: "regression", reasons };
    const notes = ["website-inhoud gewijzigd t.o.v. baseline"];
    if (newFindings.length) notes.push(`${newFindings.length} nieuwe bevestigde fout(en) na inhoudswijziging`);
    if (drop || smallDrop) notes.push(`totaalscore ${scoreDelta.overall}`);
    return { ...result, result: newFindings.length || drop ? "warning" : "passed", reasons: notes };
  }

  if (newViolations.length) return { ...result, result: "regression", reasons };
  if (newFindings.length || drop) {
    const why = [
      ...(newFindings.length ? [`nieuwe bevestigde fout(en) op ongewijzigde pagina: ${newFindings.map((f) => f.rule).join(", ")}`] : []),
      ...(drop ? [`totaalscore ${scoreDelta.overall} op ongewijzigde pagina`] : []),
      ...(scannerChanged ? ["scannerversie/commit gewijzigd sinds baseline"] : []),
    ];
    // Without a fingerprint on either side the content cannot be proven equal.
    if (contentChanged === null) return { ...result, result: "warning", reasons: ["inhoudsgelijkheid niet te bewijzen", ...why] };
    return { ...result, result: "regression", reasons: why };
  }

  if (current.renderer === "raw_html" && baseline?.renderer === "javascript_rendered") {
    reasons.push(`rendering teruggevallen op raw HTML (${current.renderFallbackReason || "onbekende reden"})`);
  } else if (expect.javascriptSite && current.renderer === "raw_html" && current.renderFallbackReason) {
    reasons.push(`JavaScript-site niet gerenderd (${current.renderFallbackReason})`);
  }
  if (smallDrop) reasons.push(`totaalscore ${scoreDelta.overall}`);
  if (knownViolations.length) reasons.push(...knownViolations.map((v) => `bekend: ${v}`));
  return { ...result, result: reasons.length ? "warning" : "passed", reasons: reasons.length ? reasons : ["geen verschillen die aandacht vragen"] };
}
