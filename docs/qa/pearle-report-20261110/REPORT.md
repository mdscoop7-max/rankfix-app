# Pearle-rapport — 10 november 2026

## Bestaande code en aantoonbare fout

De repository is opnieuw opgehaald. `qa/codex-evidence-integrity-20261109` op `251940f1670bec39ff2d49642ea798b67960eaca` bevat zowel de integratiebranch (`68269d71`) als de Claude-QA-branch (`d5e16b03`). Er is geen nieuwe inhoudelijke branch aangemaakt; de bestaande nieuwste branch is lokaal gevolgd. PR #221 en #222 hebben oudere heads. Geen main-merge of productie-uitrol.

De door de gebruiker geplakte Pearle-rapportage bevat een bevestigde weergavefout: “JavaScript uitgevoerd” naast “deze scan gebruikte raw HTML”. De oorzaak zit in de Nederlandse `reasonFor`-functie van het volledige rapport. Een losse woordmatch op `javascript|client-side|render`, of `reasonCode=needs_js`, verving de werkelijk opgeslagen beperking door een ongefundeerde uitspraak over de scanmethode. Ook verschillende zwakke-bewijsredenen werden onder één generieke tekst verstopt.

De rapportgroepering gebruikt nu de opgeslagen controleboodschap. Bij ontbrekende oude data gebruikt zij neutrale redenfallbacks zonder een scanmethode te verzinnen. De wijziging past geen status, branche, score of bewijsdekking aan. Ook bestaande opgeslagen rapporten gebruiken de gerepareerde weergave zodra deze versie wordt gedraaid. N.v.t.-redenen blijven concreet zichtbaar in plaats van een algemene uitspraak over het hele websitetype.

## Bewijs vóór en na

De oorspronkelijke formatter is vóór de reparatie geïsoleerd uitgevoerd: 1 test geslaagd, 2 mislukt (`reason-before.tap`). Na de reparatie slagen alle 3 tests (`reason-after.tap`). Een echte Chromium-test op de productiebuild controleert een opgeslagen rendered-rapport via onderschepte API-data: de precieze Consent Mode-beperking blijft zichtbaar en de raw-only-bewering ontbreekt. Dit is een browserregressie met testdata, geen live websitescan. De test wordt ook door GitHub CI uitgevoerd. Bestaande mobiele/desktop Fixes-navigatie en herstelpagina zijn opnieuw getest.

De eerste volledige suite meldde 1226 geslaagd, 1 mislukt en 8 bestaande skips. De enige fout was een bronkoppelingstest die de bestaande aanroepnaam `reasonFor(check,language)` vereist. Die naam is bij het extraheren van de helper behouden met een importalias; de bestaande test is niet gewijzigd. De gerichte controle van deze koppeling plus de drie gedragstests slaagt 4/4. De volledige suite is daarna opnieuw uitgevoerd: **1235 tests totaal, 1227 geslaagd, 0 mislukt, 8 bestaande skips**, exitcode 0 (506,8 seconden). De acht skips zijn de bestaande vier PostgreSQL-opt-ins, één langzame time-out-opt-in en drie optionele volledige replays; ze zijn niet als geslaagd geteld. De andere standaard rapportreplays zijn wel in de suite uitgevoerd.

## Nieuwe echte Pearle-scan

Op de bestaande scannercommit `251940f1` is `https://pearle.be/` opnieuw live gescand: HTTP 200, definitieve URL `https://www.pearle.be/nl_BE`, circa 80 seconden, Chromium/JavaScript daadwerkelijk uitgevoerd. Geconfigureerde proxy en TLS-validatie zijn behouden. Er zijn geen consent-, login-, winkelwagen- of betaalinteracties uitgevoerd. De broncode van de scanner is identiek aan de eerder geteste `4e2ec783`; daarna waren uitsluitend bewijsdocumenten toegevoegd. De huidige reparatie betreft alleen rapportweergave.

De scanner rapporteert `health_wellness/optician`, SEO 96, GEO 99 en een voorlopige totaalscore op bevestigd bewijs van 97. Dit is geen onafhankelijke nauwkeurigheidsmeting. De nieuwe steekproef beoordeelt 16/16 geselecteerde pagina's maar selecteert geen productdetailpagina; het aangeleverde rapport selecteerde er wel één. De twee samples mogen dus niet als identieke input of als bewezen verbeteringspercentage worden vergeleken.

`live-pearle-summary.json` legt de exacte URL's, HTTP-statussen, beperkingen, controle-uitkomsten, scorekwalificatie en SHA256 van de privé bewaarde oorspronkelijke response vast. Geen ruwe HTML, cookies, lokale sessietokens of ondoorzichtige responsepayloads gepubliceerd.

## Afzonderlijke echte productcontrole

De exacte product-URL uit het gebruikersrapport is ook live onderzocht: `https://www.pearle.be/nl_BE/brillen/oakley-wheel-house-basecamp-collection-ox8166-1154`, HTTP 200, circa 84 seconden. De scanner herkent deze als productpagina en bevestigt openbare commerce-signalen. Product/Offer-data bevatten EUR 220 en InStock; de prijscontrole vindt overeenkomstige expliciete markup. Dat bewijst geen werkende bestelling. De checkoutflow blijft terecht `unable_to_confirm`, omdat er niet is geklikt of betaald.

De hoofdbranche is in deze afzonderlijke productscan **niet betrouwbaar afgetekend**: `ecommerce`, confidence 65, met expliciet tegenbewijs voor `optician` uit de eigen pagina's. De homepage-scan noemt `optician` met confidence 90. Dit verschil is vastgelegd in `live-product-summary.json` en wordt niet als een correcte onafhankelijke sectorbeslissing of als opgelost punt geteld. Een veilige oplossing vereist een regressie die bedrijfsidentiteit vanaf de echte homepage onderscheidt van de productpaginacontext, zonder dienstverleners met een nevenwinkel tot webshop om te classificeren. Hiervoor is in deze weergavereparatie geen nieuwe classifierregel toegevoegd.

## Open punten en aanvaardingsgrenzen

- De webshopbevinding uit het aangeleverde rapport is niet definitief afgetekend. De nieuwe sample bevat geen productdetailpagina; checkoutgedrag is niet uitgevoerd. Er is geen nieuwe domeinuitzondering of gefingeerde shopbevestiging toegevoegd. N.v.t. bij webshopcontroles bewijst niet dat elders geen online verkoop plaatsvindt.
- De afspraakcontrole bevat een zwak signaal en blijft onbevestigd. Een gevonden afspraak-URL bewijst geen werkende afspraakflow. De reparatie maakt de opgeslagen reden zichtbaar; zij geeft geen extra punten.
- De verplichte mkb-holdout `tests/fixtures/testlab-mkb/catalog.json` en originele nulmeting `qa-input/rankfix-testlab-144-fresh144-20f1effd.json` ontbreken nog. `validate-mkb-catalog.mjs` geeft opnieuw `REQUIRED_INPUT_MISSING`; de gate blijft actief.
- De eerder vastgelegde 144 echte requests op dezelfde scannerbron (`4e2ec783`) leverden 31 rapporten, 1 blokkade, 110 onbevestigde upstreamfouten, 1 timeout en 1 DNS-observatie. Dat is geen geldige volledige liveacceptatie. Zie `../evidence-integrity-20261110/REPORT.md`. Er zijn in deze vervolgcontrole twee nieuwe Pearle-scans uitgevoerd (homepage en product-URL), geen nieuwe volledige 144-run geclaimd.
- `npm run qa:144:analyze` is opnieuw uitgevoerd, maar de lokale `qa-results/fresh144-latest` bevat nog de oude 5-resultatenronde op `0de08357`. Die analyse wordt afzonderlijk bewaard en niet als analyse van de latere 144-run voorgesteld.
- Vercel meldde vóór deze push nog “Account is blocked”. De verplichte catalogusjob was rood, de hoofdjob op `251940f1` groen. Nieuwe GitHub-checks worden na push apart gecontroleerd. Geen merge zolang de verplichte gates niet groen zijn.

## Definitieve lokale verificatie

`npm test`, `npm run typecheck`, `npm run build` en de Chromium-rapport/navigatietests zijn geslaagd. Lint: 0 fouten, 60 bestaande waarschuwingen. `npm run qa:144:analyze` slaagt op de afzonderlijk benoemde historische lokale resultaten. De vereiste mkb-invoervalidatie blijft geblokkeerd. SHA256SUMS omvat alle opgenomen bewijsbestanden. De uiteindelijke push en GitHub Actions worden in de gekoppelde concept-PR bevestigd; een rode verplichte gate wordt niet als volledig groene CI gepresenteerd.
