import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TOURISM_ACTIVITY_PATTERN, TOURISM_IDENTITY_PATTERN, hasRetailStoreSchema, isTourismBoardHost, retailIdentityLanguage, retailStoreSchemaTypes } from "../lib/sector-identity.ts";
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
