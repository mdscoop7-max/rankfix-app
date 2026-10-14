import test from "node:test";
import assert from "node:assert/strict";
import {
  assessDescriptionQuality, assessH1Quality, assessProductSchemaCompleteness, blendHeadlineScore,
  blockedScanMessage, canonicalCrossDomainRisk, classifyLegalLink, evidenceSnippet, findAudienceEvidence,
  findConsentEvidence, findFaqEvidence, findFormEvidence, findPaymentMethods, findRegulatoryEvidence,
  findReviewEvidence, findTagManagerEvidence, findVisiblePrices, fintechIdentity, isBlockingStatus,
  isBrokenStatus, isGenericTitle, LEGAL_LEXICON, rankfixUserAgents,
} from "../lib/evidence-quality.ts";
import { assessPageTitle } from "../lib/report-quality.ts";

// Cases come from the six-site review of 12 Oct 2026: allbirds.de, rijksoverheid.nl,
// discountoffice.nl, mollie.com/nl, transheroes.com/nl and sneakers.nl.

// ---------------------------------------------------------------- point 1
test("H1 'Home' is not a passing page heading (rijksoverheid.nl)", () => {
  const result = assessH1Quality(`<body><h1>Home</h1><h2>Nieuws</h2></body>`, ["rijksoverheid"]);
  assert.equal(result.status, "warning");
  assert.equal(result.flag, "generic");
});

test("CNN unrendered template expression is not a valid H1", () => {
  const bad = '<h1>\\n\'+(null!=(t=p(e,"if").call(r,(p(e,"compare")||l&&p(l,"compare")||c).call(r,null!=l?p(l,"componentVariation"):l,"===","headline_underscored",{name:"compare"}))?t:"")+"</h1>';
  const result = assessH1Quality(bad, ["cnn"], "https://www.cnn.com/");
  assert.equal(result.status, "warning");
  assert.equal(result.flag, "generic");
  assert.notEqual(result.status, "pass");
  assert.equal(assessH1Quality("<h1>Breaking News</h1>", ["cnn"], "https://www.cnn.com/").status, "pass");
});

test("a brand-only H1 is generic on a subpage, normal on the homepage", () => {
  assert.equal(assessH1Quality(`<h1>Sneakers.nl</h1>`, ["sneakers", "sneakers.nl"]).flag, "generic");
  assert.equal(assessH1Quality(`<h1>Sneakers.nl</h1>`, ["sneakers", "sneakers.nl"], "https://www.sneakers.nl/dames").flag, "generic");
  assert.equal(assessH1Quality(`<h1>Belastingdienst</h1>`, ["belastingdienst"], "https://www.belastingdienst.nl/").status, "pass");
  assert.equal(assessH1Quality(`<h1>Home</h1>`, ["rijksoverheid"], "https://www.rijksoverheid.nl/").flag, "generic");
});

test("a cookie-banner H1 is not counted as the page heading (transheroes.com/nl)", () => {
  const html = `<div id="CybotCookiebotDialog" class="cookie-consent"><h1>Deze website gebruikt cookies</h1></div>
    <main><h1>Transport voor ondernemers</h1></main>`;
  const result = assessH1Quality(html, ["transheroes"]);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.contentH1s, ["Transport voor ondernemers"]);
  assert.equal(result.excludedConsentH1s.length, 1);
  assert.match(result.details, /cookiebanner/);
});

test("only a cookie-banner H1 means the page has no content H1", () => {
  const result = assessH1Quality(`<div class="onetrust-banner"><h1>We use cookies</h1></div><main><h2>Shop</h2></main>`);
  assert.equal(result.status, "missing");
  assert.equal(result.flag, "only_consent");
});

test("identical duplicate H1s count as one (mollie.com/nl responsive copies)", () => {
  const h1 = `<h1>Betalingen voor elk bedrijf</h1>`;
  const result = assessH1Quality(h1.repeat(7));
  assert.equal(result.status, "pass");
  assert.equal(result.contentH1s.length, 1);
  assert.equal(result.duplicatesCollapsed, 6);
  assert.match(result.details, /tellen als één/);
});

test("several different H1s are a warning, not a pass", () => {
  const result = assessH1Quality(`<h1>Betalingen</h1><h1>Terminals</h1><h1>Prijzen</h1>`);
  assert.equal(result.status, "warning");
  assert.equal(result.flag, "multiple");
});

test("a keyword-list description is not a summary", () => {
  const result = assessDescriptionQuality("Sneakers, Nike, Adidas, Puma, New Balance, Asics, schoenen, sale");
  assert.equal(result.flag, "keyword_list");
});

test("a cut-off description is flagged", () => {
  assert.equal(assessDescriptionQuality("Ontdek onze collectie duurzame wollen schoenen voor dames en heren met gratis verzending en").flag, "truncated");
  assert.equal(assessDescriptionQuality("Ontdek onze collectie duurzame wollen schoenen…").flag, "truncated");
});

test("a normal sentence description passes the quality rule", () => {
  assert.equal(assessDescriptionQuality("Ontdek duurzame wollen sneakers. Gratis verzending en 30 dagen retour.").flag, null);
  assert.equal(assessDescriptionQuality("Mollie maakt betalingen eenvoudig voor bedrijven van elke omvang, met alle populaire betaalmethoden.").flag, null);
});

test("Product schema without price or currency is incomplete (discountoffice.nl)", () => {
  const noPrice = assessProductSchemaCompleteness([{ name: "Bureaustoel", hasImage: true, offers: [{ price: null, currency: "", availability: "https://schema.org/InStock" }] }]);
  assert.equal(noPrice.complete, false);
  assert.ok(noPrice.missing.includes("prijs"));
  assert.ok(noPrice.missing.includes("valuta"));
  const noOffers = assessProductSchemaCompleteness([{ name: "Bureaustoel", hasImage: true, offers: [] }]);
  assert.deepEqual(noOffers.missing, ["offers"]);
  const ok = assessProductSchemaCompleteness([{ name: "Bureaustoel", hasImage: true, offers: [{ price: "199.00", currency: "EUR", availability: "InStock" }] }]);
  assert.equal(ok.complete, true);
});

// ---------------------------------------------------------------- point 2
test("German prices, old prices and discounts are seen (allbirds.de)", () => {
  const html = `<div class="price"><span class="price-item--regular"><s>120 €</s></span><span class="price-item--sale">96 €</span></div><span>-20%</span>`;
  const text = "Wool Runner 120 € 96 € -20%";
  const prices = findVisiblePrices(html, text);
  assert.ok(prices.count >= 2);
  assert.ok(prices.referencePrices.some((value) => /120/.test(value)));
  assert.ok(prices.discountExamples.length > 0);
});

test("Dutch price notation including ,- is recognised", () => {
  const prices = findVisiblePrices("", "Nu € 89,95 van € 119,- en 49,- euro");
  assert.equal(prices.notation, "comma_decimal");
  assert.ok(prices.count >= 2);
  assert.ok(prices.referencePrices.some((value) => /119/.test(value)));
});

test("payment methods shown only as icons are found", () => {
  const html = `<footer><ul class="payment-icons"><li><img src="/icons/ideal.svg" alt=""></li><li><svg class="icon icon--visa" aria-label="Visa"></svg></li><li><img src="/cdn/klarna-logo.png" alt="Klarna"></li></ul></footer>`;
  const methods = findPaymentMethods(html, "");
  assert.ok(methods.includes("iDEAL"));
  assert.ok(methods.includes("Visa"));
  assert.ok(methods.includes("Klarna"));
});

test("German payment terms are recognised", () => {
  const methods = findPaymentMethods("", "Zahlungsarten: PayPal, Kauf auf Rechnung, Sofortüberweisung, Apple Pay");
  for (const name of ["PayPal", "Kauf auf Rechnung", "Sofort", "Apple Pay"]) assert.ok(methods.includes(name), name);
});

test("review widgets and ratings are found", () => {
  const review = findReviewEvidence(`<div class="trustpilot-widget" data-template-id="x"></div>`, "Klanten geven ons 4,6/5 op basis van 2.310 beoordelingen", ["Organization"]);
  assert.ok(review.platforms.includes("Trustpilot"));
  assert.ok(review.ratingText);
  assert.equal(review.found, true);
  assert.equal(findReviewEvidence(`<script type="application/ld+json">{"aggregateRating":{"ratingValue":4.8}}</script>`, "", []).aggregateRating, true);
});

test("embedded and plugin forms are found (transheroes.com/nl)", () => {
  const hubspot = findFormEvidence(`<script src="//js.hsforms.net/forms/embed/v2.js"></script><script>hbspt.forms.create({portalId:"1"})</script>`);
  assert.equal(hubspot.found, true);
  assert.deepEqual(hubspot.embeddedProviders, ["HubSpot"]);
  const cf7 = findFormEvidence(`<div class="wpcf7"><form><input type="email" name="email"><textarea name="msg"></textarea><input type="submit"></form></div>`);
  assert.equal(cf7.nativeForms, 1);
  assert.equal(cf7.inputControls, 2);
});

test("consent providers and first-party GTM loaders are found (allbirds.de)", () => {
  assert.deepEqual(findConsentEvidence(`<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>`).providers, ["OneTrust"]);
  const gtm = findTagManagerEvidence(`<script>(function(w,d,s,l,i){w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});j.src='https://sgtm.allbirds.de/gtm.js?id='+i})(window,document,'script','dataLayer','GTM-ABC123');</script>`);
  assert.equal(gtm.loader, true);
  assert.deepEqual(gtm.containers, ["GTM-ABC123"]);
});

test("Dutch compound legal words count (sneakers.nl privacyverklaring, algemene voorwaarden)", () => {
  assert.ok(LEGAL_LEXICON.privacy.test("privacyverklaring"));
  assert.ok(LEGAL_LEXICON.privacy.test("/klantenservice/privacy statement"));
  assert.ok(LEGAL_LEXICON.privacy.test("datenschutzerklarung"));
  assert.ok(LEGAL_LEXICON.terms.test("algemene voorwaarden"));
  assert.ok(LEGAL_LEXICON.terms.test("leveringsvoorwaarden"));
  assert.ok(LEGAL_LEXICON.terms.test("agb"));
  assert.equal(LEGAL_LEXICON.terms.test("onze werkwijze"), false);
});

test("legal documents as PDF or on another own host count; provider policies do not", () => {
  const page = "https://www.sneakers.nl/";
  assert.equal(classifyLegalLink("/privacy", page), "first_party");
  assert.equal(classifyLegalLink("https://media.sneakers.nl/docs/algemene-voorwaarden.pdf", page), "first_party_pdf");
  assert.equal(classifyLegalLink("https://cdn.shopify.com/s/files/1/voorwaarden.pdf", page), "external_pdf");
  assert.equal(classifyLegalLink("https://legal.sneakersgroup.com/privacy", page), "external_host");
  assert.equal(classifyLegalLink("https://policies.google.com/privacy", page), null);
  assert.equal(classifyLegalLink("https://www.youtube.com/t/terms", page), null);
});

// ---------------------------------------------------------------- point 3/4
test("a 404 is broken, a block is not (discountoffice.nl 418)", () => {
  assert.equal(isBrokenStatus(404), true);
  assert.equal(isBrokenStatus(410), true);
  assert.equal(isBrokenStatus(500), true);
  assert.equal(isBrokenStatus(418), false);
  assert.equal(isBrokenStatus(403), false);
  assert.equal(isBrokenStatus(503), false);
  assert.equal(isBlockingStatus(418), true);
  assert.equal(isBlockingStatus(429), true);
  assert.equal(isBlockingStatus(200), false);
});

test("a canonical to another domain is a cross-domain risk (sneakers.nl); www and subdomains are not", () => {
  assert.equal(canonicalCrossDomainRisk("https://www.sneakerstore.com/schoenen", "https://www.sneakers.nl/schoenen").crossDomain, true);
  assert.equal(canonicalCrossDomainRisk("https://sneakers.nl/schoenen", "https://www.sneakers.nl/schoenen").crossDomain, false);
  assert.equal(canonicalCrossDomainRisk("https://shop.sneakers.nl/schoenen", "https://www.sneakers.nl/schoenen").crossDomain, false);
  assert.equal(canonicalCrossDomainRisk("https://www.example.co.uk/a", "https://shop.example.co.uk/a").crossDomain, false);
});

// ---------------------------------------------------------------- point 5
test("a heading starting with a question word is not an FAQ (rijksoverheid.nl)", () => {
  const html = `<h2>Wat doet de overheid aan woningbouw</h2><p>Het kabinet bouwt meer betaalbare woningen in heel Nederland.</p>`;
  const faq = findFaqEvidence(html);
  assert.equal(faq.found, false);
});

test("real FAQ pairs are found with the question as proof", () => {
  const html = `<h2>Veelgestelde vragen</h2><details><summary>Hoe lang duurt de levering?</summary><p>Binnen 2 werkdagen in huis.</p></details><details><summary>Kan ik retourneren?</summary><p>Ja, binnen 30 dagen gratis.</p></details>`;
  const faq = findFaqEvidence(html);
  assert.equal(faq.found, true);
  assert.equal(faq.pairs[0].question, "Hoe lang duurt de levering?");
  assert.match(faq.reason, /Hoe lang duurt de levering/);
});

test("FAQPage schema alone is reported as schema-only evidence", () => {
  const faq = findFaqEvidence("<p>Geen vragen zichtbaar</p>", true);
  assert.equal(faq.found, true);
  assert.equal(faq.source, "schema");
});

test("target audience is found with a quote (mollie.com/nl)", () => {
  const snippet = findAudienceEvidence("Mollie is de betaaloplossing voor ondernemers die snel willen groeien.");
  assert.ok(snippet);
  assert.match(snippet, /voor ondernemers/);
});

test("fintech identity and regulatory information are recognised (mollie.com/nl)", () => {
  const text = "Mollie is een betaalprovider. Accept payments online. Mollie B.V. is een betaalinstelling onder toezicht van De Nederlandsche Bank.";
  assert.equal(fintechIdentity(text).identified, true);
  assert.match(findRegulatoryEvidence(text) || "", /De Nederlandsche Bank|betaalinstelling/);
  assert.equal(fintechIdentity("Wij verkopen schoenen en betalen kan met iDEAL.").identified, false);
});

test("evidence snippets quote around the match", () => {
  assert.equal(evidenceSnippet("abc", /zzz/), null);
  assert.match(evidenceSnippet("Lorem ipsum dolor sit amet voor bedrijven consectetur", /voor bedrijven/, 10) || "", /voor bedrijven/);
});

// ---------------------------------------------------------------- point 6/9/12
test("the headline blends the representative sample", () => {
  assert.deepEqual(blendHeadlineScore(98, null, 0), { score: 98, sampleWeight: 0 });
  assert.equal(blendHeadlineScore(100, 60, 22).score, 88);
  assert.equal(blendHeadlineScore(100, 60, 4).score, 92);
  assert.equal(blendHeadlineScore(100, 60, 1).score, 96);
});

test("user agents carry the info URL and blocked scans explain themselves", () => {
  const agents = rankfixUserAgents("https://rankfix-app.vercel.app/");
  assert.equal(agents.bot, "RankFixBot/2.1 (+https://rankfix-app.vercel.app/bot)");
  assert.equal(agents.browser, "RankFixBrowser/1.0 (+https://rankfix-app.vercel.app/bot)");
  const message = blockedScanMessage(418, "nl", agents);
  assert.match(message, /HTTP 418/);
  assert.match(message, /RankFixBot\/2\.1/);
  assert.match(message, /\/bot/);
  assert.match(message, /geen SEO-fout/);
  assert.match(blockedScanMessage(429, "en", agents), /rate-limiting/);
});

// ---------------------------------------------------------------- point 10
test("short titles are not an issue; brand-only, doubled brand and generic titles are", () => {
  assert.equal(assessPageTitle("Wollen sneakers kopen", "allbirds.de").status, "PASS");
  assert.equal(assessPageTitle("Over ons", "transheroes.com").status, "PASS");
  assert.equal(assessPageTitle("TransHeroes", "transheroes.com").status, "WARNING");
  assert.equal(assessPageTitle("Vacatures | TransHeroes | TransHeroes", "transheroes.com").status, "WARNING");
  assert.equal(assessPageTitle("Home", "rijksoverheid.nl").status, "WARNING");
  assert.equal(assessPageTitle("Een heel lange title die ver boven de zestig tekens uitkomt voor zoekmachines", "x.nl").status, "WARNING");
  assert.equal(isGenericTitle("Homepage"), true);
  assert.equal(isGenericTitle("Rijksoverheid"), false);
});

// ---------------------------------------------------------------- scanner wiring
test("the scanner route uses the review rules end to end", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  // 1: quality, not presence
  assert.match(route, /const h1Quality = assessH1Quality\(html,/);
  assert.match(route, /const descriptionQuality = assessDescriptionQuality\(description\)/);
  assert.match(route, /const productSchemaCompleteness = assessProductSchemaCompleteness\(productOfferEvidence\)/);
  // 2: visible facts
  assert.match(route, /findPaymentMethods\(html, text\)/);
  assert.match(route, /findReviewEvidence\(html, text, schemaTypes\)/);
  assert.match(route, /findVisiblePrices\(html, text\)/);
  assert.match(route, /classifyLegalLink\(item\.href, finalUrl\.toString\(\)\)/);
  assert.match(route, /sameRegistrableSite\(loc\.hostname, finalUrl\.hostname\)/);
  // 3: status and severity
  assert.match(route, /check\("fail", "broken_links"/);
  assert.match(route, /status:"broken", httpStatus:r\.status/);
  assert.match(route, /check\("fail","trust_legal_signals"/);
  // 4: cross-domain canonical is high risk on the page and in the sample
  assert.match(route, /Hoog risico: de canonical verwijst naar een ander domein/);
  assert.match(route, /"sample_canonical_cross_domain"/);
  // 6: sample in the action list and in the headline
  assert.match(route, /selectedSeoChecks\.push\(\.\.\.sampleChecks\)/);
  assert.match(route, /blendHeadlineScore\(selectedOverallScore, multiPage\.siteSampleScore, otherSampledPages\)/);
  // 7/8: raw-HTML limitations and accessibility element counts
  assert.match(route, /limitations: rawHtmlLimitations/);
  assert.match(route, /accessibilityScopeCount===0/);
  // 9/12: uniform report metadata and identified user agents
  assert.match(route, /const reportMeta = \{/);
  assert.equal(route.includes("rankfix-app.onrender.com"), false);
  // 11: commerce-only firewall lists the real check keys
  for (const key of ["eu_discount_reference_signal", "eu_review_transparency_signal", "price_currency_consistency", "checkout_trust"]) {
    assert.ok(route.includes(`"${key}"`), key);
  }
  assert.match(route, /&& !fintechNonCommerce/);
});

test("H1 multiplicity in raw/rendered HTML is advisory, not proof of visible competing headings",()=>{
  const s=assessH1Quality("<h1>Every payment</h1><h1>Platform for every payment</h1>",["example"]);
  assert.equal(s.status,"warning");
  assert.match(s.details,/tegelijk zichtbaar/);
  assert.match(s.details,/niet automatisch een bewezen rankingfout/);
});
test("sample page title lengths are not stated as definite search result truncation",()=>{
  const v=assessPageTitle("How to manage every business payment with a flexible financial platform", "example.com");
  assert.equal(v.status,"WARNING");
  assert.match(v.details,/niet bewezen/);
  assert.doesNotMatch(v.details,/zoekmachines kappen hem af/);
});

// ---------------------------------------------------------------- review round 2 (13 Oct 2026)
import { htmlWithoutScripts, isPlaceholderHref, offerPriceAndCurrency } from "../lib/evidence-quality.ts";
import { findVisibleAddress } from "../lib/contact-evidence.ts";
import { isBrandOnlyTitle, isNonContentUrl } from "../lib/report-quality.ts";

test("a cookie POLICY page heading is the page heading, not a banner (IKEA, Rijksoverheid)", () => {
  assert.equal(assessH1Quality(`<main class="cookie-policy"><h1>Cookieverklaring IKEA Nederland</h1><p>Wij gebruiken cookies om…</p></main>`, ["ikea"], "https://www.ikea.com/nl/nl/customer-service/cookie-policy/").status, "pass");
  assert.equal(assessH1Quality(`<main><h1>Cookies</h1><p>Rijksoverheid.nl gebruikt cookies.</p></main>`, ["rijksoverheid"], "https://www.rijksoverheid.nl/service/cookies").status, "pass");
  // "toestemming" in a normal heading is not consent copy.
  assert.equal(assessH1Quality(`<h1>Formulier toestemming reizen met minderjarig kind</h1>`, ["rijksoverheid"], "https://www.rijksoverheid.nl/documenten/2014/02/06/formulier").status, "pass");
  // A class that merely contains "cookie" without an overlay is not a banner.
  assert.equal(assessH1Quality(`<section class="cookie-info"><h1>Over cookies</h1></section>`, [], "https://x.nl/info").status, "pass");
});

test("real consent banners are still excluded on every platform", () => {
  for (const html of [
    `<div id="onetrust-banner-sdk"><h1>Wij gebruiken cookies</h1></div><main><h1>Wollen sneakers</h1></main>`,
    `<div class="cookie-notice" role="dialog"><h1>Cookies</h1><button>Accepteren</button></div><main><h1>Vacatures</h1></main>`,
    `<div id="CybotCookiebotDialog"><h1>Deze website gebruikt cookies</h1></div><main><h1>Transport</h1></main>`,
    `<h1>Cookies voor een gebruiksvriendelijke ervaring</h1><button>Alles accepteren</button><button>Weigeren</button><main><h1>Logistiek</h1></main>`,
  ]) {
    const result = assessH1Quality(html, [], "https://x.nl/");
    assert.equal(result.excludedConsentH1s.length, 1, html);
    assert.equal(result.contentH1s.length, 1, html);
  }
});

test("a privacy link on a provider's host is not the site's own (Coolblue: Calendly, Awin)", () => {
  assert.equal(classifyLegalLink("https://calendly.com/legal/privacy-notice", "https://www.coolblue.nl/"), null);
  assert.equal(classifyLegalLink("https://success.awin.com/s/article/cookies", "https://www.coolblue.nl/"), null);
  assert.equal(classifyLegalLink("https://legal.coolblue-group.com/privacy", "https://www.coolblue.nl/"), "external_host");
  assert.equal(classifyLegalLink("https://documents.cdn.etrias.nl/nl/privacy/privacy-nl.pdf", "https://www.sneakers.nl/"), "external_pdf");
});

test("template tokens and script links are not links (sneakers.nl product.uri)", () => {
  for (const href of ["product.uri", "item.url", "{{ product.url }}", "${link}", "#{href}", "%7B%7Burl%7D%7D"]) assert.equal(isPlaceholderHref(href), true, href);
  for (const href of ["/product/123", "contact.html", "https://x.nl/a", "../about", "page.php?id=1"]) assert.equal(isPlaceholderHref(href), false, href);
  assert.equal(/product\.uri/.test(htmlWithoutScripts(`<script>var t='<a href="product.uri">x</a>'</script><a href="/ok">ok</a>`)), false);
});

test("offer prices in priceSpecification and AggregateOffer count (IKEA, DiscountOffice)", () => {
  assert.deepEqual(offerPriceAndCurrency({ "@type": "Offer", priceSpecification: { "@type": "UnitPriceSpecification", price: 199, priceCurrency: "EUR" } }), { price: "199", currency: "EUR" });
  assert.deepEqual(offerPriceAndCurrency({ "@type": "AggregateOffer", lowPrice: "17.99", priceCurrency: "eur" }), { price: "17.99", currency: "EUR" });
  assert.deepEqual(offerPriceAndCurrency({ price: "", availability: "InStock" }), { price: null, currency: null });
  assert.deepEqual(offerPriceAndCurrency({ priceSpecification: [{ price: 5.5, priceCurrency: "USD" }] }), { price: "5.5", currency: "USD" });
});

test("business addresses are recognised in NL, US and UK format (PayPal)", () => {
  assert.match(findVisibleAddress("PayPal, Inc. is located at 2211 N 1st St. San Jose, CA 95131 and licensed") || "", /San Jose, CA 95131/);
  assert.match(findVisibleAddress("Visit 10 Downing Street, London SW1A 2AA") || "", /SW1A 2AA/);
  assert.match(findVisibleAddress("Damrak 1, 1012 LG Amsterdam") || "", /1012 LG Amsterdam/);
});

test("a locale code or 'Home' next to the brand is a brand-only title (TransHeroes)", () => {
  assert.equal(isBrandOnlyTitle("Nl | TransHeroes", "www.transheroes.com"), true);
  assert.equal(isBrandOnlyTitle("Home | Zalando", "www.zalando.de"), true);
  assert.equal(isBrandOnlyTitle("Wollen sneakers | Allbirds", "allbirds.de"), false);
});

test("login and identity screens never enter the sample (Allbirds OAuth URL)", () => {
  assert.equal(isNonContentUrl("https://account.allbirds.de/authentication/oauth/authorize?client_id=x&state=y&code=z"), true);
  assert.equal(isNonContentUrl("https://allbirds.de/pages/kontakt"), false);
});

test("FAQ needs an FAQ heading; account prompts are not questions (DiscountOffice)", () => {
  const footerLinkOnly = `<h3>Nog geen klant?</h3><p>Maak eenvoudig een account aan en bestel sneller.</p><footer><a href="/faq">Veelgestelde vragen</a></footer>`;
  assert.equal(findFaqEvidence(footerLinkOnly).found, false);
  const real = `<h2>Veelgestelde vragen</h2><details><summary>Wat zijn de verzendkosten</summary><p>Boven 50 euro gratis verzending.</p></details>`;
  assert.equal(findFaqEvidence(real).found, true);
});

test("an empty review widget is not a review signal (Allbirds '0 Bewertungen')", () => {
  assert.equal(findReviewEvidence("", "0 Bewertungen", []).ratingText, null);
  assert.ok(findReviewEvidence("", "4,6/5 op basis van 2.310 beoordelingen", []).ratingText);
});

test("software Product markup with a rating but no offer is valid (Teamleader)", () => {
  assert.equal(assessProductSchemaCompleteness([{ name: "Teamleader Focus", hasImage: true, hasRating: true, offers: [] }]).complete, true);
  assert.equal(assessProductSchemaCompleteness([{ name: "Bureaustoel", hasImage: true, offers: [] }]).complete, false);
});
