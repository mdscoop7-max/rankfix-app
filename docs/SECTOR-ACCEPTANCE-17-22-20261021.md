# RankFix · Sectoracceptatie eisen 17–22 en Bosch/Vesteda regressie — 21 oktober 2026

**Status: QA-ONLY · GEEN GOEDGEKEURDE GROUND TRUTH · geen productie-aanpassing.**
Deze taken en de 18 referentielabels zijn een gebruikersvoorstel. Een onafhankelijke inhoudelijke reviewer of het ontwikkelteam moet per site de labels en hun bronvermelding bevestigen. ChatGPT is niet een aangestelde menselijke reviewer en kan geen teamgoedkeuring afgeven.

## Ernst / prioriteiten (1–16, reproduceerbaar)

**P0 — geen ongefundeerde waarschuwingen:**
1. Head-parser: Vesteda `/nl` — bevestig meta description, canonical, viewport, HTML-lang ook bij wisselende attribuutvolgorde, casing, quotes, SSR en redirects. Controleer werkelijk ontvangen HTML; gebruik DOM-parser waar mogelijk in plaats van een volgorde-afhankelijke regex.
2. Footer-parser: vind privacy, cookies, disclaimer, contact op homepage en gecontroleerde legal-/contactpagina's, met taalcontext. Geen "ontbreekt" als de primaire response onvoldoende bewijs biedt.
3. Bij vermoedelijk onvolledig HTML of geblokkeerde browserrendering zijn controles `unable_to_confirm`, niet bewezen fouten.
4. Vesteda hoofdsector Vastgoed, subtype **verhuurder/woningbelegger**, niet makelaar; geen makelaaradvies of `LocalBusiness` voor het concern zonder passend locatiebewijs.

**P1 — compleet, consistent bewijs:**
5. Vesteda: `og:url` vs canonical en `og:type` vs homepage-paginatype afzonderlijk toetsen; alleen bewezen mismatch als waarschuwing.
6. Mollie: meertalig bewijs via HTML-head én sitemap/hreflang, met eigen onzekerheidsstatus.
7. Geselecteerde maar niet opgehaalde pagina's expliciet tonen met oorzaak; tellingen overal hetzelfde.
8. Hoge score zonder voldoende dekking altijd kwalificeren met bereik/onzekerheid; geen misleidende 100.
9. Herhaalbaarheid: gelijke input/crawlversie en bevroren fixtures → gelijke pagina's, sector, subtype en score; live content kan aantoonbaar wijzigen.
10. Bij sectorzekerheid onder ongeveer 75% abstention, met bevestigingsvraag. Geen automatisch verzonnen hoofdsector.
11. Bekende echte cases opnemen in de vastgezette testset na onafhankelijke waarheidstoets.

**P1 — Bosch (rapport 21 oktober 2026, `bosch.de`):**
12. Industrie & technologie herkennen met bestaand generiek `manufacturing_industrial`-mechanisme; *corporate is paginatype*, geen vervangende economische sector. De bestaande sectorherkenning geeft volgens meegestuurd rapport 0%, dus onderzoek de route, gebruikte codeversie, primaire bronselectie en late overrides; géén domain-hardcode.
13. Sociale profielen: controleer ook footer/social-sectie en bedoelde externe officiële profielen; bron-URL's rapporteren.
14. Duitse woorden: Impressum, Datenschutz, Kontakt, Privatsphäre-Einstellungen, Cookie-Einstellungen; pas overeenkomstige generieke meertalige dekking toe.
15. Bedrijfsidentiteit: citeer gecontroleerde impressum/legal pagina, detecteer organisatie en bron in meerdere talen; label niet "onbevestigd" als identiteit bewezen is.
16. GEO-score: laat kerngewichten, geldige/no-proof/no-applicable controlepunten, normalisaties en mogelijke scorecaps stap voor stap zien; getoonde rijen moeten reproduceerbaar aansluiten op 74/100, anders is dit een fout. JSON-LD: handmatig valideren met Rich Results Test; niet gokken.

## Eisen 17–22 (gates, niet alleen ontwerpideeën)

17. **Hiërarchisch model:** apart `mainSector`, `subtype`, `pageType`, `secondaryActivities[]`. Dit voorkomt `Bosch = corporate` als sector of `Booking.com = hotel`. Auditmodules volgen primair bewezen subtype en paginatype.
18. **Gewogen, onafhankelijke bronnen:** schema.org-types; titels, descriptions, H1 en prominente bedrijfsomschrijving; navigatie en meerdere eigen pagina's; ken lage gewichten toe aan losse marketingwoorden als checkout/pricing. Toon tegenstrijdigheden; klantcases/testimonials mogen de primaire bedrijfstak niet bepalen.
19. **Meertalig:** minimaal NL, EN en DE, inclusief legal/footer-termen; uitbreidbare woordenlijsten zonder klant-/domeinspecifieke uitzonderingen.
20. **Voorzichtig beslissen:** confidence <75 → `unknown`, alleen algemene controles, vraag om sectorbevestiging. Bij kleine scoreafstand met concurrerende sector niet blind de hogere kiezen: bij echte twijfel `unknown` of een gevalideerd hybride model. Kalibreer confidence tegen onafhankelijke data.
21. **Handmatige correctie:** alleen geautoriseerde klantbeheerder kan op website-identiteit een correctie instellen, met `approvedBy`, tijdstip, notitie en audittrail; volgende scan hergebruikt keuze **zonder** het gemeten machinebewijs te overschrijven. Behoud gebruikerscontrole om terug te draaien.
22. **Uitlegbaar:** rapporteer sector én subtype met de concrete bewijs-URL, type en gewicht, tegenevidence, confidence, gebruikte websitepagina's, modules, en de reden van een eventuele override.

## Vaste set van 18 sites — voorgesteld, niet definitief

`tests/fixtures/sector-acceptance-20261021/plan.json` bevat de 18 sites met voorgestelde labels. `review.status` is overal `pending_independent_review`. Geen enkel cijfer uit deze set mag als **geslaagd** worden gecommuniceerd vóór goedkeuring van alle labels én geldige meetbestanden.

**Rekenkundig belangrijk bij 18 sites:** 95% hoofdsectornauwkeurigheid vereist **18/18 juist** (17/18 = 94,44%). 90% subtypenauwkeurigheid vereist **minimaal 17/18 juist** (16/18 = 88,89%). Onbekend, fout en ontbrekend zijn geen successen. Meetfouten blokkeren de gate en worden apart als infrastructuurprobleem gemeld.

Voor elke site: minimaal twee identieke bevroren inputs met dezelfde engineversie; compare hoofdsector/subtype, geselecteerde pagina's en score. Herhaal levende scans aanvullend, maar verwissel een echte HTML-wijziging niet met willekeurige motoroutput.

Confusion matrix: elke onjuiste toewijzing registreert `expectedMain → observedMain`, hostname, subtypeverschil, confidence en gebruikte bron-URL. Elke nieuwe praktijkmisclassificatie wordt ná broncontrole toegevoegd.

**Bijzondere goedkeuringspunten:**
- `bosch.de`: wereldwijd industrieel technologieconcern, multi-activiteit; "corporate" is paginatype, geen subtype.
- `vesteda.com`: institutioneel woningbelegger/verhuurder, géén makelaar.
- `bol.com`: retailmarktplaats, geen enkele-verkoperwebshop.
- `coolblue.nl`: elektronicaretail primair, energiebedrijf als secundaire dienst.
- `booking.com`: boekingsplatform, niet één accommodatie.
- `umcutrecht.nl`: zorg/academisch ziekenhuis primair, onderwijs en onderzoek secundair.
- `paypal.com`: financiële betaaldienst/digitale wallet; subtype kan nader worden verfijnd.

## Acceptatie en bewijs

- Head-/footerfouten Vesteda en Bosch controleerbaar met exact de ontvangen HTML + handmatig vergeleken live pagina, plus tegenfixtures.
- Alleen bewezen juridische/contact-/schemawaarschuwingen; technologie en paginaformulieren passend bij subtype.
- Er is een expliciet scorebewijs inclusief GEO 74-reconciliatie. Een tijdelijke "cap" zonder verklaring is niet toelaatbaar.
- Hoofdsector ≥95%, subtype ≥90% op **alle 18 onafhankelijk goedgekeurde** websites; geen 18/18 claim zonder echte scans.
- Twee herhaalde bevroren runs identiek, ook paginaselectie en score.
- Elke fout in verwarringsmatrix; onzekere sector toont onbekend/vraag; correcties zijn persistent en geaudit.
- `npm test`, productiebuild en blinde extra sites; **niet** op alleen de voorgestelde 18 overfitten.
- Grootboek: site, gold-label reviewer, bron-URL, snapshot, crawlversie, datum, resultaat, afwijkingsreden en fixstatus.

## Scheiding QA / productie

Deze QA-PR wijzigt geen scanmotor, productie, Neon-database of score. De echte 18-site live-test is **nog niet uitgevoerd**. De gemelde Neon-limiet verhindert momenteel end-to-end database-afhankelijke scans; die beperking mag niet worden verward met sectoraccuratesse.
