import test from "node:test";
import assert from "node:assert/strict";
import { visibleEscapeSample, visibleTextOf } from "../lib/html-escape-evidence.ts";

test("escape: normal single encoding is what a visitor sees as '&', never a finding", () => {
  assert.equal(visibleEscapeSample("<p>Peter Mark Hair &amp; Beauty</p>"), null);
  assert.equal(visibleEscapeSample("<p>Prijs &euro;&nbsp;24,95 &mdash; gratis</p>"), null);
});

test("escape: attribute values with '>' (as Chromium serializes them) are not visible text", () => {
  const rendered = `<div data-config='{"title":"Cut &amp;amp; Colour > Styling"}'>Kapsalon</div>`
    + `<a title="Cut &amp;amp; Colour > Styling" href="/x">Boek nu</a>`
    + `<iframe srcdoc="<p>Tom &amp;amp; Jerry</p>"></iframe>`;
  assert.equal(visibleEscapeSample(rendered), null);
  assert.equal(visibleTextOf(rendered), "Kapsalon Boek nu");
});

test("escape: hidden blocks (template, textarea, script, noscript, svg, comments) are ignored", () => {
  const html = `<template><p>A &amp;amp; B</p></template><textarea>A &amp;amp; B</textarea><script>var a="&amp;amp;"</script>`
    + `<noscript>A &amp;amp; B</noscript><svg><text>A &amp;amp; B</text></svg><!-- A &amp;amp; B --><p>Welkom</p>`;
  assert.equal(visibleEscapeSample(html), null);
});

test("escape: real double encoding in visible text is reported with a sample", () => {
  const sample = visibleEscapeSample("<h2>Onze diensten</h2><p>Knippen &amp;amp; kleuren vanaf €45</p>");
  assert.ok(sample);
  assert.match(sample, /Knippen &amp; kleuren/);
});
