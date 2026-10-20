# RankFix QA aanvulling — 20 oktober 2026

## Centraal Beheer — verzekeringen (test 10)
- Geslaagd scanresultaat: SEO 93, GEO 85, totaal 90 voorlopig, security 94; 84% bewijsdekking; 23/30 geselecteerde pagina's opgehaald, 7 onbevestigde controles.
- Sector verzekeringen 96% is passend. Onderzoek foutieve koppeling aan gewone webshopproducten: module Producten, Merchant Center, productvoorraad/varianten en uitsluitend B2B-bedrijfsmodel terwijl particuliere diensten zichtbaar zijn.
- Vier waarschuwingen: alt-teksten, Open Graph, generiek LocalBusiness-advies en incompleet Organization/WebSite. Test sectorspecifiek advies, gedeelde oorzaak en de juistheid van de feiten. Sitebrede analyse meldde zes korte descriptions en een dubbele merknaam in een title.
- Bovenstaande scanneruitkomsten zijn nog niet onafhankelijk geverifieerd.

## Funda en Huislijn — vastgoed
- Beide scans gestopt met code CHALLENGE_OR_INTERSTITIAL. Geen SEO- of sectorscore. Onderzoek herkenning, rapportering en diagnostiek; geen beveiligingen omzeilen.

## Vesteda — vastgoedverhuur (test 11)
- Eerste poging: www.vesteda.com/nl met onzichtbare U+2060 achter /nl, resulteerde in REDIRECT_LIMIT (bevestigd via Vercel-logs). Verwijder of signaleer zulke tekens bij URL-invoer.
- Tweede poging op https://www.vesteda.com/nl geslaagd. Totaal 86 voorlopig (bereik 74-90), SEO 88, GEO 83, security 84, bewijsdekking 86%; 1/2 pagina's opgehaald; zes onbevestigde controles, vijf verbeterpunten.
- Hoofdsector Vastgoed & Makelaardij 96% plausibel; geen fysieke webshop gedetecteerd. Verbeter subsector woningverhuurder/vastgoedbeheerder tegenover makelaar: 'Makelaar conversie' en 'Werkgebied makelaar' staan als pass ondanks verhuurprofiel.
- Meta description ontbreekt volgens raw HTML (fail), canonical ontbreekt volgens scanner (warning), advies LocalBusiness/Organization en expliciete paginasamenvatting: onafhankelijk verifiëren.
- Ontbrekend bewijs voor viewport, HTML-taal, privacy, consent, bedrijfsgegevens, Google Ads; niet behandelen als bewezen fouten. Security 84 bevat ontbrekende cookieflags volgens passieve inspectie.
- Scanrapport-ID: 7848d79b-1812-4e9a-8b4b-7b2961ba8459.

## Volgende stap Claude
Reproduceer de drie vastgoedcases met gecontroleerde fixtures, voeg regressietests toe voor zero-width URL-tekens, sectorsubtype vastgoedverhuur en challenge-responses. Houd bewezen afwijkingen, hypotheses en crawlerblokkades gescheiden. Niet direct naar productie publiceren.

## Extra bevestiging uit Vercel-logs
- Bij de Centraal Beheer-scan logde de centrale self-check `advice_sector_mismatch` met een correctie van het LocalBusiness-advies voor `financial_services`, terwijl de leesbare uitvoer nog wel 'Richting: LocalBusiness' vermeldde. Onderzoek of export/rapport een oude checkboodschap toont na self-check; test consistentie van afgegeven advies en gecorrigeerde status. Dit is een interne inconsistentie in de scanrapportage, geen bewezen externe websitefout.

## Testpoging 12 — PostNL, logistiek en post (geen score)
- Gebruiker scande `https://www.postnl.nl/` op 20 oktober 2026. RankFix toonde: 'De website kon niet worden opgehaald. Controleer de URL en probeer opnieuw.'
- **Vercel runtime-logs bevestigen `FETCH_TIMEOUT`** voor de zuivere URL `https://www.postnl.nl/` bij herhaalde pogingen; één extra poging bevatte een onzichtbare U+2060 achter de slash (`/%E2%81%A0`) en kreeg eveneens `FETCH_TIMEOUT`.
- Code van de huidige productiecommit `ab04e0ca35f0d6e901e070a055c3c117a3e9e007`: `app/api/scan/route.ts` gebruikt `safePublicFetch` met 15.000 ms per fetch en een herhaling na 1,5 s voor `FETCH_TIMEOUT` of verbindingsproblemen. Na herhaalde time-out wordt algemene URL-controlefout getoond; code `FETCH_TIMEOUT` zit in API-respons maar de UI-melding maakt die oorzaak niet duidelijk.
- Onafhankelijke webtekstlezer kon op 20 oktober de gewone PostNL-homepage ophalen. Dit bewijst niet dat PostNL de RankFix-server toegang gaf, maar weerlegt de suggestie dat een typefout/ongeldige URL de vastgestelde oorzaak is.
- **QA-opdracht:** voeg server/client-normalisatie of expliciete validatie van U+2060 en vergelijkbare kopieertekens toe (zonder de betekenis van legitieme URL-paths zomaar te veranderen); geef gebruikers verschillende duidelijke foutteksten voor time-out, DNS/TLS, redirects en challenge; test fetch-timeout/retry onder realistische budgets en met veilige fallback, zonder WAF of toegangsregels te omzeilen. Behoud geen-score bij onvoldoende bewijs. Voeg generieke, reproduceerbare regressietests toe. **Geen score of fout van de PostNL-website geclaimd.**
