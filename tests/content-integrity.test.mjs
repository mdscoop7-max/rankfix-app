import test from "node:test";
import assert from "node:assert/strict";
import { findInertOrderButtons, findTestProducts, parseVisibleRating, parseVisibleReviewCount, reviewContradictions } from "../lib/content-integrity.ts";

test("test and dummy products are found, real products with similar words are not", () => {
  assert.deepEqual(findTestProducts({ productNames: ["Testproduct", "Dummy 2", "Lorem ipsum product"] }).length, 3);
  assert.deepEqual(findTestProducts({ productNames: ["Contest kaarsen", "Sample pack kaarsen set", "Demo-Kit Arduino Starter", "Leren tas"] }), []);
  assert.equal(findTestProducts({ productNames: [], visibleText: "Lorem ipsum dolor sit amet" }).length, 1);
});

test("order buttons that cannot work are reported, script-driven and sold-out buttons are not", () => {
  assert.equal(findInertOrderButtons('<a href="#">In winkelwagen</a>').length, 1);
  assert.equal(findInertOrderButtons('<a href="javascript:void(0)">Bestel nu</a>').length, 1);
  assert.equal(findInertOrderButtons('<p>Prijs €5</p><button type="submit">In winkelwagen</button>').length, 1);
  assert.equal(findInertOrderButtons('<button disabled>In winkelwagen</button><p>Welkom</p>').length, 1);
  assert.deepEqual(findInertOrderButtons('<form action="/cart/add"><button type="submit">In winkelwagen</button></form>'), []);
  assert.deepEqual(findInertOrderButtons('<a href="#" data-action="add-to-cart">Add to cart</a>'), []);
  assert.deepEqual(findInertOrderButtons('<p>Uitverkocht</p><button disabled>In winkelwagen</button>'), []);
  assert.deepEqual(findInertOrderButtons('<select name="maat"><option>M</option></select><button disabled>In winkelwagen</button>'), []);
  assert.deepEqual(findInertOrderButtons('<button class="js-add">In winkelwagen</button>'), []);
});

test("contradicting review claims are reported, consistent ones and other scales are not", () => {
  assert.equal(reviewContradictions({ schemaRating: 4.8, visibleRating: 4.1, visibleScale: 5 }).length, 1);
  assert.equal(reviewContradictions({ schemaRating: 4.6, visibleRating: 4.6, visibleScale: 5 }).length, 0);
  assert.equal(reviewContradictions({ schemaRating: 4.6, visibleRating: 9.2, visibleScale: 10 }).length, 0);
  assert.equal(reviewContradictions({ schemaCount: 1200, visibleCount: 300 }).length, 1);
  assert.equal(reviewContradictions({ schemaCount: 1200, visibleCount: 1190 }).length, 0);
  assert.deepEqual(parseVisibleRating("Klanten beoordelen ons met 4,7 van 5"), { rating: 4.7, scale: 5 });
  assert.equal(parseVisibleRating("Open van 9 tot 5"), null);
  assert.equal(parseVisibleReviewCount("gebaseerd op 1.234 reviews"), 1234);
});
