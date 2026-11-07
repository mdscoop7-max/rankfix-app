# P0-correcties na onafhankelijke review van PR #219

Basis: `407b6283c98237fb3c379a9b7633e789cf6ab99c`, branch
`fix/report-quality-generic-p1-p10-20261031`. PR #219 blijft draft.
Geen main-merge, deployment, automatische publicatie, live websitescan of 144-run.
De eerdere review, exacte bronlocaties en scenario's waren beschikbaar; de eigenaar
hoefde die niet opnieuw aan te leveren. Lokale reviewkopie bleef intact.

## Uitkomst en blokkerende punten

De 14 oorspronkelijke aanvullende acceptatiecontroles gingen van **3 geslaagd /
11 niet gehaald naar 14 geslaagd / 0 niet gehaald**. De bestaande routematrix blijft
**134/134** in both-, SEO- en GEO-modus; zes rendering-stubscenario's blijven groen.
Dit is offline bewijs en geen onafhankelijke certificering van echte websites.

CI op codecommit `384a8bf5917e43d70b39b4cba94df7330e91a3d6`:
[run 41425159621](https://github.com/mdscoop7-max/rankfix-app/actions/runs/41425159621).
**460 tests geslaagd, 0 gefaald, 1 overgeslagen** (echte PostgreSQL-scanintegratie,
RF_PG_TEST_URL ontbreekt). TypeScript en productiebuild slagen; de dependency-audit
meldt **0 kwetsbaarheden**. Lokaal: 46 gerichte tests geslaagd, route-acceptatie
18/18 en de oorspronkelijke 14 acceptatie-asserties 14/14.

De totale CI is bewust **rood**, met twee echte open blokkades:

1. **82 lintfouten, 48 waarschuwingen**. Niet uitgezet, genegeerd of met disable-regels
   verborgen. De historische 83 fouten zijn onderzocht; één bestaande any is
   verwijderd. De resterende UI/effect- en typeproblemen zijn niet als opgelost
   gepresenteerd. Een brede UI-herschrijving zonder browserverificatie is vermeden.
2. De nieuwe echte 144-catalogus en de exacte historische export ontbreken. De
   verplichte aparte cataloguscheck faalt gesloten op deze ontbrekende invoer.

Deze branch is dus nog niet vrijgave-/mergeklaar. Geen 9/10-claim.

## Eerst rood, daarna groen

| Probleem | Vóór correctie | Na correctie | Commit(s) |
| --- | --- | --- | --- |
| AutoFix-merge | Directe merge-aanroep zonder bewezen vereiste checks; bronregressie faalt | Veertien scripted-GitHub-scenario's slagen: missing/failure/skipped/neutral/pending/stale/unreadable/incomplete/wrong app/bypass/head changed/content changed blokkeren. Positieve controle vereist twee identieke lezingen en SHA-precondition. | `d5a5bc3` |
| Redirectcookies | Reproductie lekt fake cookie van first.co.uk naar second.co.uk; test faalt | Geen forwarding naar andere host, ook niet www/sibling/co.uk/com.au. Zelfde-host-cookie, Path, Secure, Max-Age/verloop en wissen getest. | `8f8619a` |
| Noindex/canonical | Googlebot-noindex, latere robots-noindex en twee conflicterende canonicals geven PASS | Alle toepasselijke tags worden verzameld; geen false PASS. Geldige ongequote attributen worden ook gelezen; equivalente dubbele canonicals geven geen conflict. | `194bc47`, `3b774c7` |
| Bestelknop/sample/reviews | Delegated click-handler, betaalde sample en verschillende reviewentiteiten krijgen onterechte waarschuwing/aftrek | Geen bewezen defect bij mogelijke script-handler. Bare Sample/Demo geen testbewijs. Reviews alleen binnen expliciet gekoppelde zichtbare entiteit; bestRating correct gebruikt. Positieve scoped reviewcontradictie blijft getest. | `194bc47` |
| Dubbeltelling | Eén geraakt beeld wordt als 2/2 gemeld; hoofd-URL telt tweemaal voor bewijsniveau | Union per image-element; losstaande verschillende fouten blijven twee elementen. Fetched en assessed apart; geen +1; 1/4 beoordeeld is insufficient. | `194bc47` |
| Klantmarkt versus eigen sector | Consultancy voor goede doelen wordt nonprofit; infrastructuursoftware wordt bouw | Beide negatieven correct, echte goede doelen/bouwers blijven herkenbaar, ook met software als nevenactiviteit. | `194bc47`, `494add4` |
| Dependency-/lint-gates | Audit critical/high en 83 lintfouten maken CI niet rood | Lockfile-gebonden installatie, bijgewerkte versies, audit 0 kwetsbaarheden. Lint is blokkerend en meldt de resterende 82 fouten. | `30c6b33`, `384a8bf` |

`72d9809` legt de eerste regressies en het rode resultaat vast. De vijf nieuwe
voor-fix-tests falen alle vijf op de ongewijzigde bron. De drie CI-safetytests falen
op de oorspronkelijke snapshot en slagen na de wijziging. Baseline-/afterlogs en
routebewijzen staan in `docs/qa/p0-20261102/`.

De oorspronkelijke reviewasserties zijn niet afgezwakt om 14/14 te krijgen.
Voor de bestaande positieve reviewfixture is juist extra echt-scopebewijs in de
fixture toegevoegd (dezelfde entity-id op JSON-LD en zichtbare reviewcontainer).
De verwachte waarschuwing en verschillende cijfers zijn behouden. Twee oude
linkhelperasserties die 403 als OK en 503 als bewezen broken accepteerden zijn
naar de gevraagde onbevestigde status gecorrigeerd; 404 en echte 500 blijven
positieve foutcontroles. Geen tests uitgeschakeld.

## Implementatie en grenzen

### AutoFix

`lib/autofix-merge-gate.ts` vervangt het directe mergepad in
`app/api/github/fix/route.ts`. `lib/merge-policy.ts` hergebruikt de eerder ontwikkelde
strikte beleidscontrole: GitHub moet vereiste checks daadwerkelijk afdwingen,
met gebonden producer-app en zonder bypassmogelijkheid voor deze identiteit.
Onleesbaar/ontbrekend beleid is geen toestemming. `lib/merge-check-evidence.ts`
controleert volledige lijsten, juiste SHA, conclusies en onduidelijke reruns.

Twee beoordelingen moeten overeenkomen: head/base, policy, files en goedgekeurde
blob. `PUT /merge` bevat de exacte bewezen head-SHA. De tests gebruiken een fake
GitHub; er is geen echte PR gemerged en geen derde website gepubliceerd.

### Cookies

`lib/redirect-cookies.ts` is bewust een conservatieve **hostgebonden scan-jar**.
Er is geen laatste-twee-labelsregel of domeinuitzondering. Daardoor kan geen cookie
naar een ander registrabel domein gaan, ook niet onder onbekende publieke suffixes.
Attribuutchecks en een begrensde jar blijven actief.

**Compatibiliteitsgrens:** cookies die een parent-/sibling-Domain nodig hebben
worden niet verruimd en kunnen daardoor op sommige www-/subdomeinflows ontbreken.
Dit is geen volledige browser/RFC6265-implementatie. Ruimer delen vereist eerst een
complete, actuele PSL-implementatie met regressies; een handmatige suffixlijst
zou juist opnieuw onveilige uitzonderingen introduceren. Die beperking is niet als
bewezen websitefout gescoord. Dependency-opvraag via de lokale netwerkproxy lukte
niet; er is geen proxy omzeild.

### Scanbewijs

`lib/head-directives.ts` verzamelt canonicals en robots-/crawlerdirectives vóór
beoordeling. `lib/image-metrics.ts` bewaart de union van getroffen image-elementen.
`lib/audit-score.ts` en de route onderscheiden opgehaald en inhoudelijk beoordeeld.
De bestaande scoregewichten zijn niet verhoogd.

Lege H1's worden niet langer stil weggefilterd achter de bewering "precies één";
meerdere H1's blijven niet automatisch een SEO-fout. Headingaantallen sluiten H1 uit
bij de H2–H6-telling. `lib/metadata-alignment.ts` geeft bij een zeer duidelijke,
meervoudig ondersteunde onderwerptegenspraak een **onbevestigde beoordeling** en
geen automatische foutaftrek of contentwijziging. Dit is geen volledige semantische
beoordeling van alle headings/metadata.

`lib/content-integrity.ts` behandelt mogelijke gedelegeerde/externe JS-acties niet
als bewezen stuk. Er is geen extra uitgebreide rendering gebouwd. Samples/demo's
zijn niet op hun naam alleen onjuist. Verdachte testinhoud leidt tot een
niet-gescoorde verificatieaanwijzing; alleen na bevestiging mag verwijderen/noindex
worden overwogen. Reviews worden niet meer globaal tussen willekeurige entiteiten
vergeleken. Zonder expliciete entity-koppeling wordt geen tegenspraak beweerd.
Dit is conservatief en kan ongestructureerde echte tegenstrijdigheden missen.

403/429/503 zijn zonder aanvullende context onbevestigd, geen bewezen goede link
of automatisch bewezen SEO-fout. Brede overige link-/bron-/schema-auditgaten uit de
review zijn hiermee niet allemaal opgelost.

### Sectoren

`lib/organisation-identity.ts` leest eigen provider-/klantmarktdeclaraties in de
organisatiekop, zodat een consultancy of softwareprovider niet door diens publiek
wordt vervangen. Echte goede doelen/bouwers die in hun description software als
nevenactiviteit noemen blijven behouden. Geen domeinnamen of bedrijfsnamen zijn
in productieherkenningsregels toegevoegd. De volledige 134-case regressiematrix
blijft gelijk; dit bewijst niet universele sectorjuistheid op nieuwe echte sites.

## Onderzoek lint en dependencies

| Lintcategorie | Voor | Na |
| --- | ---: | ---: |
| TypeScript no-explicit-any | 58 | 57 |
| React set-state-in-effect | 17 | 17 |
| Next no-assign-module-variable | 6 | 6 |
| no-require-imports | 1 | 1 |
| prefer-const | 1 | 1 |
| **Totaal** | **83** | **82** |

Bestandsverdeling staat in `p0-20261102/lint-analysis.json`. Veel schuld zit in de
scanroute, het auditrapport en clientcomponenten. Resterende any's vragen echte
data-contracten; React-effecten vragen gerichte browser-/state-regressies. Geen
massale typecasts, eslint-disable of uitschakeling om groen te worden.

Next/eslint-config-next zijn vastgezet op 16.4.3, Puppeteer/Core op 25.16.0, met
zod 4.6.6 override. De lockfile komt van de reeds gevalideerde QA-versies en is
op root-declaraties gecontroleerd; de daadwerkelijke `npm ci`, audit en build zijn
vervolgens in GitHub CI geslaagd. De geïnstalleerde productie-audit meldt nul
kwetsbaarheden. Dat is geen garantie dat alle toekomstige advisories of
applicatierisico's afwezig zijn.

## Nieuwe 144-TestLab blijft verplicht, maar ontbrekende data is geen PASS

`tests/fixtures/testlab-mkb/requirements.json` bevat exact de afgesproken verdeling:
30 webshop/dropshipping, 20 vaklieden, 12 bouw/installatie, 10 kappers/beauty,
10 fitness, 10 rijscholen, 10 advocaten, 10 accountants, 8 payments/fintech,
8 horeca, 8 fysio/zorg en 8 vastgoed: samen 144.

`lib/testlab-catalog-validation.mjs` en `scripts/testlab/validate-mkb-catalog.mjs`
controleren aantallen, genormaliseerde hostduplicaten, baseline-overlap, opgegeven
redirectaliases en gekoppeld bewijs. Bewijsbestanden moeten bestaan en hun hash
moet overeenkomen. Structureel geldige JSON is geen onafhankelijk bewijs van
website-existensie of sectorjuistheid: menselijke bronreview blijft verplicht en
`activationAllowed` blijft false.

De aparte CI-check faalt nu terecht: de echte catalogus en
`qa-input/rankfix-testlab-144-fresh144-20f1effd.json` ontbreken. Er zijn geen 144
verzonnen kandidaten opgenomen en geen nuloverlap of actuele bereikbaarheid
geclaimd. De validatie normaliseert hosts/www en opgegeven aliases; registrabele
site-equivalentie en onbekende redirectaliases vragen aanvullende review.

De oorspronkelijke Kaplounge-, Fysiotherapie Centrum Amsterdam- en Bart uw
Makelaar-audits zijn nog niet aangeleverd/gevonden en dus niet als verwerkte,
geslaagde site-regressies gepresenteerd. De bestaande oude resultaten zijn
ongewijzigd bewaard. Geen nieuwe dataset met dezelfde-websites-baseline verward.

## Validatiebeperkingen en vervolg

Lokale volledige tests in één proces leveren geen normale isolatie: subprocessen
worden geblokkeerd (`spawnSync EPERM`) en een gedeelde modulecache kan de DNS-stub
overslaan. Dat is niet als groen geteld. De normale, geïsoleerde GitHub-suite op de
exacte code heeft 460 passes, nul failures en één expliciete database-skip.
Los gestarte routematrices, 46 gerichte tests en de oorspronkelijke 14 controles
zijn daarnaast lokaal geslaagd. Renderer en fetch zijn in de matrices gestubd.

Niet afgerond: 82 lintfouten; echte 144-catalogus/oud exportbestand/handmatige
audits; echte browser- en PostgreSQL-scanintegratie; volledige semantische
SEO/GEO-/heading-/schema-/afbeeldingsbeoordeling; universele internationale
herkenning; cookie-sharing over hosts. Geen kwaliteitscijfer 9/10 toegekend.

Vervolgprioriteit: lintschuld gericht oplossen met UI-/contracttests en de echte
bronbestanden verwerken. CI mag pas groen worden wanneer de echte blokkades zijn
opgelost, niet door gates te versoepelen. PR blijft draft en er is geen toestemming
voor main-merge, deployment of publicatie gebruikt.
