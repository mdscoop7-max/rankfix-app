import { createBrowserDiagnostics } from "../../lib/browser-diagnostics.ts";
// 1 Nov 2026 (P5 phase 2): targeted browser observation for structured data.
// Neutral hosts, no site rules. Per case: does the probe run, and what follows?
const GTM = `<script>(function(w,d,s,l,i){var j=d.createElement(s);j.src='https://metrix.'+location.host+'/gtm.js?id='+i;})(window,document,'script','dataLayer','GTM-TEST123');</script>`;
const LD = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Shop","url":"https://x.test/"},{"@type":"WebSite","name":"Shop","url":"https://x.test/"}]}</script>`;
const page = (head, path = "/") => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fietsenwinkel Noord | Fietsen kopen in Groningen</title><meta name="description" content="Fietsenwinkel Noord in Groningen: stadsfietsen, e-bikes en onderhoud. Bezoek onze winkel of maak online een afspraak."><link rel="canonical" href="https://HOST${path}">${head}</head><body><nav><a href="/fietsen">Fietsen</a><a href="/onderhoud">Onderhoud</a><a href="/over-ons">Over ons</a><a href="/contact">Contact</a></nav><h1>Fietsenwinkel Noord</h1><p>${"Stadsfietsen, e-bikes en onderhoud in Groningen. ".repeat(40)}</p></body></html>`;
const CASES = {
  // host: [server head, browser DOM head (null = render fails), expected]
  "ld-after-js.test": [GTM, GTM + LD, { probe: 1, schema: "pass-or-warning", org: "pass", obs: /present_after_javascript/ }],
  "placeholder.test": [`<script type="application/ld+json"> </script>`, LD, { probe: 1, org: "pass", obs: /present_after_javascript/ }],
  "no-ld-rendered.test": [GTM, GTM, { probe: 1, schema: "warning", org: "warning", obs: /observation=proven_absent; basis=rendered_dom.*browserProbe=completed; window=load \+ 800 ms tot netwerkrust; consent=none/ }],
  "render-fails.test": [GTM, null, { probe: 1, schema: "unable_to_confirm", org: "unable_to_confirm", obs: /observation=not_observed.*browserProbe=incomplete:RENDER_TIMEOUT/ }],
  // No tag manager and no script at all: nothing can add JSON-LD → proven absent without a browser.
  "no-injector.test": ["", LD, { probe: 0, schema: "warning", org: "warning", obs: /observation=proven_absent; basis=static_html_no_scripts/ }],
  // No tag manager, but an own script: the browser decides (1 Nov).
  "own-script-ld.test": [`<script src="/app.js"></script>`, `<script src="/app.js"></script>` + LD, { probe: 1, org: "pass", obs: /present_after_javascript/ }],
  "own-script-fails.test": [`<script>window.App = { init() { document.querySelectorAll('.slider').forEach(initSlider); } }; App.init();</script>`, null, { probe: 1, schema: "unable_to_confirm", org: "unable_to_confirm", obs: /observation=not_observed; basis=scripts_unrendered/ }],
  "server-ld.test": [GTM + LD, GTM + LD, { probe: 0, org: "pass" }],
  // An incomplete observation is never proof of absence (1 Nov, priority 1).
  "partial-load.test": [GTM, GTM, { probe: 1, schema: "unable_to_confirm", org: "unable_to_confirm", obs: /not_observed.*incomplete:pagina niet volledig geladen/ }, undefined, { partial: true }],
  "request-cap.test": [GTM, GTM, { probe: 1, schema: "unable_to_confirm", obs: /not_observed.*incomplete:verzoeklimiet bereikt/ }, undefined, { cap: true }],
  "blocked-view.test": [GTM, GTM, { probe: 1, schema: "unable_to_confirm", obs: /not_observed.*incomplete:browser kreeg een blokkade/ }, undefined, { block: true }],
  "other-site.test": [GTM, GTM + LD, { probe: 1, schema: "unable_to_confirm", obs: /not_observed.*incomplete:browser eindigde op een andere site/ }, undefined, { otherSite: true }],
  // But JSON-LD that IS found counts even if the page kept loading.
  "partial-but-found.test": [GTM, GTM + LD, { probe: 1, org: "pass", obs: /present_after_javascript.*source=browser-DOM.*consent=none/ }, undefined, { partial: true }],
  // JavaScript sites (raw HTML is an empty app shell; the primary render shows the page).
  // JSON-LD in the primary render counts; no extra render.
  "spa-ld.test": ["SPA", GTM + LD, { probe: 1, org: "pass" }, undefined, { spa: true }],
  // Primary render without JSON-LD: the complete structured-data observation decides.
  "spa-absent.test": ["SPA", GTM, { probe: 2, schema: "warning", obs: /observation=proven_absent; basis=rendered_dom.*browserProbe=completed/ }, undefined, { spa: true }],
  // A primary render that never fully loaded: never proof of absence.
  "spa-partial.test": ["SPA", GTM, { probe: 2, schema: "unable_to_confirm", obs: /observation=not_observed; basis=render_not_complete/ }, undefined, { spa: true, partial: true }],
  // JSON-LD only on an own subpage: shown as context with URL, status/points unchanged.
  "subpage-ld.test": ["", null, { probe: 0, schema: "warning", org: "warning", points: [4, 4], context: /Context \(telt niet mee[^]*over-ons/, orgContext: /Organization\/WebSite-schema staat wel op [^ ]*over-ons/ }, { "/over-ons": LD }],
};
// Generic URL variants and external failures: identical content and scoring.
Object.assign(CASES, {
  "www-found.test": [GTM, GTM + LD, { probe: 1, org: "pass", obs: /present_after_javascript/ }, undefined, { www: true }],
  "www-empty.test": [GTM, GTM, { probe: 1, schema: "warning", obs: /observation=proven_absent/ }, undefined, { www: true }],
  "different-page.test": [GTM, GTM, { probe: 1, schema: "unable_to_confirm", obs: /not_observed.*andere pagina of query/ }, undefined, { path: true }],
  "different-page-found.test": [GTM, GTM + LD, { probe: 1, schema: "unable_to_confirm", obs: /not_observed.*andere pagina of query/ }, undefined, { path: true }],
  "different-query.test": [GTM, GTM, { probe: 1, schema: "unable_to_confirm", obs: /not_observed.*andere pagina of query/ }, undefined, { query: true }],
  "external-failures-found.test": [GTM, GTM + LD, { probe: 1, org: "pass", obs: /present_after_javascript/ }, undefined, { failures: true }],
  "external-failures-empty.test": [GTM, GTM, { probe: 1, schema: "warning", obs: /observation=proven_absent/ }, undefined, { failures: true }],
  "five-short-zero-long.test": ["SPA", GTM + LD.repeat(5), { probe: 1, org: "pass", obs: /blocks=5/ }, undefined, { spa: true, shortOnly: true }],
});
CASES["render-fails.test"][4] = { diagnosticFailure: true };
const renderCalls = {};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const c = CASES[u.host];
  if (!c) return new Response("nf", { status: 404 });
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  if (u.pathname !== "/" && !(c[3] && c[3][u.pathname] !== undefined)) return new Response("nf", { status: 404 });
  if (c[0] === "SPA" && u.pathname === "/") return new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>App</title><script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script><script src="/d.js"></script></head><body><div id="__next"></div></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  return new Response(page(u.pathname === "/" ? c[0] : c[3][u.pathname], u.pathname).replaceAll("HOST", u.host), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
const BLOCK_PAGE = `<!doctype html><html><head><title>Just a moment...</title></head><body><p>Checking your browser before accessing the site.</p></body></html>`;
globalThis.__RF_RENDER = async (url, timeoutMs, budget, options = {}) => {
  const u = new URL(url);
  renderCalls[u.host] = (renderCalls[u.host] || 0) + 1;
  calls.push({ host: u.host, timeoutMs, mode: options.mode, settleMs: options.settleMs });
  const c = CASES[u.host];
  if (!c || c[1] === null) {
    const error = new Error("RENDER_TIMEOUT");
    if (c?.[4]?.diagnosticFailure) {
      const d = createBrowserDiagnostics(url);
      d.failed({ url: url + "app.js", resourceType: "script", errorText: "net::ERR_TIMED_OUT" });
      error.browserDiagnostics = d.snapshot(url, { name: "TimeoutError", message: "RENDER_TIMEOUT", category: "timeout" });
    }
    throw error;
  }
  const view = c[4] || {};
  const html = view.block ? BLOCK_PAGE : page(view.shortOnly && options.mode ? GTM : c[1], u.pathname).replaceAll("HOST", u.host);
  const finalUrl = view.otherSite ? "https://elders.test/" : view.www ? `https://www.${u.host}/` : view.path ? new URL("/login", url).href : view.query ? url + "?view=other" : url;
  const diagnostic = createBrowserDiagnostics(url);
  if (view.www) diagnostic.redirected(url, finalUrl, 301);
  if (view.failures) for (let i = 0; i < 8; i++) diagnostic.failed({ url: `https://metrics.test/collect/${i}`, resourceType: "fetch", errorText: i % 2 ? "net::ERR_BLOCKED_BY_CLIENT" : "net::ERR_ABORTED" });
  const diagnostics = diagnostic.snapshot(finalUrl);
  const observation = options.mode === "structured_data" ? { loadReached: !view.partial, settledMs: 800, networkQuiet: !view.partial, requestCapHit: Boolean(view.cap), abortedRequests: view.cap ? 12 : 0, failedRequests: view.failures ? 8 : 0, consent: "none", window: view.partial ? "load (niet bereikt) + 0 ms" : "load + 800 ms tot netwerkrust" } : undefined;
  return { html, finalUrl, diagnostics, elapsedMs: 900, requests: 5, ...(view.partial ? { partialNavigation: true } : {}), titlePixelWidth: 300, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null, ...(observation ? { observation } : {}) };
};
const calls = [];
const { POST } = await import(new URL("../../app/api/scan/route.ts", import.meta.url));
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = []; const rows = []; const responses = new Map();
for (const [host, [, , e]] of Object.entries(CASES)) {
  const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }))).json();
  responses.set(host, j);
  const probe = j.rendering?.structuredDataProbe;
  if (CASES[host][4]?.diagnosticFailure && (probe?.diagnostics?.requestFailures?.[0]?.errorCode !== "ERR_TIMED_OUT" || probe?.finalUrl !== `https://${host}/`)) problems.push(`${host}: failed probe lost diagnostics`);
  if (CASES[host][4]?.failures && probe?.diagnostics?.requestFailures?.length !== 8) problems.push(`${host}: missing failure details in probe`);
  if (CASES[host][4]?.www && (!probe?.diagnostics?.urlComparison?.wwwChanged || probe?.diagnostics?.redirects?.[0]?.status !== 301)) problems.push(`${host}: missing www redirect evidence`);
  if (probe?.attempted && probe.ok && (!probe.requestedUrl || !probe.finalUrl)) problems.push(`${host}: missing observation URLs`);
  const by = (k) => j.geo?.checks?.find((c) => c.key === k) || {};
  const schema = by("schema"), org = by("organization_website");
  rows.push({ host, renders: renderCalls[host] || 0, rendered: j.rendering?.javascriptExecuted, schema: `${schema.status} ${schema.points}/${schema.maxPoints}`, org: `${org.status} ${org.points}/${org.maxPoints}`, found: schema.evidence?.found });
  if ((renderCalls[host] || 0) !== e.probe) problems.push(`${host}: ${renderCalls[host] || 0} render(s), expected ${e.probe}`);
  if (e.schema && e.schema !== "pass-or-warning" && schema.status !== e.schema) problems.push(`${host}: schema ${schema.status}, expected ${e.schema}`);
  if (e.org && org.status !== e.org) problems.push(`${host}: organization_website ${org.status}, expected ${e.org}`);
  if (e.obs && !e.obs.test(String(schema.evidence?.found))) problems.push(`${host}: evidence "${schema.evidence?.found}" does not match ${e.obs}`);
  if (e.points && (schema.points !== e.points[0] || org.points !== e.points[1])) problems.push(`${host}: subpage context changed points (${schema.points}, ${org.points})`);
  if (e.context && !e.context.test(String(schema.message))) problems.push(`${host}: schema message lacks subpage context: ${String(schema.message).slice(-160)}`);
  if (e.orgContext && !e.orgContext.test(String(org.message))) problems.push(`${host}: organization_website lacks subpage context: ${String(org.message).slice(-160)}`);
  if (j.rendering?.javascriptExecuted && !CASES[host][4]?.spa) problems.push(`${host}: the structured-data probe must not turn the whole report into a browser report`);
  if (CASES[host][4]?.spa && !j.rendering?.javascriptExecuted) problems.push(`${host}: the JavaScript shell was not rendered (test setup)`);
}
for (const [a, b] of [["ld-after-js.test", "external-failures-found.test"], ["no-ld-rendered.test", "external-failures-empty.test"]]) {
  const snapshot = (host) => ["seo", "geo"].map(dim => ({ score: responses.get(host)?.[dim]?.score, checks: responses.get(host)?.[dim]?.checks?.map(c => [c.key, c.status, c.points, c.maxPoints]) }));
  if (JSON.stringify(snapshot(a)) !== JSON.stringify(snapshot(b))) problems.push(`${b}: harmless external failures changed SEO/GEO checks or scores`);
}
// Only the structured-data mode with the 12 s budget and a 3 s settle window.
for (const c of calls.filter((x) => !CASES[x.host]?.[4]?.spa || x.mode)) if (c.mode !== "structured_data" || c.timeoutMs !== 12000 || c.settleMs !== 3000) problems.push(`${c.host}: probe called with ${JSON.stringify(c)}`);
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
