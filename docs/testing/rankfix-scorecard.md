# RankFix-testkaart — doel 9,5

Twee doelen, allebei **eerlijk verdiend**: nooit door de scoreberekening op te rekken, checks weg te laten of drempels te verlagen om een getal te halen.

## Doel 1 — Kwaliteit van de scanner: gemiddeld ≥ 9,5 / 10

Elke **echte** scan op de preview wordt op deze kaart beoordeeld. Een bevinding telt pas als "onterecht" nadat ze is gecontroleerd tegen de broncode van de gescande pagina of de RankFix-code.

| # | Criterium | Punten | Hoe beoordeeld |
|---|---|---:|---|
| 1 | **Sector** juist (hoofdsector en rol) | 2,0 | Fout = 0; juist maar te lage/hoge zekerheid = 1,0 |
| 2 | **Geen verzonnen fouten** | 2,0 | −1,0 per aantoonbaar onterechte waarschuwing/fout (min. 0) |
| 3 | **Juiste modules** (geen checkout/merchant zonder winkel, N.v.t. waar terecht) | 1,5 | −0,5 per onterecht actieve of onterecht uitgeschakelde module |
| 4 | **Geen onverdiende punten** (PASS alleen met bewijs) | 1,5 | −0,5 per PASS zonder bewijs |
| 5 | **Eerlijke foutafhandeling** (blokkade, 4xx/5xx, JS-only → juiste melding, geen score/geen securityoordeel op onbewezen info) | 1,0 | Niet van toepassing = volle punten |
| 6 | **Consistent profiel en kernmetrics** (websiteprofiel, aantallen, zekerheid spreken elkaar niet tegen) | 1,0 | −0,5 per tegenstrijdigheid of aantoonbaar verkeerd aantal |
| 7 | **Begrijpelijke Nederlandse uitleg + uitvoerbare aanbeveling** | 1,0 | −0,5 per onduidelijke of niet-uitvoerbare aanbeveling |
| | **Totaal** | **10,0** | Doel: gemiddelde ≥ 9,5 over de hele testlijst, en geen enkele site < 8,5 |

Testlijst: IKEA NL, IKEA internationaal, DiscountOffice, elektronica-webshop, beauty-webshop, kleine webshop, tandarts, makelaar, garage, transportbedrijf, hotel, restaurant, kapper/beautysalon, accountant, informatieve site, meertalige site.

## Doel 2 — Score van de eigen RankFix-website: ≥ 95 / 100

- Meten: de preview-scanner scant de **openbare productiesite** `https://rankfix-app.onrender.com/` (alleen lezen; productie wordt niet gewijzigd). De preview zelf is niet scanbaar, want die staat achter Vercel-login.
- Verbeteren: alleen echte, onzichtbare technische verbeteringen (metadata, structured data, headers, toegankelijkheid). **Wijzigingen aan homepage, branding, design of prijzen vereisen eerst uitdrukkelijke toestemming van de eigenaar**, ook als ze onzichtbaar zijn.
- Een verbetering telt pas na een nieuwe scan van de live site; productie blijft ongewijzigd tot de eigenaar een merge goedkeurt.

## Resultaten

| Datum | Site | Commit scanner | Score | Onderbouwing |
|---|---|---|---:|---|
| 11-10-2026 | IKEA NL — eerste scan | `dc16d37` | **7,0** | Sector 2/2 (Webshop 96%); verzonnen fout "Organization ontbreekt" (−1 → 1/2); modules 1,5/1,5; FAQ-PASS zonder bewijs (−0,5 → 1/1,5); foutafhandeling 1/1; profiel 40% vs 96% en "2157 afbeeldingen" (−1 → 0/1); uitleg 0,5/1 (aanbeveling bij een onterechte bevinding is niet uitvoerbaar) |
| 11-10-2026 | IKEA NL — herscan | `858c191` | *te bevestigen* | Alle vier punten gecorrigeerd in `061acf5` en `858c191`; score pas invullen na echte herscan |
