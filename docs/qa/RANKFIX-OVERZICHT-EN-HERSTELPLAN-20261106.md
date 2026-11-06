# RankFix — overzicht en herstelplan (6 november 2026)

Branch `qa/integration-mkb-144-20261102`, laatste commit `5f79370`. Geen merge, geen deployment.
Bronnen: Fresh144 (5 nov, samenvatting), MKB-48 (316ff53), sector80 (993161a8), live rapporten PayPal, Stripe, Organon, Rijschool Overtoom, bonprix, NUVEMIXA (punten eigenaar), 32 opgeslagen echte scans. Alle labels zijn voorgesteld, niet onafhankelijk gecontroleerd.

## 1. Wat aantoonbaar goed werkt

| Onderdeel | Bewijs |
| --- | --- |
| Score = som van eigen controles (0,6×SEO + 0,4×GEO), binnen bereik, geen 100 met onbevestigde controles | 32 opgeslagen echte scans + Stripe/PayPal live; regressietest per rapport |
| Onbevestigd/N.v.t. kosten geen punten en staan apart | Stripe, PayPal, Organon, bonprix |
| PageSpeed alleen bij echte meting | alle rapporten: "niet gemeten" |
| Blokkade-codes apart: 403, 429, time-out, TLS (verlopen/keten/hostnaam), DNS (domein bestaat niet), 402 (site niet actief), proxy-uitval | route-matrix 13/13 |
| Kapotte link met URL + verwijzende pagina; botcontrole-404 is "niet te bevestigen" | unit + route |
| Bij twijfel "Branche niet bevestigd" i.p.v. gokken | sector80: 2 fout op 66 |
| Hoofdsector bij herkende sites | sector80 herberekend: 47/66 juiste hoofdsector |
| Betaaldiensten (PayPal live, Mollie, Stripe-type), goede doelen, verzekeraar ≠ bank, fabrikant als websitetype | live PayPal + replay + sectortests |

## 2. Structurele fouten die nog bestaan

| # | Fout | Voorbeeld | Omvang |
| --- | --- | --- | --- |
| S1 | **Branche niet herkend bij duidelijke eigen titel** — veel MKB-branches hebben geen regel (rijschool, coach, psycholoog, mediator, fotograaf, uitvaart, tolk, webdesigner, schilder, stukadoor, verhuizer…) | Rijschool Overtoom: titel "rijschool Amsterdam – Rijles op maat" → onbekend | sector80 19/66 onbevestigd; Trustoo-lijst ±90 branches |
| S2 | **Alleen hoofdsector, geen subbranche** | loodgieter/hovenier → "installatie & onderhoud", sportschool → "fitness" | sector80 23/66 gedeeltelijk |
| S3 | **Webshopmodules niet actief bij bevestigde webshop** | bonprix: webshop bevestigd, modules zonder Webshop/Producten/EU-consumenteninfo | alle JS-webshops (vermoed) |
| S4 | **Geen productpagina's gevonden bij JavaScript-webshops** | bonprix: 0 productpagina's (Nuxt) | JS-webshops |
| S5 | **Productbranche (mode, elektronica…) niet bevestigd** | bonprix, Zalando, Bruna → alleen "webshop" | alle retail |
| S6 | **Score-presentatie bij lage dekking** — puntscore 97–99 valt meer op dan "72–84% dekking, 11–19 onbevestigd" | bonprix 97 bij 72%, NUVEMIXA 99 bij 84% | alle voorlopige scans |
| S7 | **Ongeldige href als "pagina bestaat niet meer"** | bonprix `/true` (framework-waarde als link) | JS-sites |
| S8 | **Product structured data: ontbrekende prijs/valuta/beschikbaarheid** — detectie en herstelactie te controleren | NUVEMIXA | webshops |
| S9 | **Merk-inconsistentie niet gesignaleerd** (oude merknaam op pagina's) | NUVEMIXA/TrendMix | alle sites na rebranding |
| S10 | **Checkout/betaalmethoden blijven onbevestigd** — mogelijk pagina's/signalen gemist | NUVEMIXA | webshops |
| S11 | Losse trefwoorden van klantsectoren beslissen soms de branche | BDO → Zorg | onbekend, 1 bewezen geval |
| S12 | Paginatypes: cookie-dialoogkop als H1, extreme H1-aantallen (18–73) | Stripe | JS-sites |

## 3. Prioriteit (impact × bewijs × oplosbaarheid; doelgroep mkb/zzp/webshops)

1. **S3 + S4 + S10 webshop-keten** (modules, productpagina's, checkout-signalen) — webshops zijn de kerndoelgroep; zonder dit zijn webshopcontroles leeg.
2. **S1 MKB-branches** — grootste aantal "onbevestigd" bij mkb/zzp; één generiek mechanisme (branchelijst met naam-in-titel + activiteit-in-omschrijving) i.p.v. losse regels.
3. **S6 score-presentatie** — snel, raakt elk voorlopig rapport.
4. **S7 ongeldige href** — valse 404 ondermijnt vertrouwen.
5. **S5 productbranche**, **S8 product structured data**, **S9 merk-inconsistentie**.
6. **S2 subbranches**, **S11**, **S12**.

## 4. Al doorgevoerd en getest (6 nov)

| Reparatie | Getest met | Live bevestigd |
| --- | --- | --- |
| PayPal = betaaldienst (winkelen = klantactiviteit) | echte PayPal-scan replay + 10 aanbiederstypen + negatieven | ja (19:40) |
| Hartstichting-type goede doelen | echte opgeslagen scan | nee |
| Verzekeraar met hypotheken ≠ bank | synthetisch | nee |
| Fabrikant / culturele instelling als websitetype | replay | nee |
| Letter op bewezen ondergrens bij onvoldoende bewijs; "(indicatie)" | 32 echte scans | nee |
| ZEISS/Sandvik-type fabrikanten | replay | nee |
| 402 / TLS / DNS juist benoemd; botcontrole-404 | route-matrix | nee |
| Stripe: NL betaalplatformtaal, eerlijke financiële bewijstekst, careers ≠ juridisch | unit + negatieven | nee |
| sector80-labelkaart (meetfout TestLab) | herberekening export | n.v.t. |
| 16 nieuwe branche-declaraties (chemie, brouwerij, farma, netbeheer, water, laden, vermogensbeheer, pensioen, notaris, thuiszorg, hoorzorg, autodealer, congreslocatie, elektrotechniek…) + "X is a … company"-zin bij generieke titel (Organon) | unit + negatieven + volledige suite | nee |

Tests: 1083 geslaagd, 0 mislukt; typecheck en lint groen; CI "Test, lint and build" groen. CI-catalogusgate blijft bewust rood (ontbrekende invoerbestanden).

## 5. Nodig voordat RankFix betrouwbaar genoeg is

1. Webshop-keten werkt op JS-webshops (S3/S4/S10), bewezen op ≥10 echte webshops (Shopify, WooCommerce, Magento, Nuxt/React).
2. MKB-branches: ≤10% onbevestigd bij sites met duidelijke eigen titel; 0 verkeerde hoofdsector.
3. Geen valse 404's; score-presentatie zet dekking en onbevestigd vóór het getal.
4. Herhaling Fresh144 + sector80 op dezelfde commit; vergelijken met nulmeting.
5. Onafhankelijke controle van labels en een eindtest op 50 nieuwe sites.

## Herstelplan (volgorde, per stap: oorzaak → generieke wijziging → test → meting)

| Stap | Onderwerp | Nodig van eigenaar | Acceptatie |
| --- | --- | --- | --- |
| 1 | Webshop-keten: modules bij bevestigde webshop, productpagina-selectie bij JS-webshops, checkout/betaalsignalen | volledige JSON bonprix, NUVEMIXA + 3 andere webshops | modules actief; ≥1 bewezen productpagina waar die bestaat; niets onbewezen als product |
| 2 | Score-presentatie bij voorlopig/onvoldoende | — | dekking + aantal onbevestigd staan vóór de puntscore; geen getal verandert |
| 3 | Ongeldige href (`true`, `undefined`, `null`, `#`) apart melden met gerenderde href | JSON bonprix | geen "pagina bestaat niet meer" voor framework-waarden |
| 4 | MKB-branchelijst (Trustoo-indeling) als één generiek mechanisme | — | elke branche ≥2 positieve + ≥2 negatieve tests; Rijschool Overtoom-type herkend |
| 5 | Productbranche, product structured data, merk-inconsistentie | JSON NUVEMIXA | gerichte tests |
| 6 | Hermeting Fresh144 + sector80 + MKB-48 | eigenaar draait TestLab | voor/na per site |

Werkwijze: één stap tegelijk, max. 5 structurele problemen per ronde, geen site-specifieke regels, alles op QA.
