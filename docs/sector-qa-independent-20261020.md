# RankFix sectorherkenning — onafhankelijke QA-uitbreiding (20 oktober 2026)

**Alleen tests en documentatie. Claude's bestaande sector- en scanmotor blijven ongewijzigd.**
Afzonderlijke QA-branch, geen productie-deploy, geen database- of klantgegevensmutaties.

## Wat al in de motor zit

De bestaande sectorherkenning bestaat uit `lib/eu-identity.ts`,
`lib/sector-identity.ts`, `lib/primary-business-identity.ts` en de integratie in
`app/api/scan/route.ts`. Er bestaan al veel Node-tests, een synthetische
scanmatrix, meerdere offline hold-outsets en evaluatiemetrics.
Dit werk **vervangt die regels of benchmarks niet**.

## Nieuwe proeven

- **Vitest:** bestaande classifiers krijgen extra, onafhankelijke testasserties
  (geen rewrite van de sectorlogica).
- **fast-check:** deterministische variaties in navigatie en H1/H2-context,
  zodat nevenwoorden zoals 'Shop', 'Tickets' en 'Hotel clients' niet zomaar de
  bewezen hoofdsector overnemen.
- **Metric truthfulness:** een onbekende sector telt niet als goed; een fout met
  94% zekerheid telt expliciet als 'high-confidence wrong'. Confidence-bins
  worden getoetst.
- **GitHub Actions:** test de nieuwe suites plus bestaande Node-suite automatisch
  op de geïsoleerde QA-branch. Rood blijft rood wanneer oudere tests falen.
- **Playwright:** de bestaande afgeschermde browsercontrole blijft draaien;
  de nieuwe sectorproeven zijn voorlopig **unit-/propertytests**, nog geen echte
  browsertests van sectorlabels in het dashboard.

## Reproduceer

```bash
npm install --no-audit --no-fund
npm install --no-save --package-lock=false --no-audit --no-fund vitest@4.1.11 fast-check@4.10.2 @playwright/test@1.64.1
npx vitest run tests/qa/sector-recognition.spec.ts --reporter=verbose
npm test
```

Nieuwe tests draaien offline op benoemde fictieve voorbeelden, zonder live
verzoeken naar klantwebsites of writes. Een geslaagde test betekent **niet**
dat sectorherkenning op onbekende echte websites 100% correct is.

## Vervolg voor Claude (pas na review)

1. Meet eerste onafhankelijke prestatie op een vooraf bevroren, echte,
   nog niet gebruikte benchmark met handmatig bevestigde hoofdsector.
   Vermijd overlap met bestaande EU81/hold-outsets en eerder geanalyseerde sites.
2. Rapporteer classificatie nauwkeurigheid, macro-F1, abstentiepercentage,
   verwarringsmatrix, 'high-confidence wrong' en kalibratie per taal/sector.
3. Onderzoek fouten in hun eigen bewijslijnen, onderscheid hoofdsector van
   nevenactiviteit, en controleer JavaScript-renders/multipage-crawls.
4. Repareer alleen algemeen aantoonbare oorzaken; **geen domein-/merkregels**
   toevoegen om individuele testwebsites kunstmatig correct te classificeren.
5. Maak eventuele daadwerkelijke verbeteringen uitsluitend als afzonderlijke
   concept-PR; voer regressies en een nieuwe blindtest uit.
6. Geen productiewijziging, geen merge en geen live deployment zonder
   expliciete toestemming.

De sectorherkenning is **alleen-lezen**: er is geen reden om klantwebsites te
wijzigen tijdens classificatie of QA.
