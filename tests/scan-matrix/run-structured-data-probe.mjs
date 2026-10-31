// 1 Nov 2026 (P5 phase 2): targeted browser observation for structured data.
// Neutral hosts, no site rules. Per case: does the probe run, and what follows?
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const GTM = `<script>(function(w,d,s,l,i){var j=d.createElement(s);j.src='https://metrix.'+location.host+'/gtm.js?id='+i;})(window,document,'script','dataLayer','GTM-TEST123');</script>`;
const LD = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Shop","url":"https://x.test/"},{"@type":"WebSite","name":"Shop","url":"https://x.test/"}]}</script>`;
const page = (head, path = "/") => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fietsenwinkel Noord | Fietsen kopen in Groningen</title><meta name="description" content="Fietsenwinkel Noord in Groningen: stadsfietsen, e-bikes en onderhoud. Bezoek onze winkel of maak online een afspraak."><link rel="canonical" href="https://HOST${path}">${head}</head><body><nav><a href="/fietsen">Fietsen</a><a href="/onderhoud">Onderhoud</a><a href="/over-ons">Over ons</a><a href="/contact">Contact</a></nav><h1>Fietsenwinkel Noord</h1><p>${"Stadsfietsen, e-bikes en onderhoud in Groningen. ".repeat(40)}</p></body></html>`;
const CASES = {
  // host: [server head, browser DOM head (null = render fails), expected]
  "ld-after-js.test": [GTM, GTM + LD, { probe: 1, schema: "pass-or-warning", org: "pass", obs: /present_after_javascript/ }],
  "placeholder.test": [`<script type="application/ld+json"> </script>`, LD, { probe: 1, org: "pass", obs: /present_after_javascript/ }],
  "no-ld-rendered.test": [GTM, GTM, { probe: 1, schema: "warning", org: "warning", obs: /observation=proven_absent; basis=rendered_dom/ }],
  "render-fails.test": [GTM, null, { probe: 1, schema: "unable_to_confirm", org: "unable_to_confirm", obs: /observation=not_observed.*browserProbe=failed/ }],
  "no-injector.test": ["", LD, { probe: 0, schema: "warning", org: "warning", obs: /observation=proven_absent; basis=raw_html_no_injectors/ }],
  "server-ld.test": [GTM + LD, GTM + LD, { probe: 0, org: "pass" }],
};
const renderCalls = {};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const c = CASES[u.host];
  if (!c) return new Response("nf", { status: 404 });
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  return new Response(page(c[0], u.pathname).replaceAll("HOST", u.host), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url);
  renderCalls[u.host] = (renderCalls[u.host] || 0) + 1;
  const c = CASES[u.host];
  if (!c || c[1] === null) throw new Error("RENDER_TIMEOUT");
  return { html: page(c[1], u.pathname).replaceAll("HOST", u.host), finalUrl: url, elapsedMs: 900, requests: 5, titlePixelWidth: 300, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = []; const rows = [];
for (const [host, [, , e]] of Object.entries(CASES)) {
  const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }))).json();
  const by = (k) => j.geo?.checks?.find((c) => c.key === k) || {};
  const schema = by("schema"), org = by("organization_website");
  rows.push({ host, renders: renderCalls[host] || 0, rendered: j.rendering?.javascriptExecuted, schema: `${schema.status} ${schema.points}/${schema.maxPoints}`, org: `${org.status} ${org.points}/${org.maxPoints}`, found: schema.evidence?.found });
  if ((renderCalls[host] || 0) !== e.probe) problems.push(`${host}: ${renderCalls[host] || 0} render(s), expected ${e.probe}`);
  if (e.schema && e.schema !== "pass-or-warning" && schema.status !== e.schema) problems.push(`${host}: schema ${schema.status}, expected ${e.schema}`);
  if (e.org && org.status !== e.org) problems.push(`${host}: organization_website ${org.status}, expected ${e.org}`);
  if (e.obs && !e.obs.test(String(schema.evidence?.found))) problems.push(`${host}: evidence "${schema.evidence?.found}" does not match ${e.obs}`);
  if (j.rendering?.javascriptExecuted) problems.push(`${host}: the structured-data probe must not turn the whole report into a browser report`);
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
