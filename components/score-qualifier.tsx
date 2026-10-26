import { confirmedChecksLine, scoreQualifier, scoreScope, type QualifiableResult } from "@/lib/score-qualifier";
import type { Locale } from "@/lib/locales";
import { ScoreCaution } from "@/components/sitewide-issues";

/** Qualifier shown directly under every headline score: final, provisional or indication only. */
export function ScoreQualifier({ result, locale }: { result: QualifiableResult | null | undefined; locale: Locale }) {
  const q = scoreQualifier(result, locale);
  const color = q.level === "complete" ? "inherit" : q.level === "provisional" ? "#b45309" : "#b91c1c";
  return (
    <div className="rf-score-qualifier" data-evidence-level={q.level} style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.4 }}>
      <strong style={{ color }}>{q.label}</strong>
      {/* QA 144: a high score never reads as "the whole site is near perfect". */}
      <ScoreCaution scope={result?.scoreModel?.scope} />
      {q.detail ? <span style={{ opacity: 0.8 }}> · {q.detail}</span> : null}
      <small style={{ display: "block", opacity: 0.8 }}>{scoreScope(result, locale)}</small>
      {confirmedChecksLine(result, locale) ? <small className="rf-score-confirmed" style={{ display: "block", opacity: 0.8 }}>{confirmedChecksLine(result, locale)}</small> : null}
      {q.note ? <small style={{ display: "block", opacity: 0.7 }}>{q.note}</small> : null}
    </div>
  );
}
