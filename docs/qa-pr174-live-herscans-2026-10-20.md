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

## Volgende beoogde hertests
1. UMC Utrecht (Hospital-sector/schema-advies)
2. Universiteit van Amsterdam (CollegeOrUniversity/Organization)
3. Coolblue (Open Graph-image)
4. Overige relevante benchmarks: KPN, CERN en evt. Monumenten.nl

Rapporteer bij elke test zowel resultaten als beperkingen, en merge draft-PR #174 niet zonder onafhankelijke kwaliteitscontrole.
