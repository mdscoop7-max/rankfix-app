# Feedback en verbeterpunten voor RankFix AI

Algemene verbeterpunten voor de scantool, geldig voor alle websites. Opgesteld naar aanleiding van drie scanrapporten (SEO, GEO, sector) van dezelfde Nuxt-site, gescand op 15 oktober 2026:

- Versie 1: 12:05 (score 95)
- Versie 2: 12:45 (score 95)
- Versie 3: 13:43 (score 85, betrouwbaarheid "beperkt")

## Samenvatting

RankFix is rekenkundig consistent en eerlijk over onzekerheid. Na drie scans zijn de meeste verbeterpunten verwerkt: de onzekerheidsregel, sectordetectie, paginatypering, de weegtabel, toegankelijkheid zonder getal en duidelijke paginatellingen. De belangrijkste oorzaak van de onzekerheid is echter nog niet opgelost:

1. **De tool rendert nog steeds geen JavaScript.** De melding "tijdelijk niet beschikbaar" staat inmiddels bij drie scans achter elkaar.
2. **De score zakt door een dekkingscorrectie die niet als aftrek in de tabel staat**, waardoor dezelfde pagina eerst 95 en daarna 85 krijgt.
3. **Een paar tegenstrijdigheden en kleine fouten** (geslaagde controles, viewport, aantallen, grammatica).

## Statusoverzicht

| # | Punt | Status na derde scan |
|---|------|----------------------|
| 1 | JS-rendering standaard | Niet verwerkt |
| 2 | Onzekerheidsregel | Verwerkt |
| 3 | Sectordetectie | Grotendeels verwerkt |
| 4 | Paginatypering | Grotendeels verwerkt |
| 5 | Transparante scoring | Grotendeels verwerkt (nieuwe knelpunten, zie 14) |
| 6 | Toegankelijkheid op gerenderde DOM | Deels verwerkt (getal weg, geen DOM) |
| 7 | Consistente cijfers en limieten | Grotendeels verwerkt |
| 8 | Steekproef per sjabloon | Deels verwerkt (blogartikelen toegevoegd) |
| 9 | Score alleen over bevestigde controles | Verwerkt |
| 10 | Toegankelijkheid zonder getal bij onzekerheid | Verwerkt |
| 11 | Geslaagde controles niet te rooskleurig | Niet verwerkt |
| 12 | Duidelijke aantallen | Grotendeels verwerkt (nog afwijkingen, zie 18) |
| 13 | Taalfout enkelvoud/meervoud | Niet verwerkt |
| 14 | Dekkingscorrectie zichtbaar maken | Nieuw |
| 15 | Stabiele score bij wisselende dekking | Nieuw |
| 16 | Tegenstrijdige viewport-meldingen | Nieuw |
| 17 | Hoofdactie bij beperkte scan | Nieuw |
| 18 | Aantallen consistent met reden | Nieuw |
| 19 | Misleidende melding "tijdelijk niet beschikbaar" | Nieuw |

## 1. Renderen als standaard, niet als uitzondering

**Status: niet verwerkt.** Ook de derde scan gebruikte alleen raw HTML. Structured data, privacy-signalen, bedrijfsgegevens, social metadata en 19 webshopcontroles blijven "niet te bevestigen". De GEO-score is hierdoor gedaald naar 79.

**Verbetering:**
- Detecteer JS-frameworks (Nuxt, Next, React, Angular, Vue, enzovoort) en render dan altijd met een headless browser (bijvoorbeeld Playwright/Chromium), met timeout en retry.
- Vergelijk raw HTML met de gerenderde DOM. Alleen wat in beide ontbreekt, is een bewezen probleem.
- Mislukt het renderen na een retry, verlaag dan de betrouwbaarheid en markeer elke afhankelijke controle als *Niet te bevestigen*.

## 2. Eén onzekerheidsregel voor alle controles

**Status: verwerkt.** Een ontbrekende canonical, title of description op JS-pagina's wordt niet meer als ontbrekend beoordeeld. Pagina's zonder volledig bewijs krijgen "score niet te bevestigen" in plaats van 100/100 (bijvoorbeeld `/winkel` en de iPhone-pagina).

## 3. Sectordetectie op meerdere signalen

**Status: grotendeels verwerkt.** Webshopfunctionaliteit is nu "niet te bevestigen" in plaats van "niet aanwezig". Er worden 51 controles uitgevoerd (eerst 30) en nog maar 7 zijn n.v.t. (eerst 26). Nieuwe modules zijn onder meer abonnementsprijzen en conversie.

**Wat nog ontbreekt:** veel van die extra controles eindigen als "niet te bevestigen" doordat er niet gerenderd wordt. Het blijft afhankelijk van punt 1.

## 4. Paginatypering op patronen

**Status: grotendeels verwerkt.** De iPhone-pagina is nu "product", blogs zijn "article" en de internetpagina's "service". Een paar pagina's staan nog als "other" (bijvoorbeeld mobiel-shop, gaming, smarthome en televisie).

**Verbetering:**
- Gebruik URL-structuur, schema.org-types, breadcrumbs en paginasjabloon om homepage, categorie, product, artikel, dienst, contact en juridisch te herkennen.
- Houd "other" voor zeldzame gevallen.

## 5. Transparante en eerlijke scoring

**Status: grotendeels verwerkt.** Er is een weegtabel met per controle maximum, behaald en aftrek. Titellengte kost geen punten meer en de tool meldt dat pixelbreedte niet kon worden gemeten.

**Wat nog ontbreekt:** zie punt 14 en 15. De tabel verklaart de daling van 10 punten niet.

## 6. Toegankelijkheid alleen op de gerenderde DOM

**Status: deels verwerkt.** De kop toont "Indicatief (raw HTML)" en geen getal meer. Een echte beoordeling vereist nog steeds de gerenderde DOM (bij voorkeur met axe-core).

## 7. Consistente cijfers en limieten

**Status: grotendeels verwerkt.** De pagina `/shop/mobiele-accessoires` wordt nu gedeeltelijk geparsed (head + eerste inhoud) in plaats van afgekeurd. De kop noemt geselecteerd, uitgesloten en niet-gescoord. Zie punt 18 voor de resterende afwijkingen.

## 8. Steekproef per sjabloon

**Status: deels verwerkt.** Er zijn blogartikelen toegevoegd (27 geselecteerde pagina's). Het is niet zichtbaar of de selectie per sjabloon gebeurt.

- Toon per paginatype hoeveel pagina's zijn geselecteerd en waarom.

## 9. Score alleen over bevestigde controles

**Status: verwerkt.** Vijf pagina's met onvoldoende metadata-bewijs zijn niet meegewogen en de steekproefscore zegt dat expliciet.

## 10. Toegankelijkheid: geen getal bij onzekerheid

**Status: verwerkt.** Zie punt 6.

## 11. Geslaagde controles niet te rooskleurig

**Status: niet verwerkt.** "Canonical URL" en "Meta title" staan nog in het overzicht met geslaagde controles, terwijl op 5 pagina's de canonical of title niet beoordeeld kon worden.

**Verbetering:**
- Splits in "bevestigd op N pagina's" en "niet te bevestigen op M pagina's".
- Laat een controle pas als volledig geslaagd gelden als alle meegenomen pagina's bevestigd zijn.

## 12. Duidelijke aantallen

**Status: grotendeels verwerkt.** Zie punt 18.

## 13. Taalfout

**Status: niet verwerkt.** De tekst "vragen 1 pagina's" staat er nog.

- Gebruik enkelvoud en meervoud correct ("1 pagina vraagt aandacht", "3 pagina's vragen aandacht").

## 14. Dekkingscorrectie zichtbaar maken (nieuw)

**Probleem:** de totaalscore daalde van 95 naar 85 (SEO 89, GEO 79), maar in de weegtabel staat nergens een aftrek. De daling komt uit een begrenzing door beperkte bewijsdekking (84% naar 62%), die alleen in de uitleg staat. Dat spreekt de zin "niet te bevestigen verlaagt de score niet" tegen.

**Verbetering:**
- Toon de dekkingscorrectie als aparte regel in de weegtabel ("Begrenzing door beperkte dekking: −X").
- Of toon een bereik, bijvoorbeeld "85 tot 100 (voorlopig)", in plaats van één getal.
- Pas de uitleg in de kop aan, zodat die niet beweert dat niet-bevestigde controles de score nooit raken.

## 15. Stabiele score bij wisselende dekking (nieuw)

**Probleem:** dezelfde pagina kreeg eerst 95 en daarna 85, alleen doordat er meer controles werden uitgevoerd die niet te bevestigen waren. De waarschuwing "niet vergelijkbaar" is er wel, maar de sprong schaadt het vertrouwen.

**Verbetering:**
- Bereken de score over een vaste kernset en toon aanvullende controles apart.
- Toon in de vergelijking met de vorige scan de dekking naast het scoreverschil, zodat duidelijk is dat de daling methodisch is.

## 16. Tegenstrijdige viewport-meldingen (nieuw)

**Probleem:** "Mobiele viewport" staat als geslaagd, terwijl "Browserzoom" meldt dat er geen viewport meta tag is gevonden.

**Verbetering:**
- Gebruik één bron van waarheid voor de viewport-detectie. Is de tag niet gevonden in raw HTML, dan moeten beide controles "niet te bevestigen" zijn (of beide geslaagd op basis van dezelfde bevinding).

## 17. Hoofdactie bij beperkte scan (nieuw)

**Probleem:** het rapport toont "Verbeterpunten (0)" en "Geen items", terwijl eerder og:image werd gemeld. Social metadata is nu "niet te bevestigen". Voor de gebruiker is de belangrijkste actie niet zichtbaar.

**Verbetering:**
- Toon bij een beperkte scan als eerste aanbevolen actie: "Browser-rendering niet beschikbaar: scan opnieuw of koppel rendering voor volledige resultaten."
- Toon bij 0 verbeterpunten liever "Geen bewezen problemen; 23 controles niet te bevestigen".

## 18. Aantallen consistent met reden (nieuw)

**Probleem:** het rapport noemt 26/27 gecontroleerde pagina's, 25 gecontroleerde pagina's (bij de meta description-melding) en 21 controleerbare pagina's (steekproefscore), zonder uitleg waarom die aantallen verschillen.

**Verbetering:**
- Gebruik één vaste indeling: geselecteerd (27), opgehaald (27), gescoord (21), niet meegewogen met reden (5 metadata onvolledig, 1 noindex).
- Gebruik overal dezelfde noemer.

## 19. Misleidende melding "tijdelijk niet beschikbaar" (nieuw)

**Probleem:** de melding "browser-rendering was tijdens deze scan tijdelijk niet beschikbaar" staat bij drie scans achter elkaar. Dat is niet tijdelijk.

**Verbetering:**
- Toon de echte oorzaak (timeout, geblokkeerd, niet ondersteund) en het aantal pogingen.
- Pas de formulering aan als de rendering herhaaldelijk mislukt voor dezelfde site.

## Prioriteit

| Prio | Punt | Effect |
|------|------|--------|
| 1 | JS-rendering standaard (1) | Lost de meeste niet-bevestigde controles op en herstelt GEO |
| 2 | Dekkingscorrectie zichtbaar (14) en stabiele score (15) | Geen onverklaarde scoresprongen |
| 3 | Geslaagde controles splitsen (11) | Onzekerheid blijft zichtbaar |
| 4 | Hoofdactie bij beperkte scan (17) en echte oorzaak (19) | Gebruiker weet wat te doen |
| 5 | Viewport-tegenstrijdigheid (16) | Betrouwbaardere technische controles |
| 6 | Aantallen consistent (18) | Minder verwarring |
| 7 | Paginatypering afronden (4) | Minder "other" |
| 8 | Taal (13) en sjabloonoverzicht (8) | Afwerking |

## Testplan

### A. Referentiesites

Scan een vaste set sites en controleer of de uitkomst klopt:

| Type | Doel |
|------|------|
| Statische HTML-site | Basisgedrag, geen JS nodig |
| WordPress-site | CMS-detectie, canonical/schema via plugin |
| Shopify- of WooCommerce-shop | Webshopdetectie, productschema, prijzen |
| Nuxt/Next-site met SSR | Vergelijking raw vs. gerenderd |
| Client-side React/Vue-site (CSR) | Alles pas na JS zichtbaar |
| Dienstverlener met abonnementen | Commerce zonder fysieke retail |
| Zeer grote pagina (>2 MB) | Gedeeltelijk parsen van `<head>` |

### B. Testgevallen

1. **Canonical via JS:** pagina met canonical alleen na rendering. Verwacht: gedetecteerd in de gerenderde DOM, geen aandachtspunt.
2. **Title via JS:** pagina zonder title in raw HTML. Verwacht: eerst renderen, dan pas scoren.
3. **Render mislukt:** forceer een timeout. Verwacht: lagere betrouwbaarheid, echte oorzaak getoond, afhankelijke controles "niet te bevestigen".
4. **Render mislukt bij herhaalde scans:** Verwacht: geen formulering als "tijdelijk".
5. **Abonnementssite:** geen fysieke producten, wel prijzen en bestelflow. Verwacht: commerce-kernset wordt uitgevoerd.
6. **Productpagina:** URL `/shop/<categorie>/<product>`. Verwacht: type "product".
7. **Lange title:** 66 tekens maar smal in pixels. Verwacht: geen of lichte aftrek.
8. **Toegankelijkheid:** knoppen die pas na hydratatie een label krijgen. Verwacht: geen fout-positief en geen getal in de kop.
9. **Paginatellingen:** geselecteerd, opgehaald, gescoord en uitgesloten sluiten op elkaar aan, met reden.
10. **Onbevestigde canonical:** Verwacht: score met label "niet bevestigd", niet automatisch 100/100.
11. **Geslaagde controles:** controle die op een deel van de pagina's niet bevestigd is. Verwacht: niet als volledig geslaagd getoond.
12. **Dekkingsdaling:** dezelfde site met 84% en daarna 62% dekking. Verwacht: scoreverschil als aparte regel in de weegtabel verklaard, of bereik getoond.
13. **Viewport:** pagina zonder viewport meta tag in raw HTML. Verwacht: "Mobiele viewport" en "Browserzoom" geven dezelfde uitkomst.
14. **0 verbeterpunten bij beperkte scan:** Verwacht: hoofdactie "scan opnieuw met rendering" zichtbaar.
15. **Taal:** rapporten met 0, 1 en meerdere pagina's. Verwacht: correct enkelvoud en meervoud.

### C. Slagingscriteria

- Geen fout-positieven op de referentiesites bij JS-afhankelijke signalen.
- Geen scores van 100/100 of "geslaagd" zonder bevestigd bewijs.
- Elke scoredaling is terug te vinden in de weegtabel of als bereik.
- Sectordetectie komt op alle referentiesites overeen met de verwachte uitkomst.
- Cijfers in kop en detail komen altijd overeen.
- Meldingen over rendering noemen de werkelijke oorzaak.

### D. Regressie

Draai de referentiesets bij elke wijziging in het scoremodel en vergelijk de scores met de vorige versie. Afwijkingen groter dan 3 punten krijgen een toelichting met de dekking erbij.
