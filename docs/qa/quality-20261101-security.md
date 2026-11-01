# Quality improvement 1: redirect isolation and 503 evidence

Baseline: QA `1d7d753`. Development branch: `dev/engine-quality-gates-20261101`.

Two remaining P1 defects were reproduced on the old code with scripted HTTP responses, without websites or network access:

- Cookie isolation compared only the last two hostname labels. Unrelated hosts under co.uk, sibling hosts, and even unrelated IPs with matching last two labels could receive a previous host's cookies. The replacement jar binds anonymous cookies to the original hostname and observes path boundaries, Secure, expiry and deletion. Domain cookies deliberately remain host-bound because no Public Suffix List is available. Existing same-host consent/redirect-loop behavior remains tested. Cross-host consent may therefore remain unconfirmed rather than disclosing cookies.
- `linkOutcome` classified any 5xx before checking the challenge flag. A confirmed 503 access/challenge template was thus reported as a server error. Challenge evidence now wins; a plain repeated 503 still remains a server error.

Changed: `lib/redirect-cookies.ts`, `lib/safe-fetch.ts`, `lib/link-status.ts`, `tests/redirect-security.test.mjs` and this report/result.

Validation: 26 unit tests across redirect-security, qa-96-report-repairs, testlab-evidence-export and dimension-score-display passed; 24 existing AutoFix merge-safety tests passed. The baseline cookie-leak probe returned true and now false; the baseline 503 probe returned server_error and now unconfirmed. No observed regression in these tests. Result: `docs/qa/results/quality-20261101-security.json`.

AutoFix's enforced checks/App/SHA protections, insufficient-evidence score presentation and missing-audit export handling already existed; no speculative rewrites were made. Full database flow, dashboard/browser and build verification remain open in this environment. No live scans, merge or deployment.
