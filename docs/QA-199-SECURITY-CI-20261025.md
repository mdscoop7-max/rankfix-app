# RankFix QA #199 — beveiligingsherstel en CI-controle (25 oktober 2026)

De voorgaande GitHub CI-run 40173859199 was groen, maar het log toonde een niet-blokkerende **kritieke Next.js-kwetsbaarheid** en een **hoge Zod-kwetsbaarheid via Chromium BiDi/Puppeteer**. Daarnaast waren er **75 lintfouten en 52 waarschuwingen**; beide controles waren gemarkeerd met `continue-on-error`.

## Uitgevoerde bronwijzigingen (op draft-PR-branch, niet op main of QA-basisbranch)

- Verhoog `next` en `eslint-config-next` van 16.3.8 naar **16.4.3**, waarmee de Next.js-kwetsbaarheden uit oktober 2026 worden aangepakt.
- Verhoog `puppeteer-core` en `puppeteer` van 25.12.0 naar **25.16.0**, met de bedoeling de verouderde Chromium BiDi/Zod-keten te vervangen.
- Maak `npm audit --omit=dev --audit-level=high` **blokkerend** in de normale CI, en stap voor reproduceerbare installs over op `npm ci`.
- Voeg een branchgebonden QA-workflow toe die de dependency-upgrade daadwerkelijk installeert, audit, tests, productiebuild, axe-core Chromium en de TestLab-/responsive-browserproeven uitvoert.
- De QA-workflow schrijft het gegenereerde `package-lock.json` alleen terug naar **dezelfde reparatiebranch** wanneer alle verplichte controles geslaagd zijn. Productie en basis-QA worden hierdoor niet gewijzigd.

## Bewuste beperkingen

1. **Niet melden dat de kwetsbaarheden verholpen zijn zonder een geslaagde audit op de bijgewerkte lockfile.** Controleer of de lockfilecommit daadwerkelijk is geland.
2. **Lintachterstand bestaat nog:** 75 fouten en 52 waarschuwingen in run 40173859199. Het niet-blokkerende lintbeleid blijft zichtbaar; apart opruimen zonder regels uit te zetten.
3. **Echte externe live scans ontbreken** zolang de lokale omgeving geen externe websites kan benaderen en Vercel geblokkeerd blijft.
4. Geen merge of deployment; de eigenaar beslist na acceptatie.
5. Registreer bij elke volgende beveiligingsupgrade apart de SHA en CI-auditresultaten.

Bronnen: GitHub CI-run 40173859199 en de npm-advisories GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-mrhx-c7xc-m3w5.
