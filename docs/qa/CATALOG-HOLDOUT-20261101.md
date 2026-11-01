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
