# QA #186 round 2: the five pre-merge checks (23 Oct 2026)

Branch `fix/qa-engine-root-causes-186`, based on QA `10e32df`. No live scans, no
production change, PageSpeed paused. Everything below is reproducible offline.

## 1. Page gate: false blocks and missed security pages

Corpus test `tests/page-gate-corpus.test.mjs`:

| Set | Result |
| --- | --- |
| 19 vendor block/challenge templates (Cloudflare challenge and block, Akamai incl. long edge error with cookie banner, Imperva, DataDome, PerimeterX, CloudFront WAF, F5, Sucuri, nginx 403, 429, queue page, Vercel checkpoint, retailer "AntiBot" in NL/FR, Google unusual traffic, human verification, NL and DE block titles) | 19/19 recognised |
| 5 error and 4 maintenance pages (EN/NL/DE/FR) | 9/9 recognised |
| Same templates as a recovered browser render | 28/28 rejected as recovery |
| 17 ordinary pages ABOUT these topics or loading vendor scripts (security vendor product pages, CAPTCHA vendor, contractor maintenance services, out-of-stock product, FAQ about access errors, news about an outage, headline "Page not found: …", Cloudflare jsd script, Imperva resource script, Queue-it client, DataDome tag, Turnstile and reCAPTCHA on forms, "just a moment" in body text, call-centre queue) | 0 rejected |
| 1293 recorded real pages of the 96-site run | 19 rejected, all genuine (10 maintenance, 7 human verification, 1 AntiBot, 1 edge error); 0 false rejections |

Defects found and repaired by this check: the edge-error page of one site (471
words with cookie banner, Akamai reference ID) was missed; title-only topic words
would have rejected security-vendor and contractor pages; several vendor scripts
that also run on normal pages had been listed as block markers. The gate now uses
template wording, block-only vendor markup, edge reference IDs, short-title rules
and site-maintenance wording.

## 2. Full sector decision through the real route

`tests/scan-matrix/run-route-replay.mjs` reconstructs each of the 70 stored sites
from the TestLab output (identity, first 3000 characters of text, sampled link
labels, commerce evidence of the scanned and every sampled page) and runs it
through `/api/scan`, including navigation, commerce reconciliation and page
evidence.

Fidelity: on the old engine the reconstruction gives the same sector as the old
live run for 68 of 70 sites.

| | Old engine (QA 10e32df) | This branch |
| --- | --- | --- |
| Compatible main sector | 52 | 63 |
| Unknown | 14 | 4 |
| Wrong | 4 | 1 (reconstruction artefact, wrong on the old engine too) |
| No report (block/error page) | 0 | 2 |
| Compatible → not compatible | — | 0 |

## 3. PostgreSQL

A real PostgreSQL 16 server was started locally. The previously skipped
`scan_attempts` integration test passes. New `run-save-pg.mjs` reproduces the
save failure deterministically: sampled page text cut inside an emoji at the
3000-character limit. Old engine: HTTP 500 `SCAN_HISTORY_SAVE_FAILED`, "invalid
input syntax for type json". This branch: report stored with emoji intact. NUL
(rejected by PostgreSQL in jsonb and in text) is removed. The guard wraps every
`pool.query`; the only direct client (`ensureDatabase`) runs static schema SQL.

## 4. Crawler recovery and timeouts

| Scenario (real hanging requests or controlled failures) | Result |
| --- | --- |
| Primary request hangs, browser serves the page | report in 33 s; status/response unconfirmed; honest note |
| Primary request hangs, browser fails | `FETCH_TIMEOUT` in 32 s, 2 attempts reported, not charged |
| All sample pages hang | report in 21 s; retry pass not started for timeouts |
| Firewall resets parallel requests | pages recovered one by one |
| Site refuses every sub-page, also sequentially | exactly 1 extra attempt, then `still_refused` |
| A single failed page | no retry pass |
| Recovered render is a block page | rejected (`HTTP_BLOCKED` / `CHALLENGE_OR_INTERSTITIAL`) |

Repair from this check: the retry pass now has a hard budget (30 s and at least
40 s before the sample deadline) and is reported as `multiPage.sampleRetryPass`.
Budget analysis: primary 2 × 15 s + 1.5 s, browser recovery ≤ 15 s and only when
started within 75 s; renders stay inside the shared 180 s render budget; the
function limit is 300 s. Pre-existing, unchanged: a redirect chain has a 15 s
timeout per hop.

Suite: 557 passed, 0 failed, 0 skipped with `RF_PG_TEST_URL`, `RF_SLOW_TESTS=1`
and `RF_ROUTE_REPLAY=1`; without those variables the three slow/database tests
are skipped. tsc clean, webpack build passes, lint unchanged.

## 5. Not tested outside the 70 replayed sites

- Live behaviour. The reconstruction lacks full navigation, H2s, body text beyond
  3000 characters and JavaScript rendering; 2 of 70 sites already differ on the
  old engine. Only a TestLab run on the merged QA SHA measures the real effect.
- The 26 sites without report were not replayed. Whether the browser recovery
  reaches the two timeout sites from Vercel is unknown until a live run.
- Languages. New lexicons cover mainly NL, EN, DE, FR, IT and ES (vehicles also
  PT, PL, SV). Maintenance/error wording in other EU languages falls back to the
  existing rules. Untested vendor templates (e.g. Kasada, custom WAFs) may be
  missed; vendors can change their pages.
- Small local businesses (restaurants, practices, contractors) are not in the 96.
  They are covered by the 140 synthetic route profiles only. Counting pages typed
  "other" as identity could change their sector when two own pages name another
  activity.
- Commerce as a channel: a shop that never calls itself a shop and has two pages
  describing another activity (e.g. a phone retailer writing about subscriptions)
  could be classified as that activity; a retailer with a product-registration
  page for its own label and no shop wording could become "manufacturer".
- Government by hostname alone (gv.at, gouv.fr, …) assumes the registry reserves
  that label for public bodies; it is reported as probable (76), not confirmed.
- Browser recovery after a timeout adds up to 15 s and one Chromium start for
  sites that hang; cost and cold starts on Vercel were not measured.
- Sector labels of the test group remain `proposed_not_independently_verified`.

## Live TestLab run on QA af918dbd (23 Oct 2026, 11:02–11:50 UTC)

| | QA 10e32df (this morning) | QA af918dbd (this branch) |
| --- | --- | --- |
| Full reports | 71 | 68 |
| Main sector compatible | 54 of 71 | 64 of 68 |
| Unconfirmed | 13 | 4 (EDF, bol, Umicore, Agfa) |
| Wrong main sector | 4 | 0 |
| Subtype compatible | 8 of 12 | 10 of 11 |
| No report | 25 | 28 |

Fewer reports, by cause: Colruyt and Iberia now stop on their block/error page
instead of being scored (intended). VRT returned HTTP 403 to RankFix in 3 s
(it served HTTP 200 this morning); Charité timed out (17 s success this morning);
DHL failed to save. ING and PostNL still time out; the browser visit after the
timeout did not reach them either. Delhaize, which failed to save this morning,
was stored.

Follow-up repairs from this run:
- Browser redirects (apex → www, "/" → "/es/es/"): links were resolved against the
  pre-render URL, so all 12 sampled pages of one site returned 404. The rendered
  URL is now adopted within the same registrable site (exact host comparison;
  two-level public suffixes handled); a redirect to another site is not adopted.
- Saving: connect-phase database errors are retried once (never after a statement
  was sent); the previous-scan comparison can no longer fail the save; a failed save
  reports `saveFailure.stage` and `saveFailure.cause` (PostgreSQL code, no secrets).
  The DHL cause could not be read: Vercel runtime logs returned 403 to this session.
  All 70 reconstructed sites were saved twice on real PostgreSQL without error.
- `scripts/testlab/run.mjs` records `failure` (blockKind, nonContent, saveFailure,
  recovery), `access`, `rendering` and `sampleRetryPass`. The laptop runner
  (`testlab-96.mjs`, outside the repository) does not store these yet.
- One site (TIM) refuses every sub-page also sequentially: the retry pass made one
  attempt and stopped (`still_refused`), as designed.

## TestLab run of 23 Oct 2026, evening (QA af918dbd, 17:42–18:32 UTC)

96 sites, 69 reports, 65 compatible, 4 unconfirmed (EDF, bol, Umicore, Agfa),
27 without report. Note: this run tested af918dbd, which does not contain commit
7219358 (rendered-URL adoption, save diagnostics).

Root causes found in the raw scans and the QA database:

| Finding | Cause | Repair |
| --- | --- | --- |
| bol: report 80/100, sector unknown | HTTP 403; the browser recovery got an "IP address is blocked" page in three languages, which the page gate did not know | Gate: IP/access-blocked messages and image-CAPTCHA templates, short pages only, help texts ("If your IP address has been blocked…", questions) excluded. Result: `HTTP_BLOCKED`, no score |
| Agfa: report 59/100, 37 words, no title | The rendered homepage was an F5-style image CAPTCHA ("testing whether you are a human visitor", support ID) | Same gate rule. Result: `CHALLENGE_OR_INTERSTITIAL`, no score |
| EDF unconfirmed | 10 of 14 sample pages refused (403); one own page declares "fournisseur d'électricité et de gaz" in its title; a second own page says "au service de l'énergie" but carries no vote; the rule needed two voting pages | One explicit TITLE declaration + another own page naming the same sector family + no contradicting vote → probable sector (medium, 74). Without that corroboration it stays unknown |
| Umicore unconfirmed | Its own offering is described on market sub-pages (/markets-products/electronics-telecom: "We provide advanced materials…"); all market sub-pages were excluded as customer pages | A market page may corroborate a sector that an ordinary own page already supports, and only when the detected sector is not the market the page addresses (the industrial-manufacturing page is still excluded). Market pages alone never decide |
| Achmea subtype financial_services instead of insurance | Two insurance votes + one generic "financiële dienstverlener" vote; any disagreement fell back to the generic key | Generic votes do not overrule specific ones; disagreeing specific votes (insurance + banking) still give the main sector only |
| eir, Coolblue BE: SCAN_HISTORY_SAVE_FAILED | Not readable directly (Vercel logs 403, no Neon logs). The QA database shows: both were saved fine in the morning, 4 save failures in ~800 attempts, one per run, at different stages of the run; the database stayed reachable (the attempt row was written right after). Reproduced on PostgreSQL: every new serverless instance ran the full schema migration (ALTER TABLE users/scans …) in one transaction; a scan INSERT on another instance holds its lock on scans and waits for users (foreign key) → `40P01 deadlock detected` → the scan save fails | (1) Schema fingerprint: an applied schema is never migrated again, so no DDL locks on cold starts; (2) the scan insert has a client-chosen id with `ON CONFLICT DO NOTHING` and is retried after deadlock / broken connection (exactly one row, proven); reads are retried, the previous-scan read can no longer fail the save; (3) stage, PostgreSQL code and message are stored in `scan_attempts.error`, so the next failure's cause can be read from the database |
| tim.it: "98" from 1 of 16 sample pages | Thin-sample rule only made it "provisional" | Fewer than a quarter of a sample of 8+ pages is "insufficient": the headline becomes the range (89–98) and the report says "indicatie" |
| fiat.it, bol.com: no PageSpeed section data | Page answered 403 → `websiteSpeed: null`, no reason | Explicit "not measured" for mobile and desktop with the reason (site refused RankFix / not reached); the report page always shows why |
| Slow scans (max 123 s) | All JavaScript sites: the sample pages of framework sites are rendered in the browser (13–30 renders); primary render 3–6 s. All within the 180 s render budget | Not changed (would change evidence); measured, see report |
| ING, PostNL timeouts; 22 × 403/challenge | Site-side refusal of the scanner; no bypass | Unchanged by design: no score, provider-specific message |

Verification (offline, no live scans): full-route replay of the evening run
reconstructs the live result of af918dbd exactly (64 compatible, 4 unknown, 1
wrong artefact). This branch: 66 compatible, 0 unknown, 1 wrong (same
artefact), bol and Agfa without report. Morning run: 65 compatible, 0 unknown,
1 wrong, 4 without report (Colruyt, Iberia, bol, Agfa). No other site changed in
either run. Suite: 571 passed, 0 failed, 0 skipped (with PostgreSQL, slow and replay
tests); tsc clean; webpack build passes; lint unchanged.
