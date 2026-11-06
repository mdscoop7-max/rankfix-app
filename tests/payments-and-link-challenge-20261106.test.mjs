import test from "node:test";
import assert from "node:assert/strict";
import { detectPrimaryBusinessIdentity } from "../lib/primary-business-identity.ts";
import { linkOutcome } from "../lib/link-status.ts";

// 6 Nov: Mollie was recognised as a payment provider through its developer and
// payment-product navigation; a consumer wallet/P2P provider (PayPal pattern)
// with segment navigation ("Particulier, Zakelijk") was not. Invented names.
const id = (title, description, headings) => detectPrimaryBusinessIdentity({ title, description, headings, schemaTypes: [] });

test("wallet / money-transfer providers are payment providers from their own identity", () => {
  for (const [t, d, h] of [
    ["Online betalen, geld sturen en ontvangen | Walletpay NL", "Walletpay is de snellere, veiligere manier om geld te sturen en te ontvangen of online te betalen.", ["Betaal, stuur en ontvang"]],
    ["Walletpay | Gemakkelijk en veilig betalen", "Betaal veilig en gemakkelijk online bij miljoenen webwinkels met Walletpay.", ["De gemakkelijkste manier om te betalen"]],
    ["Online betalingen voor bedrijven | Paybox", "Paybox maakt online betalen eenvoudig.", ["Betalingen voor groeiende bedrijven"]],
  ]) {
    const r = id(t, d, h);
    assert.equal(r.sector, "financial_services", t);
    assert.equal(r.financialKind, "payments", t);
  }
});

test("shops and services that only mention how you can pay stay non-financial", () => {
  for (const [t, d, h] of [
    ["Sneakers online kopen | Shoeshop", "Gratis verzending, veilig betalen met iDEAL of Walletpay en gratis retourneren.", ["Nieuwe sneakers"]],
    ["Cadeaukaart | Geldig bij duizenden winkels", "Betaal met de cadeaukaart bij duizenden winkels. Bestel online.", ["Cadeaukaarten"]],
    ["Tandarts Zuid | Afspraak maken", "Wij behandelen patiënten. Online betalen van je factuur kan via iDEAL.", ["Welkom"]],
  ]) assert.notEqual(id(t, d, h).financialKind, "payments", t);
});

test("a 404 or 503 carrying a bot-check page is unconfirmed, a plain 404 stays missing", () => {
  assert.equal(linkOutcome({ url: "https://example.com/a", status: 404, error: false, challenged: true }), "unconfirmed");
  assert.equal(linkOutcome({ url: "https://example.com/a", status: 503, error: false, challenged: true }), "unconfirmed");
  assert.equal(linkOutcome({ url: "https://example.com/a", status: 404, error: false }), "missing");
  assert.equal(linkOutcome({ url: "https://example.com/a", status: 403, error: false }), "unconfirmed");
});
