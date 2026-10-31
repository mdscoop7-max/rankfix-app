import test from "node:test";
import assert from "node:assert/strict";
import { classifyLinkOutcome, findConflictingAnchorTargets, isErrorPagePath, isHiddenAnchor } from "../lib/link-audit-rules.ts";

test("error-page slugs are recognised in any language, normal pages are not", () => {
  for (const p of ["/pagenotfound", "/page-not-found/", "/404", "/not-found", "/pagina-niet-gevonden", "/seite-nicht-gefunden", "/nl/404.html"]) assert.equal(isErrorPagePath(p), true, p);
  for (const p of ["/", "/diensten", "/blog/404-redenen-voor-seo", "/error-handling-guide", "/contact"]) assert.equal(isErrorPagePath(p), false, p);
});

test("hidden and honeypot anchors are detected, visible and icon links are not", () => {
  assert.equal(isHiddenAnchor('href="/x" style="display:none"'), true);
  assert.equal(isHiddenAnchor('href="/x" style="position:absolute;left:-9999px"'), true);
  assert.equal(isHiddenAnchor('href="/x" class="honeypot-link"'), true);
  assert.equal(isHiddenAnchor('href="/x" hidden'), true);
  assert.equal(isHiddenAnchor('href="/x"', "Secret Link"), true);
  assert.equal(isHiddenAnchor('href="/x" aria-hidden="true" tabindex="-1"'), true);
  assert.equal(isHiddenAnchor('href="/contact" class="btn btn-primary"', "Contact"), false);
  assert.equal(isHiddenAnchor('href="/x" aria-hidden="true"'), false);
  assert.equal(isHiddenAnchor('href="/x" class="nav-link d-none d-md-block"'), false);
});

test("same anchor text with different targets is reported, generic texts are ignored", () => {
  const anchors = [
    { text: "Vind je salon", url: "https://a.test/" },
    { text: "Vind je salon", url: "https://a.test/salons" },
    { text: "Lees meer", url: "https://a.test/a" },
    { text: "Lees meer", url: "https://a.test/b" },
    { text: "Contact", url: "https://a.test/contact" },
    { text: "Contact", url: "https://www.a.test/contact/" },
  ];
  const result = findConflictingAnchorTargets(anchors);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "Vind je salon");
});

test("time-outs never prove a broken link and a 200 from the page fetch beats a link failure", () => {
  assert.equal(classifyLinkOutcome({ status: null, error: true }, "https://a.test/x"), "unconfirmed");
  assert.equal(classifyLinkOutcome({ status: 404, error: false }, "https://a.test/x"), "broken");
  assert.equal(classifyLinkOutcome({ status: 503, error: false }, "https://a.test/x"), "broken");
  assert.equal(classifyLinkOutcome({ status: 200, error: false }, "https://a.test/pagenotfound"), "soft_error_page");
  assert.equal(classifyLinkOutcome({ status: null, error: true }, "https://a.test/x", new Set(["https://a.test/x"])), "ok");
  assert.equal(classifyLinkOutcome({ status: 403, error: false }, "https://a.test/x"), "ok");
});
