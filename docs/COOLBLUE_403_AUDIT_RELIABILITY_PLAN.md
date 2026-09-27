# RankFix — 403 / anti-bot audit reliability plan

## Aanleiding
De Coolblue Tweedekans Gaming PC-pagina geeft RankFix HTTP 403 terug:
https://www.coolblue.nl/desktops/game-pcs/gaming-deals/tweedekans

Een andere analysemethode kon delen van de zichtbare content beoordelen, maar kon canonical, H1/headings, JSON-LD/Product schema, alt-teksten en hreflang niet hard bevestigen. Dit is een belangrijke betrouwbaarheidstest voor RankFix.

## Hoofdregel
RankFix mag een geblokkeerde of onvolledig opgehaalde pagina nooit behandelen alsof de volledige HTML is onderzocht.

- bewijs gevonden -> PASS
- aantoonbaar probleem -> WARNING of FAIL
- onvoldoende bewijs -> UNABLE_TO_CONFIRM / Niet te bevestigen
- controle niet relevant voor dit paginatype -> NOT_APPLICABLE / N.v.t.

Een HTTP 401/403/429 of anti-bot/challenge-response is in de eerste plaats een fetch-/toegangsstatus, niet automatisch een SEO-fout van de klant.

## Probleem
Bij beschermde websites kunnen gewone server-side requests worden geblokkeerd door CDN/WAF/botbescherming. Als RankFix daarna ontbrekende HTML-signalen als echte afwezigheid interpreteert, ontstaan false FAIL/WARNING-resultaten en een onbetrouwbare score.

Voorbeelden die zonder volledige HTML niet als afwezig mogen worden geconcludeerd:
- canonical
- H1 en heading-hiërarchie
- robots meta
- JSON-LD/schema
- hreflang
- image alt-attributen
- tracking-tags
- product/offer markup

## Gewenste architectuur

### Fase 1 — Fetch-resultaat expliciet modelleren
Voeg één centrale fetch-status toe, bijvoorbeeld:
- COMPLETE
- PARTIAL
- BLOCKED
- TIMEOUT
- NETWORK_ERROR
- INVALID_RESPONSE

Bewaar minimaal:
- requested URL
- final URL
- HTTP-status
- content-type
- response bytes
- redirect chain indien beschikbaar
- fetch timestamp
- fetch methode
- block/challenge evidence

### Fase 2 — Betrouwbare block/challenge-detectie
Classificeer 401/403/429 als mogelijk geblokkeerd. Detecteer daarnaast challenge/interstitial-pagina's alleen met concrete evidence, bijvoorbeeld status + bekende challenge-signalen + zeer afwijkende response.

Niet op basis van één losse tekstmatch een site als bot-blocked bestempelen.

### Fase 3 — Evidence gate vóór alle auditregels
Elke auditregel krijgt een minimale evidence requirement.

Voorbeeld:
- canonical-check vereist COMPLETE/PARTIAL HTML waarin de head betrouwbaar beschikbaar is.
- alt-check vereist daadwerkelijk geparseste img-elementen.
- Product schema-check vereist betrouwbare script/JSON-LD extractie.
- hreflang-check vereist head/link evidence en voor reciprocity eventueel cross-page fetches.

Ontbreekt die evidence door BLOCKED/TIMEOUT/challenge, dan status UNABLE_TO_CONFIRM en 0 impact op de score.

### Fase 4 — Geen scorestraf voor scanner-toegang
Als RankFix zelf geen toegang krijgt, mag dat de SEO/GEO-score van de website niet verlagen.

Toon apart:
"Website blokkeert geautomatiseerde analyse (HTTP 403). Een deel van de controles kon niet worden bevestigd."

Rapporteer daarnaast coverage/confidence:
- hoeveel relevante controles bevestigd zijn
- hoeveel niet te bevestigen zijn
- reden van ontbrekend bewijs

### Fase 5 — Gedeeltelijke analyse alleen met bewezen data
Als een response wel betrouwbare delen bevat, mogen alleen checks met direct bewijs worden uitgevoerd.

Voorbeeld Coolblue:
- een bewezen title kan PASS zijn;
- canonical mag niet FAIL worden omdat hij niet in een onvolledige extractie staat;
- een bewezen noindex kan als technisch feit worden gemeld, maar de audit moet context tonen dat noindex op een tijdelijke/filter/dealpagina bewust kan zijn. De crawler mag intentie niet verzinnen.

### Fase 6 — Optionele tweede fetchstrategie, veilig
Een fallback mag alleen een andere legitieme HTTP-fetchstrategie zijn die dezelfde SSRF/DNS/rebinding/security-regels gebruikt.

Niet bouwen:
- CAPTCHA-omzeiling
- proxy-rotatie om blokkades te ontwijken
- browser fingerprint spoofing om beveiliging te passeren
- login/paywall-bypass

Als toegang geblokkeerd blijft: eerlijk UNABLE_TO_CONFIRM.

### Fase 7 — JavaScript-rendering als aparte capability
Maak onderscheid tussen:
- RAW_HTML
- RENDERED_HTML
- UNAVAILABLE

Als RankFix later een gecontroleerde browser-renderer krijgt, moet het rapport vermelden welke methode bewijs leverde. Een render-fout mag geen SEO-fout worden.

### Fase 8 — Pagina-applicability
Bepaal eerst page type en context voordat regels punten krijgen:
homepage, category/listing, product, article/content, local/service, checkout/account/filter/deal.

Voor tijdelijke deal/filterpagina's:
- noindex kan bewust zijn;
- Product schema kan per listing anders relevant zijn;
- checkout-signalen horen niet als verplichte homepage/listing-check te gelden.

Onzeker paginatype -> confidence verlagen of UNABLE_TO_CONFIRM, niet gokken.

### Fase 9 — Coolblue regressietest
Gebruik de Coolblue URL als externe praktijktest, maar schrijf unit/integration fixtures zodat tests niet afhankelijk zijn van Coolblue uptime of anti-botbeleid.

Minimaal testen:
1. 403 zonder bruikbare HTML -> auditstatus BLOCKED; HTML-afhankelijke checks UTC; geen scorestraf.
2. 403 challenge HTML -> challenge evidence; geen false PASS/FAIL uit challenge markup.
3. 200 volledige fixture -> normale checks.
4. 200 gedeeltelijke/ongeldige HTML -> alleen checks met bewezen evidence.
5. noindex fixture -> robots-meta feit correct detecteren.
6. canonical ontbreekt in COMPLETE HTML -> echte warning/fail volgens rule.
7. canonical onbekend bij BLOCKED -> UTC, nooit "ontbreekt".
8. Product schema onbekend bij BLOCKED -> UTC.
9. alt onbekend zonder img evidence -> UTC.
10. hreflang reciprocity zonder tweede pagina -> UTC.

## Vergelijkingsaudit die als test-orakel dient
Voor de Coolblue Tweedekans-pagina is uit een alternatieve extractie voorlopig alleen het volgende bruikbaar als vergelijkingsmateriaal:
- Title: PASS volgens extractie.
- Meta description: PASS volgens extractie.
- Canonical: niet te bevestigen.
- H1/headings: niet te bevestigen.
- Structured data/Product schema: niet te bevestigen.
- Alt-teksten: niet te bevestigen.
- Hreflang: niet te bevestigen.
- Prijzen en voorraad: zichtbaar in die extractie.
- Interne breadcrumb/links: zichtbaar in die extractie.
- noindex/nofollow werd door die methode gemeld, maar RankFix moet dit uitsluitend overnemen als eigen raw/rendered evidence dit bevestigt.

Deze externe extractie is dus geen vervanging voor RankFix-evidence; hij is alleen een testcase voor de eerlijkheidsregel.

## Acceptatiecriteria
De wijziging is klaar wanneer:
- HTTP 403 niet meer resulteert in verzonnen SEO/GEO-fouten.
- HTML-afhankelijke controles bij onvoldoende bewijs UTC worden.
- UTC/N.v.t. niet in teller/noemer van de technische score terechtkomen.
- coverage/confidence apart zichtbaar blijft.
- ieder PASS/WARNING/FAIL concrete evidence heeft.
- fetch errors en website issues technisch gescheiden zijn.
- dezelfde audit-engine wordt gebruikt door publieke scan en dashboard.
- bestaande SSRF/DNS/rebinding bescherming intact blijft.
- tests voor BLOCKED/PARTIAL/COMPLETE groen zijn.
- normale websites zonder blokkade geen regressie krijgen.

## Implementatievolgorde
1. Inventariseer huidige safe-fetch en alle consumers.
2. Introduceer fetch-status/evidence zonder bestaande checks te breken.
3. Voeg block/challenge classificatie toe.
4. Voeg centrale evidence gate toe.
5. Migreer HTML-afhankelijke checks.
6. Pas scoring/coverage aan.
7. Voeg regressietests toe.
8. Build/typecheck/test.
9. Controleer diff op scanner/security-regressies.
10. Pas daarna één squash-merge naar main toe en laat Render één keer deployen.

## Niet doen
Geen score verhogen om de test mooier te maken. Geen site-specifieke Coolblue whitelist. Geen hardcoded PASS-resultaten. Geen beveiliging omzeilen. Geen ontbrekend bewijs als afwezig bewijs behandelen.
