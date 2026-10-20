# PR #174 live hertests — 20 oktober 2026

QA-preview: https://rankfix-k486asi2e-scoop5.vercel.app/dashboard
Branch: qa/pr174-dbfree-live-20261020 (databasevrij; PR #174 engine plus afzonderlijke QA-vrijschakeling). Geen merge naar main of wijziging aan productie.

## Amsterdam.nl — 20:33:38 Nederlandse tijd
Korte gebruikerssamenvatting, volledig JSON-rapport nog niet ontvangen.

| Maatstaf | Eerdere scan | Nieuwe QA-preview |
|---|---:|---:|
| Totaal | 77 | 82 |
| SEO | 81 | 88 |
| GEO | 72 | 72 |
| Bewijsdekking | 90% | 88% |
| Aandachtspunten | 8 | 5 |
| Onbevestigd | 4 | 5 |

HTTP 200. Sector Overheid & Publieke sector (90%) ongewijzigd.
- Eerdere robots.txt-Disallow:/ waarschuwing en dubbele indexeerbaarheidswaarschuwing komen in nieuwe korte samenvatting niet meer voor. Dit is gunstig, maar controleer in volledig JSON of robots en indexeerbaarheid PASS zijn, niet alleen verborgen/onbevestigd.
- Sitemap-signaal: eerder waarschuwing bij 403/HTML; nu ONBEVESTIGD, niet langer bewezen sitefout. Dit past bij de fix, maar HTTP-status/content-type en user-agent zijn niet beschikbaar uit de korte tekst.
- Nieuwe aandachtspunten: meta description ontbreekt (fail), canonical ontbreekt (warning), structured data (warning), Organization + WebSite (warning), expliciete paginasamenvatting (warning). Niet onafhankelijk bevestigd; controleer of oorzaken dubbel gescoord worden (description + summary, JSON-LD + identity).
- Onbevestigd: mobiele viewport, HTML-taal, sitemap, meertalige SEO, bedrijfsgegevens.
- Conclusie: eerste live hertest geeft aanwijzingen dat robots- en sitemapfixes werken, maar bewijsdekking daalt twee punten; geen definitieve engine-goedkeuring zonder JSON en meer live voorbeelden.

## UMC Utrecht — 20:37:46 Nederlandse tijd
Door gebruiker aangeleverde korte QA-samenvatting, geen volledig JSON. Homepage `https://www.umcutrecht.nl/nl` HTTP 200. Sector Zorg & Gezondheid · universitair medisch centrum (92%), identiek aan eerdere scan.

| Maatstaf | Eerdere scan | Nieuwe QA-preview |
|---|---:|---:|
| Totaal | 91 | 91 |
| SEO | 99 | 99 |
| GEO | 80 | 80 |
| Bewijsdekking | 94% | 97% |
| Aandachtspunten | 3 | 3 |
| Onbevestigd | 2 | 1 |

- **Verbetering:** geen generiek `LocalBusiness`-advies in de korte uitvoer; waarschuwing spreekt over de `ziekenhuis-homepage`. Dit bewijst nog niet dat de uitvoer in JSON ook expliciet `Hospital` adviseert; dat vereist controle van het uitgebreide resultaat.
- **Verbetering:** Google Ads readiness valt weg uit onbevestigde controles, passend bij het verwijderen van de irrelevante GTM-only detectie voor een ziekenhuis. Alleen bedrijfsgegevens blijven onbevestigd.
- **Open:** OG-image `og:image` ontbreekt volgens scanner, ondanks nieuwe OG-extractieregels. Indien de bronsite daadwerkelijk geen bruikbare afbeelding heeft, is de blijvende waarschuwing terecht; controleer eerst rauwe HTML inclusief `og:image:secure_url`.
- **Open:** zowel Structured data als Organization + WebSite waarschuwen dat er geen valide JSON-LD/identity is bevestigd. Eerdere korte/leesbare scan meldde ook 'geen valide JSON-LD'. Dit kan een reëel SEO-advies zijn, maar toets gedeelde grondoorzaak/afwijkende scoring en eventueel alternatieve schema-microdata afzonderlijk.
- **Conclusie:** 3 procentpunt méér bewijs en één onbekende minder, maar geen score- of GEO-verbetering. De sectorbewuste advisering lijkt verbeterd; geen volledige acceptatie van PR #174 zonder originele JSON, raw HTML/headers, bewijs voor de juiste `Hospital`-aanbeveling en regressiecontrole.

## Volgende beoogde hertests
1. Universiteit van Amsterdam (CollegeOrUniversity/Organization)
2. Coolblue (Open Graph-image)
3. Overige relevante benchmarks: KPN, CERN en evt. Monumenten.nl

Rapporteer bij elke test zowel resultaten als beperkingen, en merge draft-PR #174 niet zonder onafhankelijke kwaliteitscontrole.
