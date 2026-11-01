import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutActionInHtml, purchaseActionInHtml } from '../lib/commerce-markup.ts';
import { decideCommerceModules } from '../lib/sector-motor-decisions.ts';
const product = { primarySector:'home_services', primaryBusinessModel:'service', retailProduct:true, productPrice:true, cart:true, checkout:true, merchantFeed:false, euMarket:true };
test('verified secondary storefront activates relevant modules without changing primary identity', () => {
  for (const primarySector of ['home_services','construction','manufacturer','wholesale','healthcare','telecom_technology']) {
    const evidence = {...product, primarySector, verifiedSecondaryStorefront:true};
    assert.deepEqual(decideCommerceModules(evidence), ['ecommerce','product','pricing_currency','checkout','eu_consumer']);
    assert.equal(evidence.primarySector, primarySector);
    assert.ok(!decideCommerceModules({...evidence, cart:false}).includes('checkout'));
    assert.deepEqual(decideCommerceModules({...evidence, retailProduct:false}), []);
  }
  assert.deepEqual(decideCommerceModules(product), []);
  assert.deepEqual(decideCommerceModules({...product, secondaryRetailDetail:true}), ['product','pricing_currency']);
});
test('quote/appointment forms and CSS labels never prove checkout', () => {
  for (const label of ['Offerte aanvragen','Afspraak maken','Request a quote','Book appointment','Demander un devis','Prendre rendez-vous','Angebot anfordern','Termin buchen','Pedir presupuesto','Solicitar cita','Richiedi preventivo','Prenota appuntamento']) {
    for (const control of [`<button>${label}</button>`,`<input type="submit" value="${label}">`]) {
      const html = `<form class="checkout" action="/checkout">${control}</form>`;
      assert.equal(checkoutActionInHtml(html), false, label);
      assert.equal(checkoutActionInHtml(`<a href="/checkout">${label}</a>`), false, label);
      assert.equal(checkoutActionInHtml(html + '<a href="/checkout">Afrekenen</a>'), true, label);
    }
  }
  for (const html of ['<div class="checkout">Contact</div>','<a href="/checkout/offerte">Verder</a>','<script>const x = \'<a href="/checkout">Pay</a>\';</script>', '<form action="/checkout/cart/add"><button>Add to cart</button></form>']) assert.equal(checkoutActionInHtml(html), false);
});
test('real checkout destinations and cart controls remain recognised across platforms', () => {
  for (const path of ['/checkout','/nl/afrekenen/','/kassa','/de/kasse','/paiement','/pagamento','/pago']) assert.equal(checkoutActionInHtml(`<a href="${path}">Continue</a>`), true);
  assert.equal(purchaseActionInHtml('<form action="/checkout/cart/add"><button>Add to cart</button></form>'), true);
  assert.equal(purchaseActionInHtml('<form action="/checkout/cart/add"><button>Offerte aanvragen</button></form>'), false);
});

test("P5 NS (real audit 7ee6ad5): carrier service pages are not a separate webshop; a purchase chain is", async () => {
  const { hasTransportRetailChain, commerceApplicability } = await import("../lib/commerce-applicability.ts");
  // The two 'confirmed retail samples' from the real ns.nl audit of 7ee6ad5.
  const nsEvents = { type: "event", productSchema: false, itemListSchema: true, storeSchema: false, strongCommerceAction: false, repeatedProductLinks: true, priceSignals: 3 };
  const nsOvFiets = { type: "product", productSchema: true, itemListSchema: false, storeSchema: false, strongCommerceAction: false, repeatedProductLinks: true, priceSignals: 5 };
  assert.equal(hasTransportRetailChain(nsEvents), false);
  assert.equal(hasTransportRetailChain(nsOvFiets), false);
  assert.equal(hasTransportRetailChain({ productSchema: true, strongCommerceAction: true }), true);
  const verifiedSecondaryCommerce = [nsEvents, nsOvFiets].filter(hasTransportRetailChain).length >= 1;
  const state = commerceApplicability({ confirmed: false, primaryNonCommerceIdentity: true, commerceHints: true, thinShell: false, marketSelector: false, auditedRepresentativePages: 14, verifiedSecondaryCommerce });
  assert.deepEqual(state, { state: "absent", reason: "service_identity" });
});
