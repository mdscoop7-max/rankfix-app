import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractGoogleTagIds, isValidGa4MeasurementId } from "../lib/google-tag-ids.ts";

// Brand-free HTML fragments modelled on real page types and platforms. Every
// case lists exactly the IDs that must be found; anything else is a false ID.
const cases = [
  {
    name: "webshop (Shopify-like): reCAPTCHA widget + escaped web-pixel JSON config",
    html: `<div class="g-recaptcha" data-sitekey="6Lc"></div><script>var cfg="{\\"measurementId\\":\\"G-7XK2P9QW1Z\\"}";</script>
           <script async src="https://www.googletagmanager.com/gtag/js?id=G-7XK2P9QW1Z"></script>`,
    ga4: ["G-7XK2P9QW1Z"], ads: [], gtm: [],
  },
  {
    name: "WordPress service site: gtag snippet, Ads conversion and a recaptcha plugin",
    html: `<form class="wpcf7-form g-recaptcha-form"><div class="g-recaptcha"></div></form>
           <script>gtag('config', 'G-AB12CD34EF'); gtag('config', 'AW-987654321'); gtag('event','conversion',{send_to:'AW-987654321/AbC-dEf'});</script>`,
    ga4: ["G-AB12CD34EF"], ads: ["AW-987654321"], gtm: [],
  },
  {
    name: "news article: GTM container, product name and ID-like words in body copy",
    html: `<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-W4X9ZQ');</script>
           <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-W4X9ZQ"></iframe></noscript>
           <article><p>De nieuwe G-SHOCK5 en het G-2024ABC model, getest door de GTM-redactie.</p></article>`,
    ga4: [], ads: [], gtm: ["GTM-W4X9ZQ"],
  },
  {
    name: "SaaS landing page: IDs in data attributes and HTML-entity JSON",
    html: `<div id="app" data-ga="G-Q1W2E3R4T5" data-props="{&quot;gtm&quot;:&quot;GTM-PL4ZA9&quot;}"></div>`,
    ga4: ["G-Q1W2E3R4T5"], ads: [], gtm: ["GTM-PL4ZA9"],
  },
  {
    name: "government page: no tags, CSS utility classes only",
    html: `<body class="gtm-banner g-recaptcha-badge g-col-6"><a class="g-link" href="/g-1234567">Formulier G-1234567</a></body>`,
    ga4: [], ads: [], gtm: [],
  },
  {
    name: "recreation/booking page: lower-case look-alikes and IDs inside other tokens",
    html: `<script>var a='g-ab12cd34ef', b="my-G-ABCDEF12", c="xGTM-ABCD12";</script>`,
    ga4: [], ads: [], gtm: [],
  },
];

for (const c of cases) {
  test(`tag IDs — ${c.name}`, () => {
    const ids = extractGoogleTagIds(c.html);
    assert.deepEqual(ids.ga4MeasurementIds, c.ga4, "GA4");
    assert.deepEqual(ids.googleAdsIds, c.ads, "Google Ads");
    assert.deepEqual(ids.gtmContainerIds, c.gtm, "GTM");
    for (const id of ids.ga4MeasurementIds) assert.ok(isValidGa4MeasurementId(id));
  });
}

test("GA4 validator: only real measurement ID shapes", () => {
  for (const id of ["G-AB12CD34EF", "G-7XK2P9QW1Z", "G-1234567890"]) assert.equal(isValidGa4MeasurementId(id), true, id);
  for (const id of ["g-recaptcha", "G-RECAPTCHA", "g-ab12cd34ef", "G-ABCDEFGHIJ", "G-12", "G-AB12CD34EF12345", "GA-12345678", "UA-1234567-1"]) {
    assert.equal(isValidGa4MeasurementId(id), false, id);
  }
});

test("configured gtag IDs are validated too", () => {
  const ids = extractGoogleTagIds(`gtag('config','g-recaptcha'); gtag("config","G-AB12CD34EF"); gtag('config','AW-123456789')`);
  assert.deepEqual(ids.configuredGa4Ids, ["G-AB12CD34EF"]);
  assert.deepEqual(ids.configuredAdsIds, ["AW-123456789"]);
});

test("the scanner uses the central recogniser, with no inline GA4 regex left", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /= extractGoogleTagIds\(html\);/);
  assert.doesNotMatch(source, /html\.match\(\/[^/]*G-\[A-Z0-9\]/);
  assert.doesNotMatch(source, /G-\[A-Z0-9\][^\n]*\/gi/);
});
