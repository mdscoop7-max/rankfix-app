/**
 * Score evidence fields for the TestLab export (fresh144 analysis, 29 Oct 2026).
 *
 * The export used to carry only `overallScore`, `seo`, `geo` and `evidenceLevel`.
 * A reader could not tell a final 99 from a 99 that rests on a handful of
 * confirmed checks, because coverage, unconfirmed counts, the headline range and
 * the rendering outcome were left out. This projection copies those fields from
 * the scan response; it never computes or changes a score.
 */
import { dimensionDisplayOf } from "./dimension-score-display.mjs";
type Dimension = { score?: number | null; coverage?: { coveragePercent?: number; relevant?: number; confirmed?: number; unableToConfirm?: number } | null } | null | undefined;
type ScanResponseLike = {
  scoreModel?: {
    evidenceLevel?: string | null;
    evidenceReasons?: string[] | null;
    range?: { low?: number; high?: number } | null;
    headline?: { kind?: string; display?: string } | null;
    seoRange?: { low?: number; high?: number } | null;
    geoRange?: { low?: number; high?: number } | null;
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
  /** "97" or "64–99 (indicatie)": the SEO/GEO number as it may be shown. */
  seoDisplay: string | null;
  geoDisplay: string | null;
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
    seoDisplay: data?.seo?.score == null ? null : dimensionDisplayOf(data, "seo").text,
    geoDisplay: data?.geo?.score == null ? null : dimensionDisplayOf(data, "geo").text,
    seoEvidenceLevel: dimensions?.seo?.level ?? null,
    geoEvidenceLevel: dimensions?.geo?.level ?? null,
    renderingCompleteness: data?.rendering?.completeness ?? null,
    evidenceReasons: Array.isArray(model?.evidenceReasons) ? model!.evidenceReasons!.filter((reason) => typeof reason === "string").slice(0, 8) : [],
  };
}

/** Extra CSV columns, appended after the existing ones so older parsers keep working. */
export const SCORE_EVIDENCE_CSV_HEADERS = ["headline", "headline_kind", "range_low", "range_high", "coverage_percent", "unconfirmed_checks", "seo_coverage_percent", "geo_coverage_percent", "seo_evidence_level", "geo_evidence_level", "rendering_completeness", "evidence_reasons", "seo_display", "geo_display"] as const;

export function scoreEvidenceCsvValues(fields: Partial<ScoreEvidenceFields> | null | undefined): Array<string | number> {
  const f = fields || {};
  return [f.headline ?? "", f.headlineKind ?? "", f.rangeLow ?? "", f.rangeHigh ?? "", f.coveragePercent ?? "", f.unableToConfirm ?? "", f.seoCoveragePercent ?? "", f.geoCoveragePercent ?? "", f.seoEvidenceLevel ?? "", f.geoEvidenceLevel ?? "", f.renderingCompleteness ?? "", (f.evidenceReasons || []).join(" | "), f.seoDisplay ?? "", f.geoDisplay ?? ""];
}

/**
 * What a TestLab row or QA report shows as "the score" (QA 30 Oct: "NXP 98/100
 * met 62% bewijsdekking"). The headline the customer report shows is the range
 * whenever evidence is incomplete; the point score (computed over confirmed
 * checks only) is never shown alone next to incomplete evidence.
 */
export function scoreDisplay(score: number | null | undefined, evidence: ScoreEvidenceFields | null | undefined, evidenceLevel?: string | null): { main: string; detail: string | null } {
  if (score == null) return { main: "—", detail: null };
  const level = evidenceLevel || null;
  const coverage = evidence?.coveragePercent ?? null;
  const range = evidence?.headlineKind === "range" && evidence.headline ? evidence.headline
    : evidence?.rangeLow != null && evidence?.rangeHigh != null && evidence.rangeLow < evidence.rangeHigh && level !== "complete" ? `${evidence.rangeLow}–${evidence.rangeHigh}` : null;
  const qualifier = level === "insufficient" ? "indicatie" : level && level !== "complete" ? "voorlopig" : level === "complete" ? "definitief" : null;
  const parts = [range ? `punt ${Math.round(score)} op bevestigd bewijs` : null, coverage != null ? `dekking ${coverage}%` : null, qualifier].filter(Boolean);
  return { main: range || String(Math.round(score)), detail: parts.length ? parts.join(" · ") : null };
}
