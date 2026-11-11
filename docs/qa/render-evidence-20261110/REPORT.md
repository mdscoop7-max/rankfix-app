# Pearle — bewijs bij mislukte rendering, 10 november 2026

Broncode vóór reparatie: `a3d6da5162a63d06b5309092690329c0a4151bac`, op dezelfde bestaande branch `qa/codex-evidence-integrity-20261109`. De remote branch is vóór het werk opnieuw gecontroleerd. Geen nieuwe Git-branch, main-merge, navigatie- of scoreformulewijziging.

## Aangetoond in de echte gebruikersscan

De gebruiker scande `https://www.pearle.be/nl_BE` op 10 november om 22:45 (Europe/Amsterdam). Het geplakte rapport en de bijbehorende opgeslagen scan zijn vergeleken met een uitsluitend-lezen databasequery. De oorspronkelijke klantresponse en het geplakte rapport blijven privé. `reported-case.json` bevat de gecontroleerde relevante velden en de bronhash.

De scanner meldde `RENDER_TIMEOUT` op de primaire browserpogingen en `RENDER_BUSY` bij de homepage in de steekproef. Van 15 geselecteerde pagina's waren er 8 beoordeeld en 7 gescoord; 7 bleven niet opgehaald door het scanbudget. Dit is geen verbetering ten opzichte van de eerdere 16/16-pagina's-scan met JavaScript. De 98-score vergelijkt ander en beperkter bewijs met de eerdere 97-score. Canonical en social metadata zijn nu onbevestigd en vallen uit de score; het getal mag niet als SEO-verbetering worden gepresenteerd.

Twee daadwerkelijke enginefouten:

1. De primaire H1-controle was `warning`, confidence high, 6/8 punten. De steekproef voor dezelfde URL gaf `UNABLE_TO_CONFIRM`, zonder bewijs van afwezigheid. De primaire regel beschouwde 800 woorden raw HTML als afdoende voor een ontbrekende H1; de steekproef hield rekening met uitvoerbare scripts. Veel navigatietekst kan echter niet uitsluiten dat JavaScript de H1 toevoegt.
2. Commerce was `absent/service_identity`, hoewel een OnlineStore-schema zichtbaar was en relevante categoriepagina's niet waren onderzocht. De zekerheid over de hoofdactiviteit opticien bewees niet dat een eventuele nevenwebshop afwezig was.

## Reparaties

- `missingH1NeedsRender` deelt de bestaande steekproefregel met de hoofdscan. Zonder voltooide browserrender blijft ontbrekende H1-inhoud onbevestigd bij framework-/scriptbewijs en onvoldoende eigen hoofdinhoud. De bestaande lineaire hoofdinhoudextractor sluit navigatie, headers, footers en soortgelijke paginachroom uit. Een substantieel echt SSR-document behoudt zijn bewijs, ook als de browserweergave slechter was. JSON/JSON-LD-scriptblokken zijn geen uitvoerbare scripts voor deze regel. Positief gevonden H1-bewijs blijft geldig. Een daadwerkelijk ontbrekende H1 in complete statische HTML of een voltooide render blijft een waarschuwing.
- De commercebeslissing ontvangt expliciet dat relevant retailbewijs onvolledig is: retailaanwijzingen zoals OnlineStore, een hard winkelsignaal of eigen online-retailbeschrijving, plus mislukte vereiste rendering of ononderzochte product-/categoriepagina's. Dat wordt `unconfirmed/low_coverage`, zonder onterechte N.v.t.-overschrijving door de latere dienstverleningsregel. Bevestigde commerce houdt voorrang en een daadwerkelijke toegangsweigering behoudt de eigen oorzaak. De hoofdsector wordt hierdoor niet veranderd.

Er is geen uitzondering voor Pearle of een andere domeinnaam toegevoegd. Scoremodel, kernset, onzekerheidsberekening en bewijsdekkingsformules zijn niet aangepast; de eerder aan de gebruiker toegewezen scorepunten 1 en 2 blijven apart.

## Herhaalbaar bewijs

`tests/scan-matrix/run-incomplete-render.mjs` roept de echte scanroute aan met gecontroleerde responses en een bestuurbare browserstub. Het is nadrukkelijk geen live websitescan en geen replay met verzonnen ontbrekende netwerkresponses. De fixture bevat een scriptgedreven opticien met veel navigatietekst maar lege hoofdinhoud, een positieve H1-variant, een complete statische dienstverlener en een voltooide-render-variant. Bekende winkelpagina's geven een gesimuleerde transport-timeout; onverwachte overige paden zijn expliciet onderdeel van de synthetische testomgeving.

`before.tap`: 2 tests mislukt vóór de reparatie. `after.tap`: beide geslaagd na reparatie. `controlled-before-after.json` toont per variant de werkelijke route-output: vóór de wijziging een onterechte H1-waarschuwing en onterechte commerce-afwezigheid; erna overeenkomstige H1-onzekerheid en onbevestigde commerce. Statische/gerenderde H1-waarschuwingen, positief H1-bewijs en de opticiensector blijven behouden. De suite controleert ook dat onafhankelijke bevestigde commerce voorrang houdt.

De gerichte bestaande regressies voor SSR, frameworks, diensten, webshops en scanners: 174 geslaagd. Typecheck, lint en build geslaagd; lint 0 fouten en 60 bestaande waarschuwingen. De eerste volledige suite meldde 1228 geslaagd, 1 mislukt en 8 bestaande skips: het bestaande SSR-degradatiescenario werd te voorzichtig beoordeeld. De reparatie is verfijnd met bewijs uit echte hoofdinhoud; de bestaande verwachting is niet gewijzigd. Alle 17 bestaande renderscenario’s en de definitieve 174 gerichte tests zijn daarna groen. De volledige suite en remote CI worden afzonderlijk opnieuw afgerond en aan deze bewijsset/PR gekoppeld.

## Nog open

- De daadwerkelijke rendering-time-outs en capaciteit op Render zijn hiermee niet opgelost. De gemeten auditperiode 21:40–21:46 UTC (22:40–22:46 Amsterdam) toont CPU-gebruik tot de limiet van 0,15 core en maximaal circa 94,3% van de 512 MiB-geheugenlimiet (`render-metrics.json`). Dit ondersteunt een capaciteitsknelpunt, maar bewijst niet dat elke afzonderlijke time-out door geheugen of CPU is veroorzaakt. Er is geen deadline verhoogd, capaciteit gekocht of storing verborgen. Eerst een echte scan van de nieuwe live commit voordat er iets over verbeterde browser-/paginadekking wordt geconcludeerd.
- Een onzekerheidsbereik blijft in dit Pearle-geval relevant: canonical, social metadata en author zijn onbevestigde kerncontroles. Zonder hun bewijs is een vast 98–98-bereik niet afgetekend.
- De uitleg van getelde versus gewogen dekking, N.v.t./onbevestigd als 0/max bij security/toegankelijkheid en de overige eerder genoemde rapportagepunten zijn niet als gerepareerd meegerekend.
- Verplichte oorspronkelijke mkb-invoer en nulmeting blijven ontbreken. De historische 144-metingen zijn geen nieuwe liveacceptatie van deze reparatie.
- De Render-service is aan `main` gekoppeld met auto-deploy uit. De beschikbare connector kan geen specifieke commit kiezen en omgevingwijzigingen kunnen toch een main-build starten. Voor de nieuwe code wordt geen gewone latest-main-deploy of configuratiewijziging getriggerd. Deploy de geteste QA-commit expliciet en controleer daarna de werkelijke live SHA.

## Definitieve lokale uitslag

De volledige suite op de definitieve broncode is geslaagd: **1237 tests totaal, 1229 geslaagd, 0 mislukt, 8 bestaande skips**, exitcode 0 (515,7 seconden). De skips zijn de bestaande vier PostgreSQL-opt-ins, één langzame time-out-opt-in en drie optionele volledige replays, niet als succes geteld. Typecheck, productiebuild en lint zijn opnieuw geslaagd (0 lintfouten, 60 bestaande waarschuwingen). De daadwerkelijke livewerking op Render vereist nog een deployment van deze nieuwe commit en een nieuwe scan; het bestaande klantresultaat wordt niet achteraf als gerepareerd gepresenteerd. GitHub-checks worden na push in PR #223 vastgelegd.
