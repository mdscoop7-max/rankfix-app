// QA commerce 72/72 TestLab (26 Oct 2026): unit tests for shop markup, product
// cards, brand names, supplier compounds, retail self-descriptions, comparison
// platforms and the website profile for retailers with unconfirmed shop functions.
import test from "node:test";
import assert from "node:assert/strict";
import { purchaseActionInHtml, productCardLinks, priceSignalCount, isApiOrFeedPath } from "../lib/commerce-markup.ts";
import { extractProductDetailLinks } from "../lib/product-links.ts";
import { detectDeclaredIndustry, stripBrandNames } from "../lib/site-sector-corroboration.mjs";
import { retailSelfDescription, isPublication } from "../lib/eu-identity.ts";
import { comparisonPlatformIdentity } from "../lib/platform-identity.ts";
import { buildWebsiteProfile, detectIndustryVertical } from "../lib/website-profile.ts";
import { commerceApplicability } from "../lib/commerce-applicability.ts";
import { refineSamplePageType } from "../lib/sample-quality.ts";

test("purchase controls are found in markup, not only in visible text", () => {
  assert.equal(purchaseActionInHtml(`<button class="btn" aria-label="In&#x20;Winkelwagen&#x20;Koffer" data-addto="cart"><i></i></button>`), true);
  assert.equal(purchaseActionInHtml(`<form method="post" action="https://s.test/checkout/cart/add/uenc/x/product/459/" class="product-item">`), true);
  assert.equal(purchaseActionInHtml(`<button type="submit" name="add-to-cart" value="58">`), true);
  assert.equal(purchaseActionInHtml(`<button type="button" onclick="cart.add('42')">`), true);
  assert.equal(purchaseActionInHtml(`<button title="Ajouter au panier">+</button>`), true);
  // Not a purchase control: a mini-cart container, a "Buy now" plan button, a basket CSS rule.
  assert.equal(purchaseActionInHtml(`<div id="mini-cart" class="minicart"></div>`), false);
  assert.equal(purchaseActionInHtml(`<a href="/signup" title="Buy now">Buy now</a>`), false);
  assert.equal(purchaseActionInHtml(`<style>#aside-box.basket .add-to-cart{}</style>`), false);
});

test("product cards give product links whatever the URL shape; cart actions and templates never", () => {
  const html = `<li><form action="/checkout/cart/add/product/1/" class="product-item product_addtocart_form"><a href="https://www.s.test/aluminium-koffer-alu-eco-1" class="product photo">x</a><a :href="item.product_url">t</a></form></li>
  <li class="product-item product-fallback"><div class="product-popup">${"<span>vergelijk</span>".repeat(80)}</div><a class="product-link" href="/smith-payroll-mips-fietshelm/">Helm</a></li>
  <a class="product-item-link" href="/peli-1510">Peli</a><a href="?add-to-cart=12" class="product-link">add</a><a class="product-link" href="/wp-json/wp/v2/product/58">api</a>`;
  const links = productCardLinks(html, "https://www.s.test/cat/", "s.test");
  assert.ok(links.includes("https://www.s.test/aluminium-koffer-alu-eco-1"), links.join(" "));
  assert.ok(links.includes("https://www.s.test/smith-payroll-mips-fietshelm/"), links.join(" "));
  assert.ok(links.includes("https://www.s.test/peli-1510"));
  assert.ok(!links.some((l) => /add-to-cart|item\.product_url|wp-json/.test(l)), links.join(" "));
  assert.ok(extractProductDetailLinks(html, "https://www.s.test/cat/", "s.test", 8).includes("https://www.s.test/aluminium-koffer-alu-eco-1"));
  assert.equal(isApiOrFeedPath("/wp-json/wp/v2/product/58"), true);
  assert.equal(isApiOrFeedPath("/feed/"), true);
  assert.equal(isApiOrFeedPath("/product/arganolie/"), false);
});

test("prices are counted over the whole page text, not a 12k excerpt", () => {
  const text = "menu ".repeat(5000) + Array.from({ length: 40 }, (_, i) => `€ ${10 + i},95`).join(" ");
  assert.equal(priceSignalCount(text), 40);
});

test("a brand written as a domain is a name, not a trade; a plain trade host stays evidence", () => {
  assert.equal(detectDeclaredIndustry({ title: "Jardinerie en Ligne | Achat Plantes en Ligne | Bakker.com", description: "Bakker.com, votre jardinerie en ligne : plantes et bulbes.", identityHeadings: ["Bakker"], schemaTypes: [] }), null);
  assert.equal(detectDeclaredIndustry({ title: "Bakker Jansen | Vers brood", description: "Uw bakker voor brood en banket.", identityHeadings: [], schemaTypes: [] })?.key, "bakery");
  assert.equal(detectDeclaredIndustry({ title: "Taller Mecánico López | Reparación de coches", description: "Taller mecánico: mantenimiento y frenos. Pide cita.", identityHeadings: ["Taller Mecánico López"], schemaTypes: [], hostname: "taller.test" })?.key, "car_repair");
  assert.equal(stripBrandNames("fr-fr.bakker.com", "", "Jardinerie | Bakker.com").trim(), "fr-fr.");
  assert.equal(stripBrandNames("kapsalon-jansen.nl", "", "Kapsalon Jansen | knippen"), "kapsalon-jansen.nl");
});

test("a supplier of a trade is not the trade (hair wholesaler is not a hair salon)", () => {
  assert.equal(detectDeclaredIndustry({ title: "Groothaar | Kappersgroothandel voor hair & beauty professionals", description: "De online kappersgroothandel met 20.000 producten voor kappers en consumenten.", identityHeadings: ["Kappersbenodigdheden"], schemaTypes: [] }), null);
  assert.equal(detectDeclaredIndustry({ title: "Kapsalon Zon | Kapper in Utrecht", description: "Knippen en kleuren. Boek online je afspraak.", identityHeadings: ["Kapsalon Zon"], schemaTypes: [] })?.key, "hair_salon");
});

test("retail self-descriptions: compounds and 'retailer' count; shop software and food ordering do not", () => {
  for (const t of ["Intertoys: ontdek speelgoed in onze online speelgoedwinkel!", "dé online shop voor de gezondheid van je dier", "Online boeken en cadeaus bestellen - gratis verzending", "The UK's No 1 Running & Outdoor Fitness Retailer", "Buy tools, fixings and electrical supplies online"]) assert.equal(retailSelfDescription(t), true, t);
  for (const t of ["Shopify: start je eigen online winkel", "Webshop software voor retailers", "Pizza Roma | online pizza bestellen", "Online cursussen volgen en bestellen", "Online afspraak maken bij de kapper"]) assert.equal(retailSelfDescription(t), false, t);
});

test("comparison and quote platforms are recognised from their own words, not as a publication", () => {
  assert.ok(comparisonPlatformIdentity({ ownText: "Vind en vergelijk schoenen van honderden webshops. De schoenenzoekmachine van Nederland." }));
  assert.ok(comparisonPlatformIdentity({ ownText: "Offertevind | Vergelijk offertes van specialisten" }));
  assert.ok(comparisonPlatformIdentity({ ownText: "Schoenvind | Alle schoenen op één plek", aboutTexts: ["Schoenvind is een prijsvergelijker; bestellen doe je bij de aangesloten winkels."] }));
  // About page without referral wording, a shop comparing its own models, a review blog: no platform.
  assert.equal(comparisonPlatformIdentity({ ownText: "Fietsland | Vergelijk onze e-bikes en bestel online" }), null);
  assert.equal(comparisonPlatformIdentity({ ownText: "Huidblog | Reviews van serums" }), null);
  assert.equal(isPublication("Offertevind | Vergelijk offertes van specialisten"), false);
  assert.equal(isPublication("Huidblog | Reviews van serums"), true);
});

test("website profile: a retailer with unconfirmed shop functions is a probable webshop, never a service provider", () => {
  const base = { commerceEvidence: [], sector: "ecommerce", sectorLabel: "Retail", sectorConfidence: 93, technologies: [], commercePlatform: null, cms: null, framework: null, catalog: [] };
  const p = buildWebsiteProfile({ ...base, commerceState: "unconfirmed", commerceReason: "sample_refused" });
  assert.equal(p.websiteType.value, "ecommerce_store");
  assert.equal(p.websiteType.status, "probable");
  assert.match(p.websiteType.label, /weigerden RankFix/);
  assert.ok(p.websiteType.confidence < 80);
  const cmp = buildWebsiteProfile({ ...base, sector: "service_marketplace", sectorConfidence: 84, commerceState: "unconfirmed", commerceReason: "referral_platform", platformKind: "comparison_platform" });
  assert.equal(cmp.websiteType.value, "comparison_platform");
  assert.equal(detectIndustryVertical([{ url: "c", kind: "category", text: "Plantes vivaces" }, { url: "p", kind: "product", text: "Lavande – plante vivace" }]).value, "garden");
  assert.equal(detectIndustryVertical([{ url: "c", kind: "category", text: "Haarproducten" }, { url: "p", kind: "product", text: "Professionele shampoo" }]).value, "beauty_personal_care");
});

test("commerce applicability: refused shop pages and referral platforms are explicit reasons", () => {
  const base = { confirmed: false, primaryNonCommerceIdentity: false, commerceHints: true, thinShell: false, marketSelector: false, auditedRepresentativePages: 5 };
  assert.deepEqual(commerceApplicability({ ...base, refusedRetailPages: 4 }), { state: "unconfirmed", reason: "sample_refused" });
  assert.deepEqual(commerceApplicability({ ...base, refusedRetailPages: 1 }), { state: "unconfirmed", reason: "weak_commerce_signals" });
  assert.deepEqual(commerceApplicability({ ...base, confirmed: true, referralPlatform: true }), { state: "unconfirmed", reason: "referral_platform" });
  assert.deepEqual(commerceApplicability({ ...base, confirmed: true }), { state: "confirmed" });
});

test("page typing: a product detail page with a related-products grid stays a product page", () => {
  const input = { proposed: "product", productSchema: false, itemListSchema: false, repeatedProductLinks: true, productOffer: false, purchaseAction: true, visiblePrices: 5, uniqueH1: true, detailIdentity: false, path: "/product/puur-cosmetische-arganolie-kopen/" };
  assert.equal(refineSamplePageType(input), "category");
  assert.equal(refineSamplePageType({ ...input, singleProductMarkup: true }), "product");
});
