# RankFix nachtelijke regressiepilot (issue #128)

Interne, **read-only** regressietest met de echte SEO/GEO-scanner. Geen klantmonitoring, geen fixes, geen wijzigingen aan externe websites.

## Status

**Niet actief.** De workflow heeft geen schedule en de interne routes antwoorden `503` zolang `RANKFIX_REGRESSION_PILOT` niet `1` is. Activeren gebeurt pas na akkoord van de eigenaar op de URL-lijst en het kostenbudget.

## Onderdelen

| Bestand | Rol |
|---|---|
| `lib/regression/pilot-sites.ts` | Versiebeheerde testset (7 plekken, 6 goedgekeurd, Shopify wacht op akkoord; harde limiet 29) met bewijsgebonden invarianten — geen vaste totaalscores, geen merkuitzonderingen |
| `lib/regression/context.ts` | Server-only regressiecontext: scanner leest geen sessie, schrijft geen historie/usage, slaat de publieke netwerklimiet over |
| `lib/regression/snapshot.ts` | Scanresultaat → compacte snapshot (scores, dekking, sector, paginatype, rendering, bot, regels, content-fingerprint, scannerversie/commit). Geen paginatekst |
| `lib/regression/compare.ts` | Onderscheid echte regressie / gewijzigde inhoud / onvoldoende bewijs |
| `lib/regression/store.ts` | Eigen tabellen `regression_runs` + `regression_results`; lease, idempotency, max 2 pogingen per site |
| `lib/regression/report.ts` | Eén overzicht (totaal / geslaagd / waarschuwing / niet bevestigd / geblokkeerd / timeout / overgeslagen / regressies) + groene-nacht-teller |
| `app/api/internal/regression/{start,scan,finish}` | Geheime interne routes (`Authorization: Bearer $REGRESSION_SECRET`) |
| `scripts/regression/run-pilot.mjs` | Runner: één site tegelijk, 15 s pauze, één retry bij 502/503/504 |
| `.github/workflows/regression-pilot.yml` | Alleen handmatig (`workflow_dispatch`); schedule staat uitgecommentarieerd |
| `scripts/regression/preview-smoke.mjs` | Handmatige preview-controle via de gewone publieke scan (max. 7 URL's) |

## Classificatie

- **Echte regressie**: zelfde content-fingerprint als de baseline én nieuwe bevestigde FAIL (zekerheid niet laag) of totaalscore ≥ 8 punten lager; óf een nieuwe schending van een invariant (sector, websitetype, paginatype, paginatype-tegenstrijdigheid); óf een interne RankFix-fout op een site die eerder slaagde.
- **Gewijzigde inhoud**: fingerprint (titel, description, canonical, H1's, lang, schema-types) verschilt → verschillen zijn een waarschuwing, geen regressie.
- **Onvoldoende bewijs**: dekking < 70 %, gereduceerde botpagina, 403/405/429/503, challengepagina, timeout → nooit regressie, nooit alarm.

Baseline = laatste bruikbare scan (gescand, geen botreductie, dekking ≥ 70 %) uit een eerdere run.

**Groene nacht**: 0 regressies, 0 interne scannerfouten en ≥ 70 % van de geprobeerde sites echt gescand. Drie opeenvolgende groene nachten zijn nodig vóór uitbreiding naar ~29 sites.

## Activeren (pas na akkoord eigenaar)

1. Merge deze PR na groene CI en Vercel-preview `READY`.
2. Vercel production env: `RANKFIX_REGRESSION_PILOT=1`, `REGRESSION_SECRET` (≥ 32 tekens, willekeurig), `REGRESSION_ALERT_EMAIL`.
3. GitHub repository secret `REGRESSION_SECRET` (zelfde waarde).
4. Eerst één handmatige run via *Actions → RankFix regressiepilot → Run workflow*.
5. Daarna de `schedule`-regel in de workflow aanzetten (aparte, kleine PR).

Uitzetten: `RANKFIX_REGRESSION_PILOT` verwijderen (routes geven direct `503`) of de schedule weer uitcommentariëren.
