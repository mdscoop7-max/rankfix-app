import { presentScore, scorePresentationCopy, type ScorePresentation } from "@/lib/score-presentation";

// Score presentation for existing layouts. No own colours or boxes: every
// variant renders with the class names of the surrounding design, so the
// current look on desktop and mobile stays unchanged.

type ResultLike = {
  scorePresentation?: ScorePresentation | null;
  coverage?: { coveragePercent?: number; highConfidencePercent?: number; unableToConfirm?: number } | null;
  scoreModel?: { range?: { low: number; high: number } | null } | null;
  summary?: { unableToConfirm?: number } | null;
  rendering?: { botProtection?: unknown; mode?: string } | null;
};

// Presentation for results saved before scorePresentation existed: derived
// from the same stored coverage and range, so old and new scans read alike.
export function resolveScorePresentation(result: ResultLike | null | undefined): ScorePresentation | null {
  if (!result) return null;
  if (result.scorePresentation) return result.scorePresentation;
  if (typeof result.coverage?.coveragePercent !== "number") return null;
  return presentScore({
    coveragePercent: result.coverage.coveragePercent,
    highConfidencePercent: result.coverage.highConfidencePercent,
    unableToConfirm: result.coverage.unableToConfirm ?? result.summary?.unableToConfirm ?? 0,
    range: result.scoreModel?.range ?? null,
    botReduced: Array.isArray(result.rendering?.botProtection) ? result.rendering.botProtection.length > 0 : Boolean(result.rendering?.botProtection),
  });
}

// Headline above the score: unchanged label for confirmed scores, the
// localized "provisional score" label when the evidence is incomplete.
export function scoreHeadline(result: ResultLike | null | undefined, language: string, confirmedLabel: string): string {
  const presentation = resolveScorePresentation(result);
  return presentation?.status === "provisional" ? scorePresentationCopy(language).provisional : confirmedLabel;
}

// Public scan result: plain lines in the style of the existing "Grade" line.
export function ScoreEvidenceLines({ result, language, className }: { result: ResultLike | null | undefined; language: string; className: string }) {
  const presentation = resolveScorePresentation(result);
  if (!presentation || presentation.status !== "provisional") return null;
  const copy = scorePresentationCopy(language);
  return (
    <div className={className} data-score-status="provisional" title={copy.note}>
      <div>{copy.coverage} {presentation.coveragePercent}% · {copy.reliability} {copy.levels[presentation.reliability]}</div>
      {presentation.range ? <div>{copy.range} {presentation.range.low}–{presentation.range.high}</div> : null}
    </div>
  );
}

// Dashboard audit hero: extra pills inside the existing .rf-audit-score-facts
// row (unconfirmed checks are already one of its pills).
export function ScoreEvidenceFacts({ result, language }: { result: ResultLike | null | undefined; language: string }) {
  const presentation = resolveScorePresentation(result);
  if (!presentation || presentation.status !== "provisional") return null;
  const copy = scorePresentationCopy(language);
  return (
    <>
      <span data-score-status="provisional" title={copy.note}><strong>{copy.provisional}</strong></span>
      <span>{copy.coverage} <strong>{presentation.coveragePercent}%</strong></span>
      <span>{copy.reliability} <strong>{copy.levels[presentation.reliability]}</strong></span>
      {presentation.range ? <span>{copy.range} <strong>{presentation.range.low}–{presentation.range.high}</strong></span> : null}
    </>
  );
}
