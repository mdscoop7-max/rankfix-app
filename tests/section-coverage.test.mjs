import test from "node:test";
import assert from "node:assert/strict";
import { sectionCoverage } from "../lib/section-coverage.ts";

const page = (url, type, status = "audited", httpStatus = 200, extra = {}) => ({ url, type, status, httpStatus, ...extra });

test("shop: products checked, legal blocked, contact not found, checkout never claimed as checked", () => {
  const r = sectionCoverage({ isShop: true, homepageUrl: "https://s.test/", pages: [page("https://s.test/p/1", "product"), page("https://s.test/c/a", "category"), page("https://s.test/voorwaarden", "legal", "unable_to_confirm", 403)] });
  const by = Object.fromEntries(r.items.map((i) => [i.section, i.status]));
  assert.equal(by.product, "checked"); assert.equal(by.category, "checked"); assert.equal(by.legal, "not_accessible"); assert.equal(by.contact, "not_found"); assert.equal(by.checkout, "not_examined");
  assert.equal(by.offer, undefined);
  assert.match(r.summary, /Niet toegankelijk of niet opgehaald \(niet gecontroleerd\): Juridisch/);
  assert.match(r.summary, /Afrekenstappen zijn niet doorlopen/);
});

test("organisation: 404 is 'bestaat niet', a 429 is not accessible, blocked homepage is said so", () => {
  const r = sectionCoverage({ isShop: false, homepageUrl: "https://o.test/", homepageAccess: "blocked", homepageHttpStatus: 403, pages: [page("https://o.test/diensten", "service"), page("https://o.test/privacy", "legal", "unable_to_confirm", 404), page("https://o.test/contact", "contact", "unable_to_confirm", 429)] });
  const by = Object.fromEntries(r.items.map((i) => [i.section, i]));
  assert.equal(by.homepage.status, "not_accessible");
  assert.equal(by.legal.status, "missing"); assert.match(by.legal.note, /404/);
  assert.equal(by.contact.status, "not_accessible"); assert.match(by.contact.note, /429/);
  assert.equal(by.offer.status, "checked"); assert.equal(by.product, undefined); assert.equal(by.checkout, undefined);
});

test("PDF P8: contact details in header/footer count as contact; offer named in the navigation is reported", () => {
  const out = sectionCoverage({ pages: [], isShop: false, homepageUrl: "https://x.nl/", contactOnHomepage: ["telefoon", "e-mail"], offerNavigation: ["Applications", "Brands"] });
  const contact = out.items.find((i) => i.section === "contact");
  assert.equal(contact.status, "checked"); assert.match(contact.note, /telefoon, e-mail/);
  const offer = out.items.find((i) => i.section === "offer");
  assert.equal(offer.status, "not_examined"); assert.match(offer.note, /Applications, Brands/);
  const none = sectionCoverage({ pages: [], isShop: false, homepageUrl: "https://x.nl/" });
  assert.equal(none.items.find((i) => i.section === "contact").status, "not_found");
});
