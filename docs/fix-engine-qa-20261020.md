# RankFix Fix Engine: isolated quality harness

This branch contains **tests and QA tooling only**. It does not change the live website,
fix engine, existing test runner, application dependencies or production configuration.
Do not merge or deploy on the strength of a mocked test.

## VS Code / Claude Code (Node 24)

From the repository root of this QA branch:

```bash
npm install --no-audit --no-fund
npm install --no-save --package-lock=false --no-audit --no-fund vitest@4.1.11 fast-check@4.10.2 @playwright/test@1.64.1
npx vitest run tests/qa/fix-engine.spec.ts
npm test
npx playwright install chromium
npx playwright test --config=playwright.qa.config.ts
```

The extra QA packages are deliberately **not** persisted to package.json or package-lock.json.
Reinstall them after npm ci or a clean checkout. This is an isolated trial;
after review, integrate tools into the usual dependency lockfile in a separate PR.

## What is and is not verified

- Vitest: real validators and fix policy, including dangerous target paths,
  unrelated metadata modification, stale scans, explicit approval and AI no-auto-apply policy.
- fast-check: 200 deterministic randomized property cases against real validator code.
- Playwright: actual RankFix UI buttons in a local Next.js instance; **GitHub writes and
  authenticated API data are intercepted as fixtures**, so no repository or customer account
  can be changed by these tests. Separately, a real **local** anonymous POST must return HTTP 401.
- GitHub Actions: isolated push workflow, read-only token and no deploy/merge steps.
- Existing Node regression suite: reruns; existing failures must be reported honestly.

## Open safety issue to investigate before ANY commercial release

At the current reviewed version, `app/api/github/fix/route.ts` calls GitHub's
`/pulls/<number>/merge` after creating a PR. UI copy also describes auto-merging after
the user's publish action. Therefore a Fix Engine PR may automatically merge even though
`db/github-fix-engine.md` describes manual merging.

**Do not treat QA fixture success as proof of safe automatic publication.**
On Friday, inspect product approval semantics and explicitly decide whether to disable
auto-merge, require a second confirmation or a protected test deployment before enabling
this flow. Changes to publish/merge behavior require separate review and real nonproduction
end-to-end verification.

## Friday test gates

1. Re-run PR #174 regression suite and inspect known dashboard test failures; do not hide them.
2. Run Vitest and fast-check, record exact outcomes.
3. Run Playwright locally, verify genuine buttons and note all mocked endpoints.
4. Separately test an approved PREVIEW -> PR -> deployment -> fresh rescan workflow on a
   disposable sandbox repository and test domain, **only after explicit authorization**.
5. Review production-deployment hooks/preview auto-deploy rules and obtain a go/no-go decision.
6. Never claim a fix is validated unless a fresh independent scan confirms the change.

No prod URLs, tokens, database writes, GitHub write APIs, secrets or auto-merges are used
by this QA harness.
