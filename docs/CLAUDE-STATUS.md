# RankFix — Claude voortgangslog

> **Centrale overdracht tussen Claude en ChatGPT.** Werkbranch: `feat/sector-motor-3-1-universal-evidence-arbiter-20261010`. Dit document is uitsluitend bedoeld voor technische voortgang, testresultaten en overdracht. **Geen geheimen, wachtwoorden, tokens, database-URL's, klantgegevens of persoonlijke informatie opnemen.** Deze repository is openbaar.

## Hoe we dit gebruiken

- **Claude:** werk dit bestand bij tijdens de lokale tests en voeg een volledig verslag toe bij de volgende **door de eigenaar goedgekeurde** push naar **uitsluitend** de bestaande 3.1-testbranch.
- **ChatGPT:** lees rechtstreeks dit bestand op GitHub en vergelijk de gerapporteerde resultaten met commits, tests en Vercel. Kopiëren en plakken in de chat is dan niet nodig.
- **Tussentijdse, langere testupdates zonder codepush:** gebruik [GitHub-issue #106](https://github.com/mdscoop7-max/rankfix-app/issues/106). Vermeld hier de link en datum wanneer het log bij een goedgekeurde push wordt bijgewerkt.
- **Laat nooit een status op `Geslaagd` staan zonder werkelijk uitgevoerde test.** Onderscheid `Geslaagd`, `Mislukt`, `Niet uitgevoerd` en `Niet te bevestigen`.
- Bij een conflict met de lokale branch: **haal de nieuwste branch op en integreer deze veilige documentatiecommit**, zonder commits te verwijderen, de geschiedenis te forceren of `main` te wijzigen.
- Een logbestand dat op GitHub staat, is geen automatische koppeling naar een lokale Claude-sessie. Alleen gepubliceerde updates zijn voor ChatGPT zichtbaar.

## Actuele stand

| Onderdeel | Status / bron |
| --- | --- |
| Testbranch | `feat/sector-motor-3-1-universal-evidence-arbiter-20261010` |
| GitHub vóór deze push | `323893e` (documentatiecommit ChatGPT) op `7e0ed5e` |
| Laatste **codecommit** in deze push | `dc16d37` — 21 commits bovenop `323893e`; deze documentatiecommit staat daar direct boven |
| Lokale tests | **258/258 geslaagd**, 0 mislukt, 0 overgeslagen (Node 24.21 / npm 11.21) |
| TypeScript | Geslaagd (0 fouten, na `next typegen`) |
| ESLint | 67 fouten / 41 waarschuwingen — **identiek aan de basis**, geen nieuwe meldingen |
| Standaardbuild lokaal | **Niet uitvoerbaar** (sandbox kan Google Fonts niet ophalen); standaardbuild wordt op Vercel bevestigd |
| Vercel-preview | Bestaand project `rankfix-app` (scoop5), alias `rankfix-app-git-feat-sector-motor-3-1-universal-e-4cbd07-scoop5.vercel.app`. Laatste READY vóór deze push: `323893e`. **Resultaat van deze push: zie issue #106** |
| Preview-variabelen 3.1 | **Geen** (geen `DATABASE_URL`, geen `SESSION_SECRET`); alle productievariabelen zijn alleen `production` |
| Neon | Uitgesteld; geen database aangemaakt of gewijzigd |
| Render / productie / `main` | Niet gewijzigd |

## Laatste update van Claude

**Datum en tijd:** 11-10-2026, 11:48 (Europe/Amsterdam, UTC+02:00)
**Auteur:** Claude (Claude Code-sessie)
**Werkbranch:** `feat/sector-motor-3-1-universal-evidence-arbiter-20261010`
**Lokale HEAD (code):** `dc16d37`
**Gepushte HEAD:** de commit die dit bestand bevat (direct boven `dc16d37`), push zonder force
**Vercel-preview commit en URL:** wordt na de build in [issue #106](https://github.com/mdscoop7-max/rankfix-app/issues/106) gemeld

### 1. Wat is gedaan?

- Lokale stand veiliggesteld: backup-tag, nieuwe Git-bundle (17 commits, hersteltest op `7e0ed5e` → exact gelijk) en een broncode-zip.
- Documentatiecommit `323893e` van ChatGPT opgehaald en geïntegreerd door de lokale, nog niet gepushte commits er bovenop te zetten (geen conflicten; enige verschil met de backup is dit bestand). Geen force push nodig.
- Vercel alleen-lezen gecontroleerd: voor de 3.1-branch bestaan **geen** Preview-variabelen; de enige Preview-`DATABASE_URL`/`SESSION_SECRET` horen bij de oudere branch `feat/sector-motor-3-weighted-evidence-20261009`; alle overige variabelen alleen `production`. Deployment Protection (Vercel-login) staat aan.
- Volledige lokale controleronde op een schone kopie (`npm ci`, tests, tsc, lint, build).
- Sector Motor 3.1 aangevuld met nieuwe randgevallen (zie 2) en de Fix Engine-keten volledig in een bewakingstest vastgelegd.
- Onderzocht waarom de preview zonder database niets kan scannen en een minimale, veilige oplossing toegevoegd (zie 2 en 5).

### 2. Opgeloste fouten en codewijzigingen (deze sessie)

| Onderdeel / bestand | Vastgestelde fout | Oplossing | Lokale commit |
| --- | --- | --- | --- |
| `lib/sector-arbiter.ts` | Restaurant mét Restaurant-schema en eigen online bestellen (volledige menukaart met winkelwagen) werd **webshop**; idem garage mét AutoRepair-schema en bandenshop | Specialistisch schema dat door de eigen titel/h1/meta wordt bevestigd = twee onafhankelijke bronnen → specialist blijft hoofdsector (waarschijnlijk), bestellen blijft bevestigde commercefunctie (checkoutchecks blijven actief). Nooit bij Store-schema, nooit bij betwiste sectoren, nooit op footer-/tekstwoorden | `26219c2` |
| `app/api/scan/route.ts`, `lib/scan-evidence.ts`, `lib/crawler.ts`, `lib/sector-catalog.ts`, `app/api/ai-fix/route.ts` | JavaScript-`\b` is alleen ASCII: `\bcafé\b`, `\bÜber`, `\bà propos`, `\bépuisé`, `\böffnungszeiten` matchten **nooit** ("Café Central", "Eetcafé", Duitse openingstijden/over-ons, Franse uitverkocht-tekst). Prijzen als "19,99 €" werden niet geteld | Grenzen naast accenten vervangen door `(?<![A-Za-z0-9_])`/`(?![A-Za-z0-9_])` (gelijk aan `\b` voor ASCII); euro-na-bedrag gecorrigeerd; pizzeria/trattoria/osteria/lunchroom/eetcafé/steakhouse/grillroom als horeca-identiteit; AST-bewaking tegen herhaling | `1bb1593` |
| `tests/scanner-safety.test.mjs` | Fix Engine-keten niet volledig bewaakt | Test: geen PR zonder goedgekeurde, ongewijzigde voorstel-hash; exacte commitbevestiging; geen automatische merge; "opgelost" pas na verse live scan met PASS + hoge zekerheid + bewijs | `3be1fe7` |
| `app/api/scan/route.ts` (Websiteprofiel) | **Eerste echte previewscan (IKEA NL):** sector "Webshop 96%" correct, maar het Websiteprofiel toonde "Type: Webshop · Confidence 40%" met de oude notitie "Commerciële landingpage-signalen 3/4": het technologieprofiel werd vóór Sector Motor 3.1 bepaald en daarna alleen van type gewisseld | Na bevestigde aankoopstructuur: landingpage-notitie verwijderd, bewijsregel "Aankoopstructuur bevestigd door Sector Motor 3.1", profielzekerheid minimaal 90% (sterk) / 70% (beperkt) | volgt in deze push |
| `lib/rate-limit.ts`, `app/api/scan/route.ts` | Elke scan (ook de publieke) vereiste de database voor de netwerklimiet → preview zonder database kon niets scannen | Alleen bij `VERCEL_ENV=preview` **én** geen `DATABASE_URL`: dezelfde limiet (8 per netwerk per uur) in een begrensde geheugentabel die bij overvol weigert. Niets wordt opgeslagen. Dashboard vereist nog steeds login + database. Productie (Render, Vercel Production) kan dit pad nooit nemen. Geen nieuw endpoint | `dc16d37` |

Eerdere commits (sessies 1–2) staan in het archief hieronder.

### 3. Tests — exact uitgevoerde resultaten

| Commando of testgroep | Uitgevoerd? | Geslaagd | Mislukt | Opmerking |
| --- | --- | ---: | ---: | --- |
| `npm ci` (schone kopie) | Ja | — | — | Geslaagd, Node 24.21 / npm 11.21 |
| `npm test` | Ja | 258 | 0 | 0 overgeslagen |
| `npx tsc --noEmit` | Ja | — | — | 0 fouten (na `npx next typegen`; schone kopie heeft anders geen `LayoutProps`-types) |
| `npm run lint` | Ja | — | — | 67 fouten / 41 waarschuwingen = basis; gewijzigde bestanden hebben alleen bestaande meldingen |
| `npm run build` (standaard, zonder fontvervanging) | Ja | — | 1 | **Mislukt door omgeving**: `fonts.googleapis.com` niet bereikbaar in de sandbox. Geen codefout; Vercel moet dit bevestigen |
| Build met tijdelijke fontstub (alleen voor rooktest, niet gecommit) | Ja | — | — | Geslaagd — **telt niet als standaardbuild** |
| Runtime-rooktest `next start` met `VERCEL_ENV=preview`, zonder database/secret | Ja | — | — | Homepage 200; intern IP en metadata-adres geweigerd (400 `URL_HOST_BLOCKED`); dashboard 401; niet-bestaand domein nette DNS-melding (422, niets in rekening); 9e scan vanaf hetzelfde netwerk 429; ander netwerk werkt |
| Zelfde met `VERCEL_ENV=production` zonder database | Ja | — | — | Geheugenpad **niet** gebruikt: faalt zoals voorheen ("DATABASE_URL ontbreekt", `charged:false`) |
| Sector Motor 3.1 / Evidence Engine | Ja | 37 + 33 + 13 + 17 | 0 | `sector-matrix`, `sector-arbiter`, `sector-motor-3`, `regex-evidence` |
| Scanner / HTTP / Security / SSRF | Ja | 79 + 41 + 10 | 0 | `scanner-regression`, `http-failures`, `scanner-safety` |
| Fix Engine / Monitoring / Guards / Preview | Ja | 4 + 4 + 3 + 4 | 0 | `github-client`, `monitor-outcome`, `health-guard`, `preview-mode` (+ Fix Engine-guards in `scanner-safety`) |
| Performance / Puppeteer | Ja | 3 + 9 | 0 | `performance`, `headless-render` (nagebootste browser, geen echte Chromium) |
| Echte websitescans | Nee | — | — | Niet mogelijk vanuit de sandbox; volgen op de preview |

**Mislukte testgevallen + oorzaak:** geen.
**Verschil met bestaande lintfouten:** geen nieuwe meldingen.
**Niet uitvoerbaar / afhankelijkheden:** standaardbuild (Google Fonts), echte scans, echte Chromium, database-afhankelijke functies.

### 4. Veiligheidscontroles

- Git-bundle/back-up gecontroleerd: **Geslaagd** (hersteltest exact gelijk aan lokale HEAD vóór integratie)
- Geen geheimen in commits of rapport: **Geslaagd** (scan op connection strings, sleutels, tokens, e-mailadressen; alleen synthetische testwaarden zoals `postgres://x` en een AWS-voorbeeldsleutel in de lek-detectortest)
- Geen push naar `main` of merge: **Geslaagd** (alleen de 3.1-testbranch, zonder force)
- Geen Render, productie of database aangepast: **Geslaagd**
- Preview geïsoleerd van productie: **Geslaagd** voor variabelen (geen Preview-variabelen voor 3.1; productievariabelen alleen `production`). Preview achter Vercel-login.

### 5. Wat staat nog open?

- Vercel-build van deze push: READY + standaardbuild met Google Fonts bevestigen (wordt in issue #106 gemeld).
- Echte scans op de preview (homepage-scan, zonder login): zie de websitelijst in issue #106. **IKEA NL (11-10-2026, door eigenaar):** HTTP 200, raw HTML, sector Webshop / e-commerce 96% — zoals verwacht; 29 goed, 2 te verbeteren.
- **Niet mogelijk zonder geïsoleerde testdatabase:** inloggen/registreren, dashboardscans, opgeslagen rapporten en historie, PDF-download van opgeslagen rapporten, mobiele dashboard-auditweergave, monitoring, Fix Engine end-to-end (vereist ook een test-OAuth-app en testrepository).
- Minimale instellingen voor later (alleen Preview, alleen deze branch, type Sensitive): `DATABASE_URL` van een **lege, aparte** testdatabase en een nieuw `SESSION_SECRET`; optioneel `USAGE_HASH_SALT`. Géén productiewaarden, géén Resend/OAuth/OpenAI/MONITOR_SECRET.
- Bekende, bewuste beperking: een restaurant **zonder** Restaurant-schema met een volledige online bestelmodule wordt "webshop met horeca als nevenactiviteit" (menu-tekst alleen is geen structureel bewijs, omdat "menu" in vrijwel elke navigatie staat).
- Zakelijke dienstverlening zonder schema blijft "waarschijnlijk" of "onzeker" (algemene woorden); dat is bewust voorzichtig.

### 6. Wat moet ChatGPT beoordelen?

- De nieuwe arbiterregel in `26219c2` (specialistisch schema + eigen titel gaat voor een volledige aankoopstructuur) en de vier tegentests.
- De preview-modus in `dc16d37`: is "alleen `VERCEL_ENV=preview` zonder `DATABASE_URL`" streng genoeg, en is een geheugenlimiet per instantie acceptabel achter Vercel-login?
- De accentcorrecties in `1bb1593`: semantisch gelijk aan `\b` voor ASCII-woorden.
- Of de Vercel-build van deze push READY is met exact deze commit.

## Archief — vorige Claude-updates

### 11-10-2026 02:37 — einde sessie 2 (lokaal, niet gepusht)

- 17 lokale commits bovenop `7e0ed5e`; tests 242/242, tsc 0 fouten, lint 67/41 (basis), standaardbuild lokaal niet uitvoerbaar (Google Fonts).
- Belangrijkste correcties: 55 dubbel ge-escapete regexes die bewijschecks stil uitschakelden (cookievlaggen, mixed content, wachtwoordformulieren, gelekte sleutels, SRI, robots.txt, wachtwoordherstel, Fix Engine-icoonherkenning); robots.txt wordt gerespecteerd; lege/JS-only pagina's eigen melding; GitHub-API-time-out; Health Guard op Vercel; vier kwadratische regexes (e-mail, 2× prijs, sitemap) lineair gemaakt; sector: koopbare productgrids, Nederlandse winkelwagenvarianten, titelidentiteit, tandarts zonder schema.
- Volledig rapport: `docs/testing/sector-motor-3-1-testrapport.md`; checklist: `docs/testing/preview-checklist.md`.

### 10-10-2026 — sessie 1 (lokaal, niet gepusht)

- Scanner-netwerklaag: DNS-gepinde SSRF-veilige fetch (privé, CGNAT, metadata, IPv6-varianten, DNS-rebinding), redirectlussen/-limiet, header- en body-deadlines, foutclassificatie (websitefout, toegangsblokkade, tijdelijk, scanomgeving, onveilig doel) met Retry-After-beleid en meldingen in zes talen.
- Optionele, begrensde headless-rendering; monitoring meldt scannerblokkades en losse haperingen niet als uitval.
- Fix Engine: **automatische merge verwijderd**; geen schema-fix bij onzekere sector.
- Sector Motor 3.1: catalogus-webshops en token-veilige commercebewijzen; restaurant met cadeaubonnen blijft restaurant.

## Gerelateerde controles

- [Gezamenlijk technisch overleg — issue #106](https://github.com/mdscoop7-max/rankfix-app/issues/106)
- Onafhankelijke oudere-code-review en offline security-tests staan in issue #106. Die resultaten gelden niet automatisch voor Claude's nieuwere lokale code.

## Veiligheidsafspraken

Alleen de bestaande Sector Motor 3.1-testbranch. Geen `main`, geen merge, geen Render, geen productiedatabase, geen prijswijzigingen, geen merk/designwijzigingen. Geen nieuwe Vercel-projecten of Neon-projecten. **Een push of deployment mag uitsluitend binnen de afzonderlijk door de eigenaar gegeven toestemming plaatsvinden.**
