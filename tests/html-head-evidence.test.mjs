import test from "node:test";
import assert from "node:assert/strict";
import { extractHeadMetadata, htmlAttribute } from "../lib/html-head-evidence.ts";

test("Vesteda-type head detects description, canonical, viewport and language independent of attribute order",()=>{
 const html=`<!doctype html><HTML LANG='nl-NL'><head>
 <meta content="Woningen voor de lange termijn" data-custom="x" NAME="description">
 <LINK HREF="https://www.example.test/nl" crossorigin rel="alternate canonical">
 <META content='width=device-width, initial-scale=1' name=viewport>
 <meta content="index,follow" name="robots">
 </head><body><p>Inhoud</p></body></HTML>`;
 const m=extractHeadMetadata(html);
 assert.equal(m.description,"Woningen voor de lange termijn");
 assert.equal(m.canonical,"https://www.example.test/nl");
 assert.equal(m.viewport,"width=device-width, initial-scale=1");
 assert.equal(m.robots,"index,follow");
 assert.equal(m.lang,"nl-NL");
 assert.equal(m.descriptionState,"present");
});

test("quoted, unquoted and mixed-case attributes are parsed without rel/href order rules",()=>{
 assert.equal(htmlAttribute("<meta CONTENT='a &amp; b' NAME=description>", "content"),"a &amp; b");
 assert.equal(htmlAttribute("<link rel='stylesheet CANONICAL' href=/nl>", "rel"),"stylesheet CANONICAL");
 assert.equal(htmlAttribute("<html lang=de-DE>", "lang"),"de-DE");
});

test("empty, missing and body-only meta are never treated as proven head metadata",()=>{
 const empty=extractHeadMetadata('<html lang="nl"><head><meta name="description" content=""></head><body></body></html>');
 assert.equal(empty.descriptionState,"empty");
 const missing=extractHeadMetadata('<html lang=nl><head></head><body><meta name="description" content="body fake"><link rel="canonical" href="/fake"></body></html>');
 assert.equal(missing.descriptionState,"missing");
 assert.equal(missing.canonical,"");
 assert.equal(missing.evidence.canonical,false);
});

test("source fallback without a closed head stops at body, not arbitrary rest of document",()=>{
 const m=extractHeadMetadata('<html lang="de"><head><META NAME=viewport CONTENT="width=device-width"><body><meta name=description content=fake>');
 assert.equal(m.viewport,"width=device-width");
 assert.equal(m.description,"");
});
