// 4 Nov 2026 — QA10 step 4a: page type from the page's own content, URL is a hint.
// Regression cases (no domain rules): accessibility statement typed category
// (shop mega-menu) or support (below /klantenservice/); privacy statement "other";
// FAQ typed contact; fitness lessons / personal training not services; branch and
// price pages "other".
import test from "node:test";
import assert from "node:assert/strict";
import { pageIdentityType } from "../lib/page-identity.ts";
import { refineSamplePageType } from "../lib/sample-quality.ts";
import { looksLikeLocationPath } from "../lib/product-links.ts";

const base = { productSchema: false, itemListSchema: false, repeatedProductLinks: false, productOffer: false, purchaseAction: false, visiblePrices: 0, uniqueH1: true, detailIdentity: false };
const typed = (proposed, page, extra = {}) => refineSamplePageType({ ...base, ...extra, proposed, path: page.path, identity: pageIdentityType({ title: page.title, h1s: page.h1s, schemaTypes: page.schema || [] }) });

test("legal statements are legal whatever the URL or menu", () => {
  for (const [h1, proposed] of [["Toegankelijkheidsverklaring", "category"], ["Digitale toegankelijkheidsverklaring", "support"], ["Privacy statement", "other"], ["Privacyverklaring", "other"], ["Algemene voorwaarden", "other"], ["Cookiebeleid", "other"], ["Erklärung zur Barrierefreiheit", "other"], ["Déclaration d'accessibilité", "other"], ["Accessibility statement", "category"]]) {
    assert.equal(typed(proposed, { path: "/info/x", title: `${h1} | Merk`, h1s: [h1] }, { visiblePrices: 3 }), "legal", h1);
  }
});

test("FAQ is support, not contact, even below /contact/", () => {
  assert.equal(typed("contact", { path: "/contact/faq", title: "Veelgestelde vragen | Studio", h1s: ["Veelgestelde vragen"] }), "support");
  assert.equal(typed("contact", { path: "/contact", title: "FAQ - Studio", h1s: [] , schema: ["faqpage"] }), "support");
  // A real contact page stays contact, also when it carries an FAQ block.
  assert.equal(typed("support", { path: "/klantenservice", title: "Contact | Studio", h1s: ["Contact"], schema: ["faqpage"] }), "contact");
});

test("branch overviews are location pages; recruitment pages are not", () => {
  assert.equal(typed("other", { path: "/salons", title: "Onze salons | Kapper", h1s: ["Onze salons"] }), "location");
  assert.equal(typed("other", { path: "/winkels", title: "Winkels | Merk", h1s: [] }), "location");
  assert.equal(looksLikeLocationPath("/winkels"), true);
  assert.equal(looksLikeLocationPath("/franchise-ondernemer"), false);
  assert.equal(refineSamplePageType({ ...base, proposed: "other", path: "/winkels/utrecht" }), "location");
});

test("price list of a service provider and lessons/training pages are services", () => {
  assert.equal(typed("other", { path: "/prijzen", title: "Prijzen | Kapper", h1s: ["Prijzen"] }), "service");
  assert.equal(typed("other", { path: "/tarieven", title: "Tarieven", h1s: ["Tarieven 2026"] }), "service");
});

test("a product is never re-typed by a word in its title", () => {
  assert.equal(pageIdentityType({ title: "Privacy screen protector 14 inch zwart | Shop", h1s: ["Privacy screen protector 14 inch zwart met filter"] }), null);
  assert.equal(pageIdentityType({ title: "Cookies", h1s: ["Cookies"], sellsOneProduct: true }), null);
  assert.equal(pageIdentityType({ title: "Verzendkosten | Shop", h1s: ["Verzendkosten"] }), null);
});

test("lessons, personal training and treatments are services (no purchase action)", async () => {
  const { SERVICE_INTENT } = await import("../lib/sample-quality.ts");
  for (const h of ["Fitnesslessen", "Personal training", "Groepslessen en workshops", "Behandelingen"]) {
    assert.ok(SERVICE_INTENT.test(h), h);
    assert.equal(refineSamplePageType({ ...base, proposed: "other", path: "/aanbod/x", serviceEvidence: SERVICE_INTENT.test(h) }), "service", h);
  }
  assert.ok(!SERVICE_INTENT.test("Trainingsbroek heren zwart"));
});

test("a dated news item about new rates stays an article; a price heading never overrides it", () => {
  const identity = pageIdentityType({ title: "Nouveaux tarifs | La Poste", h1s: ["Nouveaux tarifs"] });
  assert.equal(identity?.type, "pricing");
  assert.equal(refineSamplePageType({ ...base, proposed: "article", path: "/actualites/nouveaux-tarifs", datedArticle: true, identity }), "article");
});
