# RankFix — algemene diepdiagnose en Fix Engine (QA, 21 oktober 2026)

**Doel:** één website-invoer gebruiken om controleerbare eerste-partijinformatie te ontdekken en groeperen, zonder uitzonderingen voor specifieke merken, domeinen of sectoren.

## Onderzoeksbevindingen

1. De bestaande scan accepteert een domein, `www.`, `http://` en `https://`. Veilig URL- en redirectgedrag wordt door de scanner afgedwongen. De algemene homepage-herstelroute kan op dezelfde host naar een rijkere taalhomepage gaan.
2. De scan gebruikt al robots.txt, sitemaps, raw HTML, optionele browser-rendering, interne links en maximaal 30 **representatieve** vervolgpagina's. Dit is geen volledige of onbeperkte crawl; de hoofdscores blijven die van de opgegeven pagina, de sitebrede steekproef apart.
3. De linkmotor vormde voor een onopgelost template-href zoals `$parent.collectionPersonalPageUrl` een absolute URL, haalde daarvoor 404 op en presenteerde dat als bewezen kapotte bezoekerslink. Dat bewijst alleen dat een kunstmatig geconstrueerde URL 404 geeft, niet dat de echte gehydrateerde bezoekers-URL faalt. Dit is een **generiek bewijsclassificatieprobleem**.
4. De sectorherkenning gebruikt zelfstandig verklaarde primaire identiteit uit titel, omschrijving, koppen, schema en navigatie en onthoudt bij onzekerheid. Een bedrijfsnaam zonder geverifieerd domein is géén veilig bewijs van een sector.
5. Twee waarschuwingen kunnen één onderliggende oorzaak delen (bijvoorbeeld JSON-LD en organisatie-identiteit). Losse Fix-acties zonder verbandcontrole kunnen dubbele of conflicterende patches opleveren.
6. De bestaande Fix-knoppen zijn door policy, bewezen issue-status, geldige bron, scope en verificatie beschermd. Een diepdiagnose is **advies**, geen bevoegdheid om live te schrijven.

## Implementatie vandaag — merk- en sectoronafhankelijk

- `lib/scan-url-input.ts`: verwijdert onzichtbare plaktekens uitsluitend aan de invoerranden.
- `lib/link-audit-evidence.ts`: scheidt letterlijke URL's van onopgeloste client-templatehrefs. Voor die laatste geen fictieve 404 in het broken-linkbewijs; wel expliciete onzekerheid in rapport/scope.
- `lib/deep-scan-diagnosis.ts`: groepeert waargenomen checks naar mogelijke gedeelde oorzaken; maakt onvolledige steekproeven, onbekende sector, ontbrekend issue-bewijs en Fix-kandidaten zichtbaar.
- `app/api/scan/route.ts`: stuurt de link- en scope-evidence door naar de diagnose, zonder de onderliggende SEO/GEO-score op basis van vermoedens aan te passen.
- `app/dashboard/database-free-qa.tsx`: toont de representatieve dekking en diepdiagnose. Het accountloze testdashboard voert geen live codewijzigingen uit.
- Geautomatiseerde tests behandelen onopgeloste templates, reguliere echte 404-URL's, domeinvarianten, onzichtbare tekens, samengestelde waarschuwingen en Fix-veiligheid.

## Algemene controleketen voor ieder domein

1. **Doel vaststellen:** ontvang echte domeinnaam of volledige URL. Bij alleen een bedrijfsnaam eerst betrouwbaar officieel domein zoeken en door gebruiker laten bevestigen; niet raden.
2. **Veilig ophalen:** normaliseer invoer; HTTPS/redirects/TLS/host/robots/HTTP-status; geen blokkades omzeilen.
3. **Informatie verzamelen:** hoofd- en taalhomepage, titel/meta/H1/zichtbare tekst, JSON-LD, eerste-partij navigatie, robots/sitemap, gerenderde DOM indien nodig; representatieve vervolgpagina's binnen tijd-/netwerkbudget.
4. **Bewijs labelen:** bron, URL, raw versus rendered, responsstatus, oordeel PASS/WARNING/FAIL/UNABLE/NOT_APPLICABLE en onzekerheid. Een ophaalfout, template-expressie of botblokkade is geen bewezen SEO-fout.
5. **Diepe diagnose:** groepeer verwante controles, detecteer onvolledige dekking en verifieer de primaire organisatie-identiteit onafhankelijk van de gebruikte sector.
6. **Fix veilig voorstellen:** identificeer de concrete oorzaak, bestand/route en aantoonbare wijziging; stel een minimale diff voor; controleer risico, compatibiliteit en conflict; laat de eigenaar expliciet goedkeuren.
7. **Verifiëren:** tests + verse scan vergelijken met het oorspronkelijke bewijs; pas na bewezen verbetering kan status 'opgelost' volgen.

## Grenzen en besluitpunten

- Eén domeinnaam is genoeg om **de scan te starten**, niet om privépagina's, beschermde klantdata of automatisch elke URL volledig te kennen.
- Voor een werkelijk **volledige sitecrawl** is een aparte asynchrone taak met pagina-limieten, robots-compliance, voortgang, veilige opslag, deduplicatie en klanttoestemming nodig. Niet verbergen achter een PAGE_SAMPLE-score.
- Reële gebruikerswebsites, RankFix-productie en verbonden GitHub-code worden niet automatisch aangepast.
- Geen merk- of sectorspecifieke heuristiek toevoegen om één test kunstmatig te laten slagen.
- Handmatige tests op openbare sites pas in de afgesproken volgende QA-ronde; eerst geautomatiseerde regressies, build en Fix-safety-tests groen.

## Bronnen voor het ontwerpkader

- Google Search Central: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics — raw HTML en gerenderde DOM hebben elk eigen crawl-evidence.
- Google Search Central: https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors — onderscheid beschikbaarheid, ontdekte links, crawlbeperkingen en werkelijk bezochte pagina's.
