# Sectorherkenning lokale bedrijven (24 okt 2026)

Branch `fix/sector-local-trades-20261024`, gebaseerd op `qa/rankfix-shared-preview` (`981e3f7`).
Geen productiewijziging, geen live scans: alle metingen zijn offline (echte scanroute, geen netwerk).

## Aanleiding

Testresultaten van de eigenaar: opticiens (o.a. MultiÓpticas, Optical Center) niet herkend,
kapsalons soms beauty en soms webshop, hotels en restaurants soms verkeerd of onbekend.
Opdracht: structureel in de scanmotor, geen uitzonderingen per website.

## Gevonden oorzaken (generiek)

1. **Geen opticien-identiteit**, en kapper/horeca alleen in NL/EN-woorden. "Ópticas", "Optiker",
   "ottica", "peluquería", "parrucchiere", "ristorante", "Gasthaus", "hôtel" telden niet.
   Hetzelfde gat bleek bij tandartsen, garages, makelaars, bakkerijen en fysiotherapie in DE/FR/ES/IT.
2. **Een eigen webshop overschreef de hoofdactiviteit.** Een kapperketen of opticien met een
   productshop (shampoo, lenzen) werd "Webshop" met 94% zekerheid.
3. **Markt werd als identiteit gelezen.** "Hotel booking engine", "software for hotels",
   "for your hotel" maakten een softwarebedrijf tot hotel (90%).
4. **Een bijaanbod op een deelpagina blokkeerde bevestiging.** Een pagina "Hotel and parking" op
   een luchthavensite gold als tegenstrijdig bewijs.
5. **Twee drempels voor "bevestigd".** `decisionStatus` noemde 76% al "confirmed",
   `displayPolicy` pas vanaf 80%.

## Wijzigingen

| Bestand | Wijziging |
| --- | --- |
| `lib/site-sector-corroboration.mjs` | Meertalige beroepsnamen (NL, EN, DE, FR, ES, IT) voor opticien, kapper, schoonheidssalon, hotel, restaurant, bakkerij, apotheek, tandarts, fysiotherapie, garage en makelaar. De naam van het vak is identiteit; productwoorden (brillen, shampoo, kamers) zijn alleen context. "Fibra óptica/ottica", "fibre optique" zijn uitgesloten. `LOCAL_TRADE_KEYS`; bijaanbod van een ander lokaal vak op een deelpagina spreekt een homepage-identiteit niet tegen. Subtype-verfijning negeert marktvermeldingen. |
| `lib/eu-identity.ts` | `stripMarketMentions`: "voor kappers", "for your hotel", "salon software", "restaurant equipment" tellen niet als eigen activiteit. Doelgroeplijst uitgebreid met lokale vakken. |
| `app/api/scan/route.ts` | Trefwoordbeslissingen gebruiken de opgeschoonde identiteit. Een door de homepage verklaard lokaal vak blijft primair; webshop, online bestellen of boeken wordt verkoopkanaal (secundaire activiteit). Een verklaring die een bestaande beslissing binnen dezelfde sector verfijnt, behoudt die zekerheid. `decisionStatus` volgt dezelfde drempels als `displayPolicy` (≥ 80 bevestigd, 60–79 waarschijnlijk). Nieuw veld `sectorProfile.salesChannel`. |
| `lib/sales-channel.ts` (nieuw) | Verkoopkanaal: `physical_store`, `service_location`, `online_store`, `omnichannel` of `unknown`, alleen op bewijs (vestigingszoeker, winkelpagina's, adres + openingstijden, "in de winkel/bij jou in de buurt", bevestigde online aankoop). Wijzigt nooit sector of score. |
| `app/dashboard/audit/[id]/page.tsx` | Websiteprofiel toont "bevestigd / waarschijnlijk / niet vastgesteld" en het verkoopkanaal, in 6 talen. |
| `scripts/testlab/labels.mjs` | TestLab-label "retail" accepteert ook opticien, apotheek en bakkerij (lokale detailhandel). Andere zorgsubtypes niet. |

Keuze: een opticien valt onder **Zorg & Gezondheid · Opticien** (oogmeting op afspraak + verkoop);
een eigen webshop wordt als verkoopkanaal getoond. Dit is een taxonomiekeuze voor review.

## Resultaten (offline, echte scanroute)

Nieuwe matrix `tests/scan-matrix/run-local-business.mjs`: 53 profielen, 6 talen, met negatieve
controles (lenzenwebshop, zonnebrillenmerk, haarproductenshop, salonsoftware, hotelsoftware,
horecagroothandel) en twee onthoudingsgevallen.

| | Vóór (`981e3f7`) | Na |
| --- | --- | --- |
| Correct (sector + subtype) | 24 | 53 |
| Juiste sector, subtype ontbreekt | 4 | 0 |
| Onbekend waar de site zichzelf duidelijk benoemt | 17 | 0 |
| Verkeerde sector met ≥ 75% zekerheid | 8 | 0 |

Per groep vóór → na: opticiens 0/7 → 7/7 · kappers 0/7 (5× webshop) → 7/7 · restaurants 2/6 → 6/6 ·
hotelsoftware als hotel 90% → onbekend · tandarts, garage, makelaar, bakkerij, fysio (DE/FR/ES/IT)
5/15 → 15/15 · hotels, sportscholen, apotheken 10/10 → 10/10 · negatieve controles en onthouding 7/7 → 7/7.

**Let op:** deze profielen zijn tegelijk met de fix geschreven. Ze zijn geen onafhankelijke
hold-out en geen bewijs voor echte websites.

Regressie op opgenomen TestLab-replays (echte paginadata):

| Replay | Vóór | Na |
| --- | --- | --- |
| 144-site (93 met rapport) | 79 compatibel · 11 onbekend · 2 label-verschil · 1 geen rapport | identiek |
| 96-site ochtend | 65 · 1 · 0 | identiek |
| 96-site avond | 66 · 1 · 0 | identiek |

Scores ongewijzigd. Alleen subtype/zekerheid veranderde: valk.com en steigenberger.com → "hotel"
(90), hertz.com car_rental 76 → 90, rspca.org.uk non-profit 76 → 95 (blijft een labelvraag).

Checks: 634 tests (630 geslaagd, 4 overgeslagen: PostgreSQL), `tsc --noEmit` schoon,
`next build --webpack` geslaagd (Google Fonts offline gemockt), ESLint ongewijzigd (37 bestaande).

## Niet geverifieerd

- De 48 nieuwe TestLab-sites (kappers, opticiens, hotels, restaurants) hebben geen opgenomen
  replay in de repo; de laatste `lab144.json` stond op de laptop van de eigenaar.
- Live gedrag op de QA-preview. Volgende stap: eigenaar draait `--phase new48` en daarna
  `lab144` op de QA-preview na merge in `qa/rankfix-shared-preview`.
- Sectorspecifieke auditchecks (bijv. menu, afspraak) gebruiken nog grotendeels NL/EN-woorden;
  dat valt buiten deze herkenningsfix.
