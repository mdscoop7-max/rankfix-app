# Phase C — consistent scoring uncertainty

Proven regression: adding a low-confidence PASS with weight 100 to a high-confidence 5/10 result raised the score from 50 to 95. A low-confidence FAIL was converted to full-credit INFO by the old scoring safeguard. A warning could still deduct. Coverage/range counted these outcomes as measured.

`lib/audit-score.ts` now normalizes low-confidence PASS/WARNING/FAIL to UNABLE_TO_CONFIRM before score, coverage, ranges and summaries. The existing final-route demoter applies the same policy to all three outcomes, so report status and arithmetic agree. Missing evidence neither earns points nor incurs a deduction. Model version advances to 3.5.1-evidence-integrity. Existing controls remain visible.

The identical new phase-B/C tests now pass (3/3; two failed before, duplicate-source test was already green). Broader route/score regressions remain under validation. Legacy assertions expecting URL-only missing status or rewarded/penalised low-confidence warnings were corrected explicitly; real status/content 404 regressions are retained. These changes assert the owner's evidence policy, not website-specific labels.

Limitations: exclusion is not proof that remaining high-confidence checks have semantically sufficient evidence. The existing `found !== null` evidence gate is only a recorded-finding check; independent review of source fragments and the real-input comparison remain necessary. No live accuracy percentage or deployment claim.

Final targeted validation after the source-fragment guard and the final confidence gate: **48/48 pass**, TypeScript passes. The final gate now also retains the single-source cap (70) after later AI/shop processing; previously only caps below 70 survived. This prevents late confidence inflation without additional accepted own-activity evidence. Full suite results are recorded separately because the first full run overlapped implementation and is not an immutable-revision acceptance run.
