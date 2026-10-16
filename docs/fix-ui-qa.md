# Fix-knoppen — QA en één gebundelde commit

Basis: Claude engine `3b8d7fc9da0f64dbc402503e228d7f0b6f80c3e6`. Er worden **geen** wijzigingen in Claudes branch of productie gemaakt.

## Knoppen
| Waar | Verwachte werking |
|---|---|
| Openbare scan: codevoorstel | Alleen aantoonbaar bewezen en veilig toegestaan volgens centrale fix-policy |
| Openbare scan: overig probleem | Vraag AI om advies, zonder te doen alsof code is aangepast |
| Openbare scan: GitHub | Door naar ingelogde dashboardscan, niet direct naar muterende API |
| Dashboard: veilige bevinding | `scan_id` + `issue_id` en servervalidatie van opgeslagen bewijs |
| Gratis abonnement | Handmatig voorstel en duidelijk betaald-bericht; geen verborgen GitHub-publish |
| Betaald + GitHub | Repo koppelen, preview beoordelen, uitdrukkelijk goedkeuren, PR maken en status tonen |
| Na codewijziging | Live rescan bevestigt pas wanneer het probleem opgelost is |
| N.v.t./onbewezen/risicovol | Geen automatische codefix |

## Verplichte QA voor samenvoegen
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Browser op Android en desktop: public scan, veilige en onveilige fix, kopiëren, AI-advies, login.
- Testaccounts Free/Pro: paywall, GitHub OAuth, verkeerde repo, lege scan, diff, preview, annuleren, akkoord.
- Test eventuele PR + automatische merge **uitsluitend** op geïsoleerde dummy-repository; niet op productie.
- 401/403/422/429/500 tonen duidelijke fout; geen onterechte claim dat fix live is.
- Claude reviewt deze ene gebundelde commit. Geen merge of productie-deploy zonder expliciete toestemming.

**Commitdiscipline:** bundel samenhangende reparaties, tests en documentatie per reviewronde in één commit. Minder commits nooit ten koste van veiligheid, traceerbaarheid of rollback.
