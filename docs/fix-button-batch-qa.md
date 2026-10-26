# RankFix Fix-knoppen: batchcontrole (een commit)

Status: aparte QA-branch. Geen merge of productiedeployment.

## Controlelijst
1. Verzamel knopfouten per oorzaak en bundel goedgekeurde correcties in **één commit**.
2. Publieke scan: alleen FAIL/WARNING met een ondersteund type krijgt een voorstelknop. N/A, onbevestigd en onbekend krijgen geen nep-fix.
3. Publieke resultaten zijn geen opgeslagen audit. GitHub Fix leidt eerst naar een dashboardscan met vooraf ingevulde URL.
4. Vanuit opgeslagen audit → `/dashboard/github?scan_id=…&issue_id=…`. Geen rechtstreekse publicatie zonder deze IDs.
5. Controleer gratis/betaald: gratis ziet kopieerbaar voorstel en een duidelijke upgradeactie; betaald doorloopt OAuth en repositoryselectie.
6. Controleer preview, minimale diff, foutmeldingen, repo-rechten, server-side `lib/fix-policy.ts` en bewijscontrole.
7. **Let op:** bestaande backend probeert na gebruikersgoedkeuring de pull request automatisch te mergen. Test publiceren uitsluitend met een aparte testrepository.
8. Na publiceren controleren met nieuwe live scan. Geen DONE zonder aantoonbaar resultaat.
9. Voor review: `npm test`, lint, build en echte ingelogde browserchecks op desktop/mobiel.
10. Eén QA-PR per batch; Claude-branch en productie nooit overschrijven.

Deze batch herstelt openbare knoproutering, type-fallback, statusweergave en premium-uitleg.
