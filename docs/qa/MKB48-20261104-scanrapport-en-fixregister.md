# RankFix QA — MKB-48 scanrapport en herstelregister (2026-11-04)

**Status:** vastgesteld uit aangeleverde TestLab-export; herstelpunten nog NIET uitgevoerd of gevalideerd.  
**Bron:** `rankfix-testlab-144-mkb48-8f9f2e31(1).json` (gebruikers-export; bewaar het origineel apart).  
**Scancommit:** `8f9f2e31f14b37d6c352ab6f50725e487d14d229`  
**Catalogus:** `mkb48`; **gegenereerd:** `2026-11-04T18:49:29.618Z`  
**Scope:** 12 groepen × 4 domeinen, uitsluitend MKB-48; geen uitspraak over regressie in de andere 144.  
**Waarschuwing:** cataloguslabels zijn in de bron expliciet `proposed_not_independently_verified`. Sommige gekozen sites zijn ketens/platforms in plaats van typische MKB-bedrijven. Controleer ground truth vóór enginewijzigingen.

## Resultaten

| Metriek | Aantal |
| --- | ---: |
| Totaal | 48 |
| Succesvolle scan | 38 |
| Netwerkfout (`netwerk_website`) | 6 |
| Site geblokkeerd (`site_geblokkeerd`) | 3 |
| Timeout | 1 |
| Exacte sectorvergelijking (van 38 successen) | 9 |
| Mismatch in huidige verdict (van 38) | 23 |
| Niet bevestigd (`unknown`; van 38) | 6 |

**Interpretatie:** 23 mismatches zijn verdicts op basis van de huidige verwachte labels; niet 23 bewezen verkeerde classificaties. Een mislukte fetch is geen sectorfout. `exact` is ook niet altijd een correcte business-typeclassificatie (zie Treatwell).

## P0 — Eerst repareren / beoordelen

1. **Sector-equivalentie in TestLab/verdict:** `garage → car_repair`, `realtor → real_estate`, `law → legal`, `gym → fitness_sports`, `training → education` en `plumber → home_services` zijn plausibele equivalenten of ouder-kindrelaties, geen automatische enginefouten. Maak een **expliciete, geteste mapping per verwachte categorie**, niet een generieke brede 'alles is equivalent'-regel. `hotel → hospitality`, `gardener → home_services` en `beauty → health_wellness` zijn te breed om zonder inhoudelijk bewijs blind als exact te tellen. Rapporteer exact/equivalent/wrong/unconfirmed/blocked afzonderlijk.
2. **Feenstra (`feenstra.com`):** verwacht `plumber`, gevonden `ecommerce`, met webshopfuncties als bewijs en 73% scoredekking. Onderzoek of verkoopfunctionaliteit onterecht de primaire dienstactiviteit overschrijft; controleer ook of `plumber` de juiste specifieke ground truth is.
3. **Treatwell (`treatwell.nl`):** verdict `exact` bij verwacht `beauty`, gevonden `hair_salon`, maar Treatwell is een boekings-/marktplaatsplatform voor salons, niet zelf een kapsalon. Onderzoek eigen-organisatie vs aanbod van derden. Dit is een **false-positive verdict ondanks exact**.
4. **Onbekende sectoren (6):** `restaurantdekas.com` (restaurant), `klaassenbv.nl` (makelaar), `sportcity.nl` (fitness), `hutten.eu` en `vermaatgroep.nl` (catering), `donkergroep.com` (hovenier). Onderzoek site-evidence, redirects, taal/metadata en bewijsdrempels. Niet forceren zonder bewijs.
5. **Rapportage van hoge scores bij onvoldoende bewijs:** voorbeelden `freshtandartsen.nl` score 94 met `evidenceLevel=insufficient`, slechts 1/14 geselecteerde pagina's inhoudelijk beoordeeld; `vakgarage.nl` score 92 bij 77% dekking; `loetje.nl` score 99 bij 78%; `makelaarsland.nl` score 99 bij 97%. Controleer of scorebereik, dekkingsgraad, onvoldoende bewijs en ontbrekende checks prominenter zijn dan een schijnbaar definitief getal. Geen scoreverhoging op basis van ontbrekende pagina's.

## P1 — Technische bereikbaarheid en testcatalogus

- **DNS:** `tandartspraktijkdenieuwegracht.nl` en `ajloodgieters.nl` hebben `FETCH_DNS` (HTTP 502 vanuit scan-API). Controleer domeinregistratie/spelling, redirects en DNS vanaf testomgeving; vervang ongeldige kandidaten na onafhankelijke verificatie, niet stilzwijgend.
- **Verbinding/browser-render:** `cityspa.nl` heeft `FETCH_CONNECTION`, browser-render geprobeerd en mislukt (`RENDER_NETWORK`). Andere netwerkfouten: `akd.eu`, `bbenbdehofnar.nl`, `cateringgroepnederland.nl`; controleer exacte incidentcodes in originele export.
- **Geblokkeerd:** `thewaxingcompany.nl` heeft `HTTP_BLOCKED` (origin HTTP 402, API 422); ook `trainmore.nl` en `hapjesaanhuis.nl` zijn als geblokkeerd geregistreerd. Niet als classificatiefout tellen en geen blokkades omzeilen.
- **Timeout:** `hoekhoveniers.nl`. Controleer fase, timeoutbudget en attribution in incident; geen oneindige retries.
- **Cataloguskwaliteit:** huidige kandidaten omvatten grote ketens en platformen (o.a. Treatwell, Basic-Fit, De Brauw, NCOI). Als doel echt MKB/zzp is, maak een nieuwe **geverifieerde** catalogusversie; behoud dit oorspronkelijke testbestand als reproduceerbare baseline.

## P1 — Score-/bewijsinconsistenties onderzoeken

- `freshtandartsen.nl`: `evidenceLevel=insufficient`, maar `score=94`, `confidence=95`; expliciete reden: slechts 1 van 14 pagina's beoordeeld.
- `feenstra.com`: `coveragePercent=73`, 19 checks niet bevestigd, `ecommerce` als hoofdsector.
- `vakgarage.nl`: `coveragePercent=77`, 11 checks niet bevestigd; 'Product structured data' als belangrijke ontbrekende controle bij autoservice — controleer **toepasbaarheid**.
- `loetje.nl`: `coveragePercent=78`, 11 checks niet bevestigd; 'Product structured data' als belangrijke controle bij restaurant — controleer toepasbaarheid.
- `brockhoff.nl`: `coveragePercent=66`, 23 checks niet bevestigd, toch score 85.
- `klaassenbv.nl`: `coveragePercent=72`, 21 checks niet bevestigd, hoofdsector unknown.
- `restaurantdekas.com`: hoofdsector unknown, maar score 94 en GEO 100; toon expliciet dat sectorspecifieke checks ontbreken.

## Alle 48 resultaten — auditregister

Kolom **verdict** is de originele TestLab-vergelijking of de technische reden, **geen handmatig vastgesteld oordeel**.

| Groep | Domein | Scanstatus | Herkend sectorKey | Verdict / reden |
| --- | --- | --- | --- | --- |
| `dentist` | `tandartszaandamoost.nl` | `succes` | `dentist` | `exact` |
| `dentist` | `dentalclinics.nl` | `succes` | `dentist` | `exact` |
| `dentist` | `tandartspraktijkdenieuwegracht.nl` | `netwerk_website` | `—` | `FETCH_DNS` |
| `dentist` | `freshtandartsen.nl` | `succes` | `dentist` | `exact` |
| `plumber` | `feenstra.com` | `succes` | `ecommerce` | `mismatch` |
| `plumber` | `rrs.nl` | `succes` | `home_services` | `mismatch` |
| `plumber` | `ajloodgieters.nl` | `netwerk_website` | `—` | `FETCH_DNS` |
| `plumber` | `loodgieter.nl` | `succes` | `home_services` | `mismatch` |
| `garage` | `kwik-fit.nl` | `succes` | `car_repair` | `mismatch` |
| `garage` | `profile.nl` | `succes` | `car_repair` | `mismatch` |
| `garage` | `vakgarage.nl` | `succes` | `car_repair` | `mismatch` |
| `garage` | `boschcarservice.com` | `succes` | `automotive` | `mismatch` |
| `restaurant` | `beren.nl` | `succes` | `restaurant` | `exact` |
| `restaurant` | `loetje.nl` | `succes` | `restaurant` | `exact` |
| `restaurant` | `happyitaly.nl` | `succes` | `restaurant` | `exact` |
| `restaurant` | `restaurantdekas.com` | `succes` | `unknown` | `unconfirmed` |
| `realtor` | `klaassenbv.nl` | `succes` | `unknown` | `unconfirmed` |
| `realtor` | `vanderlinden.nl` | `succes` | `real_estate` | `mismatch` |
| `realtor` | `brockhoff.nl` | `succes` | `real_estate` | `mismatch` |
| `realtor` | `makelaarsland.nl` | `succes` | `real_estate` | `mismatch` |
| `beauty` | `treatwell.nl` | `succes` | `hair_salon` | `exact` |
| `beauty` | `soaptreatmentstore.com` | `succes` | `health_wellness` | `mismatch` |
| `beauty` | `thewaxingcompany.nl` | `site_geblokkeerd` | `—` | `HTTP_BLOCKED` |
| `beauty` | `cityspa.nl` | `netwerk_website` | `—` | `FETCH_CONNECTION` |
| `law` | `debrauw.com` | `succes` | `legal` | `mismatch` |
| `law` | `dirkzwager.nl` | `succes` | `legal` | `mismatch` |
| `law` | `akd.eu` | `netwerk_website` | `—` | `network` |
| `law` | `ploum.nl` | `succes` | `legal` | `mismatch` |
| `gym` | `basic-fit.com` | `succes` | `fitness_sports` | `mismatch` |
| `gym` | `sportcity.nl` | `succes` | `unknown` | `unconfirmed` |
| `gym` | `trainmore.nl` | `site_geblokkeerd` | `—` | `blocked` |
| `gym` | `anytimefitness.nl` | `succes` | `fitness_sports` | `mismatch` |
| `hotel` | `valk.com` | `succes` | `hotel` | `exact` |
| `hotel` | `stayokay.com` | `succes` | `hospitality` | `mismatch` |
| `hotel` | `hotelnewyork.nl` | `succes` | `hotel` | `exact` |
| `hotel` | `bbenbdehofnar.nl` | `netwerk_website` | `—` | `network` |
| `catering` | `hutten.eu` | `succes` | `unknown` | `unconfirmed` |
| `catering` | `vermaatgroep.nl` | `succes` | `unknown` | `unconfirmed` |
| `catering` | `cateringgroepnederland.nl` | `netwerk_website` | `—` | `network` |
| `catering` | `hapjesaanhuis.nl` | `site_geblokkeerd` | `—` | `blocked` |
| `gardener` | `kleinhoveniers.com` | `succes` | `home_services` | `mismatch` |
| `gardener` | `greentogrow.nl` | `succes` | `home_services` | `mismatch` |
| `gardener` | `donkergroep.com` | `succes` | `unknown` | `unconfirmed` |
| `gardener` | `hoekhoveniers.nl` | `timeout` | `—` | `timeout` |
| `training` | `ncoi.nl` | `succes` | `education` | `mismatch` |
| `training` | `loi.nl` | `succes` | `education` | `mismatch` |
| `training` | `nti.nl` | `succes` | `education` | `mismatch` |
| `training` | `vhgbrancheopleiding.nl` | `succes` | `education` | `mismatch` |

## Werkopdracht voor Codex en Claude

1. **Eerst reproduceren** op scancommit `8f9f2e31`, met deze 48 records; inspecteer bron-JSON en de actuele `sectorVerdict`/TestLab-mapping. Houd bestaande 144 als regressiecontrole.
2. Maak per mismatch een handmatige triage: `exact`, `equivalent`, `wrong`, `unconfirmed`, `invalid-ground-truth`; leg websitebewijs en reden vast. **Niet** simpelweg alle `mismatch` naar `equivalent` omzetten.
3. Voeg unit-/integratietests toe voor de expliciete mappings en false positives (Treatwell marketplace; Feenstra service-vs-shop; Restaurant De Kas unknown; vakgarage/Loetje niet-toepasselijke productchecks). Test dat echte webshops correct blijven.
4. Houd netwerk-/blokkade-/timeout-uitkomsten apart van sectorfouten; geen verzonnen HTTP 404 en geen geforceerde browseromzeiling.
5. Test op Windows en Linux, inclusief QA-auth, `catalog=mkb48`, sectorkeuze, startknop, versiecontrole en bewaren/exporteren. **Geen automatische scans** en geen wijziging van `main` zonder aparte goedkeuring.
6. Rapporteer vóór/na per site, inclusief oorspronkelijke verdict, nieuw verdict, evidence, coverage, regression-uitkomsten en exacte commit-SHA. Markeer niet-geteste correcties als onbevestigd.

## Historiek / reikwijdte

Dit document registreert **de nieuwe MKB-48-run** als aanvulling op de bestaande 144-testtrajecten. Het vervangt eerdere QA-rapporten niet en claimt niet dat eerdere 144-runs opnieuw zijn uitgevoerd. Er zijn in deze documentatiecommit **geen enginefixes, scans of merges** uitgevoerd.
