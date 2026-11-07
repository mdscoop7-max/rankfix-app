import test from "node:test";
import assert from "node:assert/strict";
import { jsonLdInjectorSignals, structuredDataAbsence, structuredDataUnprovenMessage } from "../lib/structured-data-evidence.ts";

const GTM = `<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>`;
const plain = `<html><head><title>Voorbeeld</title></head><body><h1>Hallo</h1></body></html>`;

test("tag managers that can inject JSON-LD client-side are recognised, generically", () => {
  assert.deepEqual(jsonLdInjectorSignals(`<html>${GTM}</html>`), ["Google Tag Manager"]);
  assert.deepEqual(jsonLdInjectorSignals(`<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XYZ9876"></iframe></noscript>`), ["Google Tag Manager"]);
  assert.deepEqual(jsonLdInjectorSignals(`<script src="https://tags.tiqcdn.com/utag/acme/main/prod/utag.js"></script>`), ["Tealium"]);
  assert.deepEqual(jsonLdInjectorSignals(`<script src="https://assets.adobedtm.com/abc/launch-123.min.js"></script>`), ["Adobe Launch"]);
  assert.deepEqual(jsonLdInjectorSignals(`<script src="https://cdn.matomo.cloud/acme/container_AbC123.js"></script>`), ["Matomo Tag Manager"]);
});

test("plain pages, and pages with only analytics/ads tags that cannot inject schema, have no injector", () => {
  assert.deepEqual(jsonLdInjectorSignals(plain), []);
  assert.deepEqual(jsonLdInjectorSignals(`<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>`), [], "gtag.js is a measurement library, not a container that injects markup");
  assert.deepEqual(jsonLdInjectorSignals(""), []);
});

test("a rendered page without JSON-LD is a proven absence", () => {
  const r = structuredDataAbsence({ validJsonLd: 0, rendered: true, clientRenderedRisk: false, injectors: ["Google Tag Manager"] });
  assert.equal(r.proven, true);
  assert.equal(r.basis, "rendered_dom");
});

test("raw HTML without any injector is a proven absence (server-rendered, nothing can add it later)", () => {
  const r = structuredDataAbsence({ validJsonLd: 0, rendered: false, clientRenderedRisk: false, injectors: [] });
  assert.equal(r.proven, true);
  assert.equal(r.basis, "raw_html_no_injectors");
});

test("raw HTML with a tag manager and no render is NOT proof of absence", () => {
  const r = structuredDataAbsence({ validJsonLd: 0, rendered: false, clientRenderedRisk: false, injectors: ["Google Tag Manager"] });
  assert.equal(r.proven, false);
  assert.equal(r.basis, "tag_manager_unrendered");
});

test("an unrendered JavaScript page is not proof of absence (existing behaviour kept)", () => {
  const r = structuredDataAbsence({ validJsonLd: 0, rendered: false, clientRenderedRisk: true, injectors: [] });
  assert.equal(r.proven, false);
  assert.equal(r.basis, "client_rendered_unrendered");
});

test("JSON-LD that is present is never an absence, whatever else is true", () => {
  const r = structuredDataAbsence({ validJsonLd: 2, rendered: false, clientRenderedRisk: true, injectors: ["Tealium"] });
  assert.equal(r.proven, false);
  assert.equal(r.basis, "present");
});

test("a successful render outranks the injector and client-render risk", () => {
  assert.equal(structuredDataAbsence({ validJsonLd: 0, rendered: true, clientRenderedRisk: true, injectors: ["Tealium"] }).proven, true);
});

test("messages name the actual reason and never claim the page lacks structured data", () => {
  const tm = structuredDataUnprovenMessage("tag_manager_unrendered", "homepage", ["Google Tag Manager"]);
  assert.match(tm, /Google Tag Manager/);
  assert.match(tm, /niet (?:in de ruwe HTML )?bewezen|niet bewezen/i);
  assert.doesNotMatch(tm, /ontbreekt aantoonbaar|Geen geldige JSON-LD structured data gevonden/);
  const js = structuredDataUnprovenMessage("client_rendered_unrendered", "homepage", []);
  assert.match(js, /JavaScript-pagina niet volledig kon worden gerenderd/, "existing wording for client-rendered pages is preserved");
});
