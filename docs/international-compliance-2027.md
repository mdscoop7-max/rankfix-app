# RankFix AI — International Compliance Readiness 2027

Status: voorbereiding, oktober 2026. Dit document is een technische/compliance-checklist en geen juridisch advies.

## Hoofdregel
Geen KvK-/registratienummer, btw-nummer, bedrijfsadres, juridische entiteit of andere bedrijfsgegevens publiceren voordat deze werkelijk bestaan en zijn geverifieerd.

## Voor commerciële start in 2027
- Definitieve verantwoordelijke/contractspartij en contactgegevens invullen in Privacy, Voorwaarden en waar vereist Duitse Anbieterkennzeichnung/Impressum.
- Privacy, Cookies en Voorwaarden inhoudelijk laten beoordelen voor de landen waarin RankFix commercieel wordt aangeboden.
- Volledige versies onderhouden voor NL, EN, DE, FR, IT en ES; geen fictieve vertalingen of bedrijfsgegevens.
- Verwerkersregister afronden voor hosting/database, Resend, OpenAI, GitHub, Google en toekomstige betaal-/analyticsdiensten.
- DPA/AVV-proces voorbereiden voor zakelijke klanten en benodigde verwerkersovereenkomsten met leveranciers controleren.
- Internationale doorgiften per leverancier documenteren, inclusief toepasselijke AVG-doorgiftegrondslag.
- Concrete bewaartermijnen vastleggen voor accounts, scans, monitoring, logs, OAuth-tokens, e-mail en verwijderde accounts.
- Verwijder-, inzage-, rectificatie-, bezwaar- en dataportabiliteitsprocessen end-to-end testen.

## Cookies en consent
Huidige eigen functionele cookies: rankfix_session, rankfix_remember, github_oauth_state en google_gsc_state. Voor livegang opnieuw controleren met browser/network tooling.
Als analytics, advertenties of andere niet-noodzakelijke trackers worden toegevoegd:
1. blokkeren vóór toestemming;
2. accepteren en weigeren op hetzelfde beslisniveau;
3. granulariteit waar vereist;
4. voorkeuren later opnieuw openen;
5. intrekken even eenvoudig als toestemmen;
6. consentbewijs en bewaartermijn documenteren;
7. alle zes talen testen.

## GitHub / Fix Engine
De huidige OAuth-flow vraagt repositorytoegang en de Fix Engine kan repositorybestandsinhoud aan de AI-API aanbieden voor een gevraagde codefix.
Voor livegang:
- least-privilege scopes ontwerpen en testen;
- duidelijk tonen welke repositoryrechten worden gevraagd;
- intrekken/ontkoppelen testen;
- tokenopslag en encryptie controleren;
- logging en bewaartermijnen documenteren;
- exact documenteren welke code naar de AI-provider gaat;
- geen 'alleen in-memory' of 'nooit training/opslag'-claim publiceren zonder technisch en contractueel bewijs.

## Google Search Console
- readonly scope behouden tenzij aantoonbaar meer nodig is;
- refresh-tokenopslag/encryptie en ontkoppelen testen;
- privacytekst en verwerkersregister bijwerken.

## AI-provider
Voor commerciële start actuele API-voorwaarden en privacy/data-controls verifiëren. Documenteer per functie welke input wordt verzonden (assistant, AI Fix, GitHub Fix, vertaling van scanresultaten), retentie en eventuele doorgifte. Marketingclaims moeten overeenkomen met de bewezen configuratie.

## Duitsland
- vóór commerciële start beoordelen welke Anbieterkennzeichnung onder §5 DDG en overige Duitse regels voor RankFix geldt;
- echte gegevens invullen zodra beschikbaar;
- permanent en gemakkelijk bereikbaar maken;
- Datenschutz en cookie/consent-flow in het Duits volledig controleren.

## Frankrijk
- Franse privacy/cookie-informatie volledig maken;
- consentinterface testen op even eenvoudige acceptatie/weigering en afwezigheid van dark patterns;
- CNIL-richtlijnen opnieuw controleren vlak vóór livegang.

## EU-consumenten en abonnementen
Voor activering van betaalde plannen:
- totaalprijs, btw, factureringscyclus en automatische verlenging duidelijk tonen;
- opzegging en restitutiebeleid vastleggen;
- herroepingsrecht/digitale dienst-flow juridisch laten toetsen;
- EU-Omnibus prijsclaims en referentieprijzen alleen toepassen waar relevant;
- betaalprovider en bijbehorende gegevensstromen toevoegen aan privacy/cookies.

## Release gate
RankFix mag pas als 'compliance ready' worden gemarkeerd nadat:
- alle zes talen zijn gecontroleerd;
- juridische bedrijfsgegevens echt en geverifieerd zijn;
- cookie/tracker-scan schoon is of consent correct werkt;
- OAuth-scopes en intrekken zijn getest;
- subprocessors/DPA/doorgiften zijn gedocumenteerd;
- bewaartermijnen en verwijdering zijn getest;
- RankFix' eigen Security, Accessibility, Consent, Legal/Trust en technische scans geen onbeoordeelde kritieke punten tonen.
