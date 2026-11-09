# Evidence integrity — phase A, 9 November 2026

Baseline: d5e16b037d83e3ae8e663f6b6e97e33ec52ecab5, branch qa/claude-9of10-20261107. Work isolated on qa/codex-evidence-integrity-20261109. No production deployment or main merge.

## Confirmed root causes

1. `link-status.ts` inferred a missing page from a redirected URL containing `/error`, even with normal HTTP 200 content.
2. The route counted a transport failure followed by one HTTP 500 as two server error measurements. Nested retry catch blocks could also make a third request.
3. `inspectLinkResponse` conflated every error template (including Internal Server Error) with a soft 404.
4. Representative page processing returned before inspecting refused HTML. A challenge served with HTTP 404 therefore lost its challenge attribution and could enter missing-link reconciliation.

## Change

Shared content policy in `lib/response-evidence.ts`, used by probes and refused representative responses. Missing-page evidence is distinct from maintenance/generic errors. Probe retries use at most two requests, retain individual transport/HTTP observations, and count actual server error responses. URL spelling alone no longer determines missing status. Existing page gates, rate limits, DNS/security controls and genuine 404 detection remain.

## Regression evidence

`tests/evidence-integrity-response.test.mjs`: three tests failed on the baseline; same three pass after repair. The route case uses controlled synthetic HTTP responses, explicitly **not real website accuracy evidence**. It verifies challenge HTTP 404 attribution, connection failure + HTTP 500, HTTP 200 server error, and genuine HTTP 404. The challenge is placed within the representative selection; no claim about pages outside that selection.

TypeScript: passed. Full existing suite running at time of this phase record; results will be recorded in the central dossier. Baseline red/green TAP files accompany this report.

## Still open

Own-activity/source-count circularity, low-confidence failure score rewards, final applicability inconsistencies, strict raw input replay and independent 144-site evaluation are not resolved by phase A. No reliability percentage established.

CI's missing original `tests/fixtures/testlab-mkb/catalog.json` and `qa-input/rankfix-testlab-144-fresh144-20f1effd.json` remain a visible blocker. Do not fabricate or silently replace those inputs with another dataset.
