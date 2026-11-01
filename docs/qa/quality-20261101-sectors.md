# Quality improvement 3: identity before customer capabilities

Baseline: QA `1d7d753`. No domain exceptions, no live scans.

Two generic defects were reproduced before changing rules:

- The primary payment-purpose lexicon omitted Portuguese and Polish provider declarations. A Portuguese PSP became SaaS; a Polish PSP remained unknown. Two supported own-identity sources now recognise these declarations. Explicit Portuguese/Polish retail self-descriptions still veto payment-provider classification. Merely mentioning accepted payment methods remains insufficient.
- Explicit software ownership in both title and description was held at a probable tier or ignored without a narrowly worded demo funnel. A provider of booking software could thus be classified as its hotel/restaurant customers. Explicit software-product identity now qualifies independently of that funnel and outranks incidental customer-sector words. Typed operators, financial identity and explicit retail identity retain their existing priority.

The runtime/crawler/rules versions were advanced so old and new evidence can be distinguished. Website score formulas were not increased or rewritten.

## Fixed-input results

- New development matrix: baseline 36/39 sites correct (5 failed assertions across 3 sites); candidate 39/39.
- Existing sector peers: 41/41 before and after; existing broad matrix: 142/142 before and after.
- Frozen same-author synthetic validation: baseline 11/13 sites correct; candidate 12/13. One Portuguese PSP remains unknown at confidence 0. Both its strict sector and subtype assertions remain FAILED in the saved results. No rules were tuned after opening these results. This is a no-regression pass, not an all-correct validation pass or independent 9/10.
- Existing stored evidence: Mollie stays financial_payments (96 website score), Philips stays manufacturing_industrial (83); Accor remains unknown (72). Scores and sector verdicts are unchanged. These are limited route reconstructions, not a new measurement of those websites.
- Full stored Adidas, Rossopomodoro and 12GO Biking audits are unavailable in the repository; they have not been counted as passing reference audits. Existing approximate/synthetic cases remain useful regressions, not replacements for missing audits.
- Focused sector tests: 75/75 with the temporary local Next-response adapter.

Saved comparison: `docs/qa/results/quality-20261101-sectors.json`. Frozen inputs, taxonomy mapping and rule fingerprints: `tests/fixtures/sector-quality/manifest.json`. Before tuning, label aliases were corrected to RankFix's existing top-level taxonomy (logistics → transport_travel, energy → energy_utilities, telecom → telecom_technology, software_app → saas_b2b); they were not counted as engine fixes. Repeated synthetic templates are labelled invariance tests, not independent support.

`run-sector-peers.mjs` now exports its real route runner, restores global test transports on exit, rejects empty selections and missing reports, fingerprints inputs, records per-case outcomes and exits nonzero on strict assertion failures. The new tests require all development cases to pass and previously correct validation cases never to regress, while retaining unresolved strict labels visibly. Existing suites remain in place.

Remaining: independent reviewer-approved real-website holdout, the unresolved Portuguese declaration, real browser/database/build/UI validation. No assertion of 9/10 or readiness for 144 sites.
