import test from "node:test";
import assert from "node:assert/strict";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";

test("central bank self-description plus independently proven monetary mandate", () => {
  const result = detectEuPrimaryIdentity({
    title: "De Nederlandsche Bank – de centrale bank van Nederland",
    description: "Wij maken ons sterk voor financiële stabiliteit en duurzame welvaart.",
    ogSiteName: "De Nederlandsche Bank",
    navLabels: ["Monetair beleid ECB", "Toezicht op financiële instellingen", "Publicaties"],
    homepage: true,
  });
  assert.equal(result?.sector, "financial_services");
  assert.equal(result?.key, "financial_central_bank");
  assert.match(result?.label || "", /centrale bank/i);
  assert.ok((result?.confidenceScore || 0) >= 85);
  assert.ok((result?.evidence || []).length >= 2);
});

test("a second EU central bank can be recognized without a brand/domain exception", () => {
  const result = detectEuPrimaryIdentity({
    title: "European Central Bank – the central bank of the euro area",
    description: "Monetary policy and price stability for the euro area.",
    homepage: true,
  });
  assert.equal(result?.key, "financial_central_bank");
});

test("an article about a central bank is not the bank itself", () => {
  const result = detectEuPrimaryIdentity({
    title: "Waarom de centrale bank van Nederland rente wil aanpassen",
    description: "Nieuwsartikel over monetair beleid en inflatie.",
    ogSiteName: "Dagelijks Nieuws",
    navLabels: ["Nieuws", "Economie", "Opinie"],
    homepage: false,
  });
  assert.notEqual(result?.key, "financial_central_bank");
});

test("retail bank is not mistaken for a central monetary authority", () => {
  const result = detectEuPrimaryIdentity({
    title: "Welkom bij onze bank: rekeningen, sparen en hypotheken",
    description: "Open een bankrekening, kies een spaarrekening en vraag een hypotheek aan.",
    homepage: true,
  });
  assert.notEqual(result?.key, "financial_central_bank");
});

test("a furniture shop called central bank is not a monetary authority", () => {
  const result = detectEuPrimaryIdentity({
    title: "Centrale Bank – de centrale bank van je woonkamer",
    description: "Nieuwe banken en zitmeubels bestellen in onze webshop.",
    homepage: true,
  });
  assert.notEqual(result?.key, "financial_central_bank");
});

test("a central bank name alone without a proven mandate is not sufficient", () => {
  const result = detectEuPrimaryIdentity({
    title: "Central Bank – the central bank of Elmshire",
    description: "Welkom op onze website",
    homepage: true,
  });
  assert.notEqual(result?.key, "financial_central_bank");
});
