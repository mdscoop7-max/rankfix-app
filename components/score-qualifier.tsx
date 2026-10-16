import { scoreQualifier, scoreScope, type QualifiableResult } from "@/lib/score-qualifier";
import type { Locale } from "@/lib/locales";

/** Qualifier shown directly under every headline score: final, provisional or indication only. */
export function ScoreQualifier({ result, locale }: { result: QualifiableResult | null | undefined; locale: Locale }) {
  const q = scoreQualifier(result, locale);
  const color = q.level === "complete" ? "inherit" : q.level === "provisional" ? "#b45309" : "#b91c1c";
  return (
    <p className="rf-score-qualifier" data-evidence-level={q.level} style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.4 }}>
      <strong style={{ color }}>{q.label}</strong>
      {q.detail ? <span style={{ opacity: 0.8 }}> · {q.detail}</span> : null}
      <small style={{ display: "block", opacity: 0.8 }}>{scoreScope(result, locale)}</small>
      {q.note ? <small style={{ display: "block", opacity: 0.7 }}>{q.note}</small> : null}
    </p>
  );
}
