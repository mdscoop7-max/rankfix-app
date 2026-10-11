# RankFix Sector Motor 3.1 — lokaal testrapport

Branch: `feat/sector-motor-3-1-universal-evidence-arbiter-20261010` · Basis op GitHub: `7e0ed5e` · Omgeving: Node 24.21 / npm 11.21, offline sandbox (geen externe websites, geen DNS, geen Google Fonts).

Statussen: **Geslaagd**, **Mislukt**, **Niet uitgevoerd**, **Niet te bevestigen**.

## Totaal

| Controle | Status | Toelichting |
|---|---|---|
| `npm ci` (schone kopie) | Geslaagd | 404 pakketten |
| Automatische tests | Geslaagd | 242/242, 0 overgeslagen |
| TypeScript (`tsc --noEmit`) | Geslaagd | 0 fouten |
| ESLint | Geslaagd (geen nieuwe meldingen) | 67 fouten / 41 waarschuwingen, identiek aan de basis; nieuwe en gewijzigde code is schoon |
| Next.js-standaardbuild | Niet uitgevoerd (omgeving) | `next/font` kan Google Fonts niet ophalen in de sandbox. Vercel bouwde 7e0ed5e wel succesvol. |
| Aanvullende build met tijdelijke fontstub | Geslaagd | Alleen ter controle van de compilatie; **geen** standaardbuild en niet gecommit |
| Runtime-rooktest (`next start`) | Geslaagd | Invoer- en SSRF-afhandeling van `/api/scan` in nl/en/de/fr |
| Echte websitescans | Niet uitgevoerd | Externe websites niet bereikbaar vanuit de sandbox |

## Tests per bestand

| Bestand | Aantal | Onderdeel |
|---|---|---|
| `scanner-regression.test.mjs` | 79 | Bestaande scanner-regressies |
| `http-failures.test.mjs` | 41 | HTTP-statusmatrix, redirects, timeouts, TLS, DNS, SSRF, foutmeldingen |
| `sector-arbiter.test.mjs` | 33 | Sector Motor 3.1-arbiter |
| `sector-matrix.test.mjs` | 29 | HTML-fixture → Evidence Engine → arbiter, per sector |
| `regex-evidence.test.mjs` | 15 | Bewijsregexes uit de echte broncode + AST-bewaking |
| `sector-motor-3.test.mjs` | 13 | Sector Motor 3.0 |
| `headless-render.test.mjs` | 9 | JavaScript-rendering (nagebootste browser) |
| `scanner-safety.test.mjs` | 9 | Route-bewaking (classificatie, verbruik, Fix Engine, commercechecks) |
| `github-client.test.mjs` | 4 | GitHub-client (gemockte fetch) |
| `monitor-outcome.test.mjs` | 4 | Monitoring / uitvalmeldingen |
| `health-guard.test.mjs` | 3 | Health Guard |
| `performance.test.mjs` | 3 | Snelheid op grote en kwaadwillige invoer |

## Belangrijkste tests

| Test | Onderdeel | Verwacht | Werkelijk | Status | Correctie |
|---|---|---|---|---|---|
| HTTP 200/201/202/204 | Scanner | Geen fout | Geen fout | Geslaagd | — |
| HTTP 301/302/303/307/308 + loops + limiet | Scanner | Volgen per stap, lus/limiet = websitefout | Zo | Geslaagd | Lusdetectie toegevoegd (sessie 1) |
| HTTP 400/401/403/405/451/999 | Scanner | Toegangsblokkade, geen score, geen SEO/security-oordeel | Zo, CDN genoemd | Geslaagd | Classificatie (sessie 1) |
| HTTP 404/410/500/501/525/530 | Scanner | Websitefout, geen score | Zo | Geslaagd | — |
| HTTP 408/429/502/503/504/52x | Scanner | Tijdelijk; Retry-After ≤ 5 s → max. 2/1 keer opnieuw, langer → stoppen | Zo | Geslaagd | Retrybeleid (sessie 1) |
| DNS onbekend / tijdelijk | Scanner | Websitefout / tijdelijk | Zo | Geslaagd | — |
| Self-signed / verlopen certificaat | Scanner | Websitefout (TLS) | Zo | Geslaagd | — |
| Header- en body-timeout | Scanner | Stopt binnen limiet | Zo | Geslaagd | Body-deadline (sessie 1) |
| Grote response (>limiet, ook gedeclareerd) | Scanner | RESPONSE_TOO_LARGE | Zo | Geslaagd | — |
| Lege pagina / JS-only shell | Scanner | Eigen melding, geen "challenge" | Zo | Geslaagd | **Deze sessie** |
| Mislukte scan registreert geen verbruik | Scanner | Verbruik pas na alle foutpaden | Zo | Geslaagd | Bewakingstest |
| SSRF: privé, CGNAT, metadata, IPv6-varianten, numerieke IP | Security | Geweigerd | Geweigerd | Geslaagd | Sessie 1 |
| DNS-rebinding | Security | Eén resolutie, verbinding naar gevalideerd IP | Zo | Geslaagd | DNS-pinning (sessie 1) |
| Cookievlaggen Secure/HttpOnly/SameSite | Security | Herkend | Werden **nooit** herkend | Geslaagd na correctie | **Deze sessie** (regex) |
| Mixed content, wachtwoordformulieren, onveilige form-actions | Security | Herkend | Werden **nooit** herkend | Geslaagd na correctie | **Deze sessie** |
| Gelekte sleutels (AWS, GitHub, bearer) | Security | Herkend | Werden **nooit** herkend | Geslaagd na correctie | **Deze sessie** |
| Externe scripts + SRI | Security | Herkend | Werden **nooit** herkend | Geslaagd na correctie | **Deze sessie** |
| 403 hersteld via browser | Security | Headers/cookies niet als bewijs | Niet te bevestigen | Geslaagd | Sessie 1 |
| robots.txt | SEO/crawl | Disallow herkend, crawler volgt RankFixBot/* | Werd als één regel gelezen | Geslaagd na correctie | **Deze sessie** |
| Grote retailer (cart + catalogus, geen Product-schema) | Sector | Webshop | Webshop | Geslaagd | Sessie 1 |
| Internationaal bedrijfsportaal | Sector | Geen webshop, geen recruitment | Zo | Geslaagd | — |
| Elektronica-, kleine, kantoor-, beauty-, meertalige webshop | Sector | Webshop | Webshop | Geslaagd | Elektronica: **deze sessie** |
| Tandarts, makelaar, garage, transport, hotel, restaurant, kapper, beautysalon, accountant | Sector | Juiste sector | Juist | Geslaagd | Tandarts zonder schema: **deze sessie** |
| Restaurant met cadeaubonnen | Sector | Restaurant, shop = nevenactiviteit | Zo | Geslaagd | Sessie 1 |
| Informatieve site | Sector | Geen webshop | Zo | Geslaagd | — |
| Losse vermelding transport/vacatures/restaurant | Sector | Geen hoofdsector | Onzeker | Geslaagd | — |
| WooCommerce-vingerafdruk zonder winkel | Modules | Geen bevestigde webshop, checkout/merchant N.v.t. | Zo | Geslaagd | Bewakingstest |
| JavaScript niet uitgevoerd | Evidence | Ontbrekend = Niet te bevestigen, lijst onbevestigde checks | Zo | Geslaagd | Sessie 1 |
| Fix Engine: geen automatische merge | Fix Engine | Alleen PR | Alleen PR | Geslaagd | Sessie 1 |
| Fix Engine: schema-fix bij onzekere sector | Fix Engine | Geweigerd | Geweigerd | Geslaagd | Sessie 1 |
| Fix Engine: GitHub-timeout | Fix Engine | Stopt met melding | Zo | Geslaagd | **Deze sessie** |
| Fix Engine: icoonherkenning | Fix Engine | icon-192.png = icoon | Werkte niet | Geslaagd na correctie | **Deze sessie** |
| Wachtwoordherstel | Account | Normaal sterk wachtwoord geaccepteerd | Eiste letterlijk "\d" | Geslaagd na correctie | **Deze sessie** |
| Monitoring 403 / tijdelijk / uitval | Guards | Geen mail / pas na 2× / 1 mail | Zo | Geslaagd | Sessie 1 |
| Health Guard op Vercel | Guards | Geen vals oranje | Zo | Geslaagd | **Deze sessie** |
| Puppeteer niet beschikbaar / hangt / te druk | Rendering | Snel falen, deadline, kill, limiet | Zo | Geslaagd | Sessie 1 |
| 574 unieke regexes op 50 KB kwaadwillige invoer | Performance | Lineair | 4 kwadratisch (e-mail, 2× prijs, sitemap) | Geslaagd na correctie | **Deze sessie** |
| 4 MB catalogus → evidence + sector | Performance | < 3 s | 0,2 s | Geslaagd | — |

## Beperkingen

- Geen echte websites, DNS of Google Fonts in de sandbox: echte scans en de standaardbuild zijn **Niet uitgevoerd**.
- De volledige `/api/scan`-route is niet end-to-end met database gedraaid; scanlogica is getest via modules, fixtures en broncodebewaking.
- PDF-download en mobiele auditweergave: **Niet uitgevoerd**.
- Puppeteer is getest met een nagebootste browser, niet met echte Chromium.
- Na de regexcorrecties werken veel bewijssignalen voor het eerst echt. Echte scans kunnen daardoor andere (juistere) uitkomsten geven dan eerdere referentiescores.

## Aandachtspunten voor de echte websitetests

- IKEA NL: verwacht webshop via winkelwagen + productcatalogus; controleer of productpagina's 403 geven (dan site-sample "Niet te bevestigen").
- IKEA internationaal (ikea.com): verwacht bedrijfsportaal, geen webshop of recruitment.
- DiscountOffice: weigerde ook een externe fetch-tool; mogelijk botbeveiliging → verwacht een nette toegangsblokkade zonder score.
- Cookie-, mixed-content-, formulier- en scriptchecks werken nu echt: vergelijk met eerdere scans en verwacht minder valse cookiewaarschuwingen en mogelijk nieuwe terechte securitybevindingen.
- robots.txt-checks kunnen nu terecht "geblokkeerd pad" melden.
