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
