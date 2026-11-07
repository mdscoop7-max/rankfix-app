# QA #186 — repairs from the 96-site TestLab report (23 Oct 2026)

Scope: QA only. No live scans, no TestLab run, no 96-site retest from this
workspace; the owner runs TestLab. `main` and production are unchanged.
Stacked on PR #188 (`fix/qa-speed-setup-runtime-186`).

## Wrong sectors — generic causes (no domain rules)

| Reported | Generic cause | Repair |
| --- | --- | --- |
| Academic hospital → education | "MC"/"-umc" names and Dutch "zorg" not read as care; teaching won | University + hospital/emergency/patient-care in own identity = healthcare; legacy hospital words; health outranks education on ties |
| Car maker → government | "Site officiel" (brand wording) counted as a government term | Only supports government with a gov host/schema; new multilingual vehicle maker/dealer identity |
| Payment provider → transport | German payment wording missing; industry pages ("/branchen/transport") voted for the provider's own sector | German/FR/ES/IT payment terms; served industries are audience; industry/customer/case pages never vote |
| Telecom operator → ecommerce | Bundle wording ("Internet, TV, mobiel en vaste lijn") not an identity | Telecom bundle identity (internet + mobile/TV + fixed line/plan); shops and broadcasters excluded |
| Manufacturer → ecommerce | "technology company" making devices/materials not recognised | Medium-confidence industry identity; software firms excluded |
| News site → ecommerce | French editorial wording and news-named publishers ("<x>info") | "l'info", "à la une", "info en continu"; news-named brand + editorial wording |

Unconfirmed sectors: extra corroboration (insurer + pension/policy concepts,
power generation, supermarket assortment, FR/DE/ES/IT sale/rent wording).
Insufficient evidence still returns `unknown`.

## Incomplete scans

- Blocked responses carry `diagnosis` (login/401, named WAF/bot protection,
  generic refusal, 429, 451) with Dutch advice; no bypass, no extra requests.
- Challenge pages name the protection provider when headers/body show it.
- Redirect loops stop immediately (`REDIRECT_LOOP`); a one-time consent-cookie
  redirect still works.
- Timeouts: no extra 30 s HTTP downgrade after two HTTPS timeouts; the error
  states attempts and elapsed time.
- TestLab labels: a target site's 429/login is `site_blocked`, never RankFix
  quota (previously this could stop the run).

## SEO/GEO and PageSpeed

- A representative sample with < 50% of ≥ 4 selected pages fetched is
  `provisional`, never "Definitief" (TIM: 1/16 pages).
- Self-check flags duplicate or contradicting findings per (category, key).
- PageSpeed: Speed Index parsed per device; FCP/LCP/CLS/TBT/SI shown per device
  from Google data only; old saved reports without SI show "—".

## Verification (offline)

`npm test`: 537 passed, 0 failed, 1 skipped (PostgreSQL). New
`tests/qa-96-report-repairs.test.mjs` (13) and 5 real-route matrix profiles
(`qa186-*`); on the previous engine 4/5 show the reported wrong sector and the payment profile was `unknown`.
`tsc --noEmit` clean; webpack production build passes (Google Fonts mocked
offline); lint totals of modified legacy files unchanged.

Not verified: real websites. Labels remain `proposed_not_independently_verified`.
