# RankFix — handmatige besloten QA-scans (20 oktober 2026)

**Doel:** feitelijke input voor latere review door Claude. Geen automatische productiewijzigingen. Noteer per punt: wat de motor meldde, wat onafhankelijk bevestigd is, wat nog onderzocht moet worden. Laat RankFix besloten totdat de kwaliteit is aangetoond.

## Door gebruiker geplakte scanresultaten

| Website | Tijd (NL) | HTTP | Totaal | SEO | GEO | Bewijsdekking | Sector + zekerheid | Aandachtspunten | Niet bevestigd |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|
| https://www.coolblue.nl/ | 13:53:10 | 200 | 99 | 99 | 100 | 85% | Webshop / e-commerce (88%) | 1 | 11 |
| https://www.monumenten.nl/ | 14:26:00 | 200 | 99 | 99 | 100 | 98% | Erfgoed & monumenteninformatie (93%) | 1 | 1 |
| https://info.cern.ch/ | 14:27:55 | 200 | 74 | 83 | 60 | 51% | Niet bevestigd (0%) | 7 | 28 |
| https://www.amsterdam.nl/ | 14:38:18 | 200 | 77 | 81 | 72 | 90% | Overheid & Publieke sector (90%) | 8 | 4 |
| https://www.kpn.com/ | 14:44:14 (12:44:14 UTC) | niet vermeld | **68–100 voorlopig** | 99 | 99 | **68%** | Telecom & Technologie (96%) | 0 | 12 |
| https://www.umcutrecht.nl/nl | 14:46:48 (12:46:48 UTC) | niet vermeld | **91** | 99 | 80 | **94%** | Zorg & Gezondheid · universitair medisch centrum (92%) | 3 | 2 |
| https://www.uva.nl/ | 14:49:55 (12:49:55 UTC) | niet vermeld | **91 voorlopig** | 95 | 85 | **88%** | Onderwijs & Opleiding (93%) | 3 | 5 |

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

### KPN.com
- De gebruiker deelde een **leesbaar auditrapport** van een echte scan op 20-10-2026 12:44:14 UTC. Website `https://www.kpn.com/`. Steekproef 15 van 16 pagina's.
- Resultaat: **eindscore 68–100 (voorlopig interval)**, SEO 99, GEO 99, Security 93; bewijsdekking slechts 68%. 27 geslaagde controles, 0 bewezen fouten of waarschuwingen, 12 onbevestigd. De eindscore mag niet als definitief 99 of 100 worden weergegeven.
- Sector: `Telecom & Technologie` met 96% zekerheid (plausibele classificatie; confidence niet onafhankelijk gevalideerd).
- **Renderingbeperking:** JavaScript-pagina niet volledig gerenderd; browser-rendering leverde minder inhoud dan raw HTML. Onderzoek eerst de browser/HTML-discrepantie, botbeveiliging, time-outs, hydration en errors.
- **12 onbevestigd:** Social metadata; Privacy & vertrouwenssignalen; Merchant Center productbasis; Bedrijfsgegevens; Prijs & valuta consistentie; Productvariant-URL; Productprijs consistentie; Productvoorraad; Structured data; Organization + WebSite; AI Product Copy & Metadata; Product structured data. Onbevestigd is geen bewezen fout.
- **27 gerapporteerd als geslaagd:** Broken links; Interne redirects; Verkeerde linkbestemming; Meta title; Meta description; H1-heading; Heading-structuur; Canonical URL; Mobiele viewport; HTML-taal; Indexeerbaarheid; Afbeelding alt-teksten; Contentdekking; HTTPS; HTTP-status; Server response; robots.txt; Sitemap-signaal; URL-structuur; Tekstweergave; Afbeeldingsbronnen; Prijsnotatie; Abonnement & prijs; Entity-signalen; Trust & context; Expliciete paginasamenvatting; Brand identity.
- **Niet van toepassing verklaard:** Twitter Card; Meertalige SEO; Commerciële voorwaarden; Merchant Center feed-signaal; Consent Mode signaal; Checkout & funnel; Checkout informatie; EU korting & referentieprijs; EU reviewtransparantie; EU schaarsteclaim; EU consumenteninformatie; Webshop vertrouwen; Webshop-beloftes; Checkout- en betaalvertrouwen; Google Ads readiness; Breadcrumbs; Vraag & antwoord content; Expertise-signalen.
- **Review:** controleer of 'niet van toepassing' voor retail/checkout voldoende onderbouwd is gezien productsignalen; check geslaagde controles bij onvolledige rendering; houd onzekerheid zichtbaar; herhaal scan indien nodig. Bijzonder: 0 waarschuwingen bij 68% dekking mag niet aanvoelen als voltooide audit.
- Bron: door gebruiker geplakte RankFix-audittekst, niet onafhankelijk geverifieerd. Originele JSON ontbreekt.

### UMC Utrecht (ziekenhuis)
- Gebruiker deelde een **leesbaar auditrapport** met scanmoment 20-10-2026 12:46:48 UTC voor `https://www.umcutrecht.nl/`, uiteindelijk gescand als `https://www.umcutrecht.nl/nl`; steekproef 15 van 16 pagina's.
- Totaal 91/100, SEO 99, GEO 80, Security 84, bewijsdekking 94%. 31 controles geslaagd, 3 waarschuwingen, 2 onbevestigd. HTTP-status niet expliciet in dit rapport vermeld.
- Herkende sector: **Zorg & Gezondheid · universitair medisch centrum (92%)**. Dit is passend bij de site, die zichzelf omschrijft als universitair ziekenhuis met zorg, onderzoek en onderwijs.
- **3 waarschuwingen**: social metadata mist naar zeggen `og:image`; geen valide JSON-LD op de pagina (voorgesteld: `LocalBusiness`); geen bevestigd `Organization` of `WebSite` schema op de homepage. Alle drie onafhankelijk te verifiëren via HTML/rendered DOM vóór conclusies of scoreaftrek. Dubbele aftrek tussen algemene structured data en Organization/WebSite nagaan.
- **Schema-type advies is te generiek**: dit is geen gewone lokale bedrijfs-/dienstpagina, maar een universitair ziekenhuis. `Hospital` is een specifieker schema.org-type, onder zowel `MedicalOrganization` als `LocalBusiness`; beoordeel `Hospital` met passende `Organization` / `WebSite` en uitsluitend feitelijk bevestigde properties. `LocalBusiness` is niet fundamenteel ongeldig, maar wel een onvoldoende specifiek standaardadvies (bron: https://schema.org/Hospital).
- **2 onbevestigd**: bedrijfsgegevens (niet op deze pagina aangetroffen ≠ niet op andere pagina's); Google Ads readiness (GTM 1, Ads ID 0, GA4 0, events 0, conversion labels 0, consent-signaal gevonden). Niet interpreteren als bewezen technische of medische kwaliteitsfout. Bovendien is betaalde advertenties gereedheid niet noodzakelijk voor zorgpagina's.
- **31 geslaagd gemeld**: Behandelingen & diensten; Afspraak maken; Team & expertise; Broken links; Interne redirects; Verkeerde linkbestemming; Meta title; Meta description; H1-heading; Heading-structuur; Canonical URL; Mobiele viewport; HTML-taal; Indexeerbaarheid; Afbeelding alt-teksten; Contentdekking; HTTPS; HTTP-status; Server response; robots.txt; Sitemap-signaal; Meertalige SEO; URL-structuur; Tekstweergave; Afbeeldingsbronnen; Privacy & vertrouwenssignalen; Consent Mode signaal; Entity-signalen; Trust & context; Expliciete paginasamenvatting; Brand identity.
- **Niet van toepassing gemeld**: Twitter Card; Commerciële voorwaarden; Merchant Center productbasis; Merchant Center feed-signaal; Prijsnotatie; Checkout & funnel; Checkout informatie; EU korting & referentieprijs; EU reviewtransparantie; EU schaarsteclaim; EU consumenteninformatie; Prijs & valuta consistentie; Webshop vertrouwen; Productvariant-URL; Productprijs consistentie; Productvoorraad; Webshop-beloftes; Checkout- en betaalvertrouwen; AI Product Copy & Metadata; Product structured data; Breadcrumbs; Vraag & antwoord content; Expertise-signalen.
- **Controlepunt scoremodel**: Security 84 terwijl er in dit leesbare rapport geen specifieke securitywaarschuwingen staan. Onderzoek welke feiten of factoren tot 84 leiden, en maak scores herleidbaar.
- Gebruik als test voor zorgspecifieke checks, betrouwbare structured data-aanbevelingen en onderscheid tussen algemene sites, lokaal ziekenhuis en universitair medisch centrum. Geen automatisch advies genereren dat meer medische claims doet dan bron bewijst.
- Bron voor auditcijfers is het door de gebruiker geplakte rapport; geen volledige JSON aanwezig, dus metadata/schema-uitkomsten niet onafhankelijk bevestigd.

### Universiteit van Amsterdam (UvA)
- Gebruiker deelde een RankFix-auditrapport van `www.uva.nl`, 20 oktober 2026 om 12:49:55 UTC, steekproef 14/16 pagina's.
- Eindscore 91/100 **voorlopig** (bewijsdekking 88%); SEO 95, GEO 85, Security 84; sector Onderwijs & Opleiding (93%); 3 waarschuwingen, 5 onbevestigd, 26 geslaagd.
- Waarschuwingen: (1) Meta description 26 tekens volgens scanner, waarschuwing voor mogelijke ontbrekende context. (2) Eén geldige JSON-LD-block gevonden, maar geen `LocalBusiness`-schema. Dit lijkt een onjuist schema-advies voor een universiteit: onderzoek `CollegeOrUniversity` / `EducationalOrganization` in plaats van generiek `LocalBusiness`. (3) Geen bevestigd `Organization` of `WebSite`-schema. Bepaal wat in de reeds gevonden JSON-LD-block staat, ook wanneer `@graph` wordt gebruikt.
- Vijf onbevestigd: sitemap-signaal (standaardlocaties niet bevestigd, `/sitemap-index.xml` 404 volgens scan); meertalige SEO (equivalente taal-URL's niet bewezen); Consent Mode signaal (runtime niet aangetoond); bedrijfsgegevens (mogelijk op andere pagina); Google Ads readiness (1 GTM; 0 Ads, GA4, event-ID's; consent niet bewezen). Niet presenteren als fouten.
- Geslaagd (26): broken links, interne redirects, verkeerde linkbestemming, meta title, H1, heading-structuur, canonical, viewport, HTML-taal, indexeerbaarheid, afbeelding alt, contentdekking, HTTPS, HTTP-status, serverresponse, social metadata, robots.txt, Twitter Card, URL-structuur, tekstweergave, afbeeldingsbronnen, privacy/trust, entity-signalen, trust/context, expliciete paginasamenvatting, brand identity.
- Niet van toepassing: commerciële voorwaarden, Merchant Center productbasis/feed, prijsnotatie, checkout/funnel/informatie, EU-korting/review/schaarste/consumenteninfo, prijs/valuta, webshop vertrouwen/beloftes, productvarianten/prijs/voorraad/schema, checkout/betaalvertrouwen, AI Product Copy, breadcrumbs, vraag/antwoord, expertise-signalen.
- Vergelijk met UMC Utrecht: beide krijgen een generiek `LocalBusiness`-advies en Security 84 zonder zichtbare securitydetails in deze samenvattingen. Onderzoek scoreherleidbaarheid, het sectorspecifieke schemabeleid en mogelijke dubbele waarschuwingen. Dit is **een hypothese, geen bewezen bug**.
- Bron: door gebruiker geplakte audittekst; originele technische JSON/HTML nog niet onafhankelijk onderzocht.

## Reviewvragen voor Claude (later)
1. Reproduceer Amsterdam robots user-agent selectie voor Googlebot versus wildcard `*`; voeg regressietest en een niet-dubbel-aftrekregel toe waar nodig.
2. Onderzoek waarom sitemap HTTP 403 in scan werd gerapporteerd; registreer status, content-type, user-agent, en zekerheid zonder blokkades als bewezen technische websitefouten te labelen.
3. Controleer bij lage bewijsdekking of no-data/unknown invloed heeft op scores, en maak de onzekerheid zichtbaar.
4. Sectoridentificatie voor kleine/historische informatieve websites verbeteren zonder willekeurige sectoren te verzinnen.
5. Per handmatige testcase echte HTML/headers opnieuw controleren: de screenshots/samenvattingen zijn geen onafhankelijk bewijs van alle SEO-claims.
6. Test verschillende sectoren en websites mét echte fouten; vereist onafhankelijk gevalideerde claims vóór publieke lancering.
7. KPN: verklaar renderingverlies, voorlopige scoreband 68–100 en hoge deelcijfers 99/99 bij 68% bewijs; valideer niet-van-toepassing-classificaties.
8. UMC Utrecht: test `Hospital` / `MedicalOrganization` schema-advies versus generiek `LocalBusiness`, voorkom overlappende scoreaftrek, verklaar Security 84 en controleer de drie waarschuwingen onafhankelijk.

9. UvA: verifieer sectorafhankelijke JSON-LD-types, dat de al aanwezige JSON-LD correct gelezen wordt, en de Security 84-score.

## UI voor handmatig testen
In previewbranch `fix/dashboard-login-resilience-20261020` bevat `app/dashboard/database-free-qa.tsx` inmiddels zowel **Kopieer samenvatting** als **Kopieer volledig rapport**, plus Download JSON en Deel auditbestand. Dit rapport omvat uitsluitend de tekst van gedeelde korte samenvattingen; voor volledige diagnostiek moeten originele JSON-audits apart worden aangeleverd.

**Geen wijzigingen aan scanmotor uitgevoerd in deze notitie.**
