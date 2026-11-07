import test from "node:test";
import assert from "node:assert/strict";
import { pageIdentityType } from "../lib/page-identity.ts";

// Stripe live scan (6 Nov): /nl/careers listed under "Juridisch (privacy, voorwaarden, cookies)".
test("a consent dialog heading is not the page's own H1", () => {
  assert.equal(pageIdentityType({ title: "Acme Careers | Bouw mee aan de toekomst", h1s: ["Cookie-instellingen", "Werken bij Acme"], path: "/nl/about" }), null);
  assert.equal(pageIdentityType({ title: "Over ons", h1s: ["We gebruiken cookies", "Over Acme"] }), null);
});
test("careers pages and employment terms are never legal pages", () => {
  assert.equal(pageIdentityType({ title: "Privacy | Acme", h1s: ["Privacy"], path: "/nl/careers" }), null);
  assert.equal(pageIdentityType({ title: "Arbeidsvoorwaarden | Werken bij Acme", h1s: ["Arbeidsvoorwaarden"], path: "/werken-bij/voorwaarden-info" }), null);
  assert.equal(pageIdentityType({ title: "Onze arbeidsvoorwaarden", h1s: ["Arbeidsvoorwaarden"] }), null);
});
test("real legal pages stay legal", () => {
  assert.equal(pageIdentityType({ title: "Privacybeleid", h1s: ["Privacybeleid"], path: "/nl/privacy" })?.type, "legal");
  assert.equal(pageIdentityType({ title: "Algemene voorwaarden | Acme", h1s: ["Cookie-instellingen", "Algemene voorwaarden"], path: "/voorwaarden" })?.type, "legal");
  assert.equal(pageIdentityType({ title: "Cookiebeleid", h1s: [] })?.type, "legal");
});
