# RankFix TestLab — snel starten op Windows

Dubbelklik in de RankFix-map op **Start-TestLab.cmd**.

- Gebruikt alleen localhost:3001 (127.0.0.1); er worden geen routerpoorten opengesteld.
- De eerste keer, of na een nieuwe Git-commit, wordt de lokale Next.js-build aangemaakt. Als je dezelfde versie opnieuw start en die build er nog is, wordt dit overgeslagen.
- Start de lokale RankFix-server in een **apart commandovenster**. Laat dit venster open tijdens het testen.
- Opent automatisch de nieuwe **72 webshops + 72 overige websites**-catalogus in je standaardbrowser: http://127.0.0.1:3001/dashboard/testlab?catalog=commerce.
- Als de juiste RankFix-server al draait, wordt alleen de browserpagina geopend.
- De bestaande 144-site baseline blijft beschikbaar via http://127.0.0.1:3001/dashboard/testlab.
- Bij ontbrekende .env.local, een bezette poort of een verkeerd actieve commit geeft de starter een foutmelding en verandert hij niets aan je database.

**Vereisten:** Windows 11, Git, Node.js 24, npm, je eigen .env.local, bereikbare PostgreSQL-database, een werkende lokale RankFix-gebruiker en toestemming als interne QA-tester (RANKFIX_INTERNAL_TEST_USER_ID of RANKFIX_INTERNAL_TEST_USER_IDS). Deel je .env.local, database-URL, loginwachtwoord of sessiecookie niet.

**Belangrijk:** de starter doet geen git pull en start **geen websitescans**. Download eerst bewust updates via GitHub wanneer jij dat wilt. Start de test vervolgens zelf in TestLab. Exporteer resultaten tussendoor naar JSON; de uitslagen worden per commit en catalogus lokaal in de browser bewaard.

Als je Chrome-tabblad sluit of de laptop in slaap gaat, stopt de TestLab-wachtrij. Open de starter opnieuw, ga terug naar de juiste catalogus en kies **Doorgaan met resterende**.
