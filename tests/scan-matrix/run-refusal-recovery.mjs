// 31 Oct 2026 (five-site QA, PDF P1): a homepage answered HTTP 403; the browser
// recovery received a refusal page ("Helaas kunnen we je op dit moment geen
// toegang verlenen tot onze site.") and it was scored 68 as the website.
// Neutral hosts, no site rules. Per language: refusal render → no score,
// HTTP_BLOCKED. Control: a real homepage rendered after a 403 is still recovered.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const REFUSALS = {
  "nl.refusal.test": ["nl", "merk", "Helaas kunnen we je op dit moment geen toegang verlenen tot onze site."],
  "en.refusal.test": ["en", "brand", "We're sorry. We can't grant you access to this site at the moment."],
  "de.refusal.test": ["de", "Marke", "Leider können wir Ihnen derzeit keinen Zugriff gewähren."],
  "fr.refusal.test": ["fr", "marque", "Désolé, nous ne pouvons pas vous donner accès à ce site pour le moment."],
  "it.refusal.test": ["it", "marchio", "Spiacenti, al momento non possiamo concederti l'accesso al sito."],
  "es.refusal.test": ["es", "marca", "Lo sentimos, en este momento no podemos darte acceso a nuestro sitio."],
};
const CONTROL = "real.recovered.test";
const refusalPage = ([lang, title, sentence]) => `<!doctype html><html lang="${lang}"><head><title>${title}</title></head><body><h1>${sentence}</h1><p>Ref 18.4a2c1702.1793484249 · ${"x ".repeat(45)}</p></body></html>`;
const realHome = `<!doctype html><html lang="nl"><head><title>Sportschoenen online kopen | Realshop</title><meta name="description" content="Sportschoenen, kleding en accessoires online kopen bij Realshop. Gratis verzending vanaf 25 euro."></head><body><nav>${["/heren", "/dames", "/kinderen", "/sale", "/klantenservice", "/over-ons"].map((h) => `<a href="${h}">${h.slice(1)}</a>`).join(" ")}</nav><h1>Sportschoenen en sportkleding</h1><p>${"Ontdek de nieuwste sportschoenen voor hardlopen, fitness en training. ".repeat(20)}</p></body></html>`;
const res = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const host = u.host.replace(/^www\./, "");
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  if (REFUSALS[host] || host === CONTROL) return u.pathname === "/" ? res("<html><body>Forbidden</body></html>", 403) : res("nf", 404);
  return new Response("nf", { status: 404 });
};
globalThis.__RF_RENDER = async (url) => {
  const host = new URL(url).host.replace(/^www\./, "");
  const html = REFUSALS[host] ? refusalPage(REFUSALS[host]) : host === CONTROL ? realHome : null;
  if (!html) throw new Error("RENDER_UNAVAILABLE_IN_TEST");
  return { html, finalUrl: url, elapsedMs: 300, requests: 3, titlePixelWidth: 100, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = []; const rows = [];
for (const host of [...Object.keys(REFUSALS), CONTROL]) {
  const r = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
  const j = await r.json();
  rows.push({ host, api: r.status, code: j.code || null, score: j.overallScore ?? null, recovered: j.recovery?.browserRecovered ?? j.incident?.browserRender?.outcome ?? null });
  if (host === CONTROL) {
    if (r.status !== 200 || j.overallScore == null) problems.push(`${host}: a real recovered homepage must still be scored (got ${r.status} ${j.code})`);
  } else {
    if (j.overallScore != null) problems.push(`${host}: refusal page scored ${j.overallScore} as the website`);
    if (j.code !== "HTTP_BLOCKED") problems.push(`${host}: expected HTTP_BLOCKED, got ${r.status} ${j.code}`);
  }
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
