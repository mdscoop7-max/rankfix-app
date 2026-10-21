import test from "node:test";
import assert from "node:assert/strict";
import { htmlOpeningTags, htmlAttributes, htmlAnchors, inspectHeadEvidence } from "../lib/html-document-evidence.ts";

test("head parser finds metadata regardless of casing, attribute position, quoting and > inside values", () => {
  const html = '<HTML LANG=nl-NL><HEAD><TITLE>Residentiële verhuurder</TITLE>'
    + "<META content='Huur > koop en woningbeheer' NAME=DESCRIPTION>"
    + '<MeTa CONTENT="width=device-width, initial-scale=1" name="VIEWPORT">'
    + "<LINK HREF='/nl' data-x='a > b' REL=CANONICAL>"
    + "</HEAD><body></body></HTML>";
  const h = inspectHeadEvidence(html);
  assert.equal(h.description, "Huur > koop en woningbeheer");
  assert.equal(h.canonical, "/nl");
  assert.equal(h.lang, "nl-NL");
  assert.match(h.viewport,/width=device-width/);
  assert.equal(h.headComplete,true);
  assert.equal(h.simultaneousCoreAbsence,false);
});

test("head parser keeps raw tag and handles unquoted and single-quoted values",()=>{
  const html="<html lang='en'><head><meta NAME='DESCRIPTION' CONTENT='Hello'>"
    + '<LINK href=https://example.test/en rel=canonical><meta content=width=device-width name=viewport></head></html>';
  const result=inspectHeadEvidence(html);
  assert.equal(result.description,"Hello");
  assert.equal(result.canonical,"https://example.test/en");
  assert.equal(result.lang,"en");
});

test("missing head has uncertainty marker rather than proof of missing tags",()=>{
  const h=inspectHeadEvidence("<html><body>Client shell</body></html>");
  assert.equal(h.headComplete,false);
  assert.equal(h.simultaneousCoreAbsence,true);
});

test("footer legal links remain detectable with href after other attributes",()=>{
  const html="<footer><a class='legal' title='Privacy & cookies' href='/nl/privacy-cookies'>Privacy &amp; cookies</a>"
    + "<a title=Disclaimer class=footer href='/nl/disclaimer'>Disclaimer</a>"
    + '<a aria-label="Contact" class=footer href=/nl/contact>Neem contact op</a></footer>';
  const anchors=htmlAnchors(html);
  assert.equal(anchors.length,3);
  assert.equal(anchors[0].label,"Privacy & cookies");
  assert.equal(anchors[0].href,"/nl/privacy-cookies");
  assert.equal(anchors[1].href,"/nl/disclaimer");
  assert.equal(anchors[2].href,"/nl/contact");
  assert.equal(anchors[2].aria,"Contact");
});

test("mixed quoted, unquoted and alternate link attributes work",()=>{
  const tags=htmlOpeningTags('<link HREF="https://x.test/en" REL="alternate" HREFLANG=en><link rel=alternate hreflang=nl href=https://x.test/nl>',"link");
  assert.equal(tags.length,2);
  assert.equal(htmlAttributes(tags[0]).hreflang,"en");
  assert.equal(htmlAttributes(tags[1]).rel,"alternate");
});
