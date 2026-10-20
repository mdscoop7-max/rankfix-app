# PR #174 live hertests — 20 oktober 2026

QA-preview: https://rankfix-k486asi2e-scoop5.vercel.app/dashboard
Branch: qa/pr174-dbfree-live-20261020 (databasevrij; PR #174 engine plus afzonderlijke QA-vrijschakeling). Geen merge naar main of wijziging aan productie.

QA-testlimiet op 20 oktober verhoogd van 8 naar 20 scans per uur per netwerk, uitsluitend in deze beschermde previewbranch, naar aanleiding van een `QA_SCAN_LIMIT` na vijf gerapporteerde en andere niet-geslaagde scanpogingen. Nieuwe READY-deployment: https://rankfix-9ytfsbpby-scoop5.vercel.app/dashboard (HTTP 200 en QA-dashboard bevestigd). Productie en PR #174 zijn niet gewijzigd.

## Amsterdam.nl — 20:33:38 Nederlandse tijd
Korte gebruikerssamenvatting, volledig JSON-rapport nog niet ontvangen.

| Maatstaf | Eerdere scan | Nieuwe QA-preview |
|---|---:|---:|
| Totaal | 77 | 82 |
| SEO | 81 | 88 |
| GEO | 72 | 72 |
| Bewijsdekking | 90% | 88% |
| Aandachtspunten | 8 | 5 |
| Onbevestigd | 4 | 5 |

HTTP 200. Sector Overheid & Publieke sector (90%) ongewijzigd.
- Eerdere robots.txt-Disallow:/ waarschuwing en dubbele indexeerbaarheidswaarschuwing komen in nieuwe korte samenvatting niet meer voor. Dit is gunstig, maar controleer in volledig JSON of robots en indexeerbaarheid PASS zijn, niet alleen verborgen/onbevestigd.
- Sitemap-signaal: eerder waarschuwing bij 403/HTML; nu ONBEVESTIGD, niet langer bewezen sitefout. Dit past bij de fix, maar HTTP-status/content-type en user-agent zijn niet beschikbaar uit de korte tekst.
- Nieuwe aandachtspunten: meta description ontbreekt (fail), canonical ontbreekt (warning), structured data (warning), Organization + WebSite (warning), expliciete paginasamenvatting (warning). Niet onafhankelijk bevestigd; controleer of oorzaken dubbel gescoord worden (description + summary, JSON-LD + identity).
- Onbevestigd: mobiele viewport, HTML-taal, sitemap, meertalige SEO, bedrijfsgegevens.
- Conclusie: eerste live hertest geeft aanwijzingen dat robots- en sitemapfixes werken, maar bewijsdekking daalt twee punten; geen definitieve engine-goedkeuring zonder JSON en meer live voorbeelden.

## UMC Utrecht — 20:37:46 Nederlandse tijd
Door gebruiker aangeleverde korte QA-samenvatting, geen volledig JSON. Homepage `https://www.umcutrecht.nl/nl` HTTP 200. Sector Zorg & Gezondheid · universitair medisch centrum (92%), identiek aan eerdere scan.

| Maatstaf | Eerdere scan | Nieuwe QA-preview |
|---|---:|---:|
| Totaal | 91 | 91 |
| SEO | 99 | 99 |
| GEO | 80 | 80 |
| Bewijsdekking | 94% | 97% |
| Aandachtspunten | 3 | 3 |
| Onbevestigd | 2 | 1 |

- **Verbetering:** geen generiek `LocalBusiness`-advies in de korte uitvoer; waarschuwing spreekt over de `ziekenhuis-homepage`. Dit bewijst nog niet dat de uitvoer in JSON ook expliciet `Hospital` adviseert; dat vereist controle van het uitgebreide resultaat.
- **Verbetering:** Google Ads readiness valt weg uit onbevestigde controles, passend bij het verwijderen van de irrelevante GTM-only detectie voor een ziekenhuis. Alleen bedrijfsgegevens blijven onbevestigd.
- **Open:** OG-image `og:image` ontbreekt volgens scanner, ondanks nieuwe OG-extractieregels. Indien de bronsite daadwerkelijk geen bruikbare afbeelding heeft, is de blijvende waarschuwing terecht; controleer eerst rauwe HTML inclusief `og:image:secure_url`.
- **Open:** zowel Structured data als Organization + WebSite waarschuwen dat er geen valide JSON-LD/identity is bevestigd. Eerdere korte/leesbare scan meldde ook 'geen valide JSON-LD'. Dit kan een reëel SEO-advies zijn, maar toets gedeelde grondoorzaak/afwijkende scoring en eventueel alternatieve schema-microdata afzonderlijk.
- **Conclusie:** 3 procentpunt méér bewijs en één onbekende minder, maar geen score- of GEO-verbetering. De sectorbewuste advisering lijkt verbeterd; geen volledige acceptatie van PR #174 zonder originele JSON, raw HTML/headers, bewijs voor de juiste `Hospital`-aanbeveling en regressiecontrole.

## Universiteit van Amsterdam (UvA) — 20:40:29 Nederlandse tijd
Door gebruiker geplakte korte QA-samenvatting van `https://www.uva.nl/`, HTTP 200. Nog geen originele JSON-audit of onafhankelijke hercontrole van de live HTML.

| Maatstaf | Eerdere scan | Nieuwe QA-preview |
|---|---:|---:|
| Totaal | 91 | 91 |
| SEO | 95 | 95 |
| GEO | 85 | 85 |
| Bewijsdekking | 88% | 90% |
| Aandachtspunten | 3 | 3 |
| Onbevestigd | 5 | 4 |

- Herkende sector **Onderwijs & Opleiding (93%)** is stabiel.
- **Subsector blijft te generiek:** het label `Onderwijs & Opleiding` is inhoudelijk juist als hoofdsector, maar benoemt geen `universiteit`, `hoger onderwijs` of `wetenschappelijk onderwijs`. Verifieer of interne sectoridentiteit het subtype wel opslaat; anders sectorclassificatie uitbreiden zonder een niet-onderbouwd label te verzinnen. Een universiteit moet niet hetzelfde gedifferentieerd worden als een basisschool of trainingsbedrijf. Sectorlabel en schema-advies dienen dezelfde specifieke identiteit te volgen.
- **Verbetering:** geen generieke `LocalBusiness`-aanbeveling meer in de korte samenvatting; structured-data-melding benoemt specifiek een universiteits-/hogeschoolhomepage. Toets in volledige JSON of het concrete advies `CollegeOrUniversity` of `EducationalOrganization` is waar toepasselijk.
- **Nieuwe diagnostische specificiteit:** scanner meldt **1 geldig JSON-LD-blok met type `Intangible`**, maar geen bevestigd passend universitair identiteitstype. De aanwezigheid van `Intangible` bewijst niet dat er geen ander microdata-, JSON-LD- of gerenderd identity-schema is. Lees de originele JSON en eventueel raw HTML om deze claim te verifiëren.
- **Stabiel aandachtspunt:** meta description volgens scanner 26 tekens (warning). Lengte is een inhoudelijke optimalisatie, niet automatisch technisch ongeldig.
- **Mogelijke dubbele oorzaak:** 'Structured data' en 'Organization + WebSite' waarschuwen beide bij niet-bevestigde universiteitsidentiteit. Onderzoek aftrekdeduplicatie en welke types als Organization-subtype worden erkend.
- **Dekking:** 90% (+2 p.p.). De enige eerder onbevestigde `Google Ads readiness`-controle verdwijnt van lijst; resterend: sitemap, meertalige SEO, Consent Mode, bedrijfsgegevens. Dit lijkt consistent met de GTM-only fix, maar de korte uitvoer toont geen check-internals.
- Conclusie: **gedeeltelijke verbetering van sectorgerichte advisering en bewijsdekking**, zonder SEO/GEO-scorewijziging. Niet als volledige PR-goedkeuring markeren. Uitvoer verifiëren met JSON/HTML en extra branchetests.

## Coolblue — 20:45:05 Nederlandse tijd
Door gebruiker verstrekte korte QA-samenvatting van `https://www.coolblue.nl/`, HTTP 200. Geen volledige JSON-audit of raw HTML-headers uit dezelfde RankFix-fetch beschikbaar.

| Maatstaf | Eerdere scan | Nieuwe QA-preview |
|---|---:|---:|
| Totaal | 99 | 99 |
| SEO | 99 | 99 |
| GEO | 100 | 100 |
| Bewijsdekking | 85% | 85% |
| Aandachtspunten | 1 | 1 |
| Onbevestigd | 11 | 11 |

- Sector Webshop / e-commerce (88%) bleef ongewijzigd en is passend.
- **Geen aangetoond effect van de OG-image-fix op deze test:** `Social metadata` blijft warning: `og:image` ontbreekt volgens RankFix. De fix kan correct zijn terwijl de bronsite daadwerkelijk geen geldige OG-image aanbiedt; óf de parser mist nog een variant. Inspecteer de EXACTE serverrespons van de RankFix-fetch en de page head: `og:image`, `og:image:url`, `og:image:secure_url`, meerdere tags met lege eerste waarde, hoofdlettervarianten en JSON/HTML-weergave. Aparte onafhankelijke webtekstweergave van Coolblue toonde bruikbare sitecontent, maar bevat geen controleerbare meta-tagwaarden; directe verzoeken uit tijdelijke testomgeving liepen vast op DNS. **Geen false positive als bewezen claimen.**
- Stabiel 99/100 bij slechts 85% bewijsdekking en 11 onbevestigd. Beoordeel voorlopig-label/scoreband op SEO en GEO afzonderlijk (dit beleid is nog niet gewijzigd).
- In verkorte uitvoer: meertalige SEO, privacy/trust, Merchant Center feed, bedrijfsgegevens, checkout/funnel, EU-reviewtransparantie + 5 verdere controles onbevestigd. Leg exacte set vast uit originele JSON, geef geen N.v.t.- of FAIL-interpretatie zonder bewijs.
- **Status:** OG-image-fix nog niet bevestigd door live Coolblue-regressietest. Te testen met originele JSON + een gecontroleerde fixture waarin lege `og:image` wordt gevolgd door valide `og:image:secure_url`; ontbrekende tags moeten warning blijven.

## KPN — 20:47:52 Nederlandse tijd
Gebruikerssamenvatting van live QA-preview-scan `https://www.kpn.com/` (HTTP 200). Geen volledig JSON-rapport of onafhankelijk vastgelegde gerenderde DOM.

| Maatstaf | Eerdere productie-scan | Nieuwe PR #174 QA-preview |
|---|---:|---:|
| SEO | 99 | 99 |
| GEO | 99 | 99 |
| Totaalweergave | voorlopig bereik 68–100 | 99/100 in korte samenvatting |
| Bewijsdekking | 68% | 68% |
| Aandachtspunten | 0 | 0 |
| Niet bevestigd | 12 | 12 |

- Sector **Telecom & Technologie (96%)** bleef gelijk.
- Geen bewezen problemen of waarschuwingen, maar 12 controles onbevestigd. De korte samenvatting noemt expliciet: social metadata, privacy-/vertrouwenssignalen, Merchant Center productbasis, bedrijfsgegevens, prijs-/valutaconsistentie, productvariant-URL en nog zes niet gespecificeerde controles.
- **Renderprobleem niet gerepareerd of live opgelost:** 68% gewogen bewijsdekking blijft onveranderd, consistent met Claude's opgegeven open punt van ontbrekende JS-rendering/DOM. Die technische oorzaak is nog niet opnieuw bewezen zonder ruwe scan-JSON en renderdiagnostiek.
- **Scorecommunicatie als productrisico:** 99/99 als SEO/GEO-deelscore en een zichtbare korte `Totaal: 99/100` kan hoog vertrouwen suggereren bij slechts 68% dekking. Vorige rapport toonde voorlopig score-interval **68–100**. Bied een expliciete voorlopigheidskwalificatie én scorebereik en onzekerheid voor totaalscore en deelscores afzonderlijk. Onbekend = geen bewezen fout; verhoog scores niet automatisch door ontbrekende data.
- Test een gecontroleerde JS-zware fixture, browser/HTML-delta, netwerk-/bot-beperkingen, gedeelde oorzaak van onbekende checks en consistentie tussen korte, volledige en JSON-rapportweergave.
- **Beoordeling:** geen aantoonbare verbetering ten opzichte van eerdere scan. De enginefix-PR had rendering expliciet niet aangepast; geen acceptatiebewijs voor de KPN-casus.

## CERN (info.cern.ch) — 20:53:55 Nederlandse tijd
Gebruiker deelde een korte QA-samenvatting van `https://info.cern.ch/`, HTTP 200, op de vernieuwde databasevrije PR #174-preview. Originele volledige JSON ontbreekt.

| Maatstaf | Eerdere scan | PR #174 QA-preview |
|---|---:|---:|
| Totaal | 74 | 74 |
| SEO | 83 | 83 |
| GEO | 60 | 60 |
| Bewijsdekking | 51% | 51% |
| Aandachtspunten | 7 | 7 |
| Niet bevestigd | 28 | 28 |
| Sector | Niet bevestigd (0%) | Niet bevestigd (0%) |

- **Geen aantoonbare regressie of verbetering van de score/sector/dekking.** Claude had terecht aangegeven bewust geen historische/informatieve website-sector te verzinnen; het niet-bevestigde sectorlabel blijft eerlijk, maar de productkwaliteit bij deze lage dekking vraagt aandacht.
- Zichtbare aandachtspunten in korte uitvoer: ontbrekende meta description (fail), subheading zonder H2 (warning, advies in plaats van bewezen rankingverlies), ontbrekende canonical (warning), OG-tags `og:title`, `og:description`, `og:image` volgens scanner afwezig, ontbrekend JSON-LD-schema op historische homepage (warning) plus twee niet getoonde waarschuwingen.
- Voorbeelden van 28 onbevestigd: mobiele viewport, HTML-taal, contentdekking, sitemap, afbeeldingsbronnen, privacy-/trustsignalen en 22 overige controles. Niet als sitefout rekenen.
- **Belangrijker dan scorestabiliteit:** 51% bewijsdekking is onvoldoende om het cijfer 74 als definitief te presenteren; koppel totaal- en deelscores expliciet aan eigen onzekerheidskwalificatie en eventueel bandbreedte. Bij oudere/statische websites moet de motor historische doelstelling respecteren, zonder metadata die vrijwillig ontbreekt automatisch tot kritieke rankingclaims te verheffen.
- Controleer bij eventuele vervolgscan de twee niet-uitgeschreven waarschuwingen, alle 28 onbekenden en bewijsbron van de voornaamste beweringen uit het oorspronkelijke JSON-rapport.
- **Status:** live regressie uitgevoerd, grotendeels identiek aan eerdere scan; geen definitief acceptatiebewijs voor ontbrekende-bewijsbeleid, geen onafhankelijke HTML-hercontrole.

## Monumenten.nl — 20:57:22 Nederlandse tijd
Gebruiker deelde een korte QA-samenvatting van `https://www.monumenten.nl/`, HTTP 200, op de databasevrije preview. Geen volledig JSON-rapport; het gedrag van de redirect is nog niet onafhankelijk opnieuw gecontroleerd.

| Maatstaf | Eerdere scan | PR #174 QA-preview |
|---|---:|---:|
| Totaal | 99 | 99 |
| SEO | 99 | 99 |
| GEO | 100 | 100 |
| Bewijsdekking | 98% | 98% |
| Aandachtspunten | 1 | 1 |
| Niet bevestigd | 1 | 1 |
| Sector | Erfgoed & monumenteninformatie (93%) | Erfgoed & monumenteninformatie (93%) |

- Eén melding interne redirect blijft staan: **1 van 16 interne links (6%)** zou van `https://www.monumenten.nl/bedrijven` naar `https://www.monumenten.nl/specialistenwijzer` verwijzen via een redirect. Als bevestigd, is rechtstreeks linken naar de doel-URL een beperkte optimalisatie; het is **geen bewezen kapotte link** en niet noodzakelijk een ernstig rankingprobleem.
- `Broken links` blijft **onbevestigd**; dit is geen bewijs dat alle 16 links foutloos of kapot zijn.
- Geen nieuwe regressie zichtbaar in de beperkte samenvatting. Het is mogelijk dat de scanregels onveranderd bleven of dat een bugfix niet op deze site van toepassing was.
- **Conclusie:** stabiele baseline, geen onafhankelijk bewezen wijziging. Alle zeven geplande hertests afgerond.

## Evaluatie na 7/7 live hertests

| Website | Totaal vroeger → nu | SEO vroeger → nu | GEO vroeger → nu | Dekking vroeger → nu | Belangrijkste observatie |
|---|---|---|---|---|---|
| Amsterdam | 77 → 82 | 81 → 88 | 72 → 72 | 90% → 88% | Botspecifieke robots- en sitemapinterpretatie lijkt verbeterd; 5 open waarschuwingen |
| UMC Utrecht | 91 → 91 | 99 → 99 | 80 → 80 | 94% → 97% | Generiek LocalBusiness-advies weg uit korte tekst; 1 onbekend over |
| UvA | 91 → 91 | 95 → 95 | 85 → 85 | 88% → 90% | Generiek LocalBusiness-advies weg, JSON-LD Intangible gemeld; hoofsector nog breed |
| Coolblue | 99 → 99 | 99 → 99 | 100 → 100 | 85% → 85% | og:image blijft warning; fix op deze live site niet bevestigd |
| KPN | oude scoreband 68–100 → zichtbare 99 | 99 → 99 | 99 → 99 | 68% → 68% | Render-/bewijsverlies niet opgelost; 12 onbevestigd |
| CERN | 74 → 74 | 83 → 83 | 60 → 60 | 51% → 51% | Onbekende sector blijft eerlijk onbekend, 28 onbevestigd |
| Monumenten | 99 → 99 | 99 → 99 | 100 → 100 | 98% → 98% | Eén interne redirect blijft gerapporteerd |

### Voorlopig besluit
- **Positief en ondersteund door live scanoutput:** 7/7 websites geven weer een rapport; sectoren en basisresultaten blijven stabiel; Amsterdam-waarschuwingen over robots/sitemap lijken gecorrigeerd; bij UMC/UvA is generiek LocalBusiness-advies uit korte uitvoer verdwenen; bij UMC/UvA neemt bewijsdekking toe.
- **Niet bewezen:** daadwerkelijke correctheid van elk HTML/robots/schema/OG-resultaat zonder originele JSON, headers en live-fetched head; de correcte types `Hospital` en `CollegeOrUniversity` staan niet expliciet in de korte samenvattingen; de OG-image-parserfix wordt door Coolblue niet bevestigd.
- **Nog open voor technische acceptatie:** oorspronkelijke 2 bestaande falende dashboard-UI-tests reproduceerbaar/wegwerken; scanresultaten onder 70–90% dekking adequaat kwalificeren (inclusief **deelscores** en interval); renderverlies bij KPN; ontbrekende schema-identity en mogelijk dubbele oorzaakaftrek bij UMC/UvA/Amsterdam; sector-subtype UvA; eventuele production- en QA-pariteitscontrole met niet-destructieve fixtures.
- **Advies:** markeer draft PR #174 als **gedeeltelijk live gevalideerd maar niet release-klaar**. Geen merge naar basis, main of productiedeploy totdat de twee dashboardtests afgehandeld zijn, relevante uitgebreide JSON/HTML-bewijzen en neutrale regressietests de reparaties ondersteunen, en acceptatiecriteria expliciet zijn afgetekend. Bijkomende reparaties voor laag bewijs en rendering mogen als aparte vervolg-PR worden behandeld.
- **Bron:** uitsluitend korte, door gebruiker gedeelde QA-preview-auditresultaten; geen automatische scoreberekening of onafhankelijke verificatie van daadwerkelijke sitefouten. PR-status gecontroleerd op 20 oktober: open, draft en niet gemerged. Vercel-check op PR-head `b2c3b5d...` staat op success; dat bevestigt een geslaagde deploy, **niet** geslaagde inhoudelijke regressietests of een live-toelating.

## Afgeronde hertests en resterend bewijs
Alle zeven geplande sites zijn opnieuw gescand. Vraag indien nodig het volledige JSON-rapport en exacte HTML-/headerfragmenten op voor de nog onbevestigde bevindingen, vooral Amsterdam robots/sitemap, UMC/UvA schema's en Coolblue og:image. Geen productie- of main-wijzigingen uit deze QA-notitie.
