import test from "node:test";
import assert from "node:assert/strict";
import { browserContentEvidence, browserContentSentences, languageOptions, reviewEvidence } from "../lib/browser-content-evidence.ts";

const URL = "https://shop.example.nl/nl/";
const hreflang = `<link rel="alternate" hreflang="nl-nl" href="https://shop.example.nl/nl/"><link rel="alternate" hreflang="de-de" href="https://shop.example.nl/de/"><link rel="alternate" hreflang="x-default" href="https://shop.example.nl/">`;
const switcher = `<nav><a href="/nl/" lang="nl">NL</a> <a href="/en/" lang="en">EN</a> <a href="/de/">Deutsch</a></nav>`;
const widget = `<script src="https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"></script>`;
const renderedReviews = `${widget}<div class="tp">4,7 uit 5 · 1.234 beoordelingen</div><script type="application/ld+json">{"@type":"Product","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.7","reviewCount":"1234"}}</script>`;

test("language: hreflang alternates or a visible switcher; menus and other links are not languages", () => {
  assert.deepEqual(languageOptions(hreflang, URL).options.map((o) => o.lang), ["nl-nl", "de-de"]);
  const s = languageOptions(switcher, URL);
  assert.equal(s.source, "switcher");
  assert.deepEqual(s.options.map((o) => o.lang), ["nl", "en", "de"]);
  assert.equal(languageOptions(`<a href="/en/">EN</a>`, URL).source, "none"); // one link is no switcher
  assert.equal(languageOptions(`<a href="/menu">Menu</a><a href="https://other.example.org/en/">EN</a><a href="/de/">Contact</a>`, URL).source, "none");
});

test("reviews: structured rating, widgets and visible review text", () => {
  const r = reviewEvidence(renderedReviews);
  assert.deepEqual([r.ratingValue, r.reviewCount, r.widgets, r.visibleReviews], [4.7, 1234, ["Trustpilot"], true]);
  assert.deepEqual(reviewEvidence("<p>Geen reviews hier, wel 5 stappen.</p>"), { ratingValue: null, reviewCount: null, widgets: [], visibleReviews: false });
});

test("browser vs raw: content that only appears after JavaScript is flagged", () => {
  const e = browserContentEvidence({ rawHtml: `<html><body>${widget}<div id="tp"></div><p>${"tekst ".repeat(20)}</p></body></html>`, renderedHtml: `<html><body>${switcher}${renderedReviews}</body></html>`, pageUrl: URL });
  assert.equal(e.javascriptExecuted, true);
  assert.equal(e.language.onlyAfterJavascript, true);
  assert.equal(e.reviews.onlyAfterJavascript, true);
  const sentences = browserContentSentences(e);
  assert.match(sentences[0], /^Taalkeuze: 3 taalversie\(s\) \(nl, en, de\) via een taalkiezer\. Alleen zichtbaar na JavaScript/);
  assert.match(sentences[1], /^Reviews: beoordeling 4\.7 \(1234 reviews\) in de productgegevens; zichtbare reviewtekst; widget: Trustpilot\. Alleen zichtbaar na JavaScript/);
});

test("browser vs raw: server-rendered content is not flagged; no raw HTML means no comparison", () => {
  const both = `<html><body>${hreflang}${renderedReviews}</body></html>`;
  let e = browserContentEvidence({ rawHtml: both, renderedHtml: both, pageUrl: URL });
  assert.deepEqual([e.language.onlyAfterJavascript, e.reviews.onlyAfterJavascript], [false, false]);
  e = browserContentEvidence({ rawHtml: "", renderedHtml: both, pageUrl: URL });
  assert.deepEqual([e.language.onlyAfterJavascript, e.reviews.onlyAfterJavascript], [false, false]);
  e = browserContentEvidence({ rawHtml: both, renderedHtml: null, pageUrl: URL });
  assert.equal(e.javascriptExecuted, false);
  assert.match(browserContentSentences(e).at(-1), /Browserweergave niet uitgevoerd/);
});
