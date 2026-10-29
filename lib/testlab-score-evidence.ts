/**
 * Score evidence fields for the TestLab export (fresh144 analysis, 29 Oct 2026).
 *
 * The export used to carry only `overallScore`, `seo`, `geo` and `evidenceLevel`.
 * A reader could not tell a final 99 from a 99 that rests on a handful of
 * confirmed checks, because coverage, unconfirmed counts, the headline range and
 * the rendering outcome were left out. This projection copies those fields from
 * the scan response; it never computes or changes a score.
 */
type Dimension = { coverage?: { coveragePercent?: number; relevant?: number; confirmed?: number; unableToConfirm?: number } | null } | null | undefined;
type ScanResponseLike = {
  scoreModel?: {
    evidenceLevel?: string | null;
    evidenceReasons?: string[] | null;
    range?: { low?: number; high?: number } | null;
    headline?: { kind?: string; display?: string } | null;
    dimensionEvidence?: { seo?: { level?: string | null; coveragePercent?: number | null } | null; geo?: { level?: string | null; coveragePercent?: number | null } | null } | null;
  } | null;
  coverage?: { coveragePercent?: number; unableToConfirm?: number } | null;
  seo?: Dimension;
  geo?: Dimension;
  rendering?: { completeness?: string | null } | null;
};

export type ScoreEvidenceFields = {
  headline: string | null;
  headlineKind: "score" | "range" | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  coveragePercent: number | null;
  unableToConfirm: number | null;
  seoCoveragePercent: number | null;
  geoCoveragePercent: number | null;
  seoEvidenceLevel: string | null;
  geoEvidenceLevel: string | null;
  renderingCompleteness: string | null;
  evidenceReasons: string[];
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function scoreEvidenceFields(data: ScanResponseLike | null | undefined): ScoreEvidenceFields {
  const model = data?.scoreModel || null;
  const headlineKind = model?.headline?.kind === "range" ? "range" : model?.headline?.kind === "score" ? "score" : null;
  const dimensions = model?.dimensionEvidence || null;
  return {
    headline: typeof model?.headline?.display === "string" ? model.headline.display : null,
    headlineKind,
    rangeLow: num(model?.range?.low),
    rangeHigh: num(model?.range?.high),
    coveragePercent: num(data?.coverage?.coveragePercent),
    unableToConfirm: num(data?.coverage?.unableToConfirm),
    seoCoveragePercent: num(dimensions?.seo?.coveragePercent) ?? num(data?.seo?.coverage?.coveragePercent),
    geoCoveragePercent: num(dimensions?.geo?.coveragePercent) ?? num(data?.geo?.coverage?.coveragePercent),
    seoEvidenceLevel: dimensions?.seo?.level ?? null,
    geoEvidenceLevel: dimensions?.geo?.level ?? null,
    renderingCompleteness: data?.rendering?.completeness ?? null,
    evidenceReasons: Array.isArray(model?.evidenceReasons) ? model!.evidenceReasons!.filter((reason) => typeof reason === "string").slice(0, 8) : [],
  };
}

/** Extra CSV columns, appended after the existing ones so older parsers keep working. */
export const SCORE_EVIDENCE_CSV_HEADERS = ["headline", "headline_kind", "range_low", "range_high", "coverage_percent", "unconfirmed_checks", "seo_coverage_percent", "geo_coverage_percent", "seo_evidence_level", "geo_evidence_level", "rendering_completeness", "evidence_reasons"] as const;

export function scoreEvidenceCsvValues(fields: Partial<ScoreEvidenceFields> | null | undefined): Array<string | number> {
  const f = fields || {};
  return [f.headline ?? "", f.headlineKind ?? "", f.rangeLow ?? "", f.rangeHigh ?? "", f.coveragePercent ?? "", f.unableToConfirm ?? "", f.seoCoveragePercent ?? "", f.geoCoveragePercent ?? "", f.seoEvidenceLevel ?? "", f.geoEvidenceLevel ?? "", f.renderingCompleteness ?? "", (f.evidenceReasons || []).join(" | ")];
}
