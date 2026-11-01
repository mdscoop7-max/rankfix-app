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

## Frozen holdout result — no tuning after measurement

| Outcome | Baseline | Candidate |
| --- | ---: | ---: |
| Correctly identified explicit activity | 48 | 59 |
| Unknown outputs | 23 | 12 |
| Wrong non-unknown sector | 5 | 5 |
| Of the unknowns: correctly abstained | 2 | 2 |

76 cases total. Exact expected outcome including correctly unknown controls:
50/76 to 61/76 (65.8% to 80.3%). On explicit known activities: 48/72 to 59/72.
There are 11 recovered identities, zero earlier-correct cases worsened, and zero
new false positives under the fixed assertions. The same five wrong positives
remain. False negatives fall from 24 to 13; ten known activities still abstain.
Applicability, limited evidence-integrity, accounting and API/report consistency
assertions: 76/76 on both revisions. These limited assertions do NOT establish
semantic correctness of every SEO/GEO statement or true rendered dashboard behaviour.

Remaining unknown: Dutch marketplace self-description with a brand-only title,
Dutch business consultancy, German legal practice and training institute, English
association, Dutch marketing agency, Spanish medical clinic, Dutch residential
rental, English amusement park and French cybersecurity.

Wrong classifications (all already wrong on the baseline):

- Spanish travel agency → tourism_recreation (expected transport_travel under the
  frozen catalog mapping; taxonomy boundary also needs independent label review).
- Medical equipment manufacturer → health_wellness, confidence 90. Customer and
  negated treatment words still outrank the manufacturer's own production evidence.
- Editorial campsite guide → hospitality, confidence 96. A legacy lodging rule
  still interprets editorial subject matter as the organisation's own activity.
- Conflicting bank/hospital identity → health_wellness, confidence 88. The new
  unknown guard cannot correct a wrong non-unknown decision made upstream.
- Manufacturer with a true secondary shop → ecommerce, confidence 94. The narrow
  hybrid trade fix remains green, but manufacturer/shop priority is not solved.

These are material open risks, including overconfident wrong identities. They
are reported before any next development round. No rule/threshold was changed in
response to this new set; the fixtures and plan remain byte-for-byte frozen.
No 9/10 rating: qualityScore=null and certified=false. The sector result is below
90%, and external independent real-world review is absent.

All 307 selected page observations in the synthetic set were audited; these are
samples of fixture pages, not a discovered count or complete site audit. No
unconfirmed page observations here; that does not prove access on real websites.
No interactive checkout, actual browser or live site was exercised.

## Tests, changes and traceability

Production changes are limited to app/api/scan/route.ts (existing identity/guard
calls), lib/site-sector-corroboration.mjs (shared vocabulary and evidence gates),
lib/catalog-primary-declarations.mjs (catalog service declarations), and
lib/sector-motor-decisions.ts (unknown confidence guard). No scoring weights,
UI components, URL fetching, cookies or access/bypass behaviour changed.
Next documentation/dependencies are not installed locally. No new Next.js API
is used; local route checks use the existing mock loader plus a temporary
NextResponse adapter. CI checks real Next.js type generation, TypeScript/build.

CI run 41341141268 on 8c7fb7c passed: 869 tests / 0 failures / 8 skips,
10 crawler checks, 34 PostgreSQL AutoFix scenarios, type generation, TypeScript,
build without deployment. The eight skips remain four genuine database scan/
persistence/dashboard tests (RF_PG_TEST_URL absent), one slow timeout and three
optional stored replays. They are not presented as passed. AutoFix PG checks
simulate GitHub/websites and perform no real merge/deployment.

Evidence files are under docs/qa/results/sector-round2: individual original-20
analysis/resolution, development-before/step1/step2, fresh-baseline/candidate and
comparison. SHA-256 binds each result to its frozen inputs and raw response bytes.
Raw route responses remain locally at /tmp/sector-round2-*-reports.json and are
reproducible offline with the recorded revisions. The five result JSON files
retain every case and assertion; line formatting was compacted for review only.

The new frozen controls reveal broader false positives, so this is a measured
partial improvement, not a completed international-quality certification. Another
separate development round and a fresh unseen set are necessary. Live five-site
or 144-site work is not started or certified ready; permission is still required.
