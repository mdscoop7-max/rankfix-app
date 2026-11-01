# Final guard: source JavaScript risk and version-bound resume

A targeted review of the NEW inventory path found two gaps before live use:

1. A short browser render can remove its script tags while asynchronous page work remains. Evaluating only that final HTML could then mark missing JSON-LD as proven absent. The crawler now retains the executable-script risk of the original server HTML; no short render can erase it. Positive JSON-LD still counts, and the existing primary P5 scan rules are unchanged.
2. Checkpoints bound URL/mode but not engine revision. Resume now requires the same crawler version, preventing previously assessed pages from silently mixing old and new evidence semantics. Old checkpoints are rejected without overwriting them. Crawler version advanced to 2.7.1.

The tests were first run with the stronger assertions BEFORE the fix: both failed (short-render absence proof and cross-version resume). With the fix, 36 focused crawler/render/JSON-LD tests pass. No rule was tuned on the frozen identity validation set.

The preceding PostgreSQL CI is now confirmed: run 41314219214 on 9f5ec75 passed 889 tests, failed 0, skipped 4; all four real PostgreSQL scan/storage tests, 34 AutoFix flow scenarios, typecheck and build passed. See `results/quality-20261101-postgres-ci.json`. The remaining skipped suites are the long timeout case and three full stored replays, not unexecuted tests marked green. This final guard awaits its own exact CI run.

No live scan, tenant-facing full-crawl integration, independent 9/10 claim, merge or deployment.
