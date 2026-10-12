## Scanner-benchmark — 2026-10-12T11:31Z

Code onder test: `779050f` · lokaal gestart op GitHub-runner (ubuntu, Node 24) met lege wegwerp-database · browser: @sparticuz/chromium (zelfde als Vercel) · anonieme publieke scan, 1 tegelijk, 15 s pauze · serverlog: 0 interne scanfouten, 0 render-meldingen

| # | Type | URL | HTTP | Uitkomst | Totaal | SEO | GEO | Sec | Dekking | Sector | Websitetype | Paginatype | Platform (scanner) | Platform (HTML) | Render | Bot | Pagina's | Wall | CPU | Piek-RAM |
|---:|---|---|---:|---|---:|---:|---:|---:|---:|---|---|---|---|---|---|---|---:|---:|---:|---:|
| 1 | artikel (nieuws) | nos.nl/artikel/2634644-geen-bezorging-en-verkeerde-prijzen-i | 200 | scanned | 94 | 95 | 93 | 96 | 97% | news_media 88% | Nieuws-/mediasite | article (medium) | Next.js | Next.js | JS | nee | 20/20 | 22.7 s | 17.1 s | 933 MB |
| 2 | nieuwssite home | www.nu.nl/ | 200 | scanned | 88 | 98 | 72 | 97 | 100% | news_media 88% | Nieuws-/mediasite | homepage (high) | — | geen (HTTP 200) | raw | nee | 13/13 | 3.9 s | 1 s | 226 MB |
| 3 | nieuwssite (WP) | www.racesport.nl/ | 200 | scanned | 99 | 98 | 100 | 78 | 95% | news_media 95% | Nieuws-/mediasite | homepage (high) | WooCommerce+WordPress | WooCommerce | raw | nee | 25/25 | 7.6 s | 1.8 s | 291 MB |
| 4 | Shopify product | allbirds.de/products/w-tree-runner-freizeitschuhe-960tr3wkww | 200 | scanned | 97 | 95 | 100 | 86 | 91% | ecommerce 99% | Webshop | product (high) | Shopify | Shopify | JS | nee | 24/26 | 17.1 s | 23.1 s | 1046 MB |
| 5 | zorgpraktijk (WP) | www.acupunctuurdijkstra.nl/ | 200 | scanned | 92 | 98 | 83 | 86 | 100% | health_wellness 95% | Website | homepage (high) | WordPress | WordPress | raw | nee | 14/14 | 3.8 s | 0.3 s | 261 MB |
| 6 | webshop home | www.ikea.com/nl/nl/ | 200 | scanned | 99 | 99 | 100 | 92 | 85% | ecommerce 92% | Webshop | homepage (high) | Custom / niet bevestigd | geen (HTTP 200) | raw | nee | 30/30 | 6.2 s | 2.1 s | 312 MB |

**Totaal:** 6 URL's · 6 gescand · 0 niet gescand · wall 61 s (gem. 10 s, max 22.7 s) · CPU 45 s (gem. 8 s, max 23.1 s) · piek-RAM max 1046 MB

### Projectie Vercel Hobby (gemeten gemiddelde per scan × 30 nachten)
- 7 sites/nacht → 0.44 CPU-uur (11 % van 4 u) en 1.2 GB-uur (0 % van 360) per maand
- 29 sites/nacht → 1.83 CPU-uur (46 % van 4 u) en 4.9 GB-uur (1 % van 360) per maand
- Aanname: functiegeheugen 2 GB × wall-tijd; CPU gemeten op een GitHub-runner (Node + Chromium samen). Vercel-CPU kan afwijken; de Hobby-limieten worden gedeeld met al het andere productieverkeer.

### Bevindingen per site (FAIL / WARNING, voor controle op valse fouten)
- **https://nos.nl/artikel/2634644-geen-bezorging-en-verkeerde-prijzen-in-supermarkt-na-it-incident-bij-albert-heijn** · niet te bevestigen: BUSINESS_PLACEHOLDER
  - `WARNING` META_TITLE_GUIDANCE (high) — Meta title: De title is 88 tekens. Richtwaarde: 30–60 tekens; de punten lopen geleidelijk af naarmate de lengte verder van deze band ligt. · gevonden: Geen bezorging en verkeerde winkelprijzen na 'cyberveiligheidsincident' bij Albe
  - `WARNING` organization_website (high) — Organization + WebSite: De representatieve homepage bevat geen bevestigd Organization- of WebSite-schema.
- **https://www.nu.nl/**
  - `WARNING` internal_redirects (high) — Interne redirects: 1 van 16 gecontroleerde interne link(s) komt via een redirect op een andere URL uit (6%). Voorbeeld: https://www.nu.nl/voorpagina → https://www.nu.nl/. · gevonden: discovered=132; checked=16; redirected=1; sampleLimit=24; truncated=true
  - `WARNING` IMAGE_ALT_MISSING (high) — Afbeelding alt-teksten: 2 van 107 controleerbare <img>-elementen in de raw HTML missen alt (2%). JavaScript-geladen afbeeldingen zijn niet meegenomen. · gevonden: 2
  - `WARNING` SOCIAL_METADATA_INCOMPLETE (high) — Social metadata: Open Graph vraagt aandacht. Ontbrekend: og:image. · gevonden: og:title, og:description
  - `WARNING` STRUCTURED_DATA_MISSING (high) — Structured data: Geen geldige JSON-LD structured data gevonden voor deze homepage. Dit is een machineleesbare optimalisatiekans; de zichtbare pagina kan zonder JSON-LD nog steeds inhoudelijk correct zijn. · gevonden: validJsonLdBlocks=0
  - `WARNING` ORGANIZATION_WEBSITE_SCHEMA (high) — Organization + WebSite: De homepage bevat geen bevestigd Organization- of WebSite-schema. Dit is machineleesbaar identity-advies en geen bewijs dat de zichtbare organisatie-identiteit ontbreekt. · gevonden: organizationSchema=false; websiteSchema=false; schemaTypes=
- **https://www.racesport.nl/** · niet te bevestigen: consent_mode_readiness, GOOGLE_ADS_READINESS
  - `WARNING` IMAGE_ALT_MISSING (high) — Afbeelding alt-teksten: 6 van 86 controleerbare <img>-elementen in de raw HTML missen alt (7%). JavaScript-geladen afbeeldingen zijn niet meegenomen. · gevonden: 6
  - `WARNING` trust_legal_signals (high) — Privacy & vertrouwenssignalen: Niet alle basissignalen zijn gevonden: privacy. Cookie-informatie: niet bevestigd (geen bewijs van ontbreken). · gevonden: privacy=false; cookies=false; contact=true
- **https://allbirds.de/products/w-tree-runner-freizeitschuhe-960tr3wkww0027** · niet te bevestigen: HREFLANG_MISSING, trust_legal_signals, merchant_feed_signal, eu_discount_reference_signal, eu_review_transparency_signal, PRODUCT_VARIANT_URL, CHECKOUT_TRUST_SIGNALS
  - `WARNING` META_DESCRIPTION_GUIDANCE (high) — Meta description: De description is 405 tekens en is uitzonderlijk lang. Dit is optimalisatieadvies, geen op zichzelf bewezen rankingfout; de punten lopen geleidelijk af naarmate de lengte extremer wordt. · gevonden: Mit unseren luftigen, seidig-weichen Sneakern aus verantwortungsvoll angebauten 
  - `WARNING` IMAGE_ALT_MISSING (high) — Afbeelding alt-teksten: 14 van 61 controleerbare <img>-elementen in de raw HTML missen alt (23%). JavaScript-geladen afbeeldingen zijn niet meegenomen. · gevonden: 14
- **https://www.acupunctuurdijkstra.nl/**
  - `WARNING` headings (medium) — Heading-structuur: Er zijn 8 subheading(s) gevonden, maar geen duidelijke H2-laag. Dit is structuuradvies en geen bewezen rankingfout. · gevonden: 8
  - `WARNING` trust_legal_signals (high) — Privacy & vertrouwenssignalen: Niet alle basissignalen zijn gevonden: privacy. Cookie-informatie: niet bevestigd (geen bewijs van ontbreken). Wel bevestigd via de steekproef: contact: https://www.acupunctuurdijkstra.nl/contact/. · gevonden: privacy=false; cookies=false; contact=true
  - `WARNING` STRUCTURED_DATA_MISSING (high) — Structured data: 1 geldige JSON-LD block(s) gevonden, maar geen passend lokaal bedrijfsschema voor deze lokale bedrijfs-/dienstpagina. · gevonden: blocks=1; types=WebPage,ReadAction,BreadcrumbList,ListItem,WebSite,SearchAction,
  - `WARNING` ORGANIZATION_WEBSITE_SCHEMA (high) — Organization + WebSite: De homepage bevat één van de twee identity-schema's (Organization of WebSite); het aanvullende schema ontbreekt. · gevonden: organizationSchema=false; websiteSchema=true; schemaTypes=WebPage,ReadAction,Bre
- **https://www.ikea.com/nl/nl/** · niet te bevestigen: merchant_feed_signal, PRICE_FORMAT, checkout_funnel_static, checkout_information_signal, eu_discount_reference_signal, eu_review_transparency_signal, eu_consumer_information_signal, price_currency_consistency, WEBSHOP_TRUST_SIGNALS, PRODUCT_VARIANT_URL, PRODUCT_PRICE_CONSISTENCY, CHECKOUT_TRUST_SIGNALS
  - `WARNING` IMAGE_ALT_MISSING (high) — Afbeelding alt-teksten: 1 van 105 controleerbare <img>-elementen in de raw HTML missen alt (1%). JavaScript-geladen afbeeldingen zijn niet meegenomen. · gevonden: 1
