// JSON-LD evidence states (31 Oct PDF P5, corrected 1 Nov after the A/B replay).
import test from "node:test";
import assert from "node:assert/strict";
import { structuredDataAbsence } from "../lib/structured-data-evidence.ts";
test("structured data: present / proven absent / not observed are three separate states", () => {
  const base = { validJsonLd: 0, rendered: false, clientRenderedRisk: false, injectors: ["Google Tag Manager"] };
  // 1 Nov (A/B on identical content): no browser observation + tag manager = not observed, never proven absent.
  assert.deepEqual(structuredDataAbsence(base), { proven: false, basis: "tag_manager_unrendered", observation: "not_observed" });
  assert.deepEqual(structuredDataAbsence({ ...base, clientRenderedRisk: true }), { proven: false, basis: "client_rendered_unrendered", observation: "not_observed" });
  assert.deepEqual(structuredDataAbsence({ ...base, rendered: true }), { proven: true, basis: "rendered_dom", observation: "proven_absent" });
  assert.deepEqual(structuredDataAbsence({ ...base, validJsonLd: 1 }), { proven: false, basis: "present", observation: "present" });
  assert.deepEqual(structuredDataAbsence({ ...base, injectors: [] }), { proven: true, basis: "raw_html_no_injectors", observation: "proven_absent" });
  // 1 Nov: without a tag manager an own script can still add JSON-LD; only a script-free page proves absence.
  assert.deepEqual(structuredDataAbsence({ ...base, injectors: [], scriptsPresent: true }), { proven: false, basis: "scripts_unrendered", observation: "not_observed" });
  assert.deepEqual(structuredDataAbsence({ ...base, injectors: [], scriptsPresent: false }), { proven: true, basis: "static_html_no_scripts", observation: "proven_absent" });
  assert.deepEqual(structuredDataAbsence({ ...base, injectors: [], scriptsPresent: true, rendered: true }), { proven: true, basis: "rendered_dom", observation: "proven_absent" });
});

test("1 Nov: executable scripts — JSON-LD, JSON data and templates are not executable", async () => {
  const { hasExecutableScripts } = await import("../lib/structured-data-evidence.ts");
  assert.equal(hasExecutableScripts(`<script src="/a.js"></script>`), true);
  assert.equal(hasExecutableScripts(`<script>window.App = { init() { document.querySelectorAll('.slider').forEach(initSlider); } }; App.init();</script>`), true);
  assert.equal(hasExecutableScripts(`<script>var x=1</script>`), false, "a trivial statement cannot add markup");
  assert.equal(hasExecutableScripts(`<script type="module" src="/m.js"></script>`), true);
  assert.equal(hasExecutableScripts(`<script type="application/ld+json">{"@type":"Thing"}</script><script type="application/json">{}</script><script type="text/template"><p></p></script><script></script>`), false);
  assert.equal(hasExecutableScripts(`<p>geen scripts</p>`), false);
  // Measurement/consent only: cannot add JSON-LD (29 Oct calibration kept).
  assert.equal(hasExecutableScripts(`<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script><script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-ABC123');</script><script src="https://consent.cookiebot.com/uc.js"></script>`), false);
  // Own code next to measurement still counts.
  assert.equal(hasExecutableScripts(`<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script><script src="/assets/app.min.js"></script>`), true);
  assert.equal(hasExecutableScripts(`<script>document.head.appendChild(Object.assign(document.createElement('script'),{type:'application/ld+json',text:JSON.stringify(data)}))</script>`), true);
});

test("injector signals: first-party GTM, Adobe Launch and an EMPTY ld+json placeholder; a filled block is not a placeholder", async () => {
  const { jsonLdInjectorSignals, emptyJsonLdPlaceholders } = await import("../lib/structured-data-evidence.ts");
  assert.deepEqual(jsonLdInjectorSignals(`<script>(function(w,d,s,l,i){j.src='https://metrix.shop.test/gtm.js?id='+i;})(window,document,'script','dataLayer','GTM-WSRFH82');</script>`), ["Google Tag Manager"]);
  assert.deepEqual(jsonLdInjectorSignals(`<script src="https://assets.adobedtm.com/abc/launch-123.min.js"></script>`), ["Adobe Launch"]);
  assert.deepEqual(jsonLdInjectorSignals(`<script type="application/ld+json">\n   \n</script>`), ["lege JSON-LD-placeholder"]);
  assert.equal(emptyJsonLdPlaceholders(`<script type="application/ld+json">{"@type":"Organization"}</script>`), 0);
  assert.deepEqual(jsonLdInjectorSignals(`<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC"></script>`), []);
});

test("PDF P4: a link to an error page is a missing page, whatever its HTTP status", async () => {
  const { isErrorPageUrl, linkOutcome } = await import("../lib/link-status.ts");
  for (const u of ["https://x.nl/pagenotfound", "https://x.nl/404", "https://x.nl/nl/not-found/", "https://x.nl/error?code=1", "https://x.nl/404.html"]) assert.equal(isErrorPageUrl(u), true, u);
  for (const u of ["https://x.nl/errors-and-omissions", "https://x.nl/404-tips", "https://x.nl/foutloos", "https://x.nl/"]) assert.equal(isErrorPageUrl(u), false, u);
  assert.equal(linkOutcome({ url: "https://x.nl/pagenotfound", status: 200, error: false }), "missing");
  assert.equal(linkOutcome({ url: "https://x.nl/banden", status: 200, error: false, finalUrl: "https://x.nl/404" }), "missing");
  assert.equal(linkOutcome({ url: "https://x.nl/banden", status: null, error: true }), "unconfirmed");
});

test("PDF P7: language and colour variants are one page; carts and bot traps are not sampled", async () => {
  const { sampleIdentityKey, isNonContentUrl } = await import("../lib/report-quality.ts");
  assert.equal(sampleIdentityKey("https://www.mollie.com/nl/pricing"), sampleIdentityKey("https://mollie.com/de/pricing"));
  assert.equal(sampleIdentityKey("https://x.nl/en-gb/pricing/"), sampleIdentityKey("https://x.nl/pricing"));
  assert.equal(sampleIdentityKey("https://ikea.test/p/billy?color=white"), sampleIdentityKey("https://ikea.test/p/billy?color=black"));
  assert.notEqual(sampleIdentityKey("https://x.nl/nl/pricing"), sampleIdentityKey("https://x.nl/nl/contact"));
  assert.notEqual(sampleIdentityKey("https://x.nl/search?page=2"), sampleIdentityKey("https://x.nl/search?page=3"));
  for (const u of ["https://x.nl/shoppingcart", "https://x.nl/checkout", "https://x.nl/secret-link", "https://x.nl/nl/honeypot"]) assert.equal(isNonContentUrl(u), true, u);
  assert.equal(isNonContentUrl("https://x.nl/banden"), false);
});

test("1 Nov: one GTM detector — Google host, first-party server-side loader and inline snippet; gtag.js alone is not GTM", async () => {
  const { detectGoogleTagManager } = await import("../lib/tag-manager.ts");
  assert.deepEqual(detectGoogleTagManager(`<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-AB12CD"></script>`).present, true);
  const firstParty = detectGoogleTagManager(`<script>(function(w,d,s,l,i){j.src='https://metrix.shop.test/gtm.js?id='+i+dl;})(window,document,'script','dataLayer','GTM-WSRFH82');</script>`);
  assert.equal(firstParty.present, true); assert.equal(firstParty.firstParty, true); assert.deepEqual(firstParty.loaders, ["metrix.shop.test"]);
  assert.equal(detectGoogleTagManager(`<script src="https://sst.shop.test/gtm.js?id=GTM-ZZ99XX"></script>`).present, true);
  assert.equal(detectGoogleTagManager(`<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>`).present, false);
  assert.equal(detectGoogleTagManager(`<p>Onze GTM-ABCD consultant</p>`).present, false);
});
