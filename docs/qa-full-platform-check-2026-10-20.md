# RankFix — brede alleen-lezen platformcontrole (20 oktober 2026)

**Opdracht:** controleer de hele RankFix-website, evidence-motor, scan-engine, dashboard, AI en Fix-knop. **Geen reparaties/merges/productiewijzigingen.** Technische beoordeling op basis van GitHub-broncode, Vercel-deployment en niet-mutatieve GET-controles, plus zeven eerdere handmatige live regressiescans. **Geen ingelogde browser-end-to-end-test, geen echte GitHub-fix of betaaltest uitgevoerd.** Niet presenteren als volledig functioneel afgetekend.

## Scope en uitgangspunt

- **Productie** `https://rankfix-app.vercel.app/`: Vercel READY, op commit `ab04e0ca35f0d6e901e070a055c3c117a3e9e007` (`fix/engine-primary-identity-evidence-20261015`). GET /, /nl, /dashboard, /dashboard/scan, /dashboard/github, /dashboard/history, /pricing gaf HTTP 200. Dat verifieert de HTML-routes, **niet** ingelogde interacties of een werkende Fix-knop.
- **DB-health** `/api/health/db`: HTTP 200 met `database:connected` op het controlemoment. Geen bevoegdheid/gebruikerstoestemming voor het lezen of veranderen van klantdata gebruikt.
- **Engine-updates** staan op draft PR [#174](https://github.com/mdscoop7-max/rankfix-app/pull/174), head `b2c3b5d...`, **niet** in productie. Afzonderlijke afgeschermde QA-preview voor de zeven hertests: `qa/pr174-dbfree-live-20261020`.
- Tests Amsterdam, UMC Utrecht, UvA, Coolblue, KPN, CERN en Monumenten zijn via de gebruiker vergeleken; [detailverslag](./qa-pr174-live-herscans-2026-10-20.md). Ze zijn **korte samenvattingen**, geen originele JSON+HTTP-verificatie.

## Vastgestelde code- en productrisico's

### P0/hoog — GitHub Fix kan automatisch mergen na één voorstelgoedkeuring
- Productieroute `app/api/github/fix/route.ts`, regels **718–736**, maakt PR en voert onmiddellijk `PUT /repos/{repo}/pulls/{number}/merge` uit (squash) als GitHub dit toestaat. Er is dus **geen aparte gebruikerstoestemming voor het mergen ná PR-creatie**. Branch policies kunnen verhinderen, maar zonder vereiste checks/reviews kan een fix direct in de gekozen basisbranch landen. Dit is codegedrag, geen aangetoonde ongeautoriseerde merge.
- `app/dashboard/github/page.tsx`: NL/EN copy beschrijft automatische merge, terwijl andere taalversies (o.a. DE/FR) zeggen dat er niets automatisch wordt gemerged. `db/github-fix-engine.md` zegt ook 'never auto-merges', achterhaald ten opzichte van code. Harmoniseer verwachtingen.
- **Advies:** releasebesluit nodig: standaard **PR-only** met expliciete aparte mergegoedkeuring, door CI vereiste kwaliteitschecks en rollbackplan. Ten minste consistente meertalige tekst vóór uitbreiding. Test de hele volgorde preview → goedkeuring → PR → opt-in merge → deploy → live verificatie, met een geïsoleerde testrepo.

### P1 — Onvoldoende strenge Fix-hercontrole kan onterecht PASS geven
- `lib/recheck.ts` **30–32**: voor `SOCIAL_METADATA_INCOMPLETE` zijn alleen `og:title` en `og:description` vereist, **niet `og:image`**. Een oorspronkelijk uitsluitend op `og:image` gebaseerde warning kan daarom bij afzonderlijke recheck ten onrechte PASS worden, terwijl afbeelding nog ontbreekt.
- `lib/recheck.ts` **34–35**: `STRUCTURED_DATA_MISSING` is PASS zodra er enig `jsonLdTypes` is; ook een generiek `Intangible` kan dus volstaan terwijl een sectorpassend `Hospital` of `CollegeOrUniversity` ontbreekt. Hercontrole moet exact het oorspronkelijke issue en sectorspecifieke type/evidence gebruiken.
- `lib/recheck.ts` **36–43**: canonical-check vereist self-reference na simpele slash-normalisatie; audit-engine laat terecht soms een beredeneerde canonieke URL toe. Check op overeenstemming met issue-semantie.
- Gebruikt door `app/api/recheck/route.ts` (GET van live HTML op POST), niet automatisch bewijs van onjuiste status in **alle** scan-gebaseerde verificatiepaden. Laat unit- en integratietests onderscheid maken tussen de hercontrole-endpoint en de aparte nieuwe-scan-statusmachine.

### P1 — Dashboard en historie verbergen score-onzekerheid
- `app/api/history/route.ts` **12–17** retourneert losse SEO/GEO/totaalcijfers, maar geen gewogen bewijsdekking, scoreband en kwalificatie van het opgeslagen scanresultaat.
- `app/dashboard/page.tsx` **103–108** toont score en SEO/GEO als kale getallen. `app/dashboard/history/page.tsx` **34–35** toont dezelfde cijfers en grafiek zonder dekking/range; die pagina leest enkel de afgeslankte history API.
- De uitgebreide audit en scan-UI hebben wel evidence-kwalificatie via `lib/score-qualifier.ts`. Daardoor ontstaan **inconsistente schermen**: de KPN-hertest liet 99/99 bij 68% bewijsdekking zien; CERN 74 bij 51%.
- **Advies:** geef in history-API bewijsdekking, niveau, bandbreedte en kern-vs-steekproef mee, en toon 'voorlopig/indicatie' overal; deel-SEO/GEO afzonderlijk kwalificeren. Zorg dat de UI op lage dekking niet als definitieve kwaliteitsgarantie oogt.

### P1 — Fix-knop niet functioneel afgetekend
- De auditpagina `app/dashboard/audit/[id]/page.tsx` **26–37** toont de GitHub Fix-link alleen bij `FAIL`/`WARNING`, voldoende bewijs, toegestane policy, passende `issue_id` en niet `fix_category C`; dit is positief.
- `app/api/github/fix/route.ts` **394–454** controleert login, plan, eigen scan, een bestaand issue, confidence en opgeslagen evidence. Hij vereist een diff-preview, opgeslagen hash, expiry en blob-controle vóór publicatie (**540–561**); dit zijn sterke guardrails.
- `app/api/github/fix/route.ts` **402** weigert de Fix Engine bij `plan_code=free`. De productie-interne QA-uitzondering voor **scans** verleent niet automatisch betaalde Fix-toegang. Dashboard kan toch een Fix-route tonen; test expliciete upgrade-/toegangsboodschap voor Free versus betaalde accounts.
- **Niet live getest:** GitHub OAuth, repo-koppeling, bestandsselectie, diff-validatie, AI-provider, echte PR-creatie, automatische merge, e-mail/planquota, terugmelding 'opgelost' na nieuwe scan. Test uitsluitend op geïsoleerde preview + testrepo, zonder automatische merge naar een echte klantwebsite.

### P1/P2 — Evidence-engine en scanbereik blijven beperkt
- `lib/scan-evidence.ts` legt bronsoort, confidence en capaciteitssignalen vast; `lib/audit-score.ts` sluit `UNABLE_TO_CONFIRM` uit van aftrek, heeft rootCause-deduplicatie en bandbreedte. Sterke ontwerpkeuzes, maar niet elk outputveld is door onafhankelijke bronnen bewezen.
- Handmatige zeven-test-matrix: Amsterdam verbetert 77→82, robots/sitemap waarschuwingen verdwijnen/veranderen naar onbevestigd; UMC/UvA tonen sectorspecifiekere adviezen. Coolblue blijft dezelfde og:image-warning tonen; KPN 68% en CERN 51% bewijsdekking ongewijzigd. Kijk naar ruwe HTML en JSON vóór 'bug opgelost' aftekenen.
- Sector **UvA** blijft hoofdcategorie 'Onderwijs & Opleiding' in plaats van universiteit/hoger onderwijs; financiële verzekeringsproducten en vastgoedverhuur vereisen subtype-checks. Onderzoek dubbele oorzaak bij schema en Organization/WebSite.
- Betrouwbaarheid: `/api/scan` gebruikt 15s per hoofdophaalpoging plus retry. Vercel-logs lieten bij PostNL meerdere `FETCH_TIMEOUT`-resultaten zien; Funda/Huislijn leverden `CHALLENGE_OR_INTERSTITIAL`. De getoonde foutmelding verwijst ten onrechte alleen naar URL-controle. Onzichtbare U+2060 in een geplakt adres veroorzaakte Vesteda-redirectlimiet. Voeg inputvalidatie/duidelijke status toe zonder WAF te omzeilen.

### P2 — Overige productcontrole
- De publieke homepage, taalpagina, prijsinformatie en dashboardroutes retourneren HTML (200); **client-side login, responsive/mobile, toegankelijkheid en links/knoppen zijn niet met een echte browser geautomatiseerd getest**.
- API-afscherming uit bron: /api/history, /api/recheck en /api/github/fix verifiëren `getCurrentUser` en eigen scans. Deze codecontroles zijn geen vervanging voor geautomatiseerde autorisatie-/CSRF-, quota- en IDOR-tests.
- `app/api/ai-fix/route.ts` accepteert clientcontext en `issue_status` om advies te genereren, terwijl GitHub-publicatie juist opgeslagen scanevidence vereist. Maak het verschil 'advies vs geverifieerde fix' expliciet en test dat AI-advies nooit ongecontroleerd als bewezen codewijziging geldt.
- Twee dashboard-UI-tests faalden volgens Claude op de basisbranch; huidige controle heeft testuite **niet zelfstandig uitgevoerd**. CI/deployment READY bewijst geen eindgebruikersflow.
- `lib/rankfix-health.ts` gebruikt voor deploymentcheck `process.env.RENDER`, terwijl de hoofdapp op Vercel staat. Controleer of health-dashboard hierdoor een misleidende oranje status geeft.
- Controleer meertalige copy, help, consent/privacy, authenticatie, onboarding, planlimieten, historiedeletion, PDF/export, GitHub-koppeling en echte gebruikscases op desktop/mobiel vóór commerciële lancering.

## Acceptatiechecklist voor Claude, zonder productie-muting

1. Veiligheidsbesluit over automatische merge en consequent taalgebruik; aparte expliciete mergecontrole of PR-only, plus echte CI-gates.
2. Unit/integratietests voor `SOCIAL_METADATA_INCOMPLETE` met alleen ontbrekende `og:image`, sectorgebonden JSON-LD (`Intangible` vs `Hospital`/`CollegeOrUniversity`), canonical uitzonderingen en opnieuw-scannen.
3. Synchroniseer score-onzekerheid tussen scan, volledig rapport, dashboard, historiegrafiek en API; check 51%, 68%, 85%, 90%, 98% dekking.
4. Reproduceer originele zeven QA-cases met raw/gerenderde HTML+headers en JSON (geen valse statusclaims), plus sectorcases verzekeringen, verhuur en logistiek.
5. Isolatie-test van Fix-knop voor Free, betaald, verlopen scan, onbekend issue, ongeldige repo, verlopen preview, gewijzigde blob, toegestane PR, merge geblokkeerd, live nog niet zichtbaar, live bewijs bevestigd. Geen echte productierepo muteren.
6. Volledige ingelogde mobiele/desktop klikroute + screen-reader/toegankelijkheid + talen + privacy en foutmeldingen; draai bestaande en nieuwe CI-tests tot groen.
7. Geen merge van PR #174 of wijzigingen aan main/productie zonder nieuwe eigenaarstoestemming en onafhankelijke acceptatie.

**Algemeen oordeel:** codearchitectuur en basiswebsite tonen goede uitgangspunten, maar **geen volledige goedkeuring** van evidence-motor, complete dashboard of Fix Engine. De auto-merge en te zwakke afzonderlijke recheck verdienen eerst aandacht. Bovenstaande bevindingen zijn overwegend **broncodecontrole**, geen volledige interactieve exploit-, betaal- of klantaccounttest.

**Provenance:** productiebasiscommit `ab04e0ca35f0d6e901e070a055c3c117a3e9e007`; PR #174 blijft draft. Dit document staat bewust alleen op een QA-branch. Geen broncode of productie aangepast.
