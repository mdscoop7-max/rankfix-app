# RankFix evidence integrity — 10 November 2026

Baseline reviewed: ca737e97b39c420668789ab93d1667700a85ceda. Branch: qa/codex-evidence-integrity-20261109. No main merge or deployment.

## Verified causes and repairs

- CI run 42682956335: 1213 tests passed, 8 failed, 8 skipped. Lint and build passed. The failing scanner groups confused uncertainty about a precise industry with proof of a non-retail business activity. Final applicability now consumes the same own-activity evidence as earlier processing, independently of the industry confidence threshold. No sector is confirmed by this exclusion. Shell/refusal and actual retail evidence retain priority. Existing sector/commerce expectations were not relaxed.
- Live rendering exposed an unhandled TargetCloseError. Browser operations were started while evaluating arguments, before `remaining()` could reject an expired deadline. All bounded browser operations now start lazily. The new controlled test fails on the previous renderer and passes after repair. The exact source assertion now requires lazy execution; no optional legacy pattern was added.
- The previous live run met a common-path failure: three unrelated public destinations returned identical plaintext upstream-connection errors and response hashes. Generic gateway wording does not prove a RankFix-specific outage or a target-origin error. Safe fetch now preserves observed HTTP 503 in error evidence, emits FETCH_UPSTREAM_UNCONFIRMED, and uses existing network attribution with no target-origin status or score. Ordinary origin 503 maintenance responses remain unchanged.

## Validation

Former failing scanner/benchmark groups: 63 passed, 0 failed, 8 skipped. Network/render subset: 23/23 passed. TypeScript and production build passed. Lint: 0 errors, 60 warnings. Full-suite final result and GitHub validation are pending at this record. This is not a full-green CI claim.

## Real-site evidence and limits

The prior pinned candidate 3898e44 produced 88 stored responses: 25 successful scan responses, one block, 62 HTTP server-error codes. Of 144 entries, 56 have no stored result. A global outbound fault was corroborated separately; the 62 codes cannot all be counted as proven target-site failures. Original responses remain unchanged. `live144-prior-candidate-summary.json` records every catalog entry, actual check statuses, assessed/selected pages, evidence-recording shape and missing results. It publishes no raw bodies or cookie/header values. These are prior-candidate measurements, not post-repair accuracy.

Nine-site raw replay before/after the prior candidate had no missing requests and unchanged sector labels/headline scores. It did not establish increased accuracy. The original raw tape remains private following automatic approval rejection of public opaque payload publication. No remaining raw chunks are approved for publication.

## Required input gate

The existing fresh144 catalog is present. CI additionally requires `tests/fixtures/testlab-mkb/catalog.json` (a new non-overlapping MKB holdout) and `qa-input/rankfix-testlab-144-fresh144-20f1effd.json` (original baseline export). Neither exists in the checked-out history examined. The gate remains enabled and failed. Creating a substitute would falsify provenance. The owner has been asked for the original storage location. The independent3 plan also explicitly states its labels await owner review; it cannot certify 90% industry accuracy.

## Acceptance

Independent accuracy for industry, error classification, completeness and semantic evidence: not established. A numerical 0–10 reliability score is not justified by available independent labels. Automated regression success is not real-site accuracy. NO-GO for rollout. Remaining work: restore original inputs, complete fresh scans on the repaired engine, independently review labels/evidence, and measure the requested 90% industry / 95% error-classification targets.

## Verified GitHub result on 4e2ec78

Run https://github.com/mdscoop7-max/rankfix-app/actions/runs/42802739443 : `Test, lint and build` succeeded, including dependency audit, all 1232 tests (1224 pass, zero fail, eight skip), lint, build, axe/browser checks, TestLab stop/resume, local QA login, both catalogs/filters/exports and UI browser smoke. The separate mandatory MKB catalog/baseline job failed on its two missing files. Overall workflow remains red; no full-green claim.

The 9-site repeated raw-input comparison is in `recorded-input-comparison.json`: no missing requests in either version, same sector outputs, no independently established accuracy gain. Additional real-site selection is in `additional-real-sites.json`, disjoint from fresh144, with actual collected public metadata and no invented expected labels. Those cases await independent review. The new full 144 run is still in progress and must not be reported complete.

## Completed request run on repaired engine — no accuracy certification

All **144 requests** on 4e2ec78325c302fb49e41b72485bcad9e365b6cf finished: **31 scan responses, 1 block, 110 FETCH_UPSTREAM_UNCONFIRMED, 1 timeout, 1 DNS observation**. Independent destinations example.com and GitHub again returned HTTP 503 with identical upstream error prefix hash `33fbc61ad080ef68dd7a6479f8c53f1bf864dba2930567dbbc4ceb47490a1909`. This corroborates the common network-path failure; the 110 results do not establish 110 broken websites. The DNS observation concerns megekko.nl; validity of the live domain cannot be independently established during this outage. None of these failures counts as a wrong sector or a successful assessment.

In the 31 returned scans, 619 of 720 selected pages were content-assessed; 19 samples were fully assessed. Six sector outputs reached the engine's confirmation threshold, 25 remained unconfirmed (three unknown labels). These are **engine output counts**, not independently verified correctness. Obtained scan-response coverage is 31/144 = 21.5%, not a scanner reliability score. Independent reviewed cases: zero. Actual industry/error/evidence accuracy and overall 0–10 reliability remain **not estimable**. The 90% / 95% acceptance goals are not demonstrated.

All three extra selected sites were requested after the main run and returned FETCH_UPSTREAM_UNCONFIRMED during the outage. Their earlier collected real metadata is retained separately; it was not used to invent a scan sector. `live144-4e2ec78-summary.json` contains every website and every SEO/GEO check's recorded status/source, incomplete pages and reasons for unperformed checks. `additional-scan-results.json` records the three additional outcomes. Original complete API responses and raw replay input remain private and unchanged.

Local full suite initially read the old eager-call source assertion before that assertion was tightened: 1223 pass, one stale source assertion failed, eight skipped. The tightened source test and behavior test passed separately; the subsequent authoritative GitHub run on the exact published repair passed 1224 tests with zero failures and eight skips. These runs are not conflated.

Next requirements: obtain the two original mandatory CI inputs and independently review their provenance; restore stable outbound connectivity; repeat the 144 and extra-site scans without common-path contamination; review the primary activity, role and evidence per site independently before calculating accuracy. Until then the missing-input job remains red and rollout remains NO-GO. No main merge or production deployment was performed.
