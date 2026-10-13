# RankFix sector QA — 57 sectors / three independent pilots

## Shift assignment

- Night 00:00–08:00 Europe/Amsterdam — exactly 19 finance, software, institutional, B2B and education sectors.
- Day 08:00–16:00 — exactly 19 ecommerce, automotive, property, local service, logistics, sport and culture sectors.
- Evening 16:00–24:00 — exactly 19 medical, personal care, hospitality, tourism, recruitment and media sectors.
- Catalog keys are validated against `lib/sector-catalog.ts` by automated tests and again before a run. Each daily execution selects three distinct sectors per shift, covering all 19 in seven rounds. Initial site fixtures include NL, DE, FR, ES, IT and PL; expand to BE, SE and additional languages/countries.

## Safe scanner execution

GitHub Actions runs the *real RankFix /api/scan code* locally with a throwaway PostgreSQL database, system Chrome and no access to the production database. Scans do not perform purchases or interactions on target websites. The workflow has `contents: read` only, checkout credentials are not persisted, and results are **Actions artifacts** (14 days), not commits. Failure/anti-bot protection is not an SEO failing grade. A mismatch is a diagnosis candidate, not a verified classification bug.

## Starting and scheduling

A push containing the workflow to `fix/review-12-punten-20261012` automatically triggers **one initial test pass** for all three shifts. GitHub Actions `schedule` events only execute from **the default branch**; therefore these daily GitHub scans **do not run automatically while the PR is unmerged**. The included UTC cron candidates use an Amsterdam local-hour guard for DST once future scheduling is separately approved. ChatGPT scheduled analysis tasks are separate from GitHub scans and cannot substitute for them.

See: https://github.com/mdscoop7-max/rankfix-app/actions/workflows/qa-sector-pilots.yml

## Manual QA interface

The preview-only `/qa` dashboard links to `/nl/scan` on the PR's protected Vercel preview. The manual preview scan endpoint uses existing access policies and **is not yet verified to use a separate database**; do not assume unlimited scans or sensitive test data isolation. A permanent isolated QA domain + separate DB require explicit Vercel configuration later. Production is unaffected by unmerged scanner-code changes.

## End-of-round fix gate

Collect pilot reports and independent validation; cluster incorrect sector matches, unsupported claims, bots, inconsistent evidence and provisional scores by general root cause. Propose generic code corrections plus automated regression tests. Review and apply fixes together in a later authorized commit; merge to `main` requires separate approval. Do not merge the temporary historical branch `ci/pr132-nightly-pilot`: its legacy workflow automatically commits results.

## NOS.nl critical regression — 13 Oct 2026

A news homepage was incorrectly displayed as **Tandarts / Dentist (95%)** while its evidence and active modules correctly identified `news_media`. Root cause: late catalog subtype promotion accepted incidental dental keywords plus a representative-page treatment signal without checking the primary sector. Both dentist and legal subtype promotions now require the matching primary sector family and first-party declared site identity. The evening QA shift also scans `https://nos.nl/` as a regression sentinel on every run. This issue is with RankFix, not the site's SEO. Do not present the fix as verified against the live site until a real post-fix scan succeeds.
