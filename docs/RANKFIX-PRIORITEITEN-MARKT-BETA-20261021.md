# RankFix · prioriteiten en marktpositionering — 21 oktober 2026

**Status: QA planning, geen productiebesluit.** Bron: evaluatie en concurrentieverkenning van de eigenaar (kwaliteit: **7/10** en commerciële kans: indicatief **5/10** nu / **7/10** na verbeteringen). Dit zijn subjectieve inschattingen, **geen bewezen kwaliteits- of marktmetingen**. Externe prijzen/namen (Otterly, Profound, Semrush, Ahrefs, Screaming Frog, Rudys.AI) zijn momentopnames en moeten voor een prijs-/lanceringsbesluit direct bij aanbieders worden geverifieerd.

## Scherpe positionering

**RankFix: bewijsgerichte SEO/GEO-gereedheidsaudit met sectorspecifieke en Europese e-commerce-aandachtspunten, begrijpelijk voor MKB en bureaus in Nederland, België en Duitsland.**

- Zeg **GEO-gereedheid**, niet dat RankFix al een merkvermelding in AI-antwoorden meet of garandeert. Prompt-monitoring, backlinkindex en keyword-dataproducten zijn andere marktsegmenten; geen pretentie dat dit Semrush/Ahrefs vervangt.
- Maak het verschil zichtbaar: gevonden bewijs, bron-URL, toepasbaarheidsreden, `unable_to_confirm`, sectorspecifieke controles, scoreuitleg en omkeerbare correctievoorstellen.
- EU/Omnibus wordt als technische **signaalcontrole** gepresenteerd, nooit als juridische conformiteitsgarantie.
- Bestaande prijsplannen (`lib/plans.ts`: Free, Start, Business, E-commerce, Pro, Agency) voorlopig **niet veranderen**. Eerst vraag en economische kosten meten; ook hero-claims en 24/7-monitoring moeten aan werkelijke capabilities worden getoetst.

## Prioriteiten op volgorde — vanaf nu

### P0: scanner waarheidsgetrouw en operationeel (blokkerend voor beta)

1. **Foute bewezen waarschuwingen oplossen.** Werk uit PR #180: order-onafhankelijke headparser (Vesteda: title, description, canonical, viewport, `lang`), privacy/footerwoorden (incl. Duits), officieel gelinkte sociale profielen, juridische/contactpagina's als bewijs. Bewaar raw HTML-snapshot, redirectketen en bewijs-URL's. Bij onvoldoende bewijs altijd `unable_to_confirm` in plaats van false positive.
2. **Auditberekening herleidbaar maken.** GEO 74 Bosch inclusief kernset, uitsluitingen, gewichten, normalisatie en scorecaps zichtbaar; exacte oorzaak van scoreaanpassing. Geen fictieve nauwkeurigheid of vertrouwen uit 99/100 bij niet-opgehaalde pagina's.
3. **Stabiele scaninfrastructuur.** Preview `DATABASE_URL` correct scoped; Neon-quota/HTTP 402/53000 blokkade oplossen zonder productiedata te migreren of kosten zonder toestemming. Toon duidelijke technische fout i.p.v. misleidend auditrapport. Echte end-to-end POST, opslag en herladen testen.
4. **Veilige wijzigingsworkflow.** Geen auto-merge, auto-deploy of directe klantwijziging; alleen concrete bewezen issues, draft PR, menselijke review, rollback en na-test. De bestaande main-fix-engine mag niet onvoorwaardelijk auto-merge blijven wanneer dit klantwebsites raakt.

**P0 acceptatie:** geen bekende foutief bewezen Vesteda-finding; Bosch footer/social/legal evidence correct op exacte opgehaalde HTML; SEO/GEO-score per rij te reconstrueren; succesvolle herhaalde end-to-end scan; nul ongeautoriseerde klantdeployments.

### P1: sectorspecifiek bewijs (voordeel t.o.v. generieke gratis tools)

5. **Twee niveaus en echte subtype-logica**: hoofdsector, subtype, paginatype en nevenactiviteiten apart. Vesteda verhuurder/belegger (geen makelaar); Bosch industrieel concern (corporate = paginatype); Booking platform (geen hotel); UMC zorg primair, onderwijs secundair. Auditmodules en passende schema-aanbevelingen volgen bewezen subtype.
6. **Meertalige en uitlegbare detectie** met signalen uit eigen titel/omschrijving/H1, structured data, navigatie en representatieve pagina's, tegenbewijs en score; bij <75 of serieuze ambiguïteit sector onbekend. Geen hardcoding op de 18 hostnamen.
7. **Onafhankelijke waarheidscontrole van 18 sites** in `tests/fixtures/sector-acceptance-20261021/plan.json`, momenteel *alle labels voorgesteld, niet goedgekeurd*. Review met primaire bron, team/inhoudelijke reviewer en vastgelegde afwijkingen. Meet naast 18-site-suite extra echt onbekende websites (hold-outs).
8. **Reproduceerbaarheid en ontbrekende pagina's**: twee gelijke bevroren runs → zelfde sectortype, subtype, geselecteerde pagina's, score; per mislukte URL reden. Verwarringsmatrix voor hoofdsector én subtype en per taal.

**P1 acceptatie:** op 18 goedgekeurde sites **18/18 juiste hoofdsector** (95%-grens) en **≥17/18 juiste subtype** (90%-grens); onbekend telt als niet juist. Geen hoog-zekere verkeerde sector; blinde extra testen. Geen rapport van 100% juist wanneer ground truth of metingen ontbreken.

### P2: veilige bruikbare audit voor klanten

9. **RankFix Speed in de algemene scan**: aparte mobiel-/desktopscore én Core Web Vitals binnen hetzelfde auditrapport, geen losse scan of invloed op SEO/GEO-punten. PageSpeed API-key, timeouts, quotumafhandeling en twee echte testmetingen; 'niet gemeten' bij providerfout.
10. **Fix-knop zonder verrassingen**: conceptwijziging met diff en concrete oorzaak; test van headers, SEO, layout, checkout; expliciete klantgoedkeuring en rollback. Voor snelheidscorrecties zijn LCP/CLS/INP diagnostisch bewijs en voor/na browser-QA vereist.
11. **Rapport voor ondernemers**: compact probleem, bewijs, impact als indicatie, veilige volgende stap; transparante score en export. Geen autonome fixes die op onzekere bevindingen steunen.

**P2 acceptatie:** scan maakt aantoonbaar juiste, verifieerbare aanbevelingen; klant kan niets onbedoeld publiceren; Speed mobiel/desktop live geverifieerd, anders afwezig/onbevestigd.

### P3: kosteloze besloten beta, pas na P0/P1/P2 gates

12. **20–50 testers** (richtgetal, geen beloofd aantal): MKB/webshops en bureaus in NL/BE/DE, met onafhankelijke instroom en gratis toegang in ruil voor **eerlijke, niet verplicht positieve** feedback.
13. Verzamel false positives, onjuiste sector/subtypes, onterechte aftrek, rapportbegrip, betaalbereidheid, supporttijd en fix-success; ticket, geanonimiseerde snapshot, reproduceerbare regressietest per finding.
14. Houd de bèta besloten (bij voorkeur maximaal twee maanden) en publiceer niet commercieel voordat de onafhankelijke nauwkeurigheid, uptime, privacy en kosten aan de gates voldoen.

**P3 acceptatie:** aantoonbare gebruikerswaarde en bereidheid te betalen, geen openstaande P0-fouten, meetbaar foutpercentage. Herbeoordeel daarna prijsmodel.

### P4: monetisatie nadat de beta het nut bewijst

15. Focus bureaus: helder exporteerbaar klantdossier, white-label (na merk-/rechtscheck), teams, duidelijke licenties, herhaalmonitoring. **Controleer eerst of beloofde functies al werken** voordat de prijspagina wordt aangescherpt.
16. Introductie gratis of laagdrempelig behouden; analyseer cloud-/database-/PageSpeedkosten en conversie voordat prijzen gewijzigd worden. Test conceptproposities met echte klanten in plaats van concurrentieprijzen direct te kopiëren.

### Later / expliciet buiten scope van huidige QA

17. AI-prompt-/antwoordmonitoring eventueel via externe provider/partner; backlink- en keywordindex evenmin van nul bouwen; niet op twee moeilijke datafronten concurreren.
18. Extra AI-marketingfeatures, dashboards of nieuwe abonnementsniveaus pas na stabiele kern en externe vraagvalidatie.

## Meetbord / beslismoment

| Maatstaf | Huidige vaststelling | Vrijgavevoorwaarde |
|---|---|---|
| Onterechte bewezen SEO-fout | Vesteda-finding door eigenaar gemeld; nog live te reproduceren | Geen bekende, reproduceerbare false positives |
| Sectoren / subtypes | Testlabels 18 nog **niet onafhankelijk bevestigd** | 18/18 hoofdsector, ≥17/18 subtype + blinde extra sites |
| Scanner end-to-end | Neon quota blokkeerde recente QA-runs | Herhaalde werkende POST, opslag en rapport |
| Scoretransparantie | Bosch GEO 74 niet herleid door gebruiker | Elke score/normalisatie verklaard |
| RankFix Speed | Meetmodule in code, provider-key ontbrak | Echte mobiel- én desktopmetingen aantoonbaar |
| Fix engine | Veiligheid/handmatige goedkeuring nog apart te bewijzen | Geen ongeautoriseerde merges / deploys |
| Vraag / omzet | Niet onderzocht | 20–50 kwalitatieve bètatesters, feedback en betaalbereidheid |

**Operationele regel:** werkvolgorde P0 → P1 → P2 → P3 → P4. Geen commerciële lancering, prijswijziging of productiefix vanwege een ongetoetste 5/10–7/10-markthypothese. Bij problemen met de database eerst bewijs van herstel, niet onnodig geld uitgeven. Herzie dit document na elke meetbare hertest.
