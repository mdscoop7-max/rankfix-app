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
