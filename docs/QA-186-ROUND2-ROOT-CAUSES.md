# QA #186 round 2: root causes and generic repairs (23 Oct 2026)

Input: the owner's TestLab run `alle-96-10e32df2` on QA `10e32df2` (71 complete reports,
54 compatible main sectors, 13 unconfirmed, 25 without report). It was read from the
owner's machine: the summary plus the raw scan JSON of all 70 stored reports. No
website was scanned from this workspace. PageSpeed stays paused.

## Root causes found in the raw scans

| Area | Evidence in the run | Generic cause |
| --- | --- | --- |
| Misleading reports | Block page scored 65, error page ("connection was interrupted") scored 83 | A browser recovery after 403/405 accepted any page with 40+ words |
| Crawler | One site: 10 of 14 sample pages were maintenance notices; another: 7 "Human Verification" pages, all "audited" | Sample gate only knew a few challenge phrases; no maintenance/error detection |
| Crawler | One site: 15 of 16 sample pages failed in 4 s with no HTTP status | Firewall resets parallel connections; no polite retry, reason logged as "ophalen mislukt" |
| Internal error | One retailer: `SCAN_HISTORY_SAVE_FAILED` | Fixed-length slices cut emoji in half; PostgreSQL jsonb rejects the lone surrogate (reproduced with a real PostgreSQL engine). NUL is rejected too |
| Timeouts | Two sites `FETCH_TIMEOUT` on both attempts | A 403 got one browser visit, a timeout did not |
| Sector: wrong | Payment provider → passenger transport | Navigation stems "Karte" (card) and "station" (stationär) read as transport; German "Payment für Ihr Business" unknown |
| Sector: wrong | Energy group → news | Press room ("Espace journalistes", "Newsroom") counted as an editorial office |
| Sector: wrong | Telecom operator / manufacturer → e-commerce | Any confirmed cart overrode identity; later reconciliation overturned corrected decisions |
| Sector: unknown | Software vendor, insurer group, bank group, energy producer, government portal, hotel brand, materials group | Pages typed "other" (e.g. /organisatie, /software/erp) never counted; missing multilingual terms; one deviating page vetoed a 3-page majority |
| Page evidence noise | Votes from "Flugblatt" (leaflet), Dutch "vlak" (next to), "operaties" (surgery), "Consejo de Gobierno", customer segment pages | Multilingual false friends, audience pages, governance bodies |
| TestLab | A 401 site counted as "site_or_input_error" | New code `HTTP_AUTH_REQUIRED` unknown to the laptop TestLab; now `HTTP_BLOCKED` + `blockKind` |

## Repairs (all generic; no domain, brand or country rules)

- `lib/page-gate.ts`: one gate for block, error and maintenance pages (multilingual);
  used for the scanned page (`SITE_ERROR_PAGE`, no score), for every browser recovery
  and for every sample page (excluded, never evidence or score). Wording about errors on
  long pages is never rejected.
- Crawler: per-page failure codes; one bounded sequential retry pass (max 6 pages,
  700 ms pause) only when most sample fetches failed at network level. Refusals,
  timeouts and block pages are never retried.
- `lib/jsonb-safe.ts` + `lib/db.ts`: every query parameter is made valid for PostgreSQL
  (well-formed Unicode, no NUL); scan persistence serialises with the same helper.
- Primary timeout or dropped connection: one bounded browser visit (RankFixBot UA, same
  SSRF checks); block pages are rejected; status and response time stay unconfirmed and
  the report says RankFix got no answer (no synthetic HTTP code in checks).
- Pages without any identity (no title, description or H1, < 80 words) get one render.
- Sector: payments for businesses, financial groups and bank business lines, insurer
  groups, mobile operators and telecom bundles, energy producers, product-making
  technology groups, software vendors, hotel compounds, government hostnames (probable).
- Page evidence: identity pages typed "other" and shallow undated section pages count;
  editorial, press, dated, market-segment and customer pages never vote; a majority of
  ≥ 3 pages and ≥ 3× the runner-up decides, closer splits abstain.
- Commerce is a channel when the site never calls itself a shop and two own pages name
  another activity, or a product-registration service proves a manufacturer. The shop is
  kept as a secondary activity; the later commerce reconciliation can no longer overturn it.

## Before / after (offline, reproducible)

| Measurement | QA 10e32df | This branch |
| --- | --- | --- |
| Identity replay of the 70 recorded sites (`scripts/testlab/replay-identity.mjs`) | 41 compatible, 29 unknown, 0 wrong | 52 compatible, 18 unknown, 0 wrong |
| Page votes against the proposed label | 13 of 257 off-label | 6 of 245 (all real secondary activities) |
| New end-to-end failure-class scenarios (real scan route) | 3 of 11 pass | 11 of 11 pass |
| Full offline suite | 537 pass | 548 pass, 0 fail, 1 skipped (PostgreSQL) |

The replay covers title, description, H1, schema and sampled-page identity only
(navigation and commerce are not stored in TestLab output). It is a lower bound for the
route, not a live result. Labels remain `proposed_not_independently_verified`.

## Not solvable from the engine

22 sites refuse RankFix (403/WAF/challenge). RankFix does not bypass them; reports now
name the protection and the owner's options. Live acceptance requires the owner's
TestLab run on the new QA SHA.
