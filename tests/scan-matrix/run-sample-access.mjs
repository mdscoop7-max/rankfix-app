// Sampled pages that refuse RankFix (HTTP 401/403/5xx). Reconstructed from live
// QA scan 4a9fe1db (24 Oct 2026, QA b8a35f0): a sampled FAQ page answered HTTP 403,
// the browser recovery received the site's own "Geen toegang | <brand>" page with
// full navigation, and that page was scored 71/100, "Gecontroleerd", with the
// HTTP check "HTTP 403" marked as passed. Neutral hosts; no site rules.
//   - accessdenied.test: refusal page in the browser too → not scored, excluded.
//   - botwall.test: refusal only to RankFix, the browser gets the real page →
//     content is scored, but the HTTP check is never "passed" on a 403.
//   - multilingual titles of refusal pages are recognised (page gate unit check).
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const nav = Array.from({ length: 40 }, (_, i) => `<a href="/sectie-${i}">Sectie ${i}</a>`).join(" ");
const doc = ({ title, description = "", h1 = [], body = "" }) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title>${description ? `<meta name="description" content="${description}">` : ""}<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><header><nav>${nav}</nav></header>${h1.map((h) => `<h1>${h}</h1>`).join("")}<main>${body}</main><footer><a href="/privacy">Privacy</a> <a href="/contact">Contact</a></footer></body></html>`;
const filler = (t) => `<p>${(t + " ").repeat(25)}</p>`;
const home = (brand) => doc({ title: `${brand}: De officiële website van de bond | ${brand}`, description: "Nieuws, competities en ondersteuning voor clubs en vrijwilligers.", h1: [`Welkom bij ${brand}`], body: `<a href="/over-ons/contact/veelgestelde-vragen/respect">Sportiviteit en respect</a> <a href="/over-ons">Over ons</a> <a href="/boeken/afspraak">Afspraak boeken</a>` + filler("Competities, clubs en vrijwilligers in het amateurvoetbal.") });
const refusal = (brand) => doc({ title: `Geen toegang | ${brand}`, body: `<p>U heeft geen rechten om deze pagina te bekijken.</p>` + filler("Ga terug naar de homepage of zoek verder.") });
const realFaq = (brand) => doc({ title: `Sportiviteit en respect | ${brand}`, description: "Veelgestelde vragen over sportiviteit en respect op en rond het veld.", h1: ["Sportiviteit en respect"], body: filler("Hoe gaan we respectvol met elkaar om op en rond het veld?") });
const about = (brand) => doc({ title: `Over ons | ${brand}`, description: "Over de bond en haar organisatie.", h1: ["Over ons"], body: filler("De bond organiseert competities en ondersteunt clubs.") });
const SITES = {
  "accessdenied.test": { brand: "Bondx", faqStatus: 403, faqRaw: refusal, faqRender: refusal },
  "botwall.test": { brand: "Bondy", faqStatus: 403, faqRaw: refusal, faqRender: realFaq },
};
const FAQ = "/over-ons/contact/veelgestelde-vragen/respect";
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const s = SITES[u.host.replace(/^www\./, "")];
  const path = u.pathname.replace(/\/$/, "") || "/";
  if (!s) return new Response("nf", { status: 404 });
  if (path === "/") return new Response(home(s.brand), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  if (path === FAQ) return new Response(s.faqRaw(s.brand), { status: s.faqStatus, headers: { "content-type": "text/html; charset=utf-8" } });
  if (path === "/boeken/afspraak") return new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Afspraak | ${s.brand}</title></head><body><div id="__next"></div>${'<script src="/_next/static/chunks/x.js"></script>'.repeat(6)}</body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  if (path === "/over-ons") return new Response(about(s.brand), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
};
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url); const s = SITES[u.host.replace(/^www\./, "")];
  if (s && u.pathname.replace(/\/$/, "") === "/boeken/afspraak") throw new Error("Protocol error (Page.navigate): Target closed");
  if (!s || u.pathname.replace(/\/$/, "") !== FAQ) throw new Error("RENDER_UNAVAILABLE_IN_TEST");
  return { html: s.faqRender(s.brand), finalUrl: url, elapsedMs: 400, requests: 5, titlePixelWidth: 200, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const { classifyNonContentPage } = await import(ROOT + "/lib/page-gate.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
const rows = [];
for (const host of Object.keys(SITES)) {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
  const j = await res.json();
  const faq = (j.multiPage?.pageAudits || []).find((p) => new URL(p.url).pathname.replace(/\/$/, "") === FAQ);
  const http = faq?.evidenceChecks?.find((c) => c.key === "http");
  rows.push({ host, status: faq?.status, httpStatus: faq?.httpStatus, score: faq?.score ?? null, httpCheck: http ? `${http.status}: ${http.details}` : null, title: faq?.title ?? null });
  if (res.status !== 200) { problems.push(`${host}: HTTP ${res.status} ${j.code}`); continue; }
  if (!faq) { problems.push(`${host}: refused sample page was not selected`); continue; }
  if (host === "accessdenied.test") {
    if (faq.status === "audited" || faq.score !== null) problems.push(`${host}: refusal page scored ${faq.score} as "${faq.status}"`);
  } else {
    if (faq.status !== "audited") problems.push(`${host}: real page from the browser not scored (${faq.status})`);
  }
  if (http?.status === "PASS") problems.push(`${host}: HTTP check passed on HTTP ${faq.httpStatus}`);
  // A sampled page whose browser render failed names the cause (live QA scan 345f4d24 did not).
  const shell = (j.multiPage?.pageAudits || []).find((p) => new URL(p.url).pathname.replace(/\/$/, "") === "/boeken/afspraak");
  if (!shell) problems.push(`${host}: JS sample page not selected`);
  else if (!(shell.evidence || []).some((e) => /javascript rendering unavailable \(BROWSER_CRASHED: .*Target closed/.test(e))) problems.push(`${host}: render failure without cause: ${JSON.stringify(shell.evidence)}`);
  // Every selected page has exactly one outcome; "not fetched" counts only real failures.
  const o = j.multiPage?.counts?.outcomes;
  if (!o) problems.push(`${host}: no sample outcome counts`);
  else {
    const sum = o.scored + o.unscored + o.noindex + o.nonContent + o.thinContent + (o.missing || 0) + o.notRetrieved + o.duplicate;
    if (sum !== o.selected || o.selected !== j.multiPage.counts.selected) problems.push(`${host}: outcomes add up to ${sum}, selected ${o.selected}/${j.multiPage.counts.selected}`);
    if (j.multiPage.counts.fetchFailed !== o.notRetrieved) problems.push(`${host}: fetchFailed ${j.multiPage.counts.fetchFailed} ≠ not retrieved ${o.notRetrieved}`);
  }
}
// Refusal-page titles in the six report languages (and English), with and without brand.
for (const title of ["Geen toegang | Bondx", "Geen toegang", "Kein Zugriff – Marke", "No access | Brand", "Accès interdit | Marque", "Acceso prohibido", "Accesso vietato | Marca", "Access forbidden", "Toegang geweigerd"]) {
  if (!classifyNonContentPage({ title, text: "Ga terug naar de homepage.", words: 300 })) problems.push(`page gate: "${title}" not recognised as refusal page`);
}
// Real pages about access stay content.
for (const title of ["Geen toegang tot zorg? Dit kunt u doen | Zorgportaal", "Toegang tot het stadion | Club", "Access control systems | Vendor", "No access fees for members"]) {
  if (classifyNonContentPage({ title, text: "Uitleg en informatie. ".repeat(60), words: 900 })) problems.push(`page gate: real page "${title}" rejected`);
}
for (const r of rows) console.log(`${r.host.padEnd(20)} ${String(r.status).padEnd(18)} http=${r.httpStatus} score=${r.score} check=${r.httpCheck}`);
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
