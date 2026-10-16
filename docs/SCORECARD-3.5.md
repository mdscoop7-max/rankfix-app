# RankFix 3.5 — scorekaart v2 (vooraf vastgelegd)

Vastgelegd op 16 oktober 2026, **vóór** de evaluatie en vóór de motorwijzigingen van ronde 3. Code: `scripts/engine-benchmark/scorecard-v2.mjs` (`SCORECARD_V2`, bevroren object). Een test bewaakt dat de gewichten samen 10 zijn en dat een onvolledige meting nooit 9/10 oplevert.

## 1. Criteria, gewichten en grenzen

Per criterium: waarde in %. Punten = gewicht × (waarde − ondergrens) / (doel − ondergrens), begrensd tussen 0 en het gewicht.

| # | Criterium | Meting | Gewicht | Doel (vol) | Ondergrens (0) |
|---|---|---|---|---|---|
| 1 | Sectorherkenning | juiste hoofdsector / gescande sites met een bekende sector; "onbekend" telt nooit als goed | 2,0 | 95 | 70 |
| 2 | Paginatypeherkenning | handmatige review: juist getypeerde pagina's / beoordeelde pagina's (5 per site, vaste selectie) | 1,0 | 95 | 75 |
| 3 | CMS- en platformherkenning | handmatige review: sites waar CMS én webshopplatform kloppen (ook "geen") / beoordeelde sites | 1,0 | 95 | 75 |
| 4 | SEO/GEO-correctheid | handmatige review: terechte waarschuwingen/fouten met aftrek / beoordeelde bevindingen (max. 5 per site) | 1,5 | 98 | 85 |
| 5 | Moduletoepasbaarheid | handmatige review: sites met de juiste actieve modules (webshop aan/uit, sectormodule) | 1,0 | 95 | 75 |
| 6 | Betrouwbaarheid van bewijs | scorende controles met bron-URL én vastgelegde bevinding / alle scorende controles | 0,5 | 100 | 90 |
| 7 | Zekerheidskalibratie | min(100 − % fout met zekerheid ≥ 85, juistheid in de klasse ≥ 90% zekerheid bij ≥ 5 sites) | 1,0 | 99 | 90 |
| 8 | Internationale prestaties | slechtste sectorjuistheid van een taal (of land) met ≥ 3 sites | 0,5 | 90 | 60 |
| 9 | Rapportconsistentie | rapporten zonder schending (waarschuwing zonder aftrek, geslaagd met aftrek, onbevestigd met punten, score buiten bereik, 100 met onbevestigde controles, render-advies na geslaagde rendering, zelfcontrole-correcties) | 0,5 | 100 | 90 |
| 10 | Stabiliteit | sites met een opgeslagen rapport / sites met een scanpoging; geblokkeerde sites tellen als mislukt (en worden apart per oorzaak gerapporteerd) | 1,0 | 95 | 70 |

Totaal: 10 punten.

## 2. Acceptatie (9/10)

RankFix haalt 9/10 alleen als **alles** geldt:

- totaal ≥ 9,0 op de **onafhankelijke** sets (§4);
- alle 10 criteria gemeten (een ongemeten criterium wordt nooit ingevuld);
- geen criterium onder zijn ondergrens;
- per sector met ≥ 3 sites minstens 80% juist, en in geen enkele sector een zelfverzekerd foute sector (zekerheid ≥ 85);
- de regressiesuite (`npm test`) en CI zijn groen op de geteste commit.

Unit-tests, de synthetische matrix en de hold-outs tellen **niet** mee voor het cijfer; zij bewaken alleen regressies.

## 3. Handmatige review (criteria 2–5)

`node --experimental-strip-types scripts/engine-benchmark/review.mjs template <scans.json> > review.json` maakt per site een vaste steekproef: de eerste 5 beoordeelde pagina's op URL-volgorde en de eerste 5 bevindingen met aftrek op sleutelvolgorde. De reviewer vult per item de werkelijke waarde in (`truthType`, `truthCms`, `truthPlatform`, `verdict`, `modules.correct`) aan de hand van de pagina zelf en de paginabron, zonder de motoruitkomst te veranderen. Lege velden tellen niet mee. Twijfelgevallen worden als `incorrect` gemarkeerd met een notitie, niet weggelaten.

## 4. Datasets

| Set | Bestand | Rol |
|---|---|---|
| EU-81 | `tests/fixtures/eu81/plan.json` | ontwikkelset: is bij het herstel bekeken, apart gerapporteerd, telt niet als onafhankelijk |
| Blind-40 | `tests/fixtures/eu-pilot2/plan.json` | onafhankelijk, behalve de blootgestelde gevallen uit `tests/fixtures/evaluation/exposures.json` (Charité), die apart worden gerapporteerd met hun oorspronkelijke fout |
| Onafhankelijk-3 | `tests/fixtures/eu-independent3/plan.json` | onafhankelijk, 68 sites, 11 landen, 11 talen, 17 sectorfamilies; vooraf geregistreerd, labels door eigenaar te beoordelen vóór de scan |

Alle plannen blijven ongewijzigd. Een blootstelling na het bevriezen komt alleen in het register.

## 5. Meten

1. Pilot: `run-pilot.mjs <plan> <prefix>` op de previewlink, met een testaccount en bij voorkeur een geïsoleerde testdatabase (zie issue #154), deployment-SHA in `RF_DEPLOYMENT_SHA`.
2. `RF_PLAN=<plan> node --experimental-strip-types scripts/engine-benchmark/eu81.mjs v2 <prefix>.scans.json <prefix>.attempts.json review.json`
3. Uitkomst: `independent` (scorekaart zonder blootgestelde gevallen) en `exposedCases`. Rapporteer per sector en per taal/land (`perSector`, `perGroup`).
