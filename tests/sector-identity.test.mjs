import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TOURISM_ACTIVITY_PATTERN, TOURISM_IDENTITY_PATTERN, hasOrganizationSchema, hasRetailStoreSchema, isTourismBoardHost, retailIdentityLanguage, retailStoreSchemaTypes, financialServicePrimaryIdentity, isLocalizedHomePath, primaryNonRetailRole } from "../lib/sector-identity.ts";
import { buildScanEvidence } from "../lib/scan-evidence.ts";

// Page identity (title, meta description, hostname, path) as served on 11 Oct 2026.
const SITES = {
  ikeaNl: "Betaalbare meubels & accessories – Alles voor je huis - IKEA Welkom bij IKEA! · Ontdek onze meubels en inspiratie voor elk budget en elk huis · Bestel online of kom langs in een van onze woonwinkels. www.ikea.com /nl/nl/",
  ikeaGlobal: "Hej! Welcome to IKEA Global Furniture, home accessories, design ideas and inspiration for big dreams and small budgets. A better everyday life begins at home! www.ikea.com /",
  zalando: "Zalando | Kleding, schoenen & accessoires online kopen Zalando online | Mode, beauty, sport & accessoires | Jouw favoriete merken voor dames, heren & kids www.zalando.nl /",
  expert: "Beste service, vertrouwd dichtbij | Expert.nl Expert is met 140 winkels door heel Nederland specialist in home-elektronica ✓ Beste Service ✓ Persoonlijk Advies www.expert.nl /",
  coolblue: "Coolblue - Alles voor een glimlach Beste webwinkel 2022. Voor 23.59u besteld? Morgen gratis bezorgd. Ook op zondag! Gratis retourneren. www.coolblue.nl /",
  kwikfit: "KwikFit - APK, Autobanden en Auto-onderhoud KwikFit: ✓ Kwaliteit Voorop ✓ Altijd in de Buurt ✓ Snel Klaar! Autobanden, APK, kleine beurt, grote beurt, accu's en meer. KwikFit autoservice! www.kwik-fit.nl /",
  transheroes: "Internationaal transport, zeevracht, luchtvracht & douane | TransHeroes Wegtransport | Zeevracht | Luchtvracht | Koeriersdiensten | Railtransport | Douaneafhandeling | Transport | Logistiek expediteur www.transheroes.com /nl/",
  housingnet: "Uw makelaar met meer dan 10 jaar ervaring | HousingNet Een woning huren, verhuren, kopen of verkopen? Verhuren aan een expat? HousingNet begeleidt u van A tot Z, met een persoonlijke aanpak. www.housingnet.nl /",
  dekas: "Restaurant de Kas PICKED IN THE MORNING, SERVED IN THE AFTERNOON From plant to plate. In de ochtend geoogst, In de middag op het bord restaurantdekas.com /",
  artiscent: "Artiscent Wellness Alkmaar - De Thaise City Spa Massage en Wellness Center van Alkmaar Thaisemassage, Duo Massage, Nek Schouder Rug Massage www.artiscentwellness.nl /",
  ljdevries: "Schoonmaakbedrijf L.J. de Vries - Betrouwbare zakelijke schoonmaak Betrouwbare zakelijke schoonmaak met oog voor kwaliteit. Duidelijke afspraken en vaste teams. ljdevries.nl /",
  tandarts: "Tandarts Amsterdam - Tandartspraktijk Plantage Middenlaan Tandarts Amsterdam: Tandartspraktijk Plantage Middenlaan in Oost ✓diverse specialisaties ✓snel een afspraak ✓ruimte voor spoedgevallen. tandartsplantagemiddenlaan.nl /",
};

test("generic marketing verbs and on-site facilities are not tourism identity", () => {
  for (const [name, identity] of Object.entries(SITES)) {
    assert.equal(TOURISM_IDENTITY_PATTERN.test(identity), false, `${name} must not have tourism identity`);
  }
  // Phrases seen on retail, restaurant and brand pages in representative crawls.
  for (const phrase of ["Ontdek onze meubels", "ontdek nu alle producten", "Visit our store", "Plan your visit to the restaurant", "Visit IKEA", "bezoekers welkom", "destination for design"]) {
    assert.equal(TOURISM_IDENTITY_PATTERN.test(phrase), false, phrase);
  }
  // Restaurants and hotels belong to hospitality and are no longer counted as tourism activity.
  assert.equal(TOURISM_ACTIVITY_PATTERN.test("Restaurant de Kas · hotels in de buurt"), false);
});

test("real tourism identity is still recognised", () => {
  assert.equal(TOURISM_IDENTITY_PATTERN.test("VVV Texel – toeristische informatie over het eiland"), true);
  assert.equal(TOURISM_IDENTITY_PATTERN.test("Citymarketing Utrecht: things to do in the city"), true);
  assert.equal(TOURISM_IDENTITY_PATTERN.test("Tourism board of Zeeland"), true);
  assert.equal(TOURISM_ACTIVITY_PATTERN.test("Agenda, evenementen en bezienswaardigheden"), true);
  assert.equal(isTourismBoardHost("www.visitzeeland.nl"), true);
  assert.equal(isTourismBoardHost("visit-amsterdam.com"), true);
  assert.equal(isTourismBoardHost("www.ikea.com"), false);
  assert.equal(isTourismBoardHost("visitor.example.com"), false);
});

test("retail identity recognises both word orders and compound store words", () => {
  const ikea = retailIdentityLanguage(SITES.ikeaNl);
  assert.deepEqual(ikea, { assortment: true, onlineSales: true, store: true });
  assert.equal(retailIdentityLanguage(SITES.zalando).onlineSales, true);
  assert.equal(retailIdentityLanguage(SITES.zalando).assortment, true);
  const expert = retailIdentityLanguage(SITES.expert);
  assert.equal(expert.assortment && expert.store, true);
  assert.equal(retailIdentityLanguage(SITES.coolblue).onlineSales, true);
  assert.equal(retailIdentityLanguage("Bekijk je winkelwagen").store, false);
  assert.equal(retailIdentityLanguage("Bestel direct online").onlineSales, true);
});

test("service, hospitality and transport identities carry no retail sales language", () => {
  for (const name of ["kwikfit", "transheroes", "housingnet", "dekas", "artiscent", "ljdevries", "tandarts"]) {
    const language = retailIdentityLanguage(SITES[name]);
    assert.equal(language.onlineSales, false, `${name} onlineSales`);
    assert.equal(language.assortment && language.store, false, `${name} assortment+store`);
  }
});

test("schema.org Store subtypes are retail schema; service types are not", () => {
  assert.deepEqual(retailStoreSchemaTypes(["WebSite", "OnlineStore", "FurnitureStore"]), ["OnlineStore", "FurnitureStore"]);
  assert.equal(hasRetailStoreSchema(["ElectronicsStore"]), true);
  assert.equal(hasRetailStoreSchema(["ClothingStore"]), true);
  for (const types of [["Organization", "LocalBusiness"], ["Restaurant"], ["AutoRepair"], ["Dentist"], ["RealEstateAgent"], ["BeautySalon"], ["HomeAndConstructionBusiness"]]) {
    assert.equal(hasRetailStoreSchema(types), false, types.join(","));
  }
});

test("Evidence Layer reads array-valued @type such as OnlineStore + FurnitureStore", () => {
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":["OnlineStore","FurnitureStore"],"name":"Shop"}</script><script type="application/ld+json">{"@type": "WebSite"}</script></head><body></body></html>`;
  const evidence = buildScanEvidence({ url: "https://shop.example/nl/", html });
  assert.ok(evidence.schema.types.includes("OnlineStore"));
  assert.ok(evidence.schema.types.includes("FurnitureStore"));
  assert.ok(evidence.schema.types.includes("WebSite"));
});

test("scan route wires the central identity rules without brand exceptions", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /patterns:\[TOURISM_IDENTITY_PATTERN,TOURISM_ACTIVITY_PATTERN\]/);
  assert.equal(source.includes("ontdek [a-zà-ÿ-]+"), false);
  assert.equal(source.includes("visit [a-zà-ÿ-]+"), false);
  assert.match(source, /const hasStoreSchema = hasRetailStoreSchema\(schemaTypes\)/);
  assert.match(source, /storeSchemaRetailIdentity = storeSchemaTypes\.length > 0 &&/);
  assert.match(source, /retailIdentityLanguage\(sectorIdentitySource\)/);
  // French "vol" (flight) collides with Dutch "vol" (full) and made retail pages transport bookings.
  assert.equal(source.includes("|vols?|"), false);
  assert.match(source, /\|airport\|vols\|vlucht\|/);
  // Market selectors are labelled as a portal and never fall back to a guessed sector.
  const selector = source.indexOf('marketSelectorPage && !finalCommerceDecision.confirmed && sectorProfile.key==="unknown"');
  assert.ok(selector > 0);
  assert.ok(selector < source.indexOf('multiPageCapabilities.transport && sectorProfile.key==="unknown"'), "selector before transport fallback");
  assert.ok(selector < source.indexOf('multiPageCapabilities.hospitality && (sectorProfile.key==="recruitment" || sectorProfile.key==="unknown")'), "selector before hospitality fallback");
  // Retail identity without confirmed shop functionality is labelled as such, and
  // in-store reservations never turn a retailer into a booking website.
  assert.match(source, /sectorProfile\.key === "ecommerce" && !finalCommerceDecision\.confirmed\) \{\n\s+sectorProfile\.label = "Retail · webshopfunctionaliteit niet bevestigd"/);
  assert.match(source, /sectorProfile\.key !== "ecommerce" && masterEvidence\.businessModels\.some\(model => model === "appointments"/);
  assert.equal(/\bikea\b|zalando|coolblue|kwik-?fit|transheroes|housingnet|dekas/i.test(await readFile(new URL("../lib/sector-identity.ts", import.meta.url), "utf8")), false);
});

test("a blocked or empty browser render is never treated as website evidence", async () => {
  const { isSubstantiveRender, renderImprovesEvidence, visibleWordCount } = await import("../lib/render-quality.ts");
  // Shape of a bot-blocked render: HTTP 200, a brand <title>, almost no content.
  const blocked = "<html><head><title>Coolblue</title></head><body><div>Coolblue - alles voor een glimlach</div><script>x()</script></body></html>";
  const rich = `<html><head><title>Shop</title></head><body>${"<p>Productinformatie en levering</p>".repeat(60)}</body></html>`;
  assert.equal(visibleWordCount(blocked), 7);
  assert.equal(isSubstantiveRender(blocked), false);
  assert.equal(isSubstantiveRender(rich), true);
  assert.equal(isSubstantiveRender(null), false);
  // Rich raw HTML (e.g. SSR Next.js) is kept when the render is poorer.
  assert.equal(renderImprovesEvidence(visibleWordCount(rich), false, blocked), false);
  assert.equal(renderImprovesEvidence(visibleWordCount(rich), false, rich), true);
  // A thin client shell is still replaced by a meaningful render.
  assert.equal(renderImprovesEvidence(5, true, rich), true);
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.equal(source.includes("html.length >= 20) {"), false, "no render is accepted on byte length alone");
  assert.equal((source.match(/isSubstantiveRender\(/g) || []).length, 4, "primary, quality-gate, representative and second-hop renders");
  assert.equal((source.match(/renderImprovesEvidence\(/g) || []).length, 2);
});

test("schema.org Organization subtypes count as Organization identity", async () => {
  for (const types of [["Organization"], ["OnlineStore", "FurnitureStore"], ["LocalBusiness"], ["Dentist"], ["Restaurant"], ["AutoRepair"], ["RealEstateAgent"], ["Corporation"]]) {
    assert.equal(hasOrganizationSchema(types), true, types.join(","));
  }
  for (const types of [["WebSite"], ["WebPage", "BreadcrumbList"], ["Product", "Offer"], ["Person"], []]) {
    assert.equal(hasOrganizationSchema(types), false, types.join(","));
  }
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const organizationSchemaPresent = hasOrganizationSchema\(schemaTypes\)/);
  assert.match(source, /const hasOrg = hasOrganizationSchema\(homepageTypes\)/);
  assert.equal(source.includes('homepageTypes.has("organization")'), false);
});

test("the scanned page is reused as its own representative sample, not refetched", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const isScannedPage = normalizeScanUrl\(page\.url\) === normalizeScanUrl\(finalUrl\.toString\(\)\)/);
  assert.match(source, /isScannedPage\n\s+\? \{ response: new Response\(html,/);
  // The scanned page already passed the 8 MB main-page limit; a large homepage is not "fetch failed".
  assert.match(source, /isScannedPage \? html : await readResponseTextLimited\(r, 2_000_000\)/);
});

test("FAQ/help-center pages cannot crowd out the representative sample", async () => {
  const { selectRepresentativePages } = await import("../lib/representative-pages.ts");
  const isFaq = (url) => /\/(?:faq|faqs|veelgestelde-vragen|help-center|helpcentrum|hilfe|ayuda|assistance)(?:\/|$)/i.test(new URL(url).pathname);
  const faq = Array.from({ length: 15 }, (_, i) => ({ url: `https://shop.example/faq/question-${i}.html`, type: "support" }));
  const shop = Array.from({ length: 10 }, (_, i) => ({ url: `https://shop.example/brand-${i}/`, type: "other" }));
  const picked = selectRepresentativePages([], [...faq, ...shop], 20, (u) => u, (u) => u, { matches: isFaq, limit: 3 });
  assert.equal(picked.filter((p) => isFaq(p.url)).length, 3);
  assert.equal(picked.filter((p) => !isFaq(p.url)).length, 10);
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /templateShapeKey, \{ matches: isFaqSample, limit: 3 \}/);
});

test("every module the scanner can activate has a report label in every locale", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  const { CAPABILITY_MODULE_MAP } = await import("../lib/sector-catalog.ts");
  const modules = new Set(Object.values(CAPABILITY_MODULE_MAP).flat());
  for (const match of source.matchAll(/modules:\[([^\]]*)\]/g)) for (const m of match[1].matchAll(/"([a-z_]+)"/g)) modules.add(m[1]);
  for (const m of ["accommodation", "booking", "local", "eu_consumer"]) modules.add(m);
  const report = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  for (const locale of ["nl", "en", "de", "fr", "it", "es"]) {
    const line = report.split("\n").find((l) => l.trimStart().startsWith(`${locale}:{`) && l.includes("core_seo:"));
    assert.ok(line, `labels for ${locale}`);
    for (const module of modules) assert.ok(line.includes(`${module}:"`), `${locale} label for ${module}`);
  }
});

test("product-detail candidates are nominated by URL shape, never editorial pages", async () => {
  const { looksLikeProductDetailPath, extractProductDetailLinks } = await import("../lib/product-links.ts");
  for (const path of [
    "/sandisk-cruzer-ultra-flair-64gb-usb-3-0-zwart-372526317",
    "/calvin-klein-underwear-trunk-3-pack-onderbroeken-black-c1182o0bt-q14.html",
    "/clinique-almost-lipstick-black-honey-cll31e01r-j11",
    "/nl/nl/p/storklinta-ladekast-met-4-lades-wit-40627537/",
    "/product/blue-widget",
  ]) assert.equal(looksLikeProductDetailPath(path), true, path);
  for (const path of [
    "/reviews/samsung-galaxy-buds4-buds4-pro",
    "/computers/opslag-en-geheugen/portable-ssd",
    "/calvin-klein/",
    "/faq/how-can-I-return-my-order.html",
    "/nieuws/2026/10/11/bedrijf-opent-nieuwe-vestiging-123456",
    "/blog/vijf-tips-voor-je-woonkamer-1234567",
    "/vacatures/medewerker-klantenservice-utrecht-100234",
  ]) assert.equal(looksLikeProductDetailPath(path), false, path);
  const html = `<a href="/zwarte-sneakers-heren-leer-ab1234cd5-q11.html">a</a><a href="https://other.example/x-y-z-1234567">b</a><a href="/over-ons">c</a>`;
  assert.deepEqual(extractProductDetailLinks(html, "https://shop.example/", "www.shop.example"), ["https://shop.example/zwarte-sneakers-heren-leer-ab1234cd5-q11.html"]);
});

test("retail sites without a product sample get a bounded second hop", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const retailContextForProducts = sectorProfile\.key === "ecommerce" \|\| explicitRetailIdentity \|\| hasEcommerceSignal;/);
  assert.match(source, /if \(retailContextForProducts && !confirmedProductSample\)/);
  assert.match(source, /unsampled\(urls\)\.slice\(0,3\)/, "at most three product audits per hop");
  assert.match(source, /item\.evidenceSource!=="rendered_html"\)\.slice\(0,2\)/, "at most two listing renders");
  // Nomination is never evidence: confirmation still comes from the fetched page.
  assert.match(source, /return audits\.some\(\(item\)=>item\.status==="audited" && item\.commerceEvidence\?\.confirmedRetailPage\)/);
  assert.match(source, /sectorProfile\.key === "ecommerce" && finalCommerceDecision\.confirmed && sectorProfile\.confidenceScore < 88/);
});

test("one page type cannot crowd out the representative sample", async () => {
  const { selectRepresentativePages } = await import("../lib/representative-pages.ts");
  const brands = Array.from({ length: 25 }, (_, i) => ({ url: `https://shop.example/brand-${i}/`, type: "other" }));
  const rest = [
    ...Array.from({ length: 3 }, (_, i) => ({ url: `https://shop.example/legal-${i}`, type: "legal" })),
    ...Array.from({ length: 4 }, (_, i) => ({ url: `https://shop.example/p/item-${i}`, type: "product" })),
  ];
  const picked = selectRepresentativePages([], [...brands, ...rest], 30, (u) => u, (u) => u, undefined, 12);
  assert.equal(picked.filter((p) => p.type === "other").length, 12);
  assert.equal(picked.filter((p) => p.type === "product").length, 4);
  assert.equal(picked.filter((p) => p.type === "legal").length, 3);
  // Without a ceiling the previous behaviour is unchanged.
  assert.equal(selectRepresentativePages([], [...brands, ...rest], 30, (u) => u, (u) => u).filter((p) => p.type === "other").length, 25);
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /\{ matches: isFaqSample, limit: 3 \}, Math\.ceil\(representativePageLimit \* 0\.4\), \{ key: sectionKey, limit: 5, exemptTypes: \["product"\] \}\)/);
  // Slug-with-id product nomination applies to retail sites only.
  assert.match(source, /\(\(sectorProfile\.key === "ecommerce" \|\| explicitRetailIdentity \|\| hasEcommerceSignal\) && looksLikeProductDetailPath\(path\)\)/);
});

test("product candidates come from sitemaps without a browser", async () => {
  const { productUrlsFromSitemap, childSitemapsFromIndex } = await import("../lib/product-links.ts");
  const urlset = `<?xml version="1.0"?><urlset><url><loc>https://www.shop.example/tefal-rk7051-waterkoker-372504463</loc></url><url><loc>https://www.shop.example/service/contact</loc></url><url><loc>https://other.example/x-y-z-1234567</loc></url><url><loc>https://www.shop.example/blog/tips-voor-koken-1234567</loc></url></urlset>`;
  assert.deepEqual(productUrlsFromSitemap(urlset, "shop.example"), ["https://www.shop.example/tefal-rk7051-waterkoker-372504463"]);
  const index = `<sitemapindex><sitemap><loc>https://www.shop.example/sitemap-pages.xml</loc></sitemap><sitemap><loc>https://www.shop.example/sitemap-products-1.xml</loc></sitemap><sitemap><loc>https://www.shop.example/sitemap-products-2.xml.gz</loc></sitemap></sitemapindex>`;
  assert.deepEqual(childSitemapsFromIndex(index), ["https://www.shop.example/sitemap-products-1.xml", "https://www.shop.example/sitemap-pages.xml"]);
  assert.deepEqual(childSitemapsFromIndex(urlset), []);
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /readResponsePrefix\(fetchedSitemap\.response, 1_500_000\)/);
  assert.ok(source.indexOf("productUrlsFromSitemap(sitemapXml") < source.indexOf("const listingPages = multiPageAudits"), "sitemap is tried before any browser render");
});

test("bounded prefix reads never fail on large documents", async () => {
  const { readResponsePrefix } = await import("../lib/safe-fetch.ts");
  const big = "x".repeat(50_000);
  assert.equal((await readResponsePrefix(new Response(big), 1000)).length, 1000);
  assert.equal(await readResponsePrefix(new Response("<urlset/>"), 1000), "<urlset/>");
});

test("a retail identity never receives LocalBusiness schema advice", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const ecommerceSchemaContext = hasEcommerceSignal \|\| earlyRetailIdentity \|\|/);
  assert.match(source, /const earlyRetailIdentity = hasRetailStoreSchema\(schemaTypes\) \|\| \(earlyRetailLanguage\.assortment && \(earlyRetailLanguage\.onlineSales \|\| \(earlyRetailLanguage\.store && commerceNavigationSignal\)\)\)/);
});

test("a confirmed shop never shows shop checks as 'not applicable' because one page lacked signals", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /const euMarketEligible = !explicitNonEuCountryTld && \(euCountryTld \|\| euLanguageSignal \|\| euroMarketSignal\);/);
  assert.match(source, /const euConsumerApplicable = hasEcommerceSignal && euMarketEligible;/);
  // EU modules follow the final site decision plus market eligibility.
  assert.match(source, /must never activate EU checks for clearly non-EU storefronts\.\n\s+if \(euMarketEligible\) \{/);
  // Page-level "no shop signals" N/A becomes unable-to-confirm once the shop is confirmed site-wide.
  assert.match(source, /finalCommerceOnlyKeys\.has\(item\.key\) && item\.status === "not_applicable" && \/webshop\|product/);
  assert.match(source, /De webshop is sitebreed bevestigd, maar deze controle kon op de gescande pagina niet worden beoordeeld\./);
});


test("primary financial identity is generic across wallets, PSPs and banking, not marketing checkout keywords",()=>{
  const cases=[
    {name:"wallet",title:"Pay, Send and Save Money with our app",description:"Paying friends, saving money and cashback with our app.",headings:["Pay, send, and save smarter"],schemaTypes:["Organization","WebSite","FinancialProduct","PaymentCard"],identified:true,provider:false},
    {name:"provider",title:"Platform for every payment",description:"One platform to accept payments and manage money.",headings:["Accept every payment"],schemaTypes:["Organization"],identified:true,provider:true},
    {name:"credit union",title:"Manage your money and savings account",description:"Financial services for your everyday banking.",headings:["Banking made simple"],schemaTypes:["BankOrCreditUnion"],identified:true,provider:false},
    {name:"transfer",title:"Send money abroad",description:"Money transfer service for families.",headings:["Transfer money worldwide"],schemaTypes:["FinancialService"],identified:true,provider:false},
    {name:"retail shop",title:"Shop designer shoes online",description:"Save money on shoes. Checkout with a debit card and earn rewards.",headings:["Shoes and fashion"],schemaTypes:["Product","OnlineStore","Offer"],identified:false},
    {name:"shop with card schema",title:"Online electronics store",description:"Buy laptops, pay with credit card or debit card.",headings:["Discover computers"],schemaTypes:["Store","PaymentCard"],identified:false},
    {name:"SaaS",title:"Project management software",description:"Start for free and enter credit card for paid access.",headings:["Manage projects"],schemaTypes:["SoftwareApplication"],identified:false},
    {name:"hotel",title:"City Hotel",description:"Book a room and pay online.",headings:["Rooms and suites"],schemaTypes:["Hotel"],identified:false},
    {name:"government",title:"Public services",description:"Apply for permits and pay fees online.",headings:["Government services"],schemaTypes:["GovernmentOrganization"],identified:false},
    {name:"shop blog",title:"Money-saving tips",description:"Save money shopping online with vouchers.",headings:["Budget shopping guide"],schemaTypes:["Article"],identified:false}
  ];
  for(const c of cases){const result=financialServicePrimaryIdentity(c);assert.equal(result.identified,c.identified,c.name);if(c.identified){assert.equal(result.provider,c.provider,c.name);assert.ok(result.evidence.length,c.name);}}
});

test("region and language homepage routes avoid accidental product classification",()=>{
  for(const p of ["/us/home","/gb/home/","/en/home","/nl/home","/en-us/home","/nl/homepage"])assert.equal(isLocalizedHomePath(p),true,p);
  for(const p of ["/us/products","/us/home/deals","/shop/home","/xy/home","/us/checkout","/products/home","/nl/nl/","/"])assert.equal(isLocalizedHomePath(p),false,p);
});

test("primary finance identity gates retailer checks across early and late scan phases",async()=>{
  const src=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.match(src,/const isHomepage = pathname === "\/" \|\| isLocalizedHomepage \|\| isLocalizedHomePath\(pathname\)/);
  assert.match(src,/const isProductPage = !isHomepage && !nonRetailIdentityEarly/);
  assert.match(src,/const hasCategorySignal = !isProductPage && !nonRetailIdentityEarly/);
  assert.match(src,/!nonRetailIdentityEarly \|\| independentRetailChain/);
  assert.match(src,/const paymentServicesPrimaryIdentity = financialIdentity\.identified/);
  assert.match(src,/confirmed: Boolean\(!primaryNonCommerceIdentity &&/);
});


test("generic role gates protect hotels, restaurants, healthcare, government, SaaS and ecommerce",()=>{
  const cases=[
    {title:"Hotel Canal rooms and suites",description:"Stay in our rooms. Book a room.",headings:["Boutique Hotel"],schemaTypes:["Hotel"],expected:"lodging"},
    {title:"Mountain guesthouse",description:"Overnight lodging with guest rooms.",headings:["Guesthouse"],schemaTypes:[],expected:"lodging"},
    {title:"Restaurant de Markt",description:"Fresh menu and dinner reservations.",headings:["Restaurant"],schemaTypes:["Restaurant"],expected:"restaurant"},
    {title:"Local bistro dining",description:"Enjoy our menu and reserve a table.",headings:["Bistro"],schemaTypes:[],expected:"restaurant"},
    {title:"Dentist in Utrecht",description:"Book a dental appointment.",headings:["Dental clinic"],schemaTypes:["Dentist"],expected:"healthcare"},
    {title:"Huisartsenpraktijk Centrum",description:"Maak een afspraak voor zorg.",headings:["Huisartsenpraktijk"],schemaTypes:[],expected:"healthcare"},
    {title:"Municipality of Westland",description:"Public services, permits for citizens.",headings:["Government services"],schemaTypes:["GovernmentOrganization"],expected:"public_sector"},
    {title:"Ministry of Infrastructure",description:"Apply for permits and read public policy.",headings:["Government"],schemaTypes:[],expected:"public_sector"},
    {title:"CRM software for businesses",description:"Manage your dashboard and workflow.",headings:["Business software"],schemaTypes:["SoftwareApplication"],expected:"software"},
    {title:"SaaS project management platform",description:"Integrate workflows and automate projects.",headings:["SaaS"],schemaTypes:[],expected:"software"},
    {title:"Shop restaurant kitchen furniture online",description:"Buy furniture and tables for restaurant businesses.",headings:["Furniture offers"],schemaTypes:["Store","Product"],expected:null},
    {title:"Book hotel-inspired furniture online",description:"Shop hotel room decoration products.",headings:["Home decor webshop"],schemaTypes:["OnlineStore","Product"],expected:null},
    {title:"Buy project software licences",description:"Add to cart and purchase digital items.",headings:["Online store"],schemaTypes:["Store","Product"],expected:null},
    {title:"Financial services explained in a blog",description:"Articles about payment cards.",headings:["Latest news"],schemaTypes:["Article"],expected:null}
  ];
  for(const c of cases){const r=primaryNonRetailRole(c);assert.equal(r.key,c.expected,c.title);if(c.expected)assert.ok(r.evidence.length,c.title);}
});
