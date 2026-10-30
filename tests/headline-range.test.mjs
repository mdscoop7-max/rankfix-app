import test from "node:test";
import assert from "node:assert/strict";
import { headlineScore } from "../lib/audit-score.ts";
import { headlineDisplay } from "../lib/score-qualifier.ts";

test("provisional evidence with a real range shows the range as the headline, at any coverage", () => {
  const h = headlineScore(95, { low: 82, high: 99 }, 88, "provisional");
  assert.equal(h.kind, "range");
  assert.equal(h.display, "82–99");
  assert.equal(h.numeric, 95, "the point score stays available next to the range");
});

test("insufficient evidence shows the range, as before", () => {
  assert.equal(headlineScore(99, { low: 41, high: 99 }, 31, "insufficient").display, "41–99");
});

test("complete evidence shows the plain score, also when a stored range exists", () => {
  const h = headlineScore(91, { low: 80, high: 99 }, 100, "complete");
  assert.equal(h.kind, "score");
  assert.equal(h.display, "91");
});

test("a range of one value is never shown (nothing is unconfirmed)", () => {
  assert.equal(headlineScore(97, { low: 97, high: 97 }, 100, "provisional").kind, "score");
  assert.equal(headlineScore(97, null, 100, "provisional").kind, "score");
  assert.equal(headlineScore(97, undefined, 40, "insufficient").kind, "score");
});

test("an unknown or ambiguous sector alone (all checks confirmed) does not turn the score into a range", () => {
  // Sector certainty and SEO/GEO evidence are judged separately.
  assert.equal(headlineScore(93, { low: 93, high: 93 }, 100, "provisional").display, "93");
});

test("the displayed score always lies inside the displayed range", () => {
  for (let score = 0; score <= 100; score += 7) {
    for (const level of ["provisional", "insufficient"]) {
      const low = Math.max(0, score - 15); const high = Math.min(100, score + 9);
      const h = headlineScore(score, { low, high }, 75, level);
      if (h.kind === "range") { const [a, b] = h.display.split("–").map(Number); assert.ok(a <= score && score <= b, `${score} outside ${h.display}`); }
    }
  }
});

test("headlineDisplay prefers the stored range and falls back to the score", () => {
  assert.equal(headlineDisplay({ overallScore: 95, scoreModel: { headline: { kind: "range", display: "82–99" } } }), "82–99");
  assert.equal(headlineDisplay({ overallScore: 95, scoreModel: { headline: { kind: "score", display: "95" } } }), "95");
  assert.equal(headlineDisplay({ overallScore: 95 }), "95");
  assert.equal(headlineDisplay({}), "—");
});
