# QA 144 — acceptatiecontroles PR #199 (25 oktober 2026)

Branch `fix/qa-144-p0-reliability-20261024`, base `qa/rankfix-shared-preview` @ `e7e9b8b`. Productie, `main` en de QA-branch zijn niet gewijzigd. Er zijn geen abonnements- of betaalinstellingen aangepast.

## 1. Vercel-blokkade

- De laatste geslaagde Vercel-build was `862e6c2` op 24-10 om 04:38 UTC. Vanaf `981e3f7` (24-10, 10:20 UTC) faalt elke commit met de Vercel-status **"Account is blocked."**, ook commits van vóór deze PR (QA-head `e7e9b8b`).
- Het is **geen buildfout**. Vercel start de build niet eens (er is geen deployment-object). Dezelfde code bouwt groen in GitHub Actions en lokaal.
- De oorzaak is account-/beleidsniveau. Vercel noemt daarvoor: spend management, Hobby-gebruikslimieten, beleid (o.a. "Hobby teams are for non-commercial personal use only"), betaalprobleem of storing. Welke van toepassing is, staat in de Vercel-mail en onder Settings → Usage/Billing. Die kon ik niet lezen, want de Vercel-koppeling heeft geen toegang tot team `scoop5`.
- Aanwijzingen: (a) RankFix heeft betaalde abonnementen en draait op Hobby. (b) De blokkade begon direct na de korte server-side TestLab-workflow (`5806003`–`862e6c2`), die scans op Vercel uitvoerde.
- **Apart probleem:** de productie-healthcheck (`/api/internal/health/run`) faalt sinds 21-10 22:24 UTC (de laatste geslaagde run). Dat was al vóór de blokkade. De productiedeployment van 17-10 staat volgens Vercel op READY, maar of productie gezond is, heb ik niet kunnen verifiëren.

## 2. Exacte SHA's

| SHA | Inhoud | GitHub CI (Node 24) |
|---|---|---|
| `7b872a3` | PR #199 zoals gisteren opgeleverd | Geslaagd: tests, lint, build, browser-smoke (run 40172443998) |
| `52fa143` | Echte axe-reparatie (`serverExternalPackages`) | — |
| `66aa062` | Tekst van TestLab + browsertests in CI | Geslaagd, inclusief 3 nieuwe browserstappen (run 40173587280) |
| head | + live-acceptatiescript en dit rapport | Zie PR-checks |

Een QA-preview op Vercel bestaat voor geen van deze SHA's, door de blokkade. QA testen kan nu alleen lokaal: de productiebuild met `VERCEL_ENV=preview`, op de laptop of in CI.

## 3. axe-core en live scans

- **Echte oorzaak van `t is not defined` gevonden** (mijn verklaring van gisteren was onjuist). axe-core maakt zijn injecteerbare script via `axeFunction.toString()`. Gebundeld verwijst die tekst naar de bundelwrapper (`"object"===i(t)&&t.exports`, `e.v(u)`).
  - In echte Chromium: de `axe.source` uit de productiebundel geeft `t is not defined`, en de originele uit `node_modules` werkt.
  - Fix: `serverExternalPackages: ["axe-core"]`. Na de build zit axe-core niet meer in de bundel, verwijst de server naar `node_modules/axe-core` (identieke source) en neemt de scanfunctie de axe-bestanden mee.
- axe-core 4.13.0 in echte Chromium vindt de verwachte fouten (button-name, html-has-lang, image-alt, label). Dit draait nu ook in CI.
- **Live scans zijn niet uitgevoerd.** Mijn werkomgeving heeft geen uitgaand webverkeer, de laptop was niet gekoppeld en er is geen Vercel-preview. Klaar voor uitvoering: `tests/manual/qa144-targeted-live.mjs`, met 7 gerichte scans (product-SKU MediaMarkt, verbeterpunten MediaMarkt en Werken bij Decathlon, de vacaturepagina, de Decathlon-subpagina, Accor en axe op IKEA). Het script weigert te draaien als de server niet exact de uitgecheckte SHA meldt, en scheidt externe blokkades van RankFix-fouten.

## 4. Tests op exacte commit

Twee schone checkouts van `7b872a3` (Node 22): **656 tests: 649 geslaagd, 0 mislukt, 7 overgeslagen**, met een identieke testlijst in beide runs. GitHub CI op Node 24 is op dezelfde SHA geslaagd. Op `66aa062`: 657 / 650 / 0 / 7 (één extra test). Testaantallen per run zijn in GitHub niet uit te lezen vanuit mijn omgeving; de stap "Tests" faalt bij elke mislukte test.

## 5. TestLab

- TestLab werkt **laptop-/browsergestuurd**. Het draait in het open browsertabblad en gaat **niet automatisch op de server door**; de server-side workflow is op 24-10 uitgezet (`981e3f7`). Dit staat nu ook letterlijk op de TestLab-pagina.
- Bewezen in echte Chromium op de echte productiebuild (`tests/manual/testlab-stop-resume.browser.mjs`, ook in CI):
  - Bij een verlopen sessie stopt de run en wordt die site als "opnieuw te testen" bewaard.
  - Na sluiten en heropenen van het tabblad blijven de resultaten bewaard.
  - Bij hervatten wordt die site opnieuw gescand.
  - Bij `Failed to fetch` volgt één retry op dezelfde site.
  - "Stop na huidige scan" werkt.
  - Zonder login wordt niets gescand.
  - De export bevat 144 rijen zonder duplicaten.

## Resterende risico's

1. **Vercel geblokkeerd.** Er is geen QA-preview, en ook geen productie-uitrol mogelijk tot de eigenaar de oorzaak in Vercel oplost. Mogelijk is een Pro-plan nodig voor commercieel gebruik; dat is een beslissing van de eigenaar.
2. **Productiegezondheid onbekend.** De healthcheck faalt al 3+ dagen, los van deze PR.
3. **Live scans nog niet gedaan.** De echte effecten op MediaMarkt, Decathlon, Accor en axe in Vercel-Chromium zijn pas bewezen na het script. axe is getest met lokale Chromium 1243, niet met `@sparticuz/chromium` op Vercel.
4. **TestLab-resultaten staan alleen in de browser** (localStorage). Gewiste browsergegevens wissen de resultaten, dus tussendoor exporteren.
5. **Sectorgevallen zonder echte pagina** (Rabobank, Mercadona, ICA, Zaask, Multiopticas, Jean Louis David) zijn nog onbewezen.
