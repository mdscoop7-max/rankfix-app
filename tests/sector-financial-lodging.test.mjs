import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectPrimaryBusinessIdentity, isSiteHomepagePath } from "../lib/primary-business-identity.ts";
import { buildScanEvidence } from "../lib/scan-evidence.ts";

const id = (title, description = "", headings = [], schemaTypes = []) =>
  detectPrimaryBusinessIdentity({ title, description, headings, schemaTypes });

// Generic profiles; brand names only appear where they are part of a page title
// a scan actually returned, never as a matching rule.
test("payments: title plus typed financial schema is enough, generic wording only", () => {
  const paypalLike = id("Pay, Send and Save Money | Example", "", [], ["Organization", "PaymentCard", "LoanOrCredit"]);
  assert.equal(paypalLike.sector, "financial_services");
  assert.equal(paypalLike.financialKind, "payments");
  assert.equal(id("Financial infrastructure for the internet", "Accept payments online and in person.").financialKind, "payments");
  assert.equal(id("Betaalprovider voor ondernemers", "Online betalingen accepteren met iDEAL en creditcard.").financialKind, "payments");
  // One identity source without schema abstains instead of guessing.
  assert.equal(id("Welcome", "We help you send money abroad.").sector, "unknown");
});

test("banks and insurers are financial services; full-service banks stay banks", () => {
  assert.equal(id("Bankieren, sparen en hypotheken | Bank", "Regel je bankzaken online.").financialKind, "banking");
  assert.equal(id("Bankieren, hypotheken en verzekeringen", "Betaalrekening openen").financialKind, "banking");
  assert.equal(id("Hypotheek afsluiten", "", [], ["BankOrCreditUnion"]).financialKind, "banking");
  assert.equal(id("Autoverzekering en zorgverzekering | Verzekeraar", "Vergelijk en sluit direct af.").financialKind, "insurance");
  assert.equal(id("Welkom", "", [], ["InsuranceAgency"]).financialKind, "insurance");
});

test("retailers are never financial services because of money or payment wording", () => {
  for (const [title, description] of [
    ["Dagaanbiedingen – saving money every day", "Online shop: start saving money on electronics."],
    ["Zitbank kopen? Banken en hoekbanken", "Online bestellen, gratis bezorgd"],
    ["Sneakers webshop", "Veilig betalen, achteraf betalen via Klarna, gratis verzending"],
    ["Telefoon kopen met verzekering", "Bestel online, morgen in huis."],
    ["Welkom bij KPN: het netwerk van Nederland | KPN", "Internet, tv en mobiel."],
  ]) assert.equal(id(title, description).sector, "unknown", title);
});

test("camping and resort words: shops stay retail, real campsites are lodging", () => {
  assert.equal(id("Campingartikelen en camping kopen | Outdoor webshop", "Camping spullen online bestellen, tenten en slaapzakken.").sector, "unknown");
  assert.equal(id("Camping & outdoor shop", "Alles voor camping: tenten, kooktoestellen. Gratis verzending.").sector, "unknown");
  assert.equal(id("Resort wear collection", "Shop now: summer dresses, free shipping.").sector, "unknown");
  assert.equal(id("Camping De Berken – kamperen op de Veluwe", "Ruime kampeerplaatsen en chalets. Reserveer je verblijf.").sector, "hospitality");
  assert.equal(id("Resort Zeeland", "Luxe bungalows aan zee, boek je verblijf.").sector, "hospitality");
  assert.equal(id("Hotel De Paris – kamers boeken in Amsterdam", "Boutique hotel in het centrum.").sector, "hospitality");
});

test("payment checkout and pension wording are not short-stay evidence", () => {
  const html = "<html><body><h1>Online payments</h1><p>Hosted checkout for your webshop. Pension funds and SaaS platforms use our API. Guests can pay at arrival.</p></body></html>";
  const evidence = buildScanEvidence({ url: "https://payments.example/", html });
  assert.equal(evidence.sectorDetails.lodging.shortStay.value, false);
  assert.equal(evidence.sectorDetails.lodging.bedBreakfast.value, false);
  const hotel = buildScanEvidence({ url: "https://hotel.example/", html: "<html><body><p>Check-in vanaf 15:00, check-out tot 11:00. Prijs per nacht.</p></body></html>" });
  assert.equal(hotel.sectorDetails.lodging.shortStay.value, true);
});

test("international market roots are homepages", () => {
  for (const path of ["/global", "/int/en", "/eu/home"]) assert.equal(isSiteHomepagePath(path), true, path);
  for (const path of ["/global/products", "/shop"]) assert.equal(isSiteHomepagePath(path), false, path);
});

test("route labels financial sub-types and maps every catalog sector", async () => {
  const route = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /financial_\$\{primaryBusinessEvidence\.financialKind\}/);
  const { SECTOR_CATALOG } = await import("../lib/sector-catalog.ts");
  const mapBlock = route.slice(route.indexOf("const catalogLegacyMap"), route.indexOf("const mappedCatalogSector"));
  const unmapped = SECTOR_CATALOG.map((s) => s.key).filter((key) => key !== "ecommerce" && key !== "general_business" && !new RegExp(`\\b${key}:`).test(mapBlock));
  assert.deepEqual(unmapped, [], `catalog sectors without a scan sector: ${unmapped.join(", ")}`);
});
