# RankFix: alleen het bewezen scanprobleem aanpassen

**Veiligheidsprincipe:** één bewezen audit-issue -> één minimaal codevoorstel.
Alles buiten dat issue moet ongewijzigd blijven. Dit is een harde ontwerpvoorwaarde,
niet een claim dat het volledige principe al bewezen geïmplementeerd is.

## Verboden neveneffecten

Een H1-fix is geen toestemming om titel, metadata, branding, afbeeldingen, kleuren,
layout, navigatie, footer, producten, prijzen, voorraad, winkelwagen, betalingen,
orders, privacy-instellingen, database, hosting of andere pagina's te wijzigen.

Een meta-title-fix is geen toestemming om meta-description of Open Graph te wijzigen.
Een social-metadata-fix is geen toestemming om de normale sitetitel te wijzigen.
Een ontbrekend veilig bewijs, onduidelijk eigenaarschap of onbetrouwbare mapping
blokkeert codepublicatie.

## Vereiste stappen voor Claude en de RankFix Fix Engine

1. Lees alleen het bij de juiste gebruiker behorende actuele scanresultaat; valideer
   exacte \`scan_id\`, \`issue_id\`, bewijs, status en zekerheid server-side.
2. Controleer dat het issue nog bestaat, de doelrepository bij de site hoort, en de
   bron/commit overeenkomt met de versie waarop de wijziging is gebaseerd.
3. Maak een kleine, issue-specifieke diff. **Vergelijk elk gewijzigd codefragment**
   met een whitelist voor dat type issue, niet alleen de hoeveelheid gewijzigde regels.
4. Onverwachte wijzigingen moeten blokkeren, ook als de AI zegt dat ze nuttig zijn.
   Geen AI-zelfgoedkeuring. Wat de validator niet precies kan verifiëren wordt
   een handmatig voorstel, geen automatische sitewijziging.
5. Maak uitsluitend een **Pull Request**, zonder automatisch samenvoegen.
   Toon aan de klant in begrijpelijke taal precies wat verandert en wat behouden blijft.
6. Vóór handmatige merge: controleer build, regressietests, browserfunctionaliteit
   en een veilig codeherstelpunt. Controleer de voorafgaande versie op geldigheid.
7. Na goedgekeurde merge/deployment: controleer de live site onafhankelijk opnieuw.
   Meld "hersteld" alleen na bewezen oplossing, anders "niet bevestigd".
8. Bied via GitHub een getest, expliciet bevestigd revert-PR herstelpad aan.
   Pas nooit automatisch databases/orders terug; die zijn geen GitHub-codebackup.

## Stand van het huidige werk

- Vorige concept-PR #176 verwijdert de auto-merge in de Fix Engine-route, nog niet live.
- De issue-scope conceptbranch beperkt de autorisatie van normale SEO/Open Graph
  metadata-aanpassingen tot de **exacte scanregel-ID**, en test het blokkeren van
  ongeoorloofde edits en kwaadaardige tekstuele suggesties.
- Dit bewijst **nog niet** dat alle mogelijke broncodewijzigingen automatisch en
  volledig op issue-scope kunnen worden gevalideerd. Vooral HTML/JSX body, stylesheet,
  formulier, winkelwagen, authenticatie en niet-herkende frameworks vragen strengere
  diff-/AST-validatie en echte sandbox-regressies.
- Daarom voorlopig: **geen productie-uitrol en geen claims van absolute veiligheid.**

## Kwaliteitsgrens voor release

Het systeem moet tijdens ten minste de sandbox end-to-end scenario's aantonen:
- toegestane minimale wijzigingen zijn mogelijk;
- dezelfde AI-fix met ongeoorloofde nevenwijziging wordt hard geblokkeerd;
- API, UI en database registreren de geblokkeerde wijziging correct;
- er vindt geen GitHub merge of deployment door RankFix plaats;
- handmatige merge + nieuwe scan zijn aantoonbaar te volgen;
- een herstel-PR kan worden aangemaakt en afzonderlijk veilig herbevestigd.
