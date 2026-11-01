# Frozen catalog-wide evaluation plan

Frozen before the first evaluation run. Engine candidate 73ddfb9; PR baseline
1907e2f. Inputs and exact criteria: tests/fixtures/quality-20261101/plan.json.
66 catalog subtypes, 68 new synthetic organisations, NL/EN/DE/FR/IT. These inputs
have not been executed during hybrid development. The two additional cases are
software for banks (not a bank) and a manufacturer serving trades (not a plumber).
Exact subtype and broad primary sector are reported separately using the catalog's
existing broad-sector mapping, fixed in advance. Unknown is counted as an
abstention on an explicit activity, not silently scored as correct.

No engine rules may change during this evaluation. Failures are reported first;
a future development round requires fresh unseen evaluation inputs. This is
same-author, frozen synthetic holdout evidence, NOT independently reviewed real
website evidence. It cannot establish a 9/10 report-quality score. All automated
results keep qualityScore=null and accepted=false. Browser, database/dashboard,
security and actual-world generalisation remain external validation requirements.

Run offline against each exact revision using the same runner and fixture:

```
FIXTURE_FILE=tests/fixtures/quality-20261101/catalog-holdout.json REPORT_FILE=/tmp/reports.json node --experimental-strip-types --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-sector-peers.mjs
node scripts/engine-benchmark/evaluate-catalog-holdout.mjs /tmp/reports.json <revision> /tmp/evaluation.json
```

A local NextResponse adapter is additionally required here without installed
Next.js. Network, renderer, database and authentication are mocked by the existing
route harness. Hashes bind inputs, plan and raw reports. Persisted evaluation rows
contain expected/actual sector, capabilities, accounting and concrete failed
assertions. The measurement concerns evidence integrity; it does not assert every
SEO/GEO recommendation has received a human semantic review.

## Measured result — rules unchanged after freeze

| Dimension | Baseline 1907e2f | Candidate 73ddfb9 |
| --- | ---: | ---: |
| Correct broad primary sector | 48/68 (70.6%) | 48/68 (70.6%) |
| Applicability assertions | 68/68 | 68/68 |
| Limited SEO/GEO evidence-integrity assertions | 68/68 | 68/68 |
| Sample accounting assertions | 68/68 | 68/68 |
| API/report consistency assertions | 68/68 | 68/68 |

19 explicit identities abstained; one wrong positive: the port authority was
classified government instead of maritime_ports. Thus sector FP=1, sector FN=20
(19 abstentions + one wrong label). Capability FP/FN=0 under the frozen assertions.
Exact catalog subtype matched 27/68; this includes legacy broad aliases and is
reported separately, not silently substituted for the primary-sector result.
No rows changed, no unseen fixes, no new regressions against this baseline.
This does not mean there are zero errors outside the assertions.

Abstentions: marketplace, travel agency, French beauty salon, B2B SaaS, events,
wholesale, food delivery, software application, photographer, French medical
clinic, childcare, elderly care, parking, French holiday rental, German camping,
coworking, agriculture/horticulture, German architecture, and the additional
manufacturer serving trades. See individual expected/actual labels in the JSON.
No production recognition rules were adjusted to fit these failures.

Across the 68 separate samples: 271 selected page observations, 267 audited,
4 not confirmed (fixture-only contact/privacy URLs returning 404 in the two
additional controls). These are NOT discovered totals for whole websites.
The response scope remains PAGE_SAMPLE; no complete website coverage is claimed.
The evaluator covers API evidence/summary/classification consistency, not a
rendered dashboard or persisted end-to-end scan flow.

Persisted results: docs/qa/results/catalog-20261101/{baseline,candidate,comparison}.json.
Each result binds the input and raw response bytes by SHA-256. Full raw responses
remain locally at /tmp/catalog-{baseline,candidate}-reports.json, reproducible via
the frozen fixtures and revisions; raw timestamps are not used for comparison.

## Validation and remaining limits

GitHub Actions run 41339227989 on the production-change commit passed:
10 crawler regressions, 864 tests passed / 0 failed / 8 skipped, 34 PostgreSQL
AutoFix scenarios, Next type generation, TypeScript, and build without deployment.
The eight skips include four real-PostgreSQL scan/persistence/dashboard tests
(RF_PG_TEST_URL unset), one slow timeout test, and three optional stored full-run
replays. They are NOT counted as passed. The AutoFix PG suite uses simulated
GitHub/websites; it performs no actual merge or deployment.

Hybrid regression establishes the secondary product/offer/purchase chain and
price/currency/SKU/availability extraction, not a complete audit of every product
or every variant. Homepage-only price/variant/shipping checks remain unconfirmed
when their evidence belongs to a sampled product. A full per-product audit and
rendered-only purchase functions remain unverified. No checkout was executed.
The broad catalog result is below the 90% threshold. Independent qualityScore
remains null; a 9/10 claim is blocked. External independent labels, more than one
case per subtype, richer platforms/languages, security review and genuine
browser/database/dashboard verification are still required.

The code has passed the stated offline/CI checks, but is not certified ready for
the 144-site measurement. A next five-site live check would be exploratory and
requires the user's separate permission. No live scans were performed.
Previous Codex development-branch work and its pending crawler patch remain
preserved in their original workspace/branch; this PR round does not claim to
have merged that separate branch or delivered its crawler in the dashboard.
