# Checklist — veilige Vercel-preview Sector Motor 3.1

Alleen project `rankfix-app`, alleen Preview, alleen branch `feat/sector-motor-3-1-universal-evidence-arbiter-20261010`. Geen geheime waarden in de chat. Stap 6 en verder pas na uitdrukkelijke toestemming. Sinds `dc16d37` kan de preview **zonder database** publieke scans uitvoeren (homepage, achter Vercel-login); stap 2–5 zijn alleen nodig voor login, dashboard, PDF en Fix Engine.

| # | Stap | Wie | Status | Controle |
|---|---|---|---|---|
| 1 | Volledig Ignored Build Step-commando bevestigen (kopiëren uit Settings → Build and Deployment) | Gebruiker plakt tekst, Claude vergelijkt met de geteste 247 tekens | Open | Exacte tekstvergelijking |
| 2 | Neon `DATABASE_URL` van `rankfix-sector-3-1-test` toevoegen: Sensitive, alleen Preview, Git-branch = 3.1-branch | Gebruiker (Vercel-dashboard) | Open | Claude leest alleen naam/scope/branch/type |
| 3 | `SESSION_SECRET` (lokaal `openssl rand -hex 32`) en `USAGE_HASH_SALT`: Sensitive, alleen Preview, 3.1-branch | Gebruiker | Open | Naam/scope/branch |
| 4 | Niet-geheime Preview-variabelen voor de 3.1-branch: `APP_URL=https://rankfix-app-git-feat-sector-motor-3-1-universal-e-4cbd07-scoop5.vercel.app`, `RANKFIX_HEADLESS=off`, `RANKFIX_INTERNAL_TEST_EMAIL=<testadres>` | Claude via koppeling, na akkoord | Open | Bewust **niet**: Resend, OAuth, OpenAI, MONITOR_SECRET |
| 5 | Databasescheiding: Project ID en Endpoint ID (`ep-…`) van het nieuwe Neon-project verschillen van het oude testproject en van de Render-`DATABASE_URL`-host | Gebruiker vergelijkt; deelt alleen ID's | Open | Na stap 7 ook: tabellen + activiteit alleen in nieuw project |
| 6 | Eén goedgekeurde push van de lokale commits | Claude, na toestemming | Toestemming gegeven 11-10-2026 | Precies één build in `rankfix-app`, geen in `rankfix-app-ngfp` |
| 7 | Vercel-previewbuild | Automatisch | Open | READY, buildlog "Build: preview …", standaardbuild met Google Fonts slaagt |
| 8 | Basiscontrole preview: Vercel-login vereist; `/api/health/db` = connected; productie-account kan **niet** inloggen; testaccount registreren | Gebruiker + Claude | Open | — |
| 9 | Echte scan IKEA Nederland | Na toestemming | Open | Webshop, delivery/restaurant secundair |
| 10 | Echte scan IKEA internationaal | Na toestemming | Open | Bedrijfsportaal |
| 11 | Echte scan DiscountOffice | Na toestemming | Open | Webshop of nette toegangsblokkade |
| 12 | Representatieve sectoren (tandarts, makelaar, garage, transport, hotel, restaurant, kapper, beautywebshop, accountant, informatieve site) | Na toestemming | Open | Sector, modules, geen verzonnen fouten |
| 13 | Mobiele auditweergave | Gebruiker / Claude | Open | — |
| 14 | PDF-download | Gebruiker / Claude | Open | — |
| 15 | End-to-end Fix Engine (alleen met test-OAuth-app en testrepository) | Na toestemming | Open | PR aangemaakt, **geen** automatische merge, herscan |

Terugdraaien: Preview-variabelen verwijderen, Ignored Build Step leegmaken, preview-deployments verwijderen. Productie (Render, `main`, Vercel Production) blijft ongemoeid.
