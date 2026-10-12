import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { articleSchemaPage, declaredIdentityGovernsPage, declaredPrimaryIdentity } from "../lib/primary-identity.ts";

const identity = (c) => declaredPrimaryIdentity({ schemaTypes: c.schemaTypes || [], identityText: [c.title || "", c.description || "", (c.h1s || []).join(" ")].join(" "), links: c.links || [], catalog: c.catalog || [] });

// ---------------------------------------------------------------------------
// Synthetic, brand-free cases per identity family.
// ---------------------------------------------------------------------------
test("news publisher: NewsMediaOrganization + news identity text", () => {
  const r = identity({ title: "Motorsport.example — het snelste racenieuws", description: "Het laatste nieuws over motorsport", schemaTypes: ["WebSite", "NewsMediaOrganization"] });
  assert.equal(r?.key, "news_publisher");
  assert.equal(r?.websiteType, "Nieuws-/mediasite");
});

test("newsletter is not news identity", () => {
  assert.equal(identity({ title: "Schrijf je in voor onze nieuwsbrief", description: "Meubels online", links: [] }), null);
});

test("software/SaaS: SoftwareApplication + software identity", () => {
  const r = identity({ title: "Het boekhoudpakket voor ondernemers", schemaTypes: ["Organization", "SoftwareApplication", "AggregateOffer"] });
  assert.equal(r?.key, "software_saas");
});

test("two text-only families are never enough (identity + content scoring)", () => {
  // No schema and no link structure: a page that merely talks about software.
  const r = identity({ title: "Software voor je administratie", catalog: [{ key: "saas_b2b", score: 6 }], links: ["/over-ons/"] });
  assert.equal(r, null);
});

test("SaaS link structure needs three different kinds of pages", () => {
  const sameKind = ["/login", "/login?x=1", "/inloggen", "/inloggen/"]; // only login-type pages
  assert.equal(identity({ title: "Online facturatie software", links: sameKind }), null);
  const varied = ["/features/", "/prijzen/", "/integraties/", "/aanmelden/"];
  assert.equal(identity({ title: "Online facturatie software", links: varied })?.key, "software_saas");
});

test("job board: identity text + many vacancy links", () => {
  const links = Array.from({ length: 12 }, (_, i) => `/vacatures/functie/rol-${i}`);
  const r = identity({ title: "De vacaturesite met banen en stages", links, catalog: [{ key: "logistics", score: 5 }] });
  assert.equal(r?.key, "job_board");
  assert.equal(r?.sector, "recruitment");
});

test("a company careers link is not a job board", () => {
  const r = identity({ title: "Witgoed en elektronica online kopen", links: ["/vacatures/", "/werken-bij/"] });
  assert.equal(r, null);
});

test("attraction/recreation: attraction identity + park structure", () => {
  const r = identity({ description: "Een attractiepark met nieuwe attracties voor het leukste dagje uit", links: ["/nl/park", "/nl/tickets", "/nl/openingstijden"] });
  assert.equal(r?.key, "attraction_recreation");
  assert.equal(r?.sector, "tourism_recreation");
});

test("retail store schema always keeps retail primary", () => {
  assert.equal(identity({ title: "Nieuws en aanbiedingen", schemaTypes: ["OnlineStore", "NewsMediaOrganization"] }), null);
});

test("ambiguous: two identities with equal evidence declare nothing", () => {
  const r = identity({ title: "Nieuws en vacatures", schemaTypes: ["NewsMediaOrganization", "JobPosting"] });
  assert.equal(r, null);
});

test("declared identity governs only non-product, non-category pages", () => {
  const r = identity({ title: "Racenieuws", schemaTypes: ["NewsMediaOrganization"] });
  assert.equal(declaredIdentityGovernsPage(r, { isProductPage: false, isCategoryPage: false }), true);
  assert.equal(declaredIdentityGovernsPage(r, { isProductPage: true, isCategoryPage: false }), false);
  assert.equal(declaredIdentityGovernsPage(r, { isProductPage: false, isCategoryPage: true }), false);
  assert.equal(declaredIdentityGovernsPage(null, { isProductPage: false, isCategoryPage: false }), false);
});

test("article schema outranks keyword local-business hints, not real LocalBusiness schema", () => {
  assert.equal(articleSchemaPage(["WebPage", "Organization", "NewsArticle"], false), true);
  assert.equal(articleSchemaPage(["BlogPosting"], false), true);
  assert.equal(articleSchemaPage(["NewsArticle"], true), false, "a homepage is not an article page");
  assert.equal(articleSchemaPage(["Article", "Restaurant"], false), false, "real LocalBusiness schema wins");
  assert.equal(articleSchemaPage(["WebPage", "Organization"], false), false);
});

// ---------------------------------------------------------------------------
// Regression data from 20 real scans (PR #127, 2026-10-12): page metadata and
// sampled internal paths. Every correctly classified site must stay untouched.
// Links here are only the sampled pages (a subset of the homepage anchors), so
// the two structure-dependent positives are verified end-to-end instead.
// ---------------------------------------------------------------------------
const { cases } = JSON.parse(readFileSync(new URL("./fixtures/identity-cases.json", import.meta.url), "utf8"));

test("real scans: no declared identity on shops, practice, transport or government", () => {
  const untouched = cases.filter((c) => !c.expected);
  assert.ok(untouched.length >= 13);
  for (const c of untouched) assert.equal(identity(c), null, `${c.url} must keep its existing classification`);
});

test("real scans: news article, news site with subscriptions and SaaS are recognised", () => {
  for (const id of ["15", "16", "18"]) {
    const c = cases.find((item) => item.id === id);
    assert.equal(identity(c)?.key, c.expected, c.url);
  }
});

test("news structure: numeric article ids count, product ids never", () => {
  const articles = Array.from({ length: 8 }, (_, i) => `/economie/64128${i}0/kop-${i}`);
  assert.equal(identity({ title: "Het laatste nieuws het eerst", links: articles })?.key, "news_publisher");
  const products = Array.from({ length: 8 }, (_, i) => `/product/94589${i}/wasmachine-${i}.html`);
  assert.equal(identity({ title: "Het laatste nieuws over onze aanbiedingen", links: products }), null);
});

test("recreation: zoo and museum identities, also as compound words", () => {
  assert.equal(identity({ title: "Beleef de natuur in Diergaarde Stad", links: ["/nl/bezoek/tickets", "/nl/bezoek", "/nl/ontdek/dieren"] })?.key, "attraction_recreation");
  assert.equal(identity({ title: "Stadsmuseum, het museum van de stad", links: ["/nl/bezoek", "/nl/tickets", "/nl/zien-en-doen"] })?.key, "attraction_recreation");
  assert.equal(identity({ title: "Stadsmuseum", links: ["/nl/winkel"] }), null, "identity text alone is not enough");
});

test("a municipality with a 'Nieuws' heading is not declared a news publisher without structure", () => {
  assert.equal(identity({ title: "Home | Gemeente Stad", h1s: ["Direct naar", "Nieuws"], links: ["/nieuws/", "/vergunningen/"] }), null);
});
