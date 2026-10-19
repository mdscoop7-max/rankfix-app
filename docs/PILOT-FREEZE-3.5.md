# RankFix 3.5 — code freeze for the independent pilot (Onafhankelijk-3)

Frozen on 17 Oct 2026 by Claude, at the owner's request, before any scan of the independent set.

- **Frozen engine commit:** the commit that adds this file on branch `fix/engine-primary-identity-evidence-20261015` (git tag `rankfix-3.5-pilot-freeze`). Scan the pilot only on the Vercel preview built from exactly this commit; record it in `RF_DEPLOYMENT_SHA`.
- **Independent set:** `tests/fixtures/eu-independent3/plan.json`, 68 sites, unchanged since pre-registration commit `164d233`. SHA-256 `dfccfd6a39faac7c83d52dcc0e7031629b053976e7f3b25b6c9fa30f4ec63bff`.
- **Not used for tuning:** none of the 68 sites was scanned, read or used for any rule or fixture. All 3.5 fixes were derived from the exploratory register (`tests/fixtures/evaluation/exploratory.json`) and neutral synthetic `.test` sites; the four field-report sites (La Poste, mBank, Poste Italiane, Brussels Airlines) are not in the independent set.
- **Scorecard:** v2 (`docs/SCORECARD-3.5.md`), unchanged. 9/10 only if every acceptance rule in §2 holds.
- **Rules during the pilot:** no engine changes until the scorecard is computed. A fix found during the pilot goes into a new commit after the measurement; affected sites then move to the exposure register and no longer count as independent.
- **State at freeze:** `npm test` 405/405 (1 PostgreSQL test opt-in, skipped), scan matrix 130/130, engine-3.5 scenarios 25/25, hold-outs 98.4 % / 100 % / 100 % with 0 high-confidence wrong, ESLint unchanged (legacy), GitHub CI green.
- Not merged to `main`, not deployed to production.
