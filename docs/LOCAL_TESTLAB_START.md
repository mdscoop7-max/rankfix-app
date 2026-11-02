# RankFix Local TestLab — vaste opstartprocedure

Deze procedure is op 30 oktober 2026 lokaal bevestigd als werkend. **Behoud dit gedrag bij iedere wijziging door Claude of andere ontwikkelaars.**

## Normale werkwijze (Windows)

1. Open PowerShell in `C:\Users\user\Desktop\rankfix-qa`.
2. Haal de bedoelde QA-branch op, mits lokale wijzigingen veilig zijn bewaard: `git pull --ff-only origin fix/engine-evidence-new144-20261028`.
3. Sluit een eventueel oud Next.js/CMD-servervenster op poort 3002 voordat je een gewijzigde servercode test.
4. Start **uitsluitend** met `.\Start-RankFix-TestLab.cmd`.
5. De launcher opent `http://127.0.0.1:3002/api/testlab/local-session?token=...` in de browser. Deel de token-URL nooit.
6. De aanmeldpagina verifieert **in dezelfde browser** via `/api/testlab/catalog?catalog=fresh144` of de cookie werkt. Alleen na een geslaagde cataloguscontrole gaat de browser door naar `/dashboard/testlab?catalog=fresh144`.
7. Controleer dat de catalogus en websites zichtbaar zijn. Bewaar bestaande browsergegevens en IndexedDB-auditresultaten.

## Vast contract voor toekomstige wijzigingen

- Houd `Start-RankFix-TestLab.cmd`, `Start-RankFix-TestLab.ps1`, `lib/local-qa.ts`, `app/api/testlab/local-session/route.ts` en `app/api/testlab/catalog/route.ts` compatibel.
- **Een geslaagde PowerShell-tokenprobe bewijst geen browsersessie.** Meld niet dat het TestLab werkt voordat de browser zijn cookie en catalogustoegang heeft bevestigd.
- Behoud loopback-only toegang, cryptografische tokencontrole, HttpOnly/SameSite-cookie, lokale ontwikkelmodus en toegangscontrole. Schakel authenticatie nooit uit om het probleem te omzeilen.
- Verifieer na wijzigingen aan login, middleware, cookies, catalogus, Next.js of launcher de volledige browserflow; een groen CI-resultaat alleen is onvoldoende.
- Hergebruik na `git pull` niet ongemerkt een oude draaiende server: stop die eerst en start opnieuw wanneer servercode gewijzigd is.
- Maak geen nieuwe browserprofielen aan en wis geen cookies, localStorage of IndexedDB om een opstartfout te maskeren. Dit kan QA-resultaten ontoegankelijk maken.
- Wijzigingen aan deze flow vereisen regressietests voor geldige/ongeldige token, Set-Cookie, browser-catalogustoegang, afwijzing zonder sessie en de redirect na succesvolle verificatie.
- Geen automatische merge of deployment naar productie.

## Diagnose bij opnieuw vastlopen

Bij `401 LOCAL_QA_SESSION_REQUIRED` met `qaEnabled:true`, `loopback:true`, `cookiePresent:false` is de browser **niet aangemeld**. Het is geen probleem met de websites in de catalogus. Controleer of de launcher de aanmeldpagina in hetzelfde browserprofiel heeft geopend en of de browser de cookie voor `127.0.0.1` accepteert. Gebruik de foutmelding op de aanmeldpagina; start niet herhaaldelijk dezelfde probe zonder nieuwe aanwijzingen.

## Opmerking

De 144-site catalogus kan VDL bevatten; de TestLab-UI sluit die site uit van de bedoelde 143-site testronde. Dit staat los van authenticatie.
