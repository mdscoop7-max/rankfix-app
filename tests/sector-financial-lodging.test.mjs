import test from "node:test";
import assert from "node:assert/strict";
import { financialServicesIdentity, isLocalizedHomepagePath, lodgingIdentity } from "../lib/sector-identity.ts";
import { buildScanEvidence } from "../lib/scan-evidence.ts";

// Page identity (title, description, H1, host, path) from the 16 Oct 2026 scans.
const PAYPAL = "Pay, Send and Save Money with PayPal | PayPal US www.paypal.com /us/home";
const MOLLIE = "Mollie – the platform for online and in-person payments www.mollie.com /";
const KPN = "Welkom bij KPN: het netwerk van Nederland | KPN www.kpn.com /";
// Non-financial sites from the existing identity matrix.
const OTHERS = [
  "Betaalbare meubels & accessories – Alles voor je huis - IKEA Welkom bij IKEA! · Bestel online of kom langs in een van onze woonwinkels. www.ikea.com /nl/nl/",
  "Zalando | Kleding, schoenen & accessoires online kopen www.zalando.nl /",
  "Coolblue - Alles voor een glimlach Beste webwinkel 2022. Voor 23.59u besteld? Morgen gratis bezorgd. Gratis retourneren. www.coolblue.nl /",
  "KwikFit - APK, Autobanden en Auto-onderhoud www.kwik-fit.nl /",
  "Internationaal transport, zeevracht, luchtvracht & douane | TransHeroes www.transheroes.com /nl/",
  "Uw makelaar met meer dan 10 jaar ervaring | HousingNet Een woning huren, verhuren, kopen of verkopen? www.housingnet.nl /",
  "Restaurant de Kas From plant to plate restaurantdekas.com /",
  "Tandarts Amsterdam - Tandartspraktijk Plantage Middenlaan tandartsplantagemiddenlaan.nl /",
  "Webshop met veilig betalen en achteraf betalen via Klarna · gratis verzending www.shop.example /",
  "Zitbank kopen? Banken en hoekbanken online bestellen www.meubels.example /",
];

test("payment providers are recognised as financial services, not webshops or hotels", () => {
  assert.equal(financialServicesIdentity(MOLLIE, ["WebSite", "Organization"])?.kind, "payments");
  assert.equal(financialServicesIdentity(PAYPAL, ["Organization", "Corporation", "WebSite", "PaymentCard", "LoanOrCredit"])?.kind, "payments");
  assert.equal(financialServicesIdentity("Stripe | Financial Infrastructure to Grow Your Revenue · Accept payments online www.stripe.com /", [])?.kind, "payments");
  assert.equal(financialServicesIdentity("Betaalprovider voor webshops – iDEAL en creditcard www.psp.example /", [])?.kind, "payments");
});

test("banks and insurers are recognised; telecom, retail and services are not", () => {
  assert.equal(financialServicesIdentity("Bankieren, sparen en hypotheken | Bank www.bank.example /", [])?.kind, "banking");
  assert.equal(financialServicesIdentity("Hypotheek afsluiten www.lender.example /", ["BankOrCreditUnion"])?.kind, "banking");
  assert.equal(financialServicesIdentity("Autoverzekering en zorgverzekering afsluiten | Verzekeraar www.verzekeraar.example /", [])?.kind, "insurance");
  assert.equal(financialServicesIdentity(KPN, ["Organization"]), null);
  for (const identity of OTHERS) assert.equal(financialServicesIdentity(identity, []), null, identity);
});

test("lodging identity needs accommodation in the page identity or schema", () => {
  assert.equal(lodgingIdentity(MOLLIE, ["WebSite", "Organization"]), false);
  assert.equal(lodgingIdentity(PAYPAL, ["PaymentCard"]), false);
  assert.equal(lodgingIdentity(KPN, []), false);
  for (const identity of OTHERS) assert.equal(lodgingIdentity(identity, []), false, identity);
  assert.equal(lodgingIdentity("Hotel De Paris – kamers boeken in Amsterdam www.hoteldeparis.example /", []), true);
  assert.equal(lodgingIdentity("B&B De Linde – overnachten op de Veluwe linde.example /", []), true);
  assert.equal(lodgingIdentity("Welkom www.example.nl /", ["LodgingBusiness"]), true);
  assert.equal(lodgingIdentity("Vakantiepark Zeeland – bungalows en chalets park.example /", []), true);
});

test("payment checkout and pension wording are not short-stay evidence", () => {
  const html = "<html><body><h1>Online payments</h1><p>Hosted checkout for your webshop. Pension funds and SaaS platforms use our API. Guests can pay at arrival.</p></body></html>";
  const evidence = buildScanEvidence({ url: "https://payments.example/", html });
  assert.equal(evidence.sectorDetails.lodging.shortStay.value, false);
  assert.equal(evidence.sectorDetails.lodging.bedBreakfast.value, false);
  const hotel = buildScanEvidence({ url: "https://hotel.example/", html: "<html><body><p>Check-in vanaf 15:00, check-out tot 11:00. Prijs per nacht.</p></body></html>" });
  assert.equal(hotel.sectorDetails.lodging.shortStay.value, true);
});

test("country and /home locale roots are homepages, real content paths are not", () => {
  for (const path of ["/us/home", "/nl/nl", "/en-gb", "/home", "/de/index.html", "/be/fr", "/global"]) {
    assert.equal(isLocalizedHomepagePath(path.split("/").filter(Boolean)), true, path);
  }
  for (const path of ["/us/home/pricing", "/shop", "/products/pos-payments", "/us/business", "/nl/winkel", "/about"]) {
    assert.equal(isLocalizedHomepagePath(path.split("/").filter(Boolean)), false, path);
  }
});

test("scan route lets financial identity outrank commerce and lodging", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /hasEcommerceSignal = \(transportBookingIdentity \|\| financialServiceIdentityEarly\)/);
  assert.match(source, /shortStayIdentity = !financialPrimaryIdentity && lodgingIdentityConfirmed/);
  assert.match(source, /masterIdentityOverride[^=]*= financialPrimaryIdentity/);
  assert.match(source, /isLocalizedHomepagePath\(pathSegmentsForType\)/);
});
