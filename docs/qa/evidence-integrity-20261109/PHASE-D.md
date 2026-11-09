# Phase D — raw comparison and real-site validation

## Confirmed measurement defects

The existing A/B harness returned a synthetic HTTP 599 for cache misses, overwrote repeated URL observations, omitted Retry-After, and truncated bodies to eight million characters. Historical TestLab route projections also manufacture HTML/prices from report fields. Those projections remain historical regression fixtures, never input for a real-site accuracy claim.

## Repair

The A/B harness now uses a versioned raw network tape: decoded response entity bytes in base64, SHA-256, all returned headers (including distinct Set-Cookie), exact method/URL/query/caller headers, request occurrence, measured delay, and actual transport exceptions. Replays use no external fetches. Missing requests throw REPLAY_NOT_RECORDED instead of inventing an HTTP response. Modified bytes fail hash validation. Legacy lossy cache files are explicitly rejected by this strict harness. Full scan JSON accompanies the result as gzip.

The absence of raw browser DOM recordings is explicit: strict A/B runs render-off on both versions and cannot validate rendering or absence after JavaScript. A separate full live scan uses the real scanner/rendering path. Live scans and offline comparisons measure different things.

## Regression evidence

The original synthetic-599 assertion failed before repair. Three raw tape tests now pass, including unchanged binary bytes, Retry-After, repeated response/failure sequence, exact query matching, missing inputs, changed bytes and refusal of legacy projections. Synthetic tests validate tape mechanics only. A genuine network recording has started for nine known problem sites; results are not yet accepted or scored in this phase note.

## CI input blocker

`tests/fixtures/testlab-mkb/requirements.json` describes a NEW non-overlapping 144-site MKB holdout, not the existing fresh144 catalog. Neither the new holdout catalog nor the original baseline export is present. Replacing these with existing fresh144 would both break the non-overlap requirement and falsify provenance. The required workflow stays red until actual inputs are recovered/supplied and verified; no security or evidence gate is disabled. Existing fresh144 and MKB48 catalogs remain available for authorized testing.

Local full build passed after replacing an external dependency symlink with an identical local dependency copy (no package or lockfile change). Lint: exit 0, 60 warnings, zero errors. Sandboxed Chromium preflight passed. Local authenticated API returned the exact engine commit, fresh144=144 and mkb48=48. Full fresh144 live run started on engine commit 6885f4d4fb9dce0649edba75eed1ea8887caed75. Its results remain pending until the run finishes.

The existing CI push trigger is extended to this exact QA branch, retaining every existing job and the failing input gate. This permits validation without a PR or merge to main. Shell GitHub authentication expired after the first three commits; connector publication is being used where available. No production deployment is implied by any workflow.
