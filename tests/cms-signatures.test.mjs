import test from "node:test";
import assert from "node:assert/strict";
import { detectCmsSignatures } from "../lib/cms-signatures.ts";

const names = (html, headers) => detectCmsSignatures(html, headers).map((entry) => entry.name);

test("CMS is recognised from the generator meta tag, whatever the vendor", () => {
  assert.ok(names('<meta name="generator" content="TYPO3 CMS">').includes("TYPO3"));
  assert.ok(names("<meta content='Drupal 10 (https://www.drupal.org)' name='generator'>").includes("Drupal"));
  assert.ok(names('<meta name="generator" content="Acme Sitebuilder 4.2">').includes("Acme Sitebuilder"));
});

test("plugin and theme builders in the generator tag are not reported as the CMS", () => {
  const result = names('<meta name="generator" content="Elementor 3.1"><meta name="generator" content="WordPress 6.5">');
  assert.ok(result.includes("WordPress"));
  assert.ok(!result.includes("Elementor"));
});

test("unique asset paths identify platforms without a generator tag", () => {
  assert.ok(names('<link href="/typo3conf/ext/site/Resources/main.css">').includes("TYPO3"));
  assert.ok(names('<script src="https://framerusercontent.com/sites/abc/chunk.mjs"></script>').includes("Framer"));
  assert.ok(names('<img src="/binaries/content/gallery/site/hero.jpg">').includes("Bloomreach (Hippo CMS)"));
  assert.ok(names('<link href="/sites/default/files/css/css_x.css">').includes("Drupal"));
  assert.ok(names('<script src="/etc.clientlibs/site/main.js"></script>').includes("Adobe Experience Manager"));
});

test("x-generator / x-powered-by response headers count as evidence", () => {
  assert.ok(names("<html></html>", { "x-generator": "Drupal 9" }).includes("Drupal"));
  assert.ok(names("<html></html>", { "x-powered-by": "Next.js" }).includes("Next.js"));
});

test("brand words in body text do not create a CMS label (negative controls)", () => {
  const text = "<p>Wij migreerden van TYPO3 en Drupal naar iets nieuws. Joomla en Sitecore zijn ook bekend. Framer is een tool.</p>";
  assert.deepEqual(names(text), []);
  assert.deepEqual(names("<html><body>Gewone pagina</body></html>"), []);
});

test("a footer credit only names a vendor when nothing else matched", () => {
  const html = '<footer>Website door <a href="https://vendor.example">Vendor Web</a></footer>';
  const found = detectCmsSignatures(html);
  assert.equal(found[0].name, "Vendor Web");
  assert.equal(found[0].strength, 1);
  const withGenerator = detectCmsSignatures(`<meta name="generator" content="TYPO3 CMS">${html}`);
  assert.ok(!withGenerator.some((entry) => entry.name === "Vendor Web"));
});

test("a very long input is scanned in linear time", () => {
  const html = "<div>" + "a".repeat(2_000_000) + "</div><meta name=\"generator\" content=\"Hugo 0.1\">";
  const started = Date.now();
  detectCmsSignatures(html);
  assert.ok(Date.now() - started < 1500);
});
