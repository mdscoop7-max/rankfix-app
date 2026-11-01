# Sector recovery round two — frozen evaluation plan

Branch fix/engine-reliability-20261101; draft PR #218. No live requests to sites,
new 144 measurement, merge or deployment. Prior hybrid/access/cookie work retained.

The former 68-case holdout is now explicitly DEVELOPMENT/REGRESSION material.
Its historical inputs/plan/results are unchanged for traceability, not reused as
an independent assessment. Per-case pre-change evidence is stored in
results/sector-round2/diagnosis-before.json: expected/actual sector, confidence,
URL, title/description/H1, detector votes, catalog candidates and the causal rule.

All 20 cases have explicit own-activity evidence in metadata. Nineteen failed
because an own-identity rule/language form was missing. The port operator already
had homepage plus /about corroboration but was vetoed by a broader government
identity. This is distinct from genuinely insufficient/contradictory evidence:
those cases must still abstain, never acquire artificial confidence.

Step 1 (04968a6): six repaired, 54 correct / 0 wrong / 14 unknown in development.
Language variants: French beauty/medical clinic, German architecture, Dutch
horticulture compound; general manufacturer declaration with actual production
context; a public port requires operating evidence to refine government.
The original 48 correct cases and 114 sector peers remain correct.

Step 2 (8c7fb7c): fourteen repaired, 68 correct / 0 wrong / 0 unknown in development.
Shared declarations cover marketplace sellers, travel, SaaS/applications, events,
wholesale, meal delivery, photography, childcare, elderly care, parking, holiday
rentals, campsites and coworking. Title/H1 own identity and supporting description
are required. Audience/editorial/consultancy exclusions protect similar businesses.
A final unknown-sector guard caps certainty at 35/low; it adds no score points.
104 focused unit cases, 114 peers and broad 142-case matrix pass. The old 68-case
set is added as a mandatory route regression, including capability/uncertainty
assertions. No sector keywords or exceptions are tied to domains/countries.
Language dictionaries are finite; support for every phrasing is not claimed.

## New assessment, frozen before first execution

76 new synthetic organisations: all 66 catalog subtypes plus ten controls covering
customer markets, editorials, quotes, conflicting/sparse identities, government
regulation versus operating, and real secondary shops at trades/manufacturers.
Six languages (NL/EN/DE/FR/ES/IT), new hosts, titles and descriptions. Exact inputs,
SHA-256, criteria, baseline and candidate revisions are in
`tests/fixtures/quality-round2-20261101/plan.json`.

Baseline 81c8db2 and candidate 8c7fb7c receive the same frozen HTML and harness.
Correct explicit identities, wrong sectors, unknown outputs and appropriately
unknown controls are reported separately. Applicability, evidence integrity,
page-sample accounting, confidence and API/report consistency are separate metrics.
Each measured dimension must reach 90% with no baseline regressions; this alone
still cannot certify an independent 9/10 report-quality score.

The engine rules are frozen during this assessment. Any deficiencies are reported
first. They may only be addressed in a separate development round followed by
another unseen assessment. New inputs have not been executed while tuning.

This is a same-author synthetic frozen holdout, not independently labelled real
website/browser evidence. No new real websites are fetched without permission.
`qualityScore` stays null and certification false. Genuine browser, security,
persisted database/dashboard, human semantic SEO/GEO review and stronger per-sector
sampling remain required. API evidence assertions do not prove the correctness of
every recommendation or complete international coverage. Scans remain PAGE_SAMPLE.
