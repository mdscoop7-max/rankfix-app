# RankFix 3.6 — grondoorzaken en herstelplan (na onafhankelijke pilot 68)

Opgesteld 18 oktober 2026. Basis: onafhankelijke meting op bevroren commit `5776f92`
(scorekaart v2: **0,9 / 10**, maximaal haalbaar 5,4) en issue #154.
Ontwikkelbranch: `fix/engine-3.6-sector-evidence`, vertakt van `fix/engine-3.5.1-post-pilot` (`b3ae5d4`).
De bevroren pilotcommit, de pilotresultaten, productie, de QA-branch en Trend Mix blijven onaangeroerd.

## Regels voor dit herstel

- Alleen generieke regels (taal, structuur, schema). Geen merk-, domein- of sitespecifieke uitzonderingen.
- De 68 pilotsites dienen alleen voor foutanalyse en regressie. Ze tellen na dit herstel **niet** meer als onafhankelijk.
- Regressietests gebruiken neutrale `.test`-hosts en eigen voorbeeldteksten in meerdere talen.
- De eindbeoordeling gebeurt op een **nieuwe, vooraf vastgelegde blinde set** met dezelfde bevroren scorekaart v2, inclusief de handmatige review van criteria 2–5.

## Grondoorzaken (bewezen)

Gemeten door `detectEuPrimaryIdentity()` rechtstreeks te draaien op de opgeslagen titel en omschrijving van de 23 sites met een foute of geen sector: **22 keer `null`**, 1 keer een foute sector.

| # | Probleem | Technische oorzaak | Bewijs |
|---|---|---|---|
| G1 | Dienstverleners worden "webshop" met 88–94% | Als de identiteitsmodule niets vindt, kiest `route.ts` e-commerce zodra er commercesignalen zijn (prijzen, Product-schema, winkelwagen). Zekerheid `86 + 2 × signalen` (vroeg) en minimaal 88/92 (late override). Geen winkelidentiteit in titel of omschrijving vereist. | Telenor, Endesa, Fortum, Fotocasa, Rode Kruis, Teamleader |
| G2 | Telecom niet herkend | Regel eist glasvezel/breedband **en** mobiel/tv. "Mobilfunk", "Internet & TV-Anbieter", "operátor", "Bellen" tellen niet. | Vodafone, T-Mobile CZ, Ziggo, Telenor |
| G3 | Energie niet herkend | Woorden als "sähköyhtiö", "energiayhtiö", "compañía de luz" ontbreken; regel eist gas of een leveringswoord. | Fortum, Endesa |
| G4 | Vastgoed en goede doelen bestaan niet in de meertalige module | Geen lexicon voor vastgoedportalen of NGO's buiten NL/EN. | Fotocasa, Amnesty, WWF, Rode Kruis |
| G5 | Hotels worden "onbekend" | Een late veto zet horeca op onbekend als de oudere boekings-identiteit niets vond. | citizenM |
| G6 | "Officiële site" telt als overheid | `sito ufficiale` / `site officiel` staat in de overheidslijst. | Uffizi → overheid 90% |
| G7 | Academisch ziekenhuis wordt onderwijs | "Patiëntenzorg", "MC" en "zorg" ontbreken als zorgbewijs. | Erasmus MC → onderwijs 95% |
| G8 | Generiek eerste titeldeel blokkeert de organisatienaam | "Home Page \| ... Ospedale ..." leest alleen "Home Page". | Ospedale Niguarda |
| G9 | SaaS en betaaldiensten | SaaS vereist "software/platform" in de titel; "CRM", "invoices" tellen niet. Betalingen: "Run payments" telt niet. | Teamleader, Adyen |
| G10 | Industriële groep zonder fabrikantwoord | "engineering group", "mining", "metal cutting" ontbreken. | Sandvik |
| G11 | Opslag bij onvoldoende bewijs | Bij 0 beoordeelde GEO-controles wordt `geo_score = 0` en een puntschatting opgeslagen. | Festo |
| G12 | Geen www-terugval bij DNS-fout | Kale host zonder DNS → scan mislukt. | HCL Lyon |
| G13 | Telling paginatypes ≠ pagina-audits | `multiPage.counts` en `pageAudits[].type` gebruiken verschillende typeringen. | Vrijwel alle rapporten |

## Herstelplan

| Prio | Herstel | Bestand(en) | Test |
|---|---|---|---|
| P0 | G2–G10: meertalige identiteit voor telecom, energie, vastgoed, goede doelen, hotels, pretparken, SaaS, betaaldiensten, industrie; "officiële site" weg uit overheid; generieke titeldelen overslaan | `lib/eu-identity.ts`, `lib/primary-business-identity.ts` | positieve en negatieve gevallen per taal in `tests/eu-identity-36.test.mjs` |
| P0 | G1: e-commerce zonder winkelidentiteit in titel/omschrijving maximaal 80% zekerheid; een meertalige dienstidentiteit wint van commercesignalen | `app/api/scan/route.ts` | scanmatrix-profielen: telecom/energie/vastgoed/goed doel/SaaS met winkelfuncties → eigen sector; echte webshop blijft webshop |
| P0 | G5: horeca-veto respecteert een meertalige hotelidentiteit | `app/api/scan/route.ts` | scanmatrix: hotelketen |
| P1 | G11: geen 0 en geen puntscore opslaan als de categorie niet beoordeeld is | scoreopslag | eenheidstest op scoremodel/opslag |
| P2 | G12: bij `FETCH_DNS` op de kale host één keer de www-variant | fetch/scan-route | scanmatrix: DNS-fout kale host |
| P2 | G13: paginatype-telling uit dezelfde typering als de audits | `lib/representative-pages.ts` of route | eenheidstest |
| P3 | Scanformulier: geen oude URL via suggestielijst bij Enter | dashboard | handmatig + test indien mogelijk |

## Status

Wordt per afgerond onderdeel bijgewerkt, met commit en testresultaat.
