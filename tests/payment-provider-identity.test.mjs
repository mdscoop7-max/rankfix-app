import test from "node:test";
import assert from "node:assert/strict";
import { detectPrimaryBusinessIdentity } from "../lib/primary-business-identity.ts";

const identity = (title, description, headings = [], schemaTypes = []) =>
  detectPrimaryBusinessIdentity({ title, description, headings, schemaTypes });

test("financial infrastructure and receive-payments identity in Dutch is payment service", () => {
  const result = identity(
    "Financiële infrastructuur voor meer omzet",
    "Ontvang betalingen, bied financiële diensten aan en groei internationaal.",
    ["Financiële infrastructuur om te groeien. Ontvang betalingen en maak eigen verdienmodellen mogelijk."],
  );
  assert.equal(result.sector, "financial_services");
  assert.equal(result.financialKind, "payments");
  assert.ok(result.confidenceScore >= 85);
  assert.ok(result.evidence.length >= 2);
});

test("generic Dutch payment providers with changed organization names get same classification", () => {
  for (const name of ["Betaalroute", "Geldstroom", "Ons Platform", "FinConnect"]) {
    const result = identity(
      name + " | Financiële infrastructuur",
      "Accepteer betalingen via onze online betaalinfrastructuur.",
      ["Verwerk betalingen online en persoonlijk"],
    );
    assert.equal(result.financialKind, "payments", name);
  }
});

test("financial infrastructure also works without a recognizable organization in the title", () => {
  assert.equal(identity(
    "Meer omzet met financiële infrastructuur",
    "Ontvang betalingen en bied financiële diensten aan.",
    ["Maak betalingen eenvoudig"],
  ).financialKind, "payments");
});

test("software vendor serving payment providers is not itself a financial institution", () => {
  const p = identity(
    "API-monitoringsoftware voor bedrijven",
    "Wij bouwen software voor fintechbedrijven en betaalproviders.",
    ["Monitoring voor financiële infrastructuur"],
  );
  assert.equal(p.sector, "unknown");
});

test("online retailer accepting payments is still not a payment provider", () => {
  const p = identity(
    "Online schoenen kopen | Onze webshop",
    "Koop sneakers online, ontvang betalingen met verschillende betaalmethoden.",
    ["Shop nu, betalen met kaart"],
  );
  assert.equal(p.sector, "unknown");
});

test("a company blog discussing payment infrastructure is not a payment service", () => {
  const p = identity(
    "Blog: financiële infrastructuur en de toekomst",
    "Lees hoe je online betalingen kunt ontvangen.",
    ["Een artikel over betaalproviders en fintech"],
  );
  assert.equal(p.sector, "unknown");
});

test("one lonely mention of receiving payments does not prove primary industry", () => {
  const p = identity(
    "Welkom",
    "Ontvang betalingen op je website.",
    ["Over ons"],
  );
  assert.equal(p.sector, "unknown");
});
