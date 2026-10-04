# RankFix handmatige tests

Deze map bewaart het testprotocol voor de pre-launch testsessie.

## Werkwijze
1. Start een nieuwe scan vanuit het RankFix-dashboard.
2. Open de audit en gebruik **PDF downloaden**.
3. Bewaar het bestand in je lokale map **RankFix tests**. De voorgestelde bestandsnaam bevat domein en scandatum.
4. Noteer fouten eerst; bundel fixes pas na de testsessie.
5. Herhaal na fixes dezelfde scan en vergelijk de PDF's.

## Testvolgorde
- System Health / Capacity Guard
- Scan Motor end-to-end
- URL-normalisatie zonder https:// en www
- Auditrapport en PDF
- Fix Engine end-to-end
- GitHub fix/PR flow
- Nieuwe scan ter verificatie
- Mobiel en desktop
- Talen NL/EN/FR/DE/IT/ES

> PDF-bestanden zelf worden niet in Git opgeslagen. Ze kunnen klant- of websitegegevens bevatten en horen in de lokale testmap.
