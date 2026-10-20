# RankFix — handmatige besloten QA-scans (20 oktober 2026)

**Doel:** feitelijke input voor latere review door Claude. Geen automatische productiewijzigingen. Noteer per punt: wat de motor meldde, wat onafhankelijk bevestigd is, wat nog onderzocht moet worden. Laat RankFix besloten totdat de kwaliteit is aangetoond.

## Door gebruiker geplakte scanresultaten

| Website | Tijd (NL) | HTTP | Totaal | SEO | GEO | Bewijsdekking | Sector + zekerheid | Aandachtspunten | Niet bevestigd |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|
| https://www.coolblue.nl/ | 13:53:10 | 200 | 99 | 99 | 100 | 85% | Webshop / e-commerce (88%) | 1 | 11 |
| https://www.monumenten.nl/ | 14:26:00 | 200 | 99 | 99 | 100 | 98% | Erfgoed & monumenteninformatie (93%) | 1 | 1 |
| https://info.cern.ch/ | 14:27:55 | 200 | 74 | 83 | 60 | 51% | Niet bevestigd (0%) | 7 | 28 |
| https://www.amsterdam.nl/ | 14:38:18 | 200 | 77 | 81 | 72 | 90% | Overheid & Publieke sector (90%) | 8 | 4 |

Dit zijn momentopnamen van de gebruiker (korte samenvattingen), **geen onafhankelijke benchmarks voor juistheid van de cijfers**.

### Coolblue
- Eén waarschuwing social metadata: `og:image` zou ontbreken.
- Niet bevestigd (11): meertalige SEO; privacy & vertrouwenssignalen; Merchant Center feed-signaal; bedrijfsgegevens; checkout & funnel; EU reviewtransparantie; EU consumenteninformatie; prijs & valuta consistentie; productvariant-URL; productprijs consistentie; checkout- en betaalvertrouwen.
- QA-vraag: bewijs leveren voor hoge score 99/100 en waarmaken van controledekking; ontbrekend `og:image` apart verifiëren.

### Monumenten.nl
- Eén waarschuwing interne redirects: 1/16 gecontroleerde links (6%); `https://www.monumenten.nl/bedrijven` -> `https://www.monumenten.nl/specialistenwijzer`.
- Eén controle niet bevestigd: broken links.
- Sector past bij de site; geen onterechte e-commerce/checkout-waarschuwingen zichtbaar in samenvatting.
- QA-vraag: redirectgedrag extern verifiëren en beoordelen of dit een SEO-waarschuwing of vooral onderhoudsadvies is.

### info.cern.ch
- Geconstateerd: ontbrekende meta description (fail), heading-structuur zonder duidelijke H2 (warning; niet per se rankingfout), ontbrekende canonical (warning), ontbrekende OG title/description/image, geen JSON-LD op homepage (warning; niet per se fout). Daarnaast twee andere aandachtspunten, niet zichtbaar in korte samenvatting.
- 28 niet bevestigd: waaronder viewport, HTML-taal, contentdekking, sitemap, afbeeldingsbronnen, privacy/trust; 22 overige niet in samenvatting.
- Sector niet bevestigd (0%). Dit is **geen bewezen verkeerde classificatie**, maar een bruikbaar testgeval: historische informatieve site over de oorsprong van het web. Onderzoek of sector `technologie / internetgeschiedenis` en doel `historische informatie / educatie` met voldoende bewijs vastgesteld kunnen worden.
- 51% bewijsdekking: scores mogen niet suggereren dat alle controles uitgevoerd zijn.
- Positief: de motor geeft hier 74 in plaats van automatisch 99.

### Amsterdam.nl
- Ingevoerd als vierde handmatige test. Meta description ontbreekt (fail); canonical ontbreekt (warning); indexeerbaarheid `Disallow: /` (warning); robots.txt `Disallow: /` (warning); sitemap `https://www.amsterdam.nl/sitemap.xml` zou HTTP 403 + HTML hebben teruggegeven; plus drie andere aandachtspunten buiten de korte samenvatting.
- 4 niet bevestigd: mobiele viewport, HTML-taal, meertalige SEO, bedrijfsgegevens.
- Sector overheid correct herkend met 90% zekerheid.
- **Belangrijk reproductiepunt:** `https://www.amsterdam.nl/robots.txt` bevat per-user-agent regels en onderaan `User-agent: * / Disallow: /`. De **specifieke `User-agent: GoogleBot` groep** bevat alleen `Disallow: /aspx/` en `Disallow: /*?*appidt=*`; homepage `/` wordt daarin niet geblokkeerd. De waarschuwing dat `Disallow: /` de homepage in het algemeen of voor Google blokkeert is daarom misleidend. Test de robots-parser op specifiekste matching user-agentgroep, per bot, en voorkom dubbele scoreaftrek voor hetzelfde feit onder 'indexeerbaarheid' en 'robots.txt'. Source: https://www.amsterdam.nl/robots.txt (extern geraadpleegd op 20 oktober).
- **Sitemap-waarschuwing niet bewezen als sitefout.** De scanner meldde 403/HTML, terwijl een afzonderlijke tekstweblezer een XML-response als `text/xml` aanduidde maar zelf niet kon parsen. Controleren met gecontroleerde HTTP-aanvragen en user-agentvarianten, en onderscheid maken tussen crawlerblokkade/403 en een werkelijk ongeldige XML-sitemap.
- Opmerking gebruiker: in eerdere tests had een overheidswebsite volgens herinnering een goed resultaat. In de repository komen `rijksoverheid.nl` voor in `tests/fixtures/eu-pilot2/plan.json` en `amsterdam.nl` in `tests/fixtures/eu-independent3/plan.json` met verwachte sector `government`, maar deze fixtureplannen tonen **geen eerdere handmatige scores**. Vergelijk alleen dezelfde domeinen en scanversies wanneer je scoreverschillen beoordeelt.

## Reviewvragen voor Claude (later)
1. Reproduceer Amsterdam robots user-agent selectie voor Googlebot versus wildcard `*`; voeg regressietest en een niet-dubbel-aftrekregel toe waar nodig.
2. Onderzoek waarom sitemap HTTP 403 in scan werd gerapporteerd; registreer status, content-type, user-agent, en zekerheid zonder blokkades als bewezen technische websitefouten te labelen.
3. Controleer bij lage bewijsdekking of no-data/unknown invloed heeft op scores, en maak de onzekerheid zichtbaar.
4. Sectoridentificatie voor kleine/historische informatieve websites verbeteren zonder willekeurige sectoren te verzinnen.
5. Per handmatige testcase echte HTML/headers opnieuw controleren: de screenshots/samenvattingen zijn geen onafhankelijk bewijs van alle SEO-claims.
6. Test verschillende sectoren en websites mét echte fouten; vereist onafhankelijk gevalideerde claims vóór publieke lancering.

## UI voor handmatig testen
In previewbranch `fix/dashboard-login-resilience-20261020` bevat `app/dashboard/database-free-qa.tsx` inmiddels zowel **Kopieer samenvatting** als **Kopieer volledig rapport**, plus Download JSON en Deel auditbestand. Dit rapport omvat uitsluitend de tekst van gedeelde korte samenvattingen; voor volledige diagnostiek moeten originele JSON-audits apart worden aangeleverd.

**Geen wijzigingen aan scanmotor uitgevoerd in deze notitie.**
