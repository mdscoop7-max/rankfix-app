import { presentScore, scorePresentationCopy, type ScorePresentation } from "@/lib/score-presentation";

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

export function scoreHeadline(result: ResultLike | null | undefined, language: string): string {
  const presentation = resolveScorePresentation(result);
  const copy = scorePresentationCopy(language);
  return presentation?.status === "provisional" ? copy.provisional : copy.confirmed;
}

const tone: Record<string, string> = {
  high: "border-emerald-300/40 bg-emerald-50 text-emerald-800",
  medium: "border-amber-300/50 bg-amber-50 text-amber-800",
  low: "border-rose-300/50 bg-rose-50 text-rose-800",
};

export default function ScoreConfidence({ result, language, compact = false }: { result: ResultLike | null | undefined; language: string; compact?: boolean }) {
  const presentation = resolveScorePresentation(result);
  if (!presentation) return null;
  const copy = scorePresentationCopy(language);
  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${tone[presentation.reliability]}`} data-score-status={presentation.status}>
      <div className="font-bold">{presentation.status === "provisional" ? copy.provisional : copy.confirmed}</div>
      <div>{copy.coverage}: <strong>{presentation.coveragePercent}%</strong> · {copy.reliability}: <strong>{copy.levels[presentation.reliability]}</strong></div>
      <div><strong>{presentation.unconfirmedChecks}</strong> {copy.unconfirmed}{presentation.range ? <> · {copy.range}: <strong>{presentation.range.low}–{presentation.range.high}</strong></> : null}</div>
      {!compact && presentation.status === "provisional" ? <p className="mt-1 opacity-80">{copy.note}</p> : null}
    </div>
  );
}
