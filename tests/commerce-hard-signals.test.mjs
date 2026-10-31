import test from "node:test";
import assert from "node:assert/strict";
import { detectHardCommerceSignals } from "../lib/commerce-hard-signals.ts";
import { commerceApplicability, confirmedRetailEvidenceForService } from "../lib/commerce-applicability.ts";

const shop = (cartHref, button) => `<header><a href="${cartHref}">Winkelwagen (0)</a></header><main><h1>Winterbanden kopen</h1><p>Vanaf € 89,95</p><button>${button}</button></main>
<footer><img alt="iDEAL" src="/p/ideal.svg"><img alt="Visa" src="/p/visa.svg"><img alt="Mastercard" src="/p/mc.svg"></footer>`;

test("a cart link plus add-to-cart or payment logos proves a store, in any language", () => {
  assert.equal(detectHardCommerceSignals(shop("/winkelwagen", "In winkelwagen")).storefrontProven, true);
  assert.equal(detectHardCommerceSignals(shop("/cart", "Add to cart")).storefrontProven, true);
  assert.equal(detectHardCommerceSignals(shop("/warenkorb", "In den Warenkorb")).storefrontProven, true);
  assert.equal(detectHardCommerceSignals(`<a href="/shoppingcart">Cart</a><script>fetch('/webshopapi/cart/add')</script><img alt="PayPal" src="x"><img alt="Klarna" src="y">`).storefrontProven, true);
});

test("services, payment providers and listings without a cart are not stores (negative controls)", () => {
  const provider = `<h1>Online betalingen voor webshops</h1><p>Accepteer iDEAL, Visa en Mastercard. Checkout in je webshop. Vanaf € 0,29 per transactie.</p><a href="/contact">Neem contact op</a><button>Start nu</button>`;
  assert.equal(detectHardCommerceSignals(provider).storefrontProven, false);
  const rental = `<h1>Huurwoningen</h1><p>€ 1.450 /mnd k.k.</p><a href="/woningen/1">Bekijk</a>`;
  assert.equal(detectHardCommerceSignals(rental).storefrontProven, false);
  const energy = `<h1>Energie</h1><a href="/contact">Contact</a><p>Tarief € 0,28 per kWh</p>`;
  assert.equal(detectHardCommerceSignals(energy).count, 0);
});

test("a cart link alone is not enough", () => {
  assert.equal(detectHardCommerceSignals(`<a href="/cart">Cart</a><p>Welkom</p>`).storefrontProven, false);
});

test("hard store evidence activates store checks even for a service identity (hybrid)", () => {
  assert.equal(confirmedRetailEvidenceForService({ representativePurchase: false, productDetailSchema: false, addToCart: false, productAndPrice: false, storefrontProven: true }), true);
  assert.equal(confirmedRetailEvidenceForService({ representativePurchase: false, productDetailSchema: false, addToCart: false, productAndPrice: false }), false);
});

test("unknown sector without hard store signals makes store checks N.v.t., a JS shell stays unconfirmed", () => {
  const base = { confirmed: false, primaryNonCommerceIdentity: false, commerceHints: true, thinShell: false, marketSelector: false, auditedRepresentativePages: 3 };
  assert.equal(commerceApplicability({ ...base, sectorUnknown: true, hardCommerceSignals: false }).state, "absent");
  assert.equal(commerceApplicability({ ...base, sectorUnknown: true, hardCommerceSignals: true }).state, "unconfirmed");
  assert.equal(commerceApplicability({ ...base, sectorUnknown: true, thinShell: true }).state, "unconfirmed");
  assert.equal(commerceApplicability({ ...base, sectorUnknown: true, marketSelector: true }).state, "unconfirmed");
});
