# RankFix QA-controle — 4 november 2026

Status: **gedeeltelijk gevalideerd; volledige live/browseracceptatie geblokkeerd**. Geen productiegeschiktheid of volledige 144-live-goedkeuring geclaimd.

## Repository en uitgangspunt

- Bestaande branch `qa/integration-mkb-144-20261102` hergebruikt, uitgangscommit `ce240ef827542f276fc67f3628cfe2336f663247`.
- Deze bevat alle `main`-commits (`3b108a45`), loopt 374 commits voor en bevat 12 commits boven de opgegeven `6950e510`.
- De P0-branch `fix/report-quality-generic-p1-p10-20261031` is al een ancestor; geen herhaalde integratie nodig. Bestaande timeoutattributie, sectorbewijzen, productpaginacontroles en consistente product/merchant-oordelen zijn al aanwezig.
- Open PRs gecontroleerd; er was geen PR voor deze integratiebranch. De oudere afzonderlijke herstel-PRs zijn niet blind gemerged.
- Geen scanengine-, score-, sector-, dashboard-, navigatie- of modulewijzigingen in deze reparatie. De live scanengine is exact die van bovenstaande uitgangscommit.

## Vijf aantoonbare infrastructuurfouten hersteld

1. `qa:144:analyze` kon op Windows en in paden met spaties, Unicode, `#` of `%` stilzwijgend niets doen: native paden worden nu via `pathToFileURL` vergeleken.
2. De analyse koos de alfabetisch hoogste SHA-export, die ouder kon zijn: selectie volgt nu `fresh144.json.currentCommit`; ontbrekende, ambigue of afwijkende exports veroorzaken een expliciete fout.
3. Ontbrekende volledige rapporten resulteerden in “geen overtredingen”: de claim-audit toont nu dekking en onvoldoende bewijs wanneer rapporten ontbreken. Dit is interne rapportconsistentie, geen verklaring dat alle websiteonderdelen onderzocht zijn.
4. De terminalrunner miste de bestaande herstelregel van TestLab voor herhaalde `SCAN_TIMEOUT`: hij gebruikt nu dezelfde regel. Databaseproblemen blijven infrastructuurproblemen en worden niet aan de website toegeschreven.
5. Eén overgebleven pending infrastructuurfout kon exitcode 0 opleveren: de QA-opdracht eindigt nu met exitcode 1 zolang zulke resultaten openstaan.

De vijf nieuwe regressietests falen alle vijf op de ongewijzigde uitgangsversie; zie `acceptance-20261104/regressions-before.tap`. De gerichte nieuwe/bestaande tests slagen alle elf; zie `regressions-after.tap`. De offline runner-test gebruikt expliciete mocks en wordt niet als live websitebewijs gebruikt.

De bestaande Windows/Linux-CI draait nu ook op pushes naar deze QA-branch. De integratie-CI voert daarnaast expliciet `npm run typecheck` uit. Geen checks uitgeschakeld of afgezwakt.

## Automatische controles

`npm ci` met een tijdelijke schrijfbare npm-cache is geslaagd. De eerste installatiepoging kon de standaardcache buiten de werkruimte niet schrijven. De eerste `npm test` binnen het beperkte processandbox gaf testprocesfouten; de herhaling in de toegestane netwerkomgeving slaagde met 1003 geslaagd, 8 overgeslagen, 0 mislukt. Die eerste pogingen zijn geen bewezen productfouten.

`npm run typecheck`, `npm run lint` en `npm run build` zijn geslaagd. Volledige afsluitende testuitvoer en GitHub-controles worden naast dit rapport opgeslagen. De bestaande skips blijven zichtbaar; niet-uitgevoerde echte database-/integratietests zijn geen geslaagde controles.

## Werkelijke live run — gedeeltelijk

`npm run qa:144` is uitgevoerd tegen de lokale ontwikkelserver op `127.0.0.1:3002`, met de gecontroleerde scannercommit, een tijdelijke lokale QA-sessie en de echte fresh144-catalogus van 144 unieke domeinen. Geen replay of simulatie. De volledige responses zijn als `.json.gz`, samenvatting, CSV en bewijsexport opgeslagen in `acceptance-20261104/live-partial/` en in de lokale `qa-results/fresh144-latest/`.

De run is na 20 afgeronde pogingen onderbroken wegens de onvolledige browseromgeving:

- 18 API-scans met rapport; dit betekent niet dat ieder websiteonderdeel volledig onderzocht is.
- 1 blokkade: `https://basf.com/`, origin HTTP 403, `HTTP_BLOCKED`; geen ontbrekende website en geen score. Verwijzende pagina niet van toepassing (start-URL). Ernst: scanbeperking; oorzaak: toegang geweigerd, exacte WAF-regel onbekend. Oplossing: eigenaar kan RankFixBot toestaan en opnieuw laten scannen.
- 1 overige website-uitkomst: `https://kuleuven.be/`, origin HTTP 503, `HTTP_SERVER_ERROR`; geen score. Verwijzende pagina niet van toepassing. Ernst: beschikbaarheidsprobleem tijdens de meting; tijdelijke aard en exacte oorzaak onbekend. Oplossing: later opnieuw controleren en bij herhaling server/CDN-logs onderzoeken.
- 0 definitieve timeouts; 124 sites niet getest. Geen 144/144-voltooiing geclaimd.

`npm run qa:144:analyze` is uitgevoerd. Binnen de 18 beschikbare rapporten: 6 exact, 9 equivalent, 3 onbekend/onbevestigd, 0 vastgestelde mismatch volgens de voorgestelde cataloguslabels. De labels zijn niet onafhankelijk geverifieerd. NXP wordt aantoonbaar als halfgeleiders/elektronica herkend; Natuurmonumenten als nonprofit. CBS, Kadaster, Leen Bakker, rijscholen en de overige ongeteste sectoren zijn hiermee niet live afgetekend.

SEO/GEO-bewijsniveau: 1 volledig, 10 voorlopig, 7 onvoldoende. Volledige responses beschikbaar voor alle 18 gerapporteerde successen; de interne claim-audit vindt daarin geen overtredingen. Dit is geen bewijs van volledige browser-, checkout-, retour-, bezorg- of alle pagina-/linkdekking. De exports bevatten de onderzochte pagina's, checks en beperkingen. Geen gemiddelde score als definitieve productkwaliteit gepresenteerd.

## Blokkades en veilige grens

Chrome start binnen de scanomgeving niet betrouwbaar: `BROWSER_UNAVAILABLE`, `chrome_crashpad_handler: --database is required`. Een afzonderlijke browserprobe meldt bovendien TLS-fout `net::ERR_CERT_AUTHORITY_INVALID` (`-202`) voor de omgevingsproxy. Dit zijn omgevingsbeperkingen; geen bewijs dat de onderzochte websites ontbreken of defect zijn.

Automatische goedkeuringscontrole heeft het toevoegen van de omgevingsproxy-CA aan de blijvende NSS-truststore geweigerd: dit zou het certificaatvertrouwen buiten deze run wijzigen zonder expliciete toestemming. Die actie is niet uitgevoerd; TLS-validatie is niet uitgezet en de weigering is niet omzeild. Voor die specifieke truststorewijziging is expliciete toestemming nodig; een vooraf correct ingerichte browseromgeving kan de blokkade ook wegnemen.

Daarna zijn een nieuwe volledige 144-live-run en browseracceptatie nodig op de definitieve QA-commit, inclusief CBS, Kadaster, Leen Bakker en webshop-/checkoutdekking. Echte databaseflows vereisen een geschikte geïsoleerde databaseconfiguratie. Geen merge naar main zolang acceptatiebewijs en vereiste controles onvoldoende zijn.

## Bewijs en herhaalbaarheid

Zie `acceptance-20261104/provenance.json` voor catalogus-SHA256, Node-versie en scannercommit, `sha256.json` voor de bewaarde bestanden en `live-analysis.md` voor de daadwerkelijke gedeeltelijke analyse. De lokale QA-token is gecontroleerd afwezig in de gepubliceerde bewijsbestanden.

## Afsluitende controle en publicatie

De definitieve lokale testsuite heeft 1012 tests: **1004 geslaagd, 0 mislukt, 8 overgeslagen**. Zie `acceptance-20261104/full-tests-final.log`. Typecheck, lint en build zijn geslaagd. De reparatiecommit is `1c3798429e73b1effb55b5ce88c07b5b33585ef9`. De live meting blijft expliciet een gedeeltelijke run van de hierboven genoemde scannercommit, niet een volledige run van de nieuwe HEAD.

Repository-rulesets waren leeg. Het uitlezen van branch protection voor main werd door GitHub geweigerd met HTTP 403 (`Resource not accessible by integration`), zowel via de connector als de geconfigureerde CLI. Verplichte mergevoorwaarden zijn daardoor niet volledig bevestigd; geen merge toegestaan op basis van deze controle. De nieuwe PR blijft concept voor acceptatie.
