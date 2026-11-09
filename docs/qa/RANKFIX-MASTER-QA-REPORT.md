# RankFix master QA-dossier

Bijgewerkt 2026-11-04. Werkbranch `qa/integration-mkb-144-20261102`.
Uitgangspunt `8751558db59573059df880d3fb2bbb12af826e20`; schone nieuwe checkout.
**NO-GO voor uitrol; geen categorie onafhankelijk op 90% afgetekend.**
De gebruiker heeft QA-reparaties, scans, commits en pushes toegestaan. Main-merge
of productie-deployment is niet toegestaan. Oude rapporten blijven historie.

## Bronnen en catalogi

| Bron | Status / betekenis |
| --- | --- |
| `tests/fixtures/testlab-144/catalog-fresh-144-20261029.json` | Bestaande 144 kandidaten; bewaren, labels voorlopig |
| `tests/fixtures/testlab-144/catalog-mkb-48-20261104.json` | 48 kandidaten, 12 groepen; labels `proposed_not_independently_verified` |
| `tests/fixtures/testlab-144/catalog-commerce-diverse-20261026.json` | Andere commercecatalogus; niet verwarren met fresh144 |
| `tests/fixtures/testlab-96/` + round-e/f-service-retail | Historische baseline / regressiemateriaal |
| `tests/fixtures/testlab-144/catalog-supplemental-beauty-20261102.json` | Aanvullende beautycatalogus |
| `docs/qa/MKB48-20261104-scanrapport-en-fixregister.md` | Rapport op 8751558d; scancommit 8f9f2e31; originele export niet in checkout gevonden |
| `qa-input/rankfix-testlab-144-fresh144-20f1effd.json` | Ontbreekt; oorspronkelijke 143-export dus niet herberekend |
| `tests/fixtures/testlab-mkb/catalog.json` | Ontbrekende andere verplichte MKB-144-invoer; MKB-48 vervangt dit niet |
| `docs/qa/FINAL-20261104.md`, `EGRESS-20261104.md`, `RUNTIME-20261104.md` | Eerdere reparaties, gedeeltelijke scans en proxyincidenten; geen volledige acceptatie |
| `docs/qa/ACCEPTANCE-20261104.md`, `P0-CORRECTIONS-20261102.md`, `LINT-ROUND-20261102.md` | Eerdere technische acceptatie en resterende bronhiaten |
| `docs/qa/SECTOR-ROUND2-20261101.md`, `results/sector-round2/` | Bevroren synthetische meting: 61/76 verwachte uitkomsten, 5 verkeerde, 12 onbekende (2 terecht); geen onafhankelijke praktijkcertificering |
| `docs/qa/final-live-20261104/` | Laatste echte gedeeltelijke run: 3 rapporten, 2 infrastructuur/pending, 139 niet gestart |

De aangeleverde historische 143-cijfers (120 succes, 18 geblokkeerd, 4 timeout,
1 TLS; 40 exact + 43 equivalent, 24 onbekend; 105 onvolledig/9 volledig bewijs)
zijn **nog niet geverifieerd tegen het origineel**. De beschikbare latere partial
runs zijn andere datasets en mogen die nulmeting niet vervangen.
MKB-48-rapport: 38 succes, 6 netwerk, 3 blokkades, 1 timeout; 9 exact,
23 mismatch en 6 onbekend volgens de oorspronkelijke vergelijking. Dit zijn
rapportgegevens, geen opnieuw ingelezen ruwe export of onafhankelijke waarheid.

## GitHub bij aanvang

Open PR #221 bevat deze QA-branch richting main en blijft concept. Andere open
herstel-PRs (#219, #218, #216 e.a.) zijn geen toestemming om te mergen. PR #217
stelt verwijdering van TestLab voor en wordt niet geïntegreerd.
Op baseline 8751558d: portability run 41891542697 geslaagd; CI 41891542727
mislukt: vier `no-html-link-for-pages`-fouten op TestLab-regel 229 en de aparte
verplichte catalogusjob faalt wegens ontbrekende bestanden. QA-integratie
41891532832 faalt eveneens; oorzaak verder te inspecteren.
Build op baseline slaagde volgens CI-log, maar bewijst geen deployment.

## Foutregister

| ID | Prio | Bevestiging / oorzaak | Reparatie / bewijs |
| --- | --- | --- | --- |
| QA-01 | P0 | MKB-labels ontbreken in `labels.mjs`; branches worden letterlijk mismatch. Brede home_services/fitness/education bewijzen het subtype niet. | Expliciete alias- en branchregels; gerichte negatieve tests. Oud: 16/18 nieuwe tests falen; nieuw: gerichte suite 33/33, inclusief extra conflictcontrole. Geen engine- of praktijkkwaliteitclaim. |
| QA-02 | P0 | Exacte beauty-sector accepteert ook een als marketplace bevestigd websitetype. | Gedeelde verdict weigert platform als eigen dienstverlener; engineoorzaak Treatwell nog open. |
| QA-03 | P1 | Vier lintfouten bij twee interne TestLab-links. | `next/link` volgens geïnstalleerde Next-documentatie; volledige lintvalidatie volgt. |
| QA-04 | P0 | Bronexport fresh144-20f1effd en originele MKB-48-export ontbreken in checkout. | Geen baseline verzonnen; gates blijven actief. Zoeken in GitHub/geschiedenis voortzetten. |
| QA-05 | P0 | Feenstra ecommerce; eerdere bevroren set heeft ook fabrikant met nevenwinkel als ecommerce. Vermoeden: expliciete retailveto blokkeert eigen hoofdactiviteit. | Route 5994–6020 onderzocht; gerichte route-reproductie vereist vóór wijziging. |
| QA-06 | P0 | Treatwell hair_salon; SOAP health_wellness. Metadata/bronresponses niet beschikbaar. | Ground truth, eigen dienst versus bemiddeling en breed versus specifiek afzonderlijk onderzoeken. |
| QA-07 | P1 | Zes onbekenden: De Kas, Klaassen, SportCity, Hutten, Vermaat, Donkergroep. | Geen sector forceren; pagina-/renderbewijs nog verzamelen. |
| QA-08 | P0 | Hoge puntwaarden bij lage check-/paginadekking volgens MKB-rapport. | Scoreformule, toepasselijkheid productchecks en zichtbare onzekerheid onderzoeken; scores niet verhogen. |
| QA-09 | P1 | Tien MKB-fetchuitkomsten. | DNS: tandartspraktijkdenieuwegracht, ajloodgieters; verbinding: cityspa, akd, bbenbdehofnar, cateringgroepnederland; blokkade: waxingcompany, trainmore, hapjesaanhuis; timeout: hoekhoveniers. Werkelijke bereikbaarheid nog niet opnieuw vastgesteld. |
| QA-10 | P0 | Historische asr/bank, Rode Kruis/publicatie, Hartstichting/zorg, Zilveren Kruis/webshop, Welkoop/tegenstrijdigheid. | Regressies en oorspronkelijke waarnemingen controleren; niet als opgelost markeren. |
| QA-11 | P1 | Oude server, QA-auth, cataloguskeuze, voortgang/hervatten. | Bestaande tests inspecteren en browseracceptatie uitbreiden voor beide catalogi. |
| QA-12 | P1 | 404/subpagina, verwijzende URL, render-/TLS-/DNS-attributie. | Bestaande technische route-/unittests en nieuwe foutgevallen beoordelen. |
| QA-13 | P2 | 59 bestaande lintwaarschuwingen op baseline. | Niet onderdrukken; functionele reparaties hebben prioriteit. |

## Meetregels en betrouwbaarheid

Per categorie: correcte / beoordeelde gevallen; onbevestigd, niet uitgevoerd en
ontbrekende ground truth apart; dekking = beoordeeld / alle geplande gevallen.
Een juiste onthouding vereist onafhankelijk bewijs dat de input onvoldoende is.
Een netwerkfout is geen verkeerde sector; synthetische regressies zijn geen
onafhankelijke liveacceptatie. Niet-uitgevoerde en overgeslagen tests zijn geen
successen. SEO/GEO-sitescores meten websitechecks, geen scannerbetrouwbaarheid.

| Categorie | Correct / beoordeeld in nieuwe onafhankelijke meting | Onbevestigd / dekking | 90% gehaald? |
| --- | --- | --- | --- |
| Brancheherkenning | Niet gemeten | Geen volledige geverifieerde ground truth | Nee, niet aangetoond |
| Webshop/dienstverlener/platform | Niet gemeten | Idem | Nee, niet aangetoond |
| Technische foutdetectie | Niet gemeten | Idem | Nee, niet aangetoond |
| 404/interne links | Niet gemeten | Idem | Nee, niet aangetoond |
| Rendering/JavaScript | Niet gemeten | Idem | Nee, niet aangetoond |
| SEO | Niet gemeten | Semantische controle open | Nee, niet aangetoond |
| GEO | Niet gemeten | Semantische controle open | Nee, niet aangetoond |
| TestLab | Niet gemeten | Browserflows open | Nee, niet aangetoond |
| Rapportage/bewijs | Niet gemeten | Originele exports ontbreken | Nee, niet aangetoond |

## Werkfase 1–3: huidige ronde

Diagnose en eerste regressies/reparaties lopen. Gewijzigd: `scripts/testlab/labels.mjs`,
`tests/mkb48-sector-verdict.test.mjs`, `components/qa-testlab.tsx`, dit dossier.
De aliasregels veranderen geen websitecatalogus, scanengine, scoregewichten of
historische export. Een inhoudelijk fout cataloguslabel blijft handmatig te beoordelen.
Volgende stappen: regressies op routegedrag, score-/bewijsprojectie, volledige
unit/integratie/lint/typecheck/build en echte TestLab-browsercontrole; daarna
branchebewijs en bereikbaarheid verzamelen en nieuwe scans met commitprovenance.
Exacte herstelcommits en CI worden na validatie hieronder toegevoegd.

## Aanvullende bevindingen en reparaties in deze ronde

- QA-08: gereproduceerd dat 1/14 beoordeelde pagina's met globaal onvoldoende
  bewijs nog definitieve losse SEO/GEO-cijfers gaf. `dimension-score-display.mjs`
  projecteert nu beide dimensies als indicatie bij zo'n onvolledige steekproef;
  de punten en oorspronkelijke bewijsvelden veranderen niet. Nieuwe test vóór
  reparatie: 1 fout/2; gerichte scoreweergavesuite daarna: 6/6.
- QA-12: DNS in `renderFailureCode` kwam in `RENDER_BLOCKED` terecht; certificaten
  kregen slechts `RENDER_NETWORK`. Nu aparte `RENDER_DNS` en `RENDER_TLS` met
  passende uitleg, zonder blokkadeclaim. Nieuwe tests vóór: 5 fout/11; daarna
  gecombineerde render-/rapportkwaliteitssuite 29/29.
- QA-06: routefixture bevestigde beauty/hair_salon bij een expliciet platform voor
  onafhankelijke salons. Platformverklaring + bemiddeling wordt afzonderlijk
  beoordeeld, met negatieve controles voor eigen medewerkers, ketens, gidsen en
  salonsoftware. `website-profile.ts` presenteert de bevestigde platformactiviteit
  ook als marketplace. Concrete titel-/beschrijvings-/H1-regels worden nu bewaard
  in sectorbewijs; algemene bevestigingstekst alleen was niet controleerbaar.
- De echte diagnostische Treatwell-scan vond daarna **nog steeds hair_salon**.
  Dit is als falende praktijkcontrole vastgelegd, niet als geslaagde fix. De
  metadata van homepage en vergelijkingslijsten toonde zoeken + vergelijken/
  recensies + boeken bij salons. Een aanvullende generieke bemiddelingsregel
  behandelt dit patroon; eigen salonketens en software blijven uitgesloten.
  Nieuwe discovery-route vóór: 2 afwijkingen in 3 sites; daarna 0. Met de
  verwarmingsdienstcontrole: 4 sites, 0 afwijkingen. Dit zijn ontwikkelregressies;
  nieuwe echte scan op de definitieve herstelcommit blijft vereist.
- QA-05: de echte Feenstra-scan gaf nu unknown (niet opnieuw ecommerce), hoewel
  homepage en eigen onderhoudspagina concrete uitvoerende activiteit beschrijven.
  Generieke verklaringen van installatie/onderhoud van klimaatinstallaties worden
  nu herkend; leveranciers, software, opleiding, gidsen en bemiddelaars zijn
  negatieve controles. Twee unitgroepen en de routefixture slagen. Feenstra's
  cataloguslabel plumber is hiermee niet onafhankelijk als exacte branche bewezen.
- QA-11: navigatie gebruikt `next/link`; de serverpagina leest de asynchrone
  `searchParams` en geeft de catalogus als key/prop door. Zo wordt bij navigatie
  de juiste catalogus geladen en oude lokale componentstate niet hergebruikt.
  De bestaande stop-/hervat-browsertest hing op achterhaalde tekst `Klaar.`;
  de echte melding is `Klaar: ...`. Eerst time-out gereproduceerd, daarna de
  readinessassertie gecorrigeerd; alle vijf bestaande fases A–E slagen.

### Actuele HTTP-/DNS-observaties

`master-20261104/http-probes.json` bevat tijdstempels, URL, status, metadata,
DNS-observatie en HTML-hash voor 24 probleemdomeinen. Dit zijn losse primaire
HTTP-probes, geen 24 volledige scans of onafhankelijke branchebeoordelingen.

- DNS-resolutie mislukt hier voor tandartspraktijkdenieuwegracht.nl,
  ajloodgieters.nl en bbenbdehofnar.nl. Hun HTTPS-proxyweigering bewijst geen
  origin-403; registratie/definitieve geldigheid vraagt aanvullend bewijs.
- cityspa.nl, akd.eu en cateringgroepnederland.nl gaven 503 met de herkenbare
  `envoy://cloudflare_https_tunnel`-infrastructuursignatuur. Geen bewezen
  website-503, sectorfout of renderfout.
- thewaxingcompany.nl, trainmore.nl en hapjesaanhuis.nl gaven in deze probe 200.
  Hun historische blokkade wordt niet herschreven. hoekhoveniers.nl gaf 400;
  de oorspronkelijke timeout is daarmee niet verklaard of opgelost.
- Klaassen noemt expliciet horecamakelaardij; SOAP injectables, skin therapy,
  beauty en small surgery. SOAP als algemene health_wellness is dus niet zonder
  meer een verkeerde hoofdsector; een cosmetische/medische hybride vereist
  preciezere ground truth. Hutten noemt catering en culinaire dienstverlening;
  Vermaat horeca op maat. SportCity's metadata noemt lidmaatschap/groepslessen,
  Donker een natuurgerichte leefomgeving; volledige eigen activiteiten en
  representatieve pagina's blijven te beoordelen. Geen branches geforceerd.

### Echte diagnostische scanronde (geen definitieve acceptatie)

Drie volledige oorspronkelijke antwoorden en het manifest staan gecomprimeerd
in `master-20261104/diagnostic-*.json.gz`. SHA's van ongewijzigde responsebytes
staan in het manifest. De server meldde baseline-SHA 8751558d terwijl de werkboom
bewust nog wijzigingen had; manifest `dirty:true` en diff-hash voorkomen dat dit
als meting van een schone herstelcommit wordt voorgesteld. De eerste aanroep
zonder dashboard-vlag kreeg drie infrastructuurantwoorden; de juiste TestLab-
payload met `dashboard:true` leverde de onderstaande drie rapporten op.

| Site | Waarneming | Betekenis |
| --- | --- | --- |
| Feenstra | unknown; 10/20 pagina's beoordeeld | Hoofdactiviteitsherstel daarna toegevoegd; nieuwe scan vereist |
| Treatwell | beauty/hair_salon, ten onrechte eigen locatie | Discovery-/bemiddelingsherstel daarna toegevoegd; nieuwe scan vereist |
| Restaurant De Kas | hospitality/restaurant, medium 76; vier eigen bewijs-URL's | Huidige route kan restaurant bevestigen; geen volledige site-/scoregoedkeuring |

### Browser en catalogusintegriteit

`master-20261104/local-browser.json` registreert de echte lokale
browser→auth→catalogus→UI→export-flow: ongeautoriseerd 401, beveiligde lokale
cookie, alle 12 groepen met 4 sites, clientnavigatie 48→144→48 en geselecteerde
4/4-voltooiing/export. **Alleen scanresponses zijn gesimuleerd**, geen database
of echte klantwebsite aangeroepen door deze browsertest. De uitvoer bevat geen
paginaconsolefouten. `tests/manual/run-local-qa-browser.mjs` maakt een tijdelijke
loopbacksessie en wordt toegevoegd aan de CI-codejob; secrets blijven tijdelijk.
De bestaande stop-/hervat-browsertest blijft daarnaast actief.

`master-20261104/catalog-integrity.json` legt aantallen en SHA256 van alle
catalogusbestanden vast en vergelijkt bytes met 8751558d. Bestaande 144- en
MKB-48-catalogi zijn ongewijzigd. De nieuwe booking-mediation-fixture is expliciet
synthetisch ontwikkelmateriaal en vervangt geen catalogus/holdout.

De React-review controleerde hookafhankelijkheden, remount bij cataloguswissel,
serverauth, lokale opslagisolatie per catalogus/SHA en gewone toegankelijke links.
Geen authenticatievoorwaarde, SSRF-, TLS-, quota- of beveiligingscontrole uitgezet.
De automatisch door Next gewijzigde AGENTS.md-kop wordt behouden zoals het bestand
voorschrijft. Overige bekende sector-, fabrikant/nevenwinkel-, scoretoepasselijkheids-
en ground-truthproblemen blijven open. Geen 90%-certificering of deploymentclaim.

## Technische validatie van de herstelcode

`master-20261104/validation.json` bindt de gewijzigde bron-/testbestanden aan
SHA256 en bewaart hashes van de volledige gecomprimeerde testlogs.

- `npm test`: **1060 totaal, 1052 geslaagd, 0 mislukt, 8 expliciet overgeslagen**.
- Vier echte PostgreSQL-integraties apart: **4/4 geslaagd**, inclusief scans,
  foutattributie, opslag, save-races en dashboard/historie. Tijdelijke database
  draaide alleen op 127.0.0.1:15432 en is daarna verwijderd.
- Drie optionele historische volledige routereplays apart: **3/3 geslaagd**.
  Dit is bewaard invoermateriaal, geen nieuwe livecatalogusmeting.
- Lint: **0 fouten, 59 bestaande waarschuwingen**; TypeScript en build geslaagd.
- axe niet gebundeld en axe in echte Chromium: geslaagd.
- Nieuwe geïsoleerde lokale QA-browserrunner: geslaagd. Bestaande TestLab
  stop/hervat A–E op de lokale **productiebuild**: geslaagd.
- De extra trage timeoutprobe loopt afzonderlijk; wordt niet vooraf groen geteld.
- Verplichte catalogusgate opnieuw uitgevoerd: **terecht mislukt** met
  REQUIRED_INPUT_MISSING voor de twee genoemde bronnen. Ook de eerdere
  QA-integratieworkflow 41891532832 bleek op Lint te zijn gefaald.

Geen branchmerge of deployment uitgevoerd. Groene technische regressies tonen
herstel binnen hun testscope; alle negen onafhankelijke betrouwbaarheidsmetingen
blijven **niet aangetoond**, dus de uitrolbeslissing blijft NO-GO.

## 9 november 2026 — evidence-integrity-herstel, nog geen GO

Branch: `qa/codex-evidence-integrity-20261109`; baseline: `d5e16b037d83e3ae8e663f6b6e97e33ec52ecab5`. Claude's branch en bestaande catalogi blijven intact. Fasedossiers: [A](evidence-integrity-20261109/PHASE-A.md), [B](evidence-integrity-20261109/PHASE-B.md), [C](evidence-integrity-20261109/PHASE-C.md), [D](evidence-integrity-20261109/PHASE-D.md), [hercontrole](evidence-integrity-20261109/FOLLOWUP.md).

Gepubliceerd: `154b350` (responsebeleid), `0ebad0d` (geen sector als eigen bewijs), `452ecef` (uniforme onzekerheid), `4cc3283f` (strikte ruwe replay + bestaande CI op QA). De eerste CI op 4cc3283f faalde: 1215 tests geslaagd, 5 mislukt, 8 overgeslagen; lint en build geslaagd. Verplichte oorspronkelijke catalogus/baseline ontbreken nog; geen vervangende data of afgezwakte gate. Hercontrole repareert twee echte regressies en drie verouderde broncode-asserties; volledige eindvalidatie volgt.

Vastgelegde echte A/B-invoer: negen probleemsites, 372 netwerkmetingen. Beide motoren: nul ontbrekende replayrequests. Eerste vergelijking: sectorlabels en totaalscores gelijk; geen bewezen nauwkeurigheidswinst. Bewijsdekking De Kas steeg door N/A en is daarom geen bewijs van betere scanning; de applicabiliteitsbeslissing wordt aangescherpt en op dezelfde opname herhaald. Rendering staat in beide A/B-metingen uit; daarvoor volgt de echte lokale scanroute met sandboxed Chromium.

Betrouwbaarheid brancheherkenning, scanvolledigheid, foutdetectie en evidence: **nog niet onafhankelijk vastgesteld**. Onbevestigde labels worden afzonderlijk geteld; een geslaagde HTTP-request of syntactisch bewijsveld telt niet als inhoudelijk juiste scan. Geen categorie krijgt 9/10 op grond van deze ontwikkeltests. Uitrol: **NO-GO** totdat echte 144-resultaten, voldoende bewijs en onafhankelijke labels de doelstelling ondersteunen. Geen productie-deployment of merge naar main uitgevoerd.
