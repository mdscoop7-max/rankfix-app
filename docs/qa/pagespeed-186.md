# PageSpeed in QA (#186)

The shared preview had no `PAGESPEED_API_KEY` when inspected. Successful parsing or mocked tests do not prove that live Google measurements work. This work must not be marked complete until both devices return real scores in a fresh QA audit.

## Environment setup

1. In a Google Cloud project, enable PageSpeed Insights API and create an API key restricted to that API. Keep the key server-side. Do not paste it into chat, reports, command arguments or Git.
2. In the Vercel `rankfix-app` project, add `PAGESPEED_API_KEY` for **Preview**, restricted to branch `qa/rankfix-shared-preview`. Use a sensitive environment variable. Do not use a `NEXT_PUBLIC_` variable or change Production settings.
3. Redeploy that QA branch so the server receives the variable. Existing deployments and stored reports do not acquire new measurements retroactively.
4. Run a fresh QA scan against an accessible website. Confirm `websiteSpeed.mobile.status` and `.desktop.status` are `measured`, both scores are numbers in 0–100, and real lab metrics appear in the dashboard and printable report. A 0 score is valid; missing field INP is allowed.

For an authorized local check with the key already provided through the process environment:

```sh
node --experimental-strip-types scripts/testlab/check-pagespeed.mjs https://your-owned-test-site.example/
```

The checker prints only status, score, diagnostics and measurement time. It exits 2 if either device lacks a measured result. Do not run it with `set -x` or print environment values.

## Behavior

- Missing key: `not_configured`, no repeated anonymous API calls. Explicit `PAGESPEED_ALLOW_ANONYMOUS=1` remains available for deliberate development checks; it does not guarantee quota.
- Mobile and desktop run concurrently. One device failure preserves the other's measurement.
- Default measurement budget is 45 seconds, capped at 60. The scan supplies its remaining budget with a 15-second reserve below the route's 300-second limit. Two attempts share the same deadline.
- One retry for transient 500/502/503/504 errors. Keyed 429 responses retry only with an explicit Retry-After of at most two seconds and sufficient time. Daily quota errors, missing/rejected keys and disabled API errors do not retry.
- Diagnostics distinguish configuration, quota, rejected key, disabled API, timeout, invalid response, runtime failure and exhausted scan budget. Google error text and keys are never returned.
- Performance is separate from SEO/GEO. Missing evidence never becomes a fabricated speed score or an automatic fix.
- Existing saved reports retain their scores and receive translated fallback explanations in all six UI languages.

## Validation

Run the focused PageSpeed tests, full `npm test`, `npm run lint` and `npm run build`. Live Google success, browser presentation in QA and the later 96-site comparison remain separate acceptance checks; they require a configured QA key and authenticated QA access.

Official API references:
- https://developers.google.com/speed/docs/insights/v5/get-started
- https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed

Validation recorded 2026-10-22: focused tests 15/15; full suite 524 passed, 0 failed, 1 skipped PostgreSQL test; Next production build passed. Focused ESLint passed for PageSpeed, messages, component, tests and checker. Repository-wide ESLint remains failing with 69 pre-existing errors and 49 warnings. Compared both modified existing route/report files against the base: identical lint diagnostic signatures (scan 22 errors/7 warnings, report 18 errors/2 warnings). No claim of a clean repository-wide lint run or successful live measurement is made.
