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
