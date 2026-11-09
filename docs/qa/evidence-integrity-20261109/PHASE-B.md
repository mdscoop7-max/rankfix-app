# Phase B — decision source integrity

Confirmed before repair: a known sector with no homepage role evidence and one supporting page was reported as a confirmed own provider with two independent sources. The second source was manufactured from the sector label itself. The new regression fails on d5e16b0 and passes after removal of that fallback.

`lib/operating-role.ts` no longer invents own-service activity or a homepage source from a known sector. The route now passes the actual homepage URL. It supplies observed own-activity fragments, rather than manufacturing manufacturer/publisher evidence from the selected sector label or treating LocalBusiness address/contact details as proof of the trade. Supporting page votes retain matching metadata fragments, reject third-party/audience clauses and deduplicate repeated fragments. The existing detectors and their original checks remain. Final service applicability now consistently includes the independently verified non-commerce identity already used earlier in the pipeline.

This conservative metadata guard is not an independently validated semantic classifier. It can reduce recall, and does not yet prove that every apparent self-declaration is true. Two distinct fragments are not automatically independent business verification. AI verification and broader taxonomy accuracy still require real-data validation. Do not translate the confidence score into accuracy.

The phase-B source-circle test is green; the phase-C weak-score regression remains red intentionally until the scoring repair. Full regression validation follows the combined changes. No 9/10 claim.
