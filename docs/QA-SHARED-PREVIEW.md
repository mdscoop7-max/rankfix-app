# RankFix — één vaste gedeelde testversie

## Enige testbestemming
- Git branch: `qa/rankfix-shared-preview`.
- Vercel: branchgebonden **preview** alias `rankfix-app-git-qa-rankfix-shared-preview-scoop5.vercel.app` zodra deployment READY is.
- Niet naar `main`, productie of de bevroren pilotbranch deployen.
- Vervang de testlink niet telkens met een nieuwe deployment-hash. Alleen de branchepreview-alias delen.

## Bron en integratie
- Begonnen op Claude's post-pilot motorbranch `fix/engine-3.5.1-post-pilot` (PR #164, commit `27fb477`), **niet** op de bevroren pilot.
- ChatGPT's klanten-UI en QA-quota-afhandeling meegenomen vanuit `ui/fix-upsell-free-20261017` (PR #165).
- Claude en ChatGPT zetten vervolgwijzigingen na review op deze gedeelde QA-branch, vóór een nieuwe browsertest. Iedere commit moet aantoonbaar in een geslaagde previewbuild terechtkomen.
- **Bronbranches worden niet automatisch samengevoegd.** Noteer telkens bron-SHA en geïntegreerde QA-SHA; conflicts moeten bewust worden opgelost.
- Echte klantbetalingen, productie-merge, pilotset, scorecard en frozen commit mogen niet worden aangepast.

## Login en data: blokkade en veilige voorwaarden
- Gebonden previewvariabelen `DATABASE_URL`, `SESSION_SECRET`, `RANKFIX_INTERNAL_TEST_CUSTOMER_ID` worden **alleen aan deze QA-branch** gekoppeld.
- Een vast domein en stabiele `SESSION_SECRET` voorkomen onnodige her-login na iedere deployment. Sessies verlopen normaal en na wachtwoordwijziging kan opnieuw inloggen nodig zijn.
- Test-DB moet onafhankelijk van productie en de blind-pilot zijn; toets dat voor elke databasewissel.
- **Openstaande blokkade op 17 okt 2026:** bestaande qa-gebruiker en oude scan zijn in Neon-project `orange-shadow-05923249` beschikbaar, maar Neon blokkeert SQL met HTTP 402 wegens overschreden quota. Database kan dus de login tijdelijk niet dienen. Vercel READY is geen bewijs dat login werkt.
- Een alternatieve geïsoleerde QA-DB is voorbereid binnen `bitter-mountain-71537280`, maar **niet automatisch gekoppeld**. Het overzetten van een databasewachtwoord naar Vercel vereist een expliciete, veilige eigenaarshandeling; geen credentials in commits/logs/chats opnemen.
- Als een nieuwe database wordt gekoppeld, moet account- en scanhistorie opnieuw worden ingesteld; wachtwoorden worden nooit gekopieerd uit screenshots.

## Testchecklist
1. Inspecteer de nieuwe Vercel deployment: `READY`, bronbranch én commit SHA.
2. Login met QA-account, bestaande scans openen, geen 500/402.
3. `/dashboard/github`: gratis klant ziet Fix aanmaken en popup met abonnement en eerlijke betaalstatus.
4. `/dashboard/scan`: geautoriseerde interne QA-gebruiker kan testen zonder gewone 2-scanslimiet; klant buiten QA heeft altijd vaste normale limiet.
5. Registreer screenshots en resultaat van één end-to-end browsercontrole; geen scans uitvoeren op het onafhankelijk 68-site-plan.
