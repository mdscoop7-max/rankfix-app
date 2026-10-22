# QA #186 — sector evidence and regression checkpoint

Status: repairs implemented and offline-verified; live acceptance remains open.
Production, subscriptions and `main` are unchanged. This change targets only
`qa/rankfix-shared-preview` through `fix/qa-sector-evidence-regression-186`.

Baseline: `fd33f2fa80d75313e90e8ddc7fb9a3c49efc80b2` (verified READY QA preview).

## Findings and changes

- Sector recovery used a sample deduplicated by DOM structure. Two independent
  service pages with the same template could collapse to one source. Recovery
  now uses the successfully fetched, URL/canonical-deduplicated page set.
- Recovery applies the existing multilingual primary-identity detectors per
  page. Two different identities on first-party pages must agree. Duplicate
  identity text, query aliases, failed/partial fetches and editorial pages do
  not establish corroboration. Conflicting primary activities abstain. Source
  URLs, alternatives and reasons are included in `sectorProfile.pageEvidence`.
  Existing established primary sectors are preserved. Sample-only recovery
  remains probable (78), not confirmed. No brand-specific rules were added.
- Hospital identity lacked the patient concept in several European languages.
  Hospital + patients can now provide separate concepts; patient mentions alone
  do not establish a healthcare provider. Negative publisher/retail controls
  and the existing independent EU identity fixtures remain in the test suite.
- The original C/D plans use subtype-like expectations (`payments`, `banking`,
  `insurance`) and aliases (`healthcare`, `telecom`, `energy`, `retail`,
  `logistics`, `software`, `travel`). Literal equality with the engine's broader
  sectors incorrectly counted some compatible labels as failures. The runner
  records broad-sector and subtype agreement separately. Neither establishes
  independently verified ground truth. All original labels are retained.
- A double-escaped regex prevented detecting a partial metadata head. Corrected
  so unavailable description/canonical evidence is not treated as proven absent.
- Report text and `multiPage.coverageDimensions` distinguish weighted check
  coverage, selected-page fetch/scoring coverage, and sector confidence. Zero
  audited pages are no longer displayed as one by the report fallback.
- Scan response/history now include commit SHA, environment and engine/rules/
  score versions. `/api/scan/version` exposes the same non-secret identity.
- The original four plans (96 unique websites) are versioned under
  `tests/fixtures/testlab-96`; no blind holdout labels were changed.
- `scripts/testlab/run.mjs` requires an authenticated isolated QA session, an
  exact full SHA and the fixed preview host. It checks the returned SHA for
  every scan, stops on auth/quota/infrastructure failures and uses a file lock.
  The targeted phase (the new 48-site C/D set) precedes all 96 on the same SHA.

## Verification

- Final full offline suite: 513 passed, 0 failed, 1 skipped (514 total).
  The additional focused helper/runtime tests passed 10/10. The skipped test requires `RF_PG_TEST_URL` (real PostgreSQL).
- Full real-route synthetic scan matrices, held-out identity fixtures, scoring,
  rendering, adversarial performance and concurrency gates passed in that suite.
- Added real-route sparse-homepage regression: French and German hospital
  service pages share one template, yet recover healthcare independently.
- `npm run build`, generated Next route types and `tsc --noEmit` passed.
- ESLint on the new helpers/runner and `git diff --check` passed.
- A clean baseline worktree independently reproduced four pre-existing test
  failures. One was the regex defect above; three stale source assertions were
  updated for the extracted legal lexicon, expanded government guard and finite
  internal-QA quota policy. Customer plan limits were not changed.

## Live acceptance — NOT completed

The protected QA preview is reachable through authenticated Vercel access, but
`/api/auth/me` returned `{"user":null}` in this session on 22 October 2026.
Vercel access does not provide a RankFix tester session. No account, password,
quota or protection was changed to work around this. A local attempt through
unmodified public DNS validation failed with `FETCH_DNS` / `EAI_AGAIN`; this is
an execution-environment limitation, not evidence that Mollie is unavailable.

No post-repair live website results, score/speed improvements or 96-site success
are claimed. Issues #186 must remain open until the live phases complete and
remaining discrepancies and access failures are reviewed. The previous A–D
aggregate is not a verified same-SHA baseline; subtype labels remain proposed.

## Reproduction (authenticated QA only)

Set `RF_SESSION` privately from the authorised QA tester session and
`RF_DEPLOYMENT_SHA` to the READY QA deployment's full source SHA. Keep secrets
out of Git, screenshots, logs and command-line arguments.

```sh
node scripts/testlab/run.mjs --phase targeted --dry-run
node scripts/testlab/run.mjs --phase all --dry-run
node scripts/testlab/run.mjs --phase targeted --output /tmp/rankfix-186-live
node scripts/testlab/run.mjs --phase all --output /tmp/rankfix-186-live
```

Optional Vercel access credentials are read from environment variables, never
stored in reports. The runner uses existing QA limits; it does not bypass them.
