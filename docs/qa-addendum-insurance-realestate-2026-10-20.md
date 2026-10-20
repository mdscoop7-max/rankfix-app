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
