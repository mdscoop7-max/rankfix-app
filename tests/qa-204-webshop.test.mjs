// QA #203/#204 (26 Oct 2026): regression tests for webshop recognition, the
// website profile, template links, transport identity, local-trade brands,
// render wording, TestLab verdicts and unverifiable start-page 404s.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import { buildWebsiteProfile, detectIndustryVertical } from "../lib/website-profile.ts";
import { isTemplateHref, neutralizeTemplateBindings, isCartActionUrl } from "../lib/template-links.ts";
import { detectEuPrimaryIdentity, stripAudience } from "../lib/eu-identity.ts";
import { detectDeclaredIndustry } from "../lib/site-sector-corroboration.mjs";
import { alignRenderedWording } from "../lib/evidence-source.ts";
import { refineSamplePageType } from "../lib/sample-quality.ts";
import { sectorVerdict } from "../scripts/testlab/labels.mjs";
import { classifyScanAnswer } from "../lib/testlab-outcome.mjs";
import { attributeIncident } from "../lib/scan-incident.ts";
import { classifyScanOutcome } from "../lib/scan-attempts.ts";

const tech = (name, role, confidence = 97) => ({ name, role, confidence, evidence: [`${name} marker`] });
const shopInput = (over = {}) => ({ commerceState: "confirmed", commerceEvidence: ["Product-, prijs- of winkelwagenbewijs bevestigd."], sector: "ecommerce", sectorLabel: "Webshop / e-commerce", sectorConfidence: 92, technologies: [tech("WordPress", "cms"), tech("WooCommerce", "commerce_platform")], commercePlatform: "WooCommerce", cms: "WordPress", framework: null, catalog: [], ...over });

test("website profile: a confirmed webshop stays a webshop when its branch is unknown", () => {
  const p = buildWebsiteProfile(shopInput({ sector: "unknown", sectorLabel: "Sector niet bevestigd", sectorConfidence: 0 }));
  assert.equal(p.websiteType.value, "ecommerce_store");
  assert.equal(p.websiteType.status, "confirmed");
  assert.equal(p.industryVertical.status, "unknown");
  assert.match(p.summary, /^Webshop \(branche niet bevestigd\)/);
  assert.equal(p.commercePlatform.value, "WooCommerce");
  assert.equal(p.cms.value, "WordPress");
});

test("website profile: platform and branch are separate dimensions", () => {
  const p = buildWebsiteProfile(shopInput({ catalog: [
    { url: "https://s.test/", kind: "homepage", text: "Skin care rituals" },
    { url: "https://s.test/product/a", kind: "product", text: "Regenerating facial oil" },
    { url: "https://s.test/product/b", kind: "product", text: "Nourishing day cream SPF 30" },
  ] }));
  assert.equal(p.industryVertical.value, "beauty_personal_care");
  assert.equal(p.industryVertical.status, "confirmed");
  assert.notEqual(p.industryVertical.value, "WooCommerce");
  assert.match(p.summary, /Beauty/);
  assert.match(p.summary, /WooCommerce/);
});

test("website profile: an installed shop plugin without a shop is never a webshop platform", () => {
  const p = buildWebsiteProfile(shopInput({ commerceState: "absent", sector: "professional_services", sectorLabel: "Zakelijke dienstverlening", sectorConfidence: 90 }));
  assert.equal(p.websiteType.value, "services");
  assert.equal(p.commercePlatform.status, "installed_no_shop");
  assert.match(p.commercePlatform.label, /geen webshop bevestigd/);
  assert.equal(p.industryVertical.status, "not_applicable");
});

test("website profile: a webshop without platform traces is 'eigen of onbekend platform', not a guess", () => {
  const p = buildWebsiteProfile(shopInput({ technologies: [], commercePlatform: "Custom / niet bevestigd", cms: null }));
  assert.equal(p.commercePlatform.value, "custom");
  assert.equal(p.commercePlatform.status, "unknown");
});

test("industry vertical: product and category pages decide, the homepage only breaks ties", () => {
  // "gardens" on the homepage must not compete with three skincare product pages.
  const v = detectIndustryVertical([
    { url: "h", kind: "homepage", text: "Rituals inspired by the gardens of Burgundy, plant-based" },
    { url: "p1", kind: "product", text: "Regenerating facial oil" }, { url: "p2", kind: "product", text: "Rejuvenating facial oil" }, { url: "c1", kind: "category", text: "Facial oils" },
  ]);
  assert.equal(v.value, "beauty_personal_care");
  assert.equal(detectIndustryVertical([{ url: "h", kind: "homepage", text: "Koffers en kisten" }]).status, "unknown");
  assert.equal(detectIndustryVertical([{ url: "p", kind: "product", text: "Peli 1510 koffer" }, { url: "c", kind: "category", text: "Flightcases en transportkoffers" }]).value, "luggage_cases");
  assert.equal(detectIndustryVertical([{ url: "p", kind: "product", text: "Akkuschrauber 18 V" }, { url: "c", kind: "category", text: "Werkzeug" }]).value, "tools_diy");
  // Two branches with equal catalogue evidence: not confirmed.
  assert.equal(detectIndustryVertical([{ url: "p1", kind: "product", text: "Laptop 15 inch" }, { url: "p2", kind: "product", text: "Hardloopschoen dames" }]).status, "unknown");
});

test("template links: framework bindings and template expressions are not links", () => {
  for (const href of ["item.product_url", "data.url", "product.link", "row.detailUrl", "{{ product.url }}", "${url}", "<%= url %>", "%7B%7Burl%7D%7D", "[[link]]"]) assert.equal(isTemplateHref(href), true, href);
  for (const href of ["/item.product_url.html", "index.html", "page.php", "/contact", "https://x.test/a.b", "products/shoe-1", "#top", "?p=2", "file.pdf"]) assert.equal(isTemplateHref(href), false, href);
  const html = `<a :href="item.product_url">x</a><a x-bind:href="u">y</a><a v-bind:href="v">z</a><a href="/real">r</a><template x-for="i in list"><a href="/tpl">t</a></template>`;
  const hrefs = [...neutralizeTemplateBindings(html).matchAll(/<a\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["/real"]);
  assert.equal(isCartActionUrl("/?add-to-cart=12"), true);
  assert.equal(isCartActionUrl("/checkout/cart/add/uenc/abc/product/9/"), true);
  assert.equal(isCartActionUrl("/winkelwagen"), false);
  assert.equal(isCartActionUrl("/product/olie"), false);
});

test("transport identity: a case shop is not a passenger carrier; an airline still is", () => {
  const shop = detectEuPrimaryIdentity({ title: "Flightcases, transportkoffers en kisten | Koffervak.nl", description: "Koffers en kisten voor transport, luchtvaart, defensie en industrie. Ruim 700 flightcases op voorraad.", h1s: ["Koffers en kisten voor elke toepassing"], hostname: "koffervak.test" });
  assert.notEqual(shop?.key, "passenger_transport");
  const shop2 = detectEuPrimaryIdentity({ title: "Reiskoffers en handbagage | Kofferland", description: "Reiskoffers, handbagage en travel bags voor elke vlucht-ervaring.", h1s: ["Reiskoffers"], hostname: "kofferland.test" });
  assert.notEqual(shop2?.key, "passenger_transport");
  // Mode words alone (no tickets, timetable or journeys) never make a carrier.
  const supplier = detectEuPrimaryIdentity({ title: "Luchtvaart onderdelen | AeroParts", description: "Onderdelen voor de luchtvaart en luchtvaartindustrie.", h1s: ["Luchtvaart"], hostname: "aeroparts.test" });
  assert.notEqual(supplier?.key, "passenger_transport");
  const airline = detectEuPrimaryIdentity({ title: "VliegMij | Goedkope vluchten boeken", description: "Boek je vliegtickets bij luchtvaartmaatschappij VliegMij.", h1s: ["Vluchten boeken"], hostname: "vliegmij.test" });
  assert.equal(airline?.key, "passenger_transport");
  const rail = detectEuPrimaryIdentity({ title: "Spoorweg Noord | Treinkaartjes en dienstregeling", description: "Plan je reis met de trein en koop je kaartje.", h1s: ["Reisplanner"], hostname: "spoornoord.test" });
  assert.equal(rail?.key, "passenger_transport");
  assert.match(stripAudience("Flightcases en reiskoffers"), /goederen/);
});

test("local trades: a brand that fuses the trade noun names the trade; software for the trade does not", () => {
  assert.equal(detectDeclaredIndustry({ title: "Multiópticas", description: "Más de 600 ópticas en España. Revisión visual gratuita.", identityHeadings: [], schemaTypes: [] })?.key, "optician");
  assert.equal(detectDeclaredIndustry({ title: "Opticalnet | Software voor opticiens", description: "Kassasoftware voor optiekzaken.", identityHeadings: [], schemaTypes: [] }), null);
  assert.equal(detectDeclaredIndustry({ title: "Trattoria Sole", description: "Cucina romana. Prenota un tavolo online.", identityHeadings: ["Benvenuti"], schemaTypes: [] })?.key, "restaurant");
  assert.equal(detectDeclaredIndustry({ title: "Restaurant Booking Pro | Table reservations software", description: "Let your guests book a table online.", identityHeadings: [], schemaTypes: [] }), null);
  // One field with a reservation sentence only: not enough evidence, abstain.
  assert.equal(detectDeclaredIndustry({ title: "Rossonapoli", description: "Scopri i nostri locali, il menu e prenota un tavolo.", identityHeadings: [], schemaTypes: [] }), null);
});

test("render wording: a rendered scan never says it only read the raw HTML", () => {
  const checks = [
    { key: "checkout_funnel_static", message: "Dit is een productpagina, maar RankFix kon in raw HTML geen duidelijke toevoegen-aan-winkelwagen actie bevestigen. De actie kan client-side via JavaScript worden gerenderd.", fix: "Raw HTML alleen is onvoldoende bewijs voor een checkoutfout.", evidence: { url: "u", found: null, details: "x", source: "rendered_html" } },
    { key: "content", message: "De raw HTML is een dunne JavaScript-shell.", fix: "", evidence: { url: "u", found: null, details: "", source: "rendered_html" } },
  ];
  assert.equal(alignRenderedWording(structuredClone(checks), false), 0);
  const out = structuredClone(checks);
  alignRenderedWording(out, true);
  assert.doesNotMatch(out[0].message + out[0].fix, /raw HTML|client-side via JavaScript/i);
  assert.match(out[0].message, /gerenderde pagina/);
  assert.equal(out[1].message, checks[1].message, "thin-shell wording only exists without render and stays untouched");
});

test("page typing: a grid of priced products is a collection, a product detail stays a product", () => {
  const base = { proposed: "product", productSchema: false, itemListSchema: false, repeatedProductLinks: true, productOffer: false, purchaseAction: true, visiblePrices: 7, uniqueH1: true, detailIdentity: false, path: "/nl/nl/producten/zon" };
  assert.equal(refineSamplePageType(base), "category");
  assert.equal(refineSamplePageType({ ...base, productSchema: true, productSchemaCount: 1, productOffer: true, path: "/nl/nl/producten/serum" }), "product");
});

test("TestLab verdicts: literal label differences are not counted as sector errors", () => {
  assert.equal(sectorVerdict("banking", { sector: "financial_services", key: "financial_banking" }).verdict, "equivalent");
  assert.equal(sectorVerdict("retail", { sector: "health_wellness", key: "optician" }).verdict, "equivalent");
  assert.equal(sectorVerdict("retail", { sector: "beauty", key: "beauty", websiteType: "ecommerce_store" }).verdict, "equivalent");
  assert.equal(sectorVerdict("ecommerce", { sector: "ecommerce", key: "ecommerce" }).verdict, "exact");
  assert.equal(sectorVerdict("retail", { sector: "unknown", key: "unknown" }).verdict, "unconfirmed");
  assert.equal(sectorVerdict("retail", { sector: "transport_travel", key: "passenger_transport" }).verdict, "mismatch");
});

test("an unverifiable start-page 404 is a site-side, unscored outcome, never 'page does not exist'", () => {
  assert.equal(attributeIncident(422, "UNVERIFIED_NOT_FOUND"), "target_site");
  assert.equal(classifyScanOutcome(422, "UNVERIFIED_NOT_FOUND"), "site_blocked");
  assert.equal(classifyScanAnswer({ ok: false, status: 422, data: { code: "UNVERIFIED_NOT_FOUND", incident: { attribution: "target_site" } } }), "site_geblokkeerd");
  assert.equal(classifyScanAnswer({ ok: false, status: 422, data: { code: "UNVERIFIED_NOT_FOUND" } }), "site_geblokkeerd");
  assert.equal(classifyScanAnswer({ ok: false, status: 422, data: { code: "HTTP_NOT_FOUND", incident: { attribution: "target_site" } } }), "site_onbereikbaar");
});


// Keep the new commerce-heavy QA catalog independently reproducible and intact.
test("TestLab 144 commerce catalog: 72 webshop targets, 72 other sectors, unique hosts", () => {
  const catalog = JSON.parse(readFileSync(new URL("./fixtures/testlab-144/catalog-commerce-diverse-20261026.json", import.meta.url), "utf8"));
  assert.equal(catalog.sites.length, 144);
  const normalizedHosts = catalog.sites.map(s => s.hosts[0].toLowerCase().replace(/^www\\./, ""));
  assert.equal(new Set(normalizedHosts).size, 144);
  const stores = catalog.sites.filter(s => s.expected === "ecommerce");
  const other = catalog.sites.filter(s => s.expected !== "ecommerce");
  assert.equal(stores.length, 72);
  assert.equal(other.length, 72);
  assert.equal(new Set(stores.map(s => s.group)).size, 13);
  for (const host of ["combray-skincare.com", "rayskincare.com", "allekoffers.nl"]) {
    assert.ok(normalizedHosts.includes(host), host + " absent");
  }
  assert.ok(other.some(s => s.group === "healthcare"));
  assert.ok(other.some(s => s.group === "education"));
  assert.ok(other.some(s => s.group === "hair_salon"));
});
