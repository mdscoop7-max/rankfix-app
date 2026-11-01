// "No JSON-LD" is only a warning when absence is proven (fresh144, 29 Oct 2026).
// The same server-rendered page is scanned in four variants; neutral .test hosts.
//   plain.test     SSR, no JSON-LD, nothing that can inject it  -> warning (proven, as before)
//   gtm.test       SSR, no JSON-LD, tag-manager container, no render -> unconfirmed, no points lost
//   gtag.test      SSR, no JSON-LD, only gtag.js measurement  -> warning (cannot inject markup)
//   present.test   SSR + GTM, JSON-LD in the HTML -> pass (injector irrelevant)
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const body = `<h1>Fietsenmaker in de regio</h1><p>${"Wij repareren en onderhouden fietsen voor particulieren en bedrijven in de regio. ".repeat(20)}</p><a href="/contact">Contact</a><a href="/privacy">Privacy</a>`;
const LD = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Werkplaats","url":"https://present.test/"},{"@type":"WebSite","name":"Werkplaats","url":"https://present.test/"}]}</script>`;
const GTM = `<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>`;
const GTAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>`;
const page = (extraHead = "") => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Werkplaats | Fietsenmaker in de regio</title><meta name="description" content="Fietsenmaker voor reparatie en onderhoud van fietsen in de regio."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/">${extraHead}</head><body>${body}</body></html>`;
const SITES = { "plain.test": page(), "gtm.test": page(GTM), "gtag.test": page(GTAG), "present.test": page(GTM + LD) };
const respond = (b) => new Response(b, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const doc = SITES[u.host.replace(/^www\./, "")];
  if (!doc) return new Response("nf", { status: 404 });
  const path = u.pathname.replace(/\/$/, "") || "/";
  return respond(path === "/" ? doc : page());
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const scan = async (host) => {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
  return { res, j: await res.json() };
};
const problems = [];
const rows = [];
const EXPECT = {
  "plain.test": { schema: "warning", organization_website: "warning" },
  "gtm.test": { schema: "unable_to_confirm", organization_website: "unable_to_confirm" },
  "gtag.test": { schema: "warning", organization_website: "warning" },
  "present.test": { schema: "pass", organization_website: "pass" },
};
for (const [host, expected] of Object.entries(EXPECT)) {
  const { res, j } = await scan(host);
  const geo = j.geo?.checks || [];
  rows.push({ host, http: res.status, score: j.overallScore, geo: j.geo?.score, schema: geo.find((c) => c.key === "schema")?.status, org: geo.find((c) => c.key === "organization_website")?.status });
  if (res.status !== 200) { problems.push(`${host}: HTTP ${res.status} ${j.code}`); continue; }
  for (const [key, status] of Object.entries(expected)) {
    const item = geo.find((c) => c.key === key);
    if (item?.status !== status) problems.push(`${host}: ${key} is ${item?.status}, expected ${status}`);
    if (item?.status === "unable_to_confirm") {
      if (item.points !== 0 || item.issue_status !== "UNABLE_TO_CONFIRM") problems.push(`${host}: ${key} unconfirmed but points=${item.points}`);
      if (!/Google Tag Manager/.test(item.message || "")) problems.push(`${host}: ${key} message does not name the tag manager: ${item.message}`);
      if (/Geen geldige JSON-LD|ontbreekt aantoonbaar/i.test(item.message || "")) problems.push(`${host}: ${key} claims absence: ${item.message}`);
    }
  }
}
// An unproven absence must never cost points: gtm.test may not score below plain.test in GEO.
const byHost = Object.fromEntries(rows.map((r) => [r.host, r]));
if (byHost["gtm.test"] && byHost["plain.test"] && byHost["gtm.test"].geo < byHost["plain.test"].geo) problems.push(`gtm.test GEO ${byHost["gtm.test"].geo} below plain.test ${byHost["plain.test"].geo}`);
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length }));
process.exit(0);
