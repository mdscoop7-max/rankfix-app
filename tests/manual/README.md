# RankFix handmatige tests

Deze map bewaart het testprotocol voor de pre-launch testsessie.

## Werkwijze
1. Start een nieuwe scan vanuit het RankFix-dashboard.
2. Open de audit en gebruik **PDF downloaden**.
3. Bewaar het bestand in je lokale map **RankFix tests**. De voorgestelde bestandsnaam bevat domein en scandatum.
4. Noteer fouten eerst; bundel fixes pas na de testsessie.
5. Herhaal na fixes dezelfde scan en vergelijk de PDF's.

## Testvolgorde
- System Health / Capacity Guard
- Scan Motor end-to-end
- URL-normalisatie zonder https:// en www
- Auditrapport en PDF
- Fix Engine end-to-end
- GitHub fix/PR flow
- Nieuwe scan ter verificatie
- Mobiel en desktop
- Talen NL/EN/FR/DE/IT/ES

> PDF-bestanden zelf worden niet in Git opgeslagen. Ze kunnen klant- of websitegegevens bevatten en horen in de lokale testmap.

## Lokale end-to-end: herstel en scanlimieten

Volledig lokaal, zonder productiedatabase, betalingen of e-mail (geen `RESEND_API_KEY`).

1. Maak een lokale PostgreSQL-database `rankfix_test` (rol `rankfix_test`).
2. `npm run build`
3. Start de app met alleen testwaarden, bijvoorbeeld:
   `DATABASE_URL=postgres://rankfix_test:local-test-only@127.0.0.1:5432/rankfix_test SESSION_SECRET=<willekeurig> APP_URL=http://localhost:3100 npx next start -p 3100`
4. `node tests/manual/auth-and-limits.e2e.mjs` registreert de testaccounts.
5. Herstart de app met `RANKFIX_INTERNAL_TEST_USER_ID=<id van tester@rankfix.test>` en
   `RANKFIX_INTERNAL_TEST_EMAIL=free@rankfix.test` (bewijst dat e-mail alleen geen vrijstelling geeft).
6. Draai `node tests/manual/auth-and-limits.e2e.mjs` opnieuw: alle regels moeten `PASS` zijn.

Scans eindigen lokaal met HTTP 502 omdat externe sites niet bereikbaar zijn; de limieten worden vóór het ophalen geteld en dus wel getest.
