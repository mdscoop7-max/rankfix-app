# RankFix 3.1 — engine quality report (16 Oct 2026)

Reproduce: `node scripts/engine-benchmark/eu81.mjs baseline` · `node scripts/engine-benchmark/offline.mjs` · `node scripts/engine-benchmark/offline.mjs --holdout holdout.json` · `--holdout holdout2.json`. Gate: `tests/engine-benchmark.test.mjs`.

## Scorecard (0–10, measured values only)
Sector accuracy 2.5 (95% = full, 60% = 0) · no confident-wrong sector 2 (99/85) · score honesty 2 (100/80) · report consistency 1.5 (100/80) · scan success 1 (95/60) · median evidence coverage 1 (90/50). Unmeasured criteria are never filled in.

## Baseline — 53 stored EU-81 audits (issue #151)
81 planned / 53 stored (65.4%) · correct sector 27 (50.9%) · wrong 6 (11.3%) · no sector 20 (37.7%) · macro-F1 0.43 · 100/100 with incomplete evidence 3 · 98+ at <70% coverage 4 · median coverage 82% · **scorecard 2.2** (8.5 of 10 points measurable).

## Same input, start of day (commit 6581cca) vs now
| Set | Start of day | First measurement, unseen | After generic fixes (seen) |
|---|---|---|---|
| Hold-out 1 (64 sites, 17 languages) | 64.1% | 85.9% (5 confident-wrong) | 100% |
| Hold-out 2 (36 sites, 20 languages incl. bg/sk/sl/et/da/lv/lb) | 55.6% | 86.1% (3 confident-wrong) | 100% |
| 14 real EU homepage identities | 28.6% | — (drove the first pass) | 100% (VRT abstains) |
| Synthetic matrix (103) | 84.5% | — | 100% |

Now on all sets: 0 confident-wrong sectors, 0 × 100/100 with unconfirmed checks, 0 bare 98+ headlines under 70% evidence, 0 self-check corrections. 347/347 tests.

**Honest reading:** first-contact accuracy on unseen data was ~86% twice; out-of-sample accuracy after the second round is estimated 86–95% and is not proven. Hold-outs were written by the same author as the fixes. Offline runs fetch no live site, so speed, blocking and rendering are not measured here. 9/10 is not proven until the EU-81 pilot (protocol in the shared report): export `scans` + `scan_attempts` read-only and run `eu81.mjs export scans.json attempts.json`.

## Competitor comparison (published facts only)
RankFix: ~66 SEO/GEO + 7 security checks, homepage + ≤30 representative pages, Chromium raw-vs-rendered with rejection of poorer renders, evidence level + range, "unable to confirm" status, sector modules in EU languages. Semrush: 140+ checks, Chromium JS rendering + JS Impact report, Site Health weighted by errors/warnings. Ahrefs: Health Score = % internal URLs without errors. Screaming Frog: Chromium rendering, Schema.org + rich-result validation, extensive hreflang, 500 URLs free / unlimited paid, £199/yr. Sitebulb: 300+ issues, Response vs Render report, prioritised hints. SE Ranking: health score weighted by severity and share of pages, optional client-side rendering. None of the consulted pages mentions score uncertainty. RankFix trails on breadth (full crawls, number of checks, CWV field data, full schema/hreflang validation).


## 3.5 pass (16 Oct 2026, evening) — strict metrics
Benchmark corrected: an unknown sector is never counted as correct (strict accuracy = correct sector / scanned sites with a known sector). Same inputs, three engine versions:

| Set | Start of day (6581cca) | 3.1 pass (3061a10) | 3.5 pass |
|---|---|---|---|
| Hold-out 1 (64) | 57.8% | 92.2% | 98.4% |
| Hold-out 2 (36) | 44.4% | 86.1% | 100% |
| Hold-out 3 (33 weak homepages, frozen before 3.5) | 33.3% | **72.7% (first unseen measurement, 3 confident-wrong)** | 100% (now seen) |
| Matrix (101 with a known sector) | 80.2% | 95.0% | 96.0% |
| 14 real EU homepage identities | 28.6% | 92.9% | 92.9% (VRT abstains) |

Unseen first measurements so far: 85.9% → 86.1% → 72.7% (weak, navigation-only homepages are the hard case). Every scored check now carries a source URL and a recorded finding, or it is "niet te bevestigen" and leaves the score (matrix invariant, 0 violations on 243 reports).

Scan success: every logged-in attempt is stored in `scan_attempts` (inserted as "running" before the scan, completed with HTTP status, error code and category; a row left "running" = platform timeout). Verified end to end against a real PostgreSQL 16 database, including the upgrade of the first table version (`RF_PG_TEST_URL=… npm test`). Structural fixes: whole-scan time budget (renders stop at 180 s, sampling at 170 s, platform limit 300 s), body read timeout, one retry on transient network errors and 502/503/504, cookie jar across redirect chains, Accept-Language header, redirect limit 6. Not bypassed: WAF/CAPTCHA blocks are reported as `site_blocked`.
