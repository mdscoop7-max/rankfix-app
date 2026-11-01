# Quality improvement 4: mandatory regressions, independent rating protocol

`npm run qa:quality` runs the actual offline scan route on the existing 41 sector peers, 39 development profiles and 13 frozen synthetic validation profiles. It saves inputs, fingerprints, outcomes, fixed cases, regressions and unresolved strict labels. Empty input or missing reports cannot pass. Development and existing-reference assertions must pass; a previously correct frozen validation case may not worsen. This gate passed with 12/13 strict validation cases correct and one explicitly unresolved PSP. It does not turn that unresolved case green.

`npm run qa:quality:assess -- --manifest ... --baseline ... --candidate ... --artifacts ... --out ...` only reads stored files. It never scans or fetches a URL. This is the separate independent 0–10 quality assessment. Website SEO/GEO scores are untouched.

## Frozen rubric 1.0.0

| Criterion | Weight / 10 | Required evidence |
|---|---:|---|
| Primary sector | 1.5 | Independent ground-truth review; correct activity or justified abstention; strict accuracy also remains visible in sector results |
| Applicability | 1.5 | Only checks supported by the site's own activity/capabilities |
| SEO/GEO | 1.5 | Findings and deductions agree with actual recorded evidence |
| Page coverage | 1.0 | Counts reconcile; samples/limits never become whole-site claims |
| False positives | 1.0 | Unproven defects remain unconfirmed; no invented evidence |
| Report consistency | 1.0 | Dashboard, headline, page evidence and findings agree |
| International | 1.0 | Multiple languages; weak language groups cannot hide in the aggregate |
| Regression resistance | 1.0 | Same frozen inputs, no previously correct case worsens |
| Security | 0.5 | URL safety, isolation, redirect cookies and fail-closed AutoFix publication |

Acceptance: numerical quality >=9, all nine criteria measured, every criterion >=80%, no regression or critical/security failure, and subgroup sector/language floors met. At least three unexposed real-audit cases per required family and at least three languages are required. The families are payments/banking, retail, lodging/travel, restaurants, healthcare, beauty, industry, logistics/energy, professional services and hybrid businesses. The reviewed manifest freezes review-item IDs and denominators before tuning; missing reviews/audits do not disappear from the denominator. Synthetic/development/exposed data cannot produce the independent rating. The CLI checks stored artifact hashes and rejects file references outside its artifact directory.

An external reviewer must substantiate label provenance and independence; metadata alone cannot prove a person's independence or the truth of a label. `quality-plan-20261101.json` is explicitly INCOMPLETE, with no selected independent cases/reviewer, not a frozen valid assessment. The actual command ran and correctly returned exit 1, `qualityScore: null`, `accepted: false`; result: `results/quality-20261101-assessment.json`. No 9/10 is claimed.

## Enforcement and scope

The existing validation workflow now also covers PRs to the requested QA branch/main and pushes on this development branch. It runs the quality gate, preserves its artifact (missing artifact is an error), existing full tests, PostgreSQL AutoFix flow, typecheck and a build without deployment. Configuring GitHub branch-protection requirements is an administrative operation not performed here; a workflow file is not proof that GitHub enforces it. Existing AutoFix's server-enforcement checks stay unchanged.

Late hardening: robots wildcard matching no longer compiles site-controlled patterns as backtracking regexes; URL/policy sizes are bounded; operator temporary files use exclusive creation and random names. Twenty-two final focused tests pass. No public API, tenant-facing database job or dashboard-wide crawl feature was introduced: the new bounded inventory is an operator tool atop the existing crawler, and `/api/scan` remains representative.

Local broad verification: 779 assertions passed in available tests, with three test files failing to import missing `pg` (same on baseline) and eight subprocess/database-dependent files not executed. These are NOT an all-green full suite. Evidence is retained in `results/quality-20261101-available-tests.json`. Real Chromium, real Next/dashboard behavior, database integration and a complete build remain unverified until actual CI/QA confirms them. No live websites, 144-site measurement, merge or deployment.
