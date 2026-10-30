import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectPrimaryBusinessIdentity, isSiteHomepagePath } from "../lib/primary-business-identity.ts";
import { confirmedRetailEvidenceForService } from "../lib/commerce-applicability.ts";

const sector = (title, description, headings = [], schemaTypes = []) =>
  detectPrimaryBusinessIdentity({title,description,headings,schemaTypes});

test("primary-sector evidence: payment processors are services, not accommodation or retail", () => {
  const cases = [
    ["FlowPay – the platform for online and in-person payments", "One platform to accept payments, manage money and access funding.", ["Payments made simple"], ["WebSite","Organization"]],
    ["Pay, Send and Save Money", "From paying friends to saving money and getting cash back.", ["Pay, send, and save smarter"], ["FinancialProduct","PaymentCard"]],
    ["Acme payment processing platform", "Accept online payments and manage funds from your business dashboard.", ["For every payment"], ["Organization"]],
    ["Betaalplatform voor ondernemers", "Eén plek om betalingen te accepteren en je geld te beheren.", ["Betalingen verwerken"], ["WebSite"]],
    ["Digital wallet and money transfers", "Send money and transfer money worldwide.", ["Money made simpler"], []],
  ];
  for (const [title,description,headings,schemaTypes] of cases) {
    const result = sector(title,description,headings,schemaTypes);
    assert.equal(result.sector, "financial_services", title);
    assert.ok(result.confidenceScore >= 85, title);
    assert.ok(result.evidence.length >= 2, title);
  }
});

test("primary-sector evidence: hotels require identity, not stray guest/check-in text", () => {
  const hotel = sector("Harbor Hotel & Guesthouse", "Book your room and overnight stay with us.",["Rooms and accommodation"], ["Hotel"]);
  assert.equal(hotel.sector,"hospitality");
  assert.equal(hotel.confidence,"high");
  const hotelWithoutSchema = sector("Harbor Hotel", "Comfortable accommodation with rooms to book.");
  assert.equal(hotelWithoutSchema.sector,"hospitality");
  const accommodationSchemaOnly = sector("Welcome", "Our family-owned property.", [], ["Hotel"]);
  assert.equal(accommodationSchemaOnly.sector,"hospitality");

  for (const incidental of [
    sector("Secure payment processing for businesses", "Accept payments and manage money securely.", ["Guest checkout and arrivals"], ["Organization","PaymentCard"]),
    sector("Accounting services", "Business bookkeeping and financial reporting.", ["Book a call; guest accounts and check-in information"], ["Organization"]),
    sector("Online store for luggage", "Shop bags, travel accessories and suitcases.", ["Guests, hotels and vacation stays"]),
    sector("Travel ticket booking", "Search train timetables and departure/arrival schedules.", ["Book travel for two guests"]),
  ]) assert.notEqual(incidental.sector,"hospitality");
});

test("primary-sector evidence: generic merchant, checkout and price references are not sector identity", () => {
  const cases = [
    sector("Fashion brand's new online store", "Buy products, pick colors and checkout.", ["100% secure payments"], ["Product","Offer"]),
    sector("Store analytics", "Dashboards for product pages and shopping carts.", ["Accept a demo"], ["SoftwareApplication"]),
    sector("Consulting firm", "Expert advice for growing businesses.", ["Our hotel clients and their guests use our software"]),
    sector("The digital marketing agency", "Campaigns, creative design and lead generation.", ["Payments, departure and guests"]),
  ];
  for (const c of cases) assert.equal(c.sector,"unknown");
});

test("primary-sector evidence: weaker conflicting identity abstains instead of guessing 96%", () => {
  const c = sector("Payments platform for hotels", "Accept payments from hotel guests and offer rooms", ["Hotel solutions"], ["PaymentCard"]);
  assert.equal(c.sector,"financial_services");
  const sparse = sector("We're here to help", "Visit our services", ["Arrival, departure, guests, checkout"]);
  assert.equal(sparse.sector,"unknown");
  assert.equal(sparse.confidenceScore,0);
});

test("generic homepage aliases do not create product pages", () => {
  for (const path of ["/","/us/home","/nl/home","/en-us/home","/fr/","/home","/us/en/home","/en/gb/home","/index.html",
    // Server start pages (QA replay: telekom /start, esselunga /it-it/homepage.html, enterprise /en/home.html).
    "/start","/de/start","/en/home.html","/it-it/homepage.html","/de/startseite","/fr/accueil","/es/inicio","/index.php"])
    assert.equal(isSiteHomepagePath(path),true,path);
  for (const path of ["/us/products","/shop/home","/products/home","/guides/home","/us/home/product","/us/products/example",
    "/shop/start","/blog/homepage.html","/products/index.html","/startpakket","/home-improvement"])
    assert.equal(isSiteHomepagePath(path),false,path);
});

test("primary-sector and page classification are wired into RankFix before commerce checks", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url),"utf8");
  assert.match(route,/const isHomepage = isLocalizedHomepage \|\| isSiteHomepagePath\(pathname\)/);
  assert.match(route,/const primaryBusinessEvidence = detectPrimaryBusinessIdentity\(\{title,description,headings:h1s,schemaTypes\}\)/);
  assert.match(route,/const shortStayIdentity = primaryBusinessEvidence\.sector === "hospitality" && Boolean/);
  assert.match(route,/primaryBusinessEvidence\.sector === "financial_services"/);
  assert.match(route,/retailPurchaseEvidence\s*&& primaryBusinessEvidence\.sector !== "financial_services"/);
  // The service gate also accepts independently corroborated sector identity.
  // Its presence is a prerequisite for treating a cart as a secondary capability.
  assert.match(route,/const verifiedNonCommerceIndustry = Boolean\(acceptExtendedIndustry/);
  assert.match(route,/const hardCommerceEvidence = \(primaryNonCommerceIdentity \|\| verifiedNonCommerceIndustry\)/);
  assert.match(route,/confirmedRetailEvidenceForService\(\{/);
});

test("service vs retail eligibility is capability-based for every sector, not one domain", () => {
  const none = {representativePurchase:false,productDetailSchema:false,addToCart:false,productAndPrice:false};
  for (const options of [
    none,
    {...none,addToCart:true},
    {...none,productAndPrice:true},
    {...none,productDetailSchema:true,addToCart:true},
    {...none,productDetailSchema:true,productAndPrice:true},
  ]) assert.equal(confirmedRetailEvidenceForService(options),false);
  assert.equal(confirmedRetailEvidenceForService({...none,representativePurchase:true}),true);
  assert.equal(confirmedRetailEvidenceForService({...none,productDetailSchema:true,addToCart:true,productAndPrice:true}),true);
});
