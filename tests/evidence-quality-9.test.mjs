import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderImprovesEvidence, renderLosesStructure, visibleWordCount, withServerHead } from "../lib/render-quality.ts";
import { detectSocialProfiles } from "../lib/social-profiles.ts";
import { extractImageMetrics, canonicalImageKey } from "../lib/image-metrics.ts";
import { decodeHtmlEntities } from "../lib/html-entities.ts";

const route = () => readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
const words = (n) => Array.from({ length: n }, (_, i) => `woord${i}`).join(" ");
const nav = (n) => Array.from({ length: n }, (_, i) => `<a href="/categorie/${i}">Categorie ${i}</a>`).join("");

// ---------------------------------------------------------------------------
// 1. Degraded browser render never replaces richer server HTML (any site)
// ---------------------------------------------------------------------------
test("render: keeps words but loses navigation → raw HTML stays (webshop shape)", () => {
  const raw = `<html><head><title>Shop</title></head><body>${nav(300)}<p>${words(1500)}</p><script type="application/ld+json">{"@type":"Organization"}</script></body></html>`;
  const degraded = `<html><head><title>Shop</title></head><body><a href="/">Home</a><p>${words(1300)}</p></body></html>`;
  assert.equal(renderLosesStructure(raw, degraded), true);
  assert.equal(renderImprovesEvidence(visibleWordCount(raw), false, withServerHead(raw, degraded, false), raw), false);
});

test("render: body JSON-LD lost → raw HTML stays (news/article shape)", () => {
  const raw = `<html><head><title>Artikel</title></head><body><p>${words(600)}</p><script type="application/ld+json">{"@type":"NewsArticle"}</script></body></html>`;
  const rendered = `<html><head><title>Artikel</title></head><body><p>${words(650)}</p></body></html>`;
  assert.equal(renderImprovesEvidence(visibleWordCount(raw), false, withServerHead(raw, rendered, false), raw), false);
});

test("render: a normal hydrated page is still accepted (SaaS / service shapes)", () => {
  const raw = `<html><head><title>App</title><script type="application/ld+json">{}</script></head><body>${nav(40)}<p>${words(300)}</p></body></html>`;
  const rendered = `<html><head><title>App</title></head><body>${nav(45)}<p>${words(420)}</p><footer><a href="/privacy">Privacy</a></footer></body></html>`;
  assert.equal(renderImprovesEvidence(visibleWordCount(raw), false, withServerHead(raw, rendered, false), raw), true);
  // Small sites (few links) are never judged on link loss.
  const small = `<html><head><title>Praktijk</title></head><body>${nav(8)}<p>${words(300)}</p></body></html>`;
  assert.equal(renderLosesStructure(small, `<html><body><p>${words(310)}</p></body></html>`), false);
});

test("render: thin client shells are still replaced by a real render", () => {
  const shell = `<html><head><title>App</title></head><body><div id="root"></div></body></html>`;
  assert.equal(renderImprovesEvidence(2, true, `<html><body>${nav(30)}<p>${words(200)}</p></body></html>`, shell), true);
});

test("render: primary and representative pages both pass the raw HTML to the guard", async () => {
  const source = await route();
  assert.match(source, /renderImprovesEvidence\(rawVisibleWords, thinClientShell, withServerHead\(rawHtml, rendered\.html, thinClientShell\), rawHtml\)/);
  assert.match(source, /renderImprovesEvidence\(representativeVisibleWords, representativeThinShell, withServerHead\(representativeRawHtml, renderedPage\.html, representativeThinShell\), representativeRawHtml\)/);
});

// ---------------------------------------------------------------------------
// 2. Social / review profiles from icon links (any sector)
// ---------------------------------------------------------------------------
test("social: icon-only profile links are recognised (dental practice shape)", () => {
  const html = `<footer><a href="https://www.facebook.com/Praktijk-Voorbeeld-1387495171557250"><svg/></a><a href="https://www.instagram.com/praktijk.voorbeeld/" aria-label=""><i class="icon"></i></a></footer>`;
  assert.deepEqual(detectSocialProfiles(html), ["Facebook", "Instagram"]);
});

test("social: review platforms per sector", () => {
  const html = [
    '<a href="https://www.zorgkaartnederland.nl/zorginstelling/tandarts-voorbeeld-123">Zorgkaart</a>',
    '<a href="https://nl.trustpilot.com/review/voorbeeld.nl">Trustpilot</a>',
    '<a href="https://www.tripadvisor.nl/Restaurant_Review-g188590-d1-Reviews-Voorbeeld.html">Tripadvisor</a>',
    '<a href="https://www.linkedin.com/company/voorbeeld-bv/">LinkedIn</a>',
    '<a href="https://g.page/r/CVoorbeeld/review">Google</a>',
  ].join("");
  assert.deepEqual(detectSocialProfiles(html).sort(), ["Google Bedrijfsprofiel", "LinkedIn", "Tripadvisor", "Trustpilot", "Zorgkaart Nederland"]);
});

test("social: share buttons, bare platform homepages and search are not profiles", () => {
  const html = [
    '<a href="https://www.facebook.com/sharer/sharer.php?u=https://voorbeeld.nl">Deel</a>',
    '<a href="https://twitter.com/intent/tweet?text=x">Tweet</a>',
    '<a href="https://www.linkedin.com/shareArticle?mini=true&amp;url=x">Deel</a>',
    '<a href="https://www.instagram.com/">Instagram</a>',
    '<a href="https://www.google.com/search?q=voorbeeld">Zoek</a>',
  ].join("");
  assert.deepEqual(detectSocialProfiles(html), []);
});

test("social: Organization sameAs counts too", () => {
  assert.deepEqual(detectSocialProfiles("", ["https://www.youtube.com/@voorbeeld", "https://example.org/"]), ["YouTube"]);
});

test("social: brand identity and trust evidence use the detected profiles", async () => {
  const source = await route();
  assert.match(source, /const socialProfiles = detectSocialProfiles\(html, organizationSameAsValues\);/);
  assert.match(source, /const hasSocialOrReviewSignal = socialProfiles\.length > 0 \|\|/);
});

// ---------------------------------------------------------------------------
// 3. Image count = pictures, not responsive variants or payload URLs
// ---------------------------------------------------------------------------
test("images: Shopify width variants and srcset count as one picture", () => {
  const html = `<img src="//cdn.shopify.com/s/files/1/p/shoe_400x.jpg?v=1" srcset="//cdn.shopify.com/s/files/1/p/shoe_200x.jpg?v=1 200w, //cdn.shopify.com/s/files/1/p/shoe_800x.jpg?v=1 800w" alt="Schoen">`;
  assert.equal(extractImageMetrics(html).uniqueImageReferences, 1);
});

test("images: WordPress size variants and Next.js optimiser URLs collapse", () => {
  assert.equal(canonicalImageKey("https://x.nl/wp-content/uploads/2024/team-300x200.jpg"), canonicalImageKey("https://x.nl/wp-content/uploads/2024/team.jpg"));
  assert.equal(canonicalImageKey("/_next/image?url=%2Fimg%2Fhero.png&w=1080&q=75"), canonicalImageKey("/img/hero.png"));
  const html = `<img src="/_next/image?url=%2Fimg%2Fhero.png&amp;w=640" srcset="/_next/image?url=%2Fimg%2Fhero.png&amp;w=1080 2x"><img src="/img/logo.svg">`;
  assert.equal(extractImageMetrics(html).uniqueImageReferences, 2);
});

test("images: payload/feed URLs on a page with images are not page images; a client shell still counts them", () => {
  const feed = Array.from({ length: 50 }, (_, i) => `"https://cdn.example/p${i}.jpg"`).join(",");
  assert.equal(extractImageMetrics(`<img src="/hero.jpg" alt=""><script>window.state=[${feed}]</script>`).uniqueImageReferences, 1);
  assert.equal(extractImageMetrics(`<div id="app"></div><script>window.state=[${feed}]</script>`).uniqueImageReferences, 50);
});

// ---------------------------------------------------------------------------
// 4. Meta description decoding and real double escaping
// ---------------------------------------------------------------------------
test("meta: a normal &amp; is decoded once; a double-escaped one stays visible", () => {
  assert.equal(decodeHtmlEntities("Damen &amp; Herren"), "Damen & Herren");
  assert.equal(decodeHtmlEntities("Damen &amp;amp; Herren"), "Damen &amp; Herren");
});

test("meta: the scanner decodes the description and reports only real double escaping", async () => {
  const source = await route();
  assert.match(source, /const description = descriptionContentMatch \? decode\(stripHtml\(descriptionContentMatch\[2\]\)\) : "";/);
  assert.match(source, /const doubleEscapedMeta = \[visibleEscapePattern\.test\(title\) \? "title" : "", visibleEscapePattern\.test\(description\) \? "meta description" : ""\]\.filter\(Boolean\);/);
});

// ---------------------------------------------------------------------------
// 5. Website profile never claims commerce navigation that was not seen
// ---------------------------------------------------------------------------
test("profile: commerce wording follows the signals actually found", async () => {
  const source = await route();
  assert.equal(source.includes("Secundaire commerce-navigatie gevonden"), false);
  assert.match(source, /const hadCommerceHints = Boolean\(technologyProfile\.isCommerce \|\| hasEcommerceSignal \|\| masterEvidence\.commerce\.strength > 0\);/);
});
