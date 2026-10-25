// QA 144 run 7a2155c (25 Oct): DNS and 404 classes. Neutral hosts, no site rules.
//   apexdns.test        apex has no DNS record, www.apexdns.test answers -> report via www, hostFallback recorded
//   www.wwwdns.test     www has no DNS, the apex answers                  -> report via apex
//   nodns.test          neither name resolves                             -> 502 FETCH_DNS (network, no score)
//   root404.test        homepage 404 to RankFix, browser gets the site    -> report, crawler block (originalStatus 404)
//   root404real.test    homepage 404 and the browser gets "Seite nicht gefunden" -> 422 HTTP_NOT_FOUND
//   deep404.test        a deep URL 404                                     -> 422 HTTP_NOT_FOUND, no browser attempt
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const nav = Array.from({ length: 12 }, (_, i) => `<a href="/sectie-${i}">Sectie ${i}</a>`).join(" ");
const site = (title) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} – Sortiment, Filialen und Service."></head><body><header>${nav}</header><h1>${title}</h1><main><p>${"Sortiment Filialen Service Angebote ".repeat(80)}</p></main></body></html>`;
const dnsError = () => { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND" }; return e; };
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const h = u.host;
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  if (h === "apexdns.test" || h === "www.wwwdns.test" || h === "nodns.test" || h === "www.nodns.test") throw dnsError();
  if (h === "www.apexdns.test") return new Response(site("Apex Baumarkt"), { status: 200, headers: { "content-type": "text/html" } });
  if (h === "wwwdns.test") return new Response(site("Www Optik"), { status: 200, headers: { "content-type": "text/html" } });
  if (h === "root404.test" && u.pathname === "/") return new Response("<html><head><title>404</title></head><body>Not found</body></html>", { status: 404, headers: { "content-type": "text/html" } });
  if (h === "root404real.test") return new Response("<html><head><title>Seite nicht gefunden</title></head><body>404</body></html>", { status: 404, headers: { "content-type": "text/html" } });
  if (h === "deep404.test") return new Response("<html><head><title>Seite nicht gefunden</title></head><body>404</body></html>", { status: 404, headers: { "content-type": "text/html" } });
  return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
};
let renders = [];
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url);
  renders.push(u.host + u.pathname);
  const html = u.host === "root404.test" && u.pathname === "/" ? site("Root Markt Online")
    : u.host === "root404real.test" ? `<!doctype html><html><head><title>Seite nicht gefunden</title></head><body><h1>Seite nicht gefunden</h1><p>${"Die angeforderte Seite existiert nicht. ".repeat(20)}</p></body></html>`
    : null;
  if (!html) throw new Error("RENDER_UNAVAILABLE_IN_TEST");
  return { html, finalUrl: url, elapsedMs: 600, requests: 6, titlePixelWidth: 200, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
const rows = [];
const cases = [
  ["apexdns.test", "/", (j, r) => { if (r.status !== 200) return `expected report via www, got ${r.status} ${j.code}`; if (!j.hostFallback || !/www\.apexdns\.test/.test(j.hostFallback.to)) return `hostFallback missing: ${JSON.stringify(j.hostFallback)}`; if (!/www\.apexdns\.test/.test(j.finalUrl)) return `finalUrl ${j.finalUrl}`; }],
  ["www.wwwdns.test", "/", (j, r) => { if (r.status !== 200) return `expected report via apex, got ${r.status} ${j.code}`; if (!/\/\/wwwdns\.test/.test(j.hostFallback?.to || "")) return `hostFallback ${JSON.stringify(j.hostFallback)}`; }],
  ["nodns.test", "/", (j, r) => { if (r.status !== 502 || j.code !== "FETCH_DNS") return `expected 502 FETCH_DNS, got ${r.status} ${j.code}`; if (j.incident?.attribution !== "network") return `attribution ${j.incident?.attribution}`; }],
  ["root404.test", "/", (j, r) => { if (r.status !== 200) return `expected browser recovery, got ${r.status} ${j.code}`; if (j.access?.originalStatus !== 404 || !j.access?.rankfixBlocked) return `access ${JSON.stringify(j.access)}`; if (!/geautomatiseerde verzoeken/.test(j.access?.note || "")) return `note ${j.access?.note}`; }],
  ["root404real.test", "/", (j, r) => { if (r.status !== 422 || j.code !== "HTTP_NOT_FOUND") return `expected 422 HTTP_NOT_FOUND, got ${r.status} ${j.code}`; if (j.incident?.originHttpStatus !== 404) return `origin ${j.incident?.originHttpStatus}`; if (!/bestaat niet.*browsercontrole/.test(j.error || "")) return `message ${j.error}`; }],
  ["deep404.test", "/winkel/oud-product", (j, r) => { if (r.status !== 422 || j.code !== "HTTP_NOT_FOUND") return `expected 422 HTTP_NOT_FOUND, got ${r.status} ${j.code}`; if (renders.some((x) => x.startsWith("deep404.test"))) return "browser attempted on a deep 404"; }],
];
for (const [host, path, check] of cases) {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}${path}`, mode: "both", language: "nl" }) }));
  const j = await res.json();
  rows.push({ host, status: res.status, code: j.code || null, final: j.finalUrl || null, fallback: j.hostFallback?.to || null, origin: j.incident?.originHttpStatus ?? j.access?.originalStatus ?? null });
  const p = check(j, res);
  if (p) problems.push(`${host}: ${p}`);
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
