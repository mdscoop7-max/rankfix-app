import test from "node:test";
import assert from "node:assert/strict";
import { detectPrimaryBusinessIdentity } from "../lib/primary-business-identity.ts";

test("financial infrastructure plus explicit payment execution on homepage is a medium-confidence payment provider, not generic SaaS", () => {
  for (const title of ["Welkom op ons platform", "Cloud API voor ondernemers", "Home"]) {
    const identity = detectPrimaryBusinessIdentity({
      title,
      description: "",
      headings: ["Financiële infrastructuur om je omzet te laten groeien. Ontvang betalingen, bied financiële diensten aan en implementeer verdienmodellen."],
      homepage: true,
    });
    assert.equal(identity.sector, "financial_services", title);
    assert.equal(identity.financialKind, "payments", title);
    assert.equal(identity.confidence, "medium", title);
    assert.ok(identity.confidenceScore < 80, title);
  }
});

test("different financial providers, same generic identity evidence, same primary sector without domain lists", () => {
  const examples = [
    ["Betalingsinfrastructuur voor ondernemers", "Accepteer online betalingen vanuit één platform"],
    ["Payments infrastructure for modern businesses", "Accept payments, process transactions and send payouts"],
    ["Betaalplatform voor bedrijven", "Verwerk digitale betalingen en optimaliseer je betalingsverkeer"],
  ];
  for (const [title, heading] of examples) {
    const identity = detectPrimaryBusinessIdentity({ title: "Home", headings: [title + ". " + heading], homepage: true });
    assert.equal(identity.sector, "financial_services", title);
    assert.equal(identity.financialKind, "payments", title);
  }
});

test("independent payment title and description still produce strongly proven financial sector", () => {
  const identity = detectPrimaryBusinessIdentity({
    title: "Payments infrastructure for internet businesses",
    description: "Accept payments online and in person on our payment platform",
    homepage: true,
  });
  assert.equal(identity.sector, "financial_services");
  assert.equal(identity.financialKind, "payments");
  assert.equal(identity.confidence, "high");
  assert.ok(identity.confidenceScore >= 90);
});

test("software with merely an integration/payment feature is not a payment service provider", () => {
  const identity = detectPrimaryBusinessIdentity({
    title: "Cloud developer toolkit",
    description: "Integrate with payment APIs, SDKs and invoicing features.",
    headings: ["Build APIs and manage workflows"],
    homepage: true,
  });
  assert.notEqual(identity.sector, "financial_services");
});

test("generic SaaS billing product remains unconfirmed without financial infrastructure and payment movement", () => {
  const identity = detectPrimaryBusinessIdentity({
    title: "Subscription billing management software",
    headings: ["Manage subscriptions, invoices and usage-based billing"],
    homepage: true,
  });
  assert.notEqual(identity.financialKind, "payments");
});

test("retailer with checkout and finance wording stays outside financial sector", () => {
  const identity = detectPrimaryBusinessIdentity({
    title: "Elektronica webshop",
    description: "Online bestellen, snelle levering en veilig betalen",
    headings: ["Financiële infrastructuur voor online verkoop: ontvang betalingen in je webshop"],
    homepage: true,
  });
  assert.notEqual(identity.sector, "financial_services");
});

test("non-homepage article or third-party payment tutorial is not an identity assertion", () => {
  const identity = detectPrimaryBusinessIdentity({
    title: "Home",
    headings: ["Financiële infrastructuur voor ondernemers. Ontvang betalingen met moderne APIs"],
    homepage: false,
  });
  assert.notEqual(identity.sector, "financial_services");
});

test("customer types do not imply merchant's own payment business", () => {
  const identity = detectPrimaryBusinessIdentity({
    title: "Software agency for fintech and payments",
    description: "We build applications for payment providers and banks.",
    headings: ["Engineering services for merchants and payment businesses"],
    homepage: true,
  });
  assert.notEqual(identity.sector, "financial_services");
});
