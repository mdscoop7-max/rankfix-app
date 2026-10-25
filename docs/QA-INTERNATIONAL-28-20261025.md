# QA international-28 (TestLab @ 3d9239aa, 25 Oct 2026) — structural repairs

Status: QA branch / draft PR #201 only. Not merged, not deployed.

## Confirmed in the export (28 sites, labels "proposed_not_independently_verified")
- 6 refusals (HTTP 403/blocked) — correct detection, nothing bypassed, no change.
- 10 × sector "unknown" with scores 88–99: mortgage adviser (NL), doctor booking
  platform (FR), home-services marketplace (ES, NO), web hosting (IT), real-estate
  agency (IT, DK, FI), hospital group (PT), construction group (CH).
- No page text was stored for these sites, so the repairs below are reproduced on
  neutral invented texts that represent each CLASS (no domain or brand rule).

## Repairs (existing sectors only, same independence rule as before)
| Class | Change | Sector / key |
|---|---|---|
| Real-estate agency | DA, SV, NO, IS, FI, ET, PL, PT, CS/SK, HU, RO, EL, HR/SL trade nouns + context | real_estate |
| Marketplace for trades | ES "encuentra/pide", Nordic "få tilbud", FI/PL verbs; craftsmen nouns; **"our craftsmen" = contractor, excluded** | service_marketplace |
| Mortgage adviser | declared mortgage advice/brokerage in 12 languages; refines a financial subtype; **a bank naming itself never declares this** | financial_services / financial_mortgage |
| Hospital / clinic group | multilingual hospital, medical-centre and clinic-group nouns + care context; **animal hospitals stay veterinary**; a broad declaration never replaces a specific subtype (UMC stays academic) | health_wellness |
| Doctor booking | booking verb + appointment + practitioner together | health_wellness / healthcare_booking |
| Web hosting | hosting nouns, **only with domain/server/cloud context; web agencies excluded** | saas_b2b / web_hosting |
| Construction group | construction-group nouns, **only with infrastructure context**; a local builder is not covered | manufacturing_industrial / construction_infrastructure |
| Software vendor for hospitals | no longer read as a care provider (pre-existing false positive) | saas_b2b |

Homepage-only declarations stay "probable" (76) until own pages corroborate them.

## Prices, FAQ, legal links, EU/EEA scope
- Visible prices: CHF / Fr. / SFr.; round prices "€ 12,-" and "CHF 12.–"; "kr" assigned
  to SEK/DKK/NOK/ISK only from the country domain or page language (never guessed);
  ISK, RSD, MKD, ALL, BAM, MDL, UAH, TRY (₺), GEL (₾). Opening hours ("Fr. 9-18 Uhr")
  and words equal to a code (all, try, gel, km) are not prices.
- FAQ: question words of the EU/EEA languages, "¿…", Greek ";", `<dt>/<dd>`, accordion
  buttons, wrapped answers, microdata. Still requires a question AND an answer ≥ 12 chars.
- Legal links: privacy/cookies/terms words in SV, NO, DA, FI, PL, CS/SK, HU, RO, ET, LV, LT, HR/SL.
- EU consumer signals: NO/IS/LI storefronts are in scope (EEA). Switzerland and the UK are
  not; a store priced only in CHF or GBP on a generic domain is not treated as EU market.
- Returns/shipping wording for the same languages (incl. "14 days" in each language).

## Not changed / still open
- Accessibility: no confirmed failing case in the 28-site export or the 144 data I can read; not changed.
- ICA audit: not found in the shared files; not used.
- ing.nl / brainwash-kappers.nl timeouts: need a live diagnostic on the laptop (permission pending).

## Verification
- npm test: 674 tests, 667 pass, 0 fail, 7 skipped.
- Full-route replays (232 recorded sites) vs HEAD 3d9239aa: 0 differences. Matrix 142/142,
  render, sample access and local 53 unchanged. 12 new neutral route profiles (8 classes + 4 controls) pass;
  on 3d9239aa 6 of the 8 classes failed and the hospital-software control was misread.
- tsc --noEmit clean.

## Timeouts ing.nl / brainwash-kappers.nl (laptop browser check, 25 Oct 19:45, read-only)
Earlier TestLab (7a2155c): both FETCH_TIMEOUT in phase browser_render, no origin status.
- brainwash-kappers.nl: the bare domain accepts no HTTPS connection (laptop browser also
  hung > 15 s); www.brainwash-kappers.nl answers HTTP 200 in 0.3 s (268 words, 53 links).
  Fix: after a timeout/refused connection, ONE attempt on the www/apex counterpart of the
  same site, adopted only when it serves a 2xx page; never after an HTTP refusal (403/429).
- ing.nl: in a normal browser the bare domain redirects to www and answers fast (TTFB 51 ms).
  Not reproduced as a site timeout; the RankFix server fetch from the laptop could not be
  run (no shell on the laptop in this session). Not changed. Observation: the page content
  sits entirely in shadow DOM (149 web components, ~1,700 words) while the light DOM has
  3 words; RankFix's browser snapshot (page.content()) does not include shadow DOM, so a
  render of this kind of site would look empty. Not changed (needs a separate decision).

## Round 2 (TestLab @ f6ebd201, 25 Oct 21:10) — six remaining "unknown" sites
Owner's run: 22 reports, 6 refusals unchanged, unknown 10 → 6. Real page content was read
read-only in the laptop browser; saved reports via /api/history (owner logged in).
| Site class | Confirmed cause | Fix (generic) |
|---|---|---|
| Home-services marketplace (ES) | React streaming SSR puts `<meta name=description>` and canonical in `<body>`; RankFix read head only → identity saw no description; the SEO check said "geen meta description-tag gevonden" (untrue) | Outside-head description used for identity only; SEO checks unchanged in points but now say "staat buiten <head>" |
| Doctor booking (FR) | "soignant" missing; "trouvez un spécialiste … prenez rendez-vous" order not covered | practitioner nouns + reversed order |
| Web hosting (IT) | title "Home \| brand", no description, no H1; activity only in H2 + navigation | probable (74) navigation-level hosting identity; agencies excluded |
| Property listing portal (IT) | "Annunci case e appartamenti in vendita" (listing portal, no agency noun) | listing-portal nouns in 15 languages |
| Construction group (CH) | "Bauunternehmer", "Immobiliendienstleisterin" (noun forms) | noun forms; infrastructure context still required |
| Service marketplace (NO) | "finne fagfolk", "legg ut jobben … bli kontaktet av håndverkere" | Nordic verbs/phrases + context |

Terveystalo 93 → 91: FAQ check pass (10/10) → not applicable. Cause: the FAQ rewrite in
215829cc capped heading markup at 400 characters; 12 of its headings carry longer inner
markup. Regression fixed (visible text ≤ 250 chars, markup up to 2,000). Note for the owner:
the two headings that pass are promotional teasers ending in "?", not a FAQ; tightening the
FAQ rule would change existing documented behaviour and needs a decision.
The same run also gained legal links (FI "Tietosuojaseloste"): unable → pass.

Score vs sector: every report with an unconfirmed or probable sector now carries
`scoreModel.scope.sectorDistinction` ("Technische SEO/GEO-score X/100 … sectorspecifieke
controles zijn niet uitgevoerd … zegt niets over de sector"), shown under the headline score.

Verification: 678 tests, 671 pass, 0 fail; 7 new neutral route profiles (6 classes fail on
f6ebd201, pass now; agency control stays non-hosting); replays 232 sites: 1 difference —
a recorded French property portal unknown → real_estate (expected label real_estate).

## Round 3 (25 Oct 21:30) — owner decisions and field report
- FAQ (owner approved): a heading question counts only inside a page-labelled FAQ (EU/EEA
  languages) or as a series of ≥ 3 pairs; every pair must answer its question (shared
  content-word stem) and must not be promotion/event/CTA wording. details/dt/accordion/
  microdata keep one pair, without promotion. Positive and negative regression tests added;
  the earlier single-heading test now uses a labelled FAQ (behaviour change by decision).
- Car body / collision repair (owner report, NL chain "unknown" at 99/100): declaration
  of body-repair trades in NL, DE, FR, IT, ES, PT, Nordic, FI, PL, CS, HU, RO → automotive /
  car_repair. Bare "schadeherstel" needs a vehicle word (property damage repair is excluded).
- Found with the new control: property-damage repair was "Vastgoed 90" because the word
  "woning" anchored the legacy real-estate rule. "woning/huizen" are now context only;
  replays (232 sites) and the 53 local profiles are unchanged.
