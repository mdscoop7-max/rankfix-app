// scan-matrix redos "formOpen" (7 Nov 2026): three patterns re-read the rest of
// the page from every unclosed "<form" / "<x" (quadratic). They now scan once.
// Behaviour must be identical to the former patterns; time must grow linearly.
import test from "node:test";
import assert from "node:assert/strict";
import { checkoutActionInHtml } from "../lib/commerce-markup.ts";
import { microdataTypes, rdfaTypes } from "../lib/structured-data-evidence.ts";

const time = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };

test("10,000 unclosed <form tags and unclosed tag runs stay fast (linear, not quadratic)", () => {
  // Same shape as the scan-matrix case: the run sits inside a normal page.
  const wrap = (n) => `<html><body><p>${"<form ".repeat(n)}</p><a href="/contact">Contact</a></body></html>`;
  const small = wrap(2500), big = wrap(10000);
  checkoutActionInHtml(small); microdataTypes(small); rdfaTypes(small); // warm-up
  const tSmall = time(() => { checkoutActionInHtml(small); microdataTypes(small); rdfaTypes(small); });
  const tBig = time(() => { checkoutActionInHtml(big); microdataTypes(big); rdfaTypes(big); });
  assert.ok(tBig < 300, `4x input took ${Math.round(tBig)} ms`);
  // Quadratic would be ~16x; allow generous noise for linear (~4x).
  assert.ok(tBig < Math.max(50, tSmall * 10), `small ${tSmall.toFixed(1)} ms, big ${tBig.toFixed(1)} ms`);
});

test("forms: a quote form is still removed, a checkout link next to it still counts, malformed tags as before", () => {
  const quote = `<form action="/checkout"><button>Offerte aanvragen</button></form>`;
  assert.equal(checkoutActionInHtml(quote), false, "lead form with a checkout action is lead generation");
  assert.equal(checkoutActionInHtml(`${quote}<a href="/checkout">Afrekenen</a>`), true, "a real checkout next to a quote form stays observable");
  // A closing tag hidden inside a later, malformed opening tag still closes the
  // first form (as the former lazy pattern did).
  assert.equal(checkoutActionInHtml(`<form action="/checkout"><button>Offerte</button><form x</FORM ><a href="/checkout">Afrekenen</a>`), true);
});

test("microdata and RDFa types are still read from opening tags", () => {
  assert.deepEqual(microdataTypes(`<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">X</span></div>`), ["Product"]);
  assert.deepEqual(microdataTypes(`<div itemtype="https://schema.org/Product">`), [], "itemtype without itemscope is not microdata");
  assert.deepEqual(microdataTypes(`<li itemscope itemtype='https://schema.org/Offer https://schema.org/Thing'>`), ["Offer", "Thing"]);
  assert.deepEqual(rdfaTypes(`<div vocab="https://schema.org/" typeof="LocalBusiness">`), ["LocalBusiness"]);
  assert.deepEqual(rdfaTypes(`<div typeof="schema:Organization">`), ["Organization"]);
});
