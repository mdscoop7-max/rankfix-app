import test from "node:test";
import assert from "node:assert/strict";
import { essentialFacts, openEssentialFacts } from "../lib/essential-facts.ts";

const base = { scannedUrl: "https://shop.nl/", scannedRegistration: null, scannedContact: false, scannedIndirectContactOnly: false, scannedThin: false, placeholders: 0, testData: false, pages: [], commerceConfirmed: false };
const fact = (facts, key) => facts.find((f) => f.key === key);

test("facts: registration and contact confirmed on the scanned page", () => {
  const facts = essentialFacts({ ...base, scannedRegistration: "KvK 12345678", scannedContact: true });
  assert.equal(fact(facts, "company_registration").state, "confirmed");
  assert.match(fact(facts, "company_registration").detail, /KvK 12345678 op \//);
  assert.equal(fact(facts, "contact").state, "confirmed");
  assert.deepEqual(openEssentialFacts(facts), []);
});

test("facts: found on a sampled page counts as confirmed, with that page as evidence", () => {
  const facts = essentialFacts({ ...base, pages: [{ url: "https://shop.nl/contact", status: "audited", businessDetails: ["KvK 87654321", "telefoonnummer", "adres (Damrak 1, 1012 LG Amsterdam)"] }] });
  assert.deepEqual([fact(facts, "company_registration").state, fact(facts, "company_registration").url], ["confirmed", "https://shop.nl/contact"]);
  assert.equal(fact(facts, "contact").state, "confirmed");
  assert.equal(fact(facts, "contact").detail, "telefoonnummer, adres op /contact.");
});

test("facts: missing only when the right page was read; otherwise not confirmed", () => {
  // Nothing read but the homepage: not confirmed.
  let facts = essentialFacts(base);
  assert.equal(fact(facts, "company_registration").state, "not_confirmed");
  assert.equal(fact(facts, "contact").state, "not_confirmed");
  // A privacy page proves nothing about contact or registration.
  facts = essentialFacts({ ...base, pages: [{ url: "https://shop.nl/privacy", status: "audited", businessDetails: [] }] });
  assert.equal(fact(facts, "contact").state, "not_confirmed");
  assert.equal(fact(facts, "company_registration").state, "not_confirmed");
  // A contact page that was read and holds nothing: proven missing.
  facts = essentialFacts({ ...base, pages: [{ url: "https://shop.nl/contact", status: "audited", businessDetails: [] }] });
  assert.equal(fact(facts, "contact").state, "missing");
  assert.match(fact(facts, "contact").detail, /\/, \/contact/);
  assert.equal(fact(facts, "company_registration").state, "missing");
  // A contact page that failed to load proves nothing.
  facts = essentialFacts({ ...base, pages: [{ url: "https://shop.nl/contact", status: "unable_to_confirm" }] });
  assert.equal(fact(facts, "contact").state, "not_confirmed");
  // A JavaScript shell page proves nothing either.
  facts = essentialFacts({ ...base, pages: [{ url: "https://shop.nl/contact", status: "audited", thin: true, businessDetails: [] }] });
  assert.equal(fact(facts, "contact").state, "not_confirmed");
});

test("facts: a form on the contact page is a contact channel", () => {
  const facts = essentialFacts({ ...base, pages: [{ url: "https://shop.nl/contact", status: "audited", businessDetails: [], formCount: 1 }] });
  assert.equal(fact(facts, "contact").state, "confirmed");
  assert.match(fact(facts, "contact").detail, /Contactformulier/);
});

test("facts: placeholder data is proven missing; indirect links stay not confirmed", () => {
  let facts = essentialFacts({ ...base, placeholders: 2 });
  assert.equal(fact(facts, "company_registration").state, "missing");
  facts = essentialFacts({ ...base, scannedIndirectContactOnly: true });
  assert.equal(fact(facts, "contact").state, "not_confirmed");
  assert.match(fact(facts, "contact").detail, /FAQ-, help- of klantenservicelink/);
});

test("facts: stock and checkout only for a confirmed webshop, from the final checks", () => {
  let facts = essentialFacts(base);
  assert.equal(fact(facts, "stock").state, "not_applicable");
  facts = essentialFacts({ ...base, commerceConfirmed: true, stockCheck: { status: "warning", message: "Voorraad zichtbaar 'uitverkocht', productgegevens 'InStock'.", url: "https://shop.nl/p/1" }, checkoutCheck: { status: "unable_to_confirm" } });
  assert.deepEqual([fact(facts, "stock").state, fact(facts, "checkout").state], ["missing", "not_confirmed"]);
  assert.deepEqual(openEssentialFacts(facts), [
    "Bedrijfsregistratie (KvK/btw) niet bevestigd",
    "Contactgegevens niet bevestigd",
    "Voorraadinformatie ontbreekt",
    "Winkelwagen en checkout niet bevestigd",
  ]);
  facts = essentialFacts({ ...base, commerceConfirmed: true, stockCheck: { status: "pass" }, checkoutCheck: { status: "pass" } });
  assert.deepEqual([fact(facts, "stock").state, fact(facts, "checkout").state], ["confirmed", "confirmed"]);
});

test("facts: an open essential fact keeps an otherwise complete score provisional", async () => {
  const { evidenceLevel, headlineScore } = await import("../lib/audit-score.ts");
  const complete = evidenceLevel({ coveragePercent: 100, javascriptRequiredButNotRendered: false, unconfirmed: 0, importantUnconfirmed: [] });
  assert.equal(complete.level, "complete");
  const facts = essentialFacts({ ...base, scannedContact: true });
  const open = evidenceLevel({ coveragePercent: 100, javascriptRequiredButNotRendered: false, unconfirmed: 0, importantUnconfirmed: openEssentialFacts(facts) });
  assert.equal(open.level, "provisional");
  assert.ok(open.reasons.some((r) => r.includes("Bedrijfsregistratie (KvK/btw) niet bevestigd")));
  // The number itself is unchanged; only its status says it is not final.
  assert.deepEqual(headlineScore(99, { low: 99, high: 99 }, 100, open.level), { numeric: 99, kind: "score", display: "99", indication: false });
});
