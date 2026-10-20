# RankFix Safe Restore — klantvriendelijk herstel via GitHub

**Status: voorstel, niet geïmplementeerd of op productie actief.**
Opgesteld voor technische review in de geïsoleerde concept-PR #176. Geen merge/deploy zonder expliciete toestemming.

## Het probleem

Een klant zonder GitHub-kennis moet na een mislukte Fix Engine-wijziging kunnen terugkeren
naar een **aantoonbaar eerder werkende versie**, zonder git-commando's te hoeven kennen.

Een auditrapport, HTML-snapshot of in `fix_proposals.original_content` bewaarde
broncode is **niet voldoende om een volledige website te herstellen**.
GitHub bevat alleen bestanden die werkelijk worden geversioneerd. Hostingconfiguratie,
externe databases, CMS-content, uploads, actuele orders en klantgegevens kunnen ontbreken.

## Voorgestelde UX

**RankFix Dashboard → Mijn website → Fixgeschiedenis → [Herstel vorige versie]**

- Toon de laatste **geverifieerde werkende** versie, tijdstip, bron (GitHub commit +
  indien beschikbaar provider deployment-ID), en *wat het herstel wel/niet terugzet*.
- De gebruiker kiest **Bekijk herstelvoorstel**. RankFix maakt een veilige diff en
  toont gevolgen, bijvoorbeeld gewijzigde pagina's, verlies van nieuwere aanpassingen,
  en of databases/webshopgegevens buiten het herstel vallen.
- **Test alleen in een isolatie-/previewomgeving**: build, unit-/browserchecks,
  security, kritieke routes, oorspronkelijke issue(s). Geen echte klantgegevens wijzigen.
- Gebruik **Herstel bevestigen** als afzonderlijke, expliciete autorisatiestap.
  De knop wordt niet actief als vereiste checks of rechten ontbreken.
- Daarna: maak een **revert Pull Request** gericht op alleen de betrokken fixcommit(s);
  geen `git reset --hard`, force-push of willekeurig terugzetten van een hele branch.
  De PR krijgt een geverifieerde reviewer/branch-protection gate; RankFix voert
  **geen automatische merge** uit bij het indienen.
- Een klant hoeft GitHub-techniek niet te kennen: de interface geeft voortgang,
  een eenvoudige uitleg en een link voor de bevoegde reviewer/beheerder.
  Een toekomstige provider-specifieke één-klik-redeployment mag pas na afzonderlijke
  beveiligings- en rechtenreview worden geactiveerd.
- Controleer na de **daadwerkelijke** samenvoeging en deployment de live website
  onafhankelijk. Status uitsluitend 'Hersteld' als site daadwerkelijk is teruggekeerd
  naar de afgesproken werkende toestand; anders 'Niet bevestigd' of 'Herstel mislukt'.

## Minimaal technisch bewijs per fix

Bewaar per ingreep (met passende bewaartermijn en toegangscontrole):
- klant-, site- en repository-ID, eigenaarstoestemming en gekoppelde hostingprovider;
- audit-ID, issue-ID, regelversie, bewijs, doel-URL en scanmoment;
- `base_commit_sha`, PR-nummer, specifiek wijzigingscommit-SHA, file hashes en
  provider deployment-ID, plus geverifieerde status;
- de exacte voorafgaande file-/codeversie, zonder secrets of privacygevoelige data
  in logs, diffs of test-artefacten;
- restore-capabilities: code-only, deploy-only, CMS/database/asset backup *verified*;
- backup- en restore-testtijdstippen, proefresultaten, approver en complete audittrail.

**Een geslaagde eerdere build is niet automatisch bewijs dat alle klantfuncties werkten.**
Laat 'laatst werkende' alleen zien bij voldoende independent testbewijs.
Anders label 'vorige codeversie — werkende toestand niet bevestigd'.

## Wat absoluut niet mag

- Geen automatisch herstellen van een gehele klantwebsite op grond van alleen een scan.
- Geen terugzetten van een webshopdatabase naar gisteren: dat kan recente
  bestellingen, betalingen en klantgegevens verwijderen.
- Geen downgrade van schema, productprijzen, orderstatus, betaalgegevens of CMS-inhoud
  zonder apart gecontroleerd, provider-specifiek restoreplan.
- Geen opslag van volledige back-ups in de standaard scanrapportendatabase zonder
  encryptie, toegangsmodel, retention, kosteninschatting en verwerkers-/AVG-toets.
- Geen misleidende '1-klik herstel beschikbaar'-claim als er geen beproefde backup of
  autorisatie bestaat. Gebruik in dat geval 'Hulp bij herstel' / 'Herstel niet beschikbaar'.
- Geen directe merge, force-push, productie-write of deploy in dit voorstel.

## Implementatiefasen voor Claude Code

1. Bouw eerst een **read-only restore-capability check** per gekoppelde site
   (GitHub commitversies en deployment history waar autorisatie dit toelaat);
   gebruik een kleine typed status: AVAILABLE / NEEDS_REVIEW / UNAVAILABLE / UNCONFIRMED.
2. Toon een eenvoudige klantinterface, zonder herstelacties zolang er geen
   onafhankelijke sandboxtests en eigenaarstoestemming zijn.
3. Bouw daarna gecontroleerde revert-PR-generatie, idempotentie, race guards,
   file-integriteitscontroles, audit logging en rollen/rechten.
4. Integreer GitHub Actions checks + Playwright browserflow met **gemockte GitHub write-API**
   en een afzonderlijke sandbox integration test voor echte PR/preview/deploy/herscan.
5. Test aparte providers; voor een echte WordPress- of webshop-full-restore zijn
   provider-specifieke database-/bestandsbackups en bewezen restorability nodig.
6. Pas na bewezen betrouwbaarheid en autorisatie eventueel een eenvoudiger
   geautomatiseerde release-/restorebevestiging toe. *Geen auto-merge als default.*

## Gebruikerstekst

> 'Er is iets misgegaan na een fix. RankFix heeft een eerder opgeslagen codeversie
> gevonden. Bekijk eerst wat veilig hersteld kan worden. Bestellingen en andere
> actuele websitegegevens veranderen niet door dit codeherstel.'

**Definitie van klaar:** live herstel is aantoonbaar getest op een wegwerp-testwebsite,
incl. een gefaalde herstelpoging en een volledige documentatie van wat niet is hersteld.
