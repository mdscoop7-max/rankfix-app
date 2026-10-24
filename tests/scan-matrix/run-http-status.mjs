// HTTP status handling for the scanned page, sampled pages and internal links:
// 200, 403, 404, 410, 429, 500 and a "soft 404" (HTTP 200 with a not-found page).
// Neutral hosts; no site rules. Rules:
//  - homepage 404/410/500/429/403 (no browser): no SEO/GEO score, a reason per status
//    in the scan language.
//  - homepage soft 404: no score.
//  - sampled 404 page: not "audited"; says the page does not exist.
//  - internal links: 404/410 and soft 404 are missing pages (with URL + action);
//    a 5xx is a server error, not a missing page; 401/403/429 and network errors
//    are unconfirmed, never silently "passed"; account/login links are skipped.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const html = ({ title, description = "", h1 = [], body = "", lang = "nl" }) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>${description ? `<meta name="description" content="${description}">` : ""}<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="/"></head><body>${h1.map((h) => `<h1>${h}</h1>`).join("")}<main>${body}</main><footer><a href="/privacy">Privacy</a></footer></body></html>`;
const filler = (t) => `<p>${(t + " ").repeat(25)}</p>`;
const page = (t) => html({ title: `${t} | Werkplaats`, description: `${t} van de werkplaats.`, h1: [t], body: filler(`${t}: informatie en contact.`) });
const notFound = html({ title: "Pagina niet gevonden | Werkplaats", body: "<p>Deze pagina bestaat niet (meer). Ga terug naar de homepage.</p>" });
const LINKS = { "/diensten": 200, "/contact": 200, "/over-ons": 200, "/weg": 404, "/oud": 410, "/storing": 500, "/prive": 403, "/druk": 429, "/verdwenen": "soft404", "/account/login": 403 };
const homeBody = Object.keys(LINKS).map((p) => `<a href="${p}">${p.slice(1)}</a>`).join(" ") + filler("Wij repareren en onderhouden fietsen in de regio.");
const respond = (status, body) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...(status === 429 ? { "retry-after": "0" } : {}) } });
const SITES = {
  "linksite.test": (path) => {
    if (path === "/") return respond(200, html({ title: "Werkplaats | Fietsenmaker in de regio", description: "Fietsenmaker voor reparatie en onderhoud van fietsen.", h1: ["Fietsenmaker"], body: homeBody }));
    const s = LINKS[path];
    if (s === "soft404") return respond(200, notFound);
    if (s === 200 || path === "/privacy") return respond(200, page(path.slice(1)));
    if (typeof s === "number") return respond(s, s === 404 || s === 410 ? notFound : `<html><head><title>Error ${s}</title></head><body>Error ${s}</body></html>`);
    return respond(404, notFound);
  },
  "home404.test": () => respond(404, notFound),
  "home410.test": () => respond(410, notFound),
  "home500.test": () => respond(500, "<html><head><title>Internal Server Error</title></head><body>Internal Server Error</body></html>"),
  "home429.test": () => respond(429, "<html><body>Too Many Requests</body></html>"),
  "home403.test": () => respond(403, "<html><head><title>403 Forbidden</title></head><body>Forbidden</body></html>"),
  "homesoft404.test": () => respond(200, notFound),
};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const site = SITES[u.host.replace(/^www\./, "")];
  if (!site) return new Response("nf", { status: 404 });
  return site(u.pathname.replace(/\/$/, "") || "/");
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const scan = async (host, language = "nl") => {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language }) }));
  return { res, j: await res.json() };
};
const problems = [];
const rows = [];
// Homepage statuses: never a score, a reason per status, in each language.
const HOME = { "home404.test": ["HTTP_NOT_FOUND", /bestaat niet|404/i, /does not exist|not found/i], "home410.test": ["HTTP_NOT_FOUND", /bestaat niet|410/i, /does not exist|no longer exists/i], "home500.test": ["HTTP_SERVER_ERROR", /serverfout/i, /server error/i], "home429.test": ["SITE_RATE_LIMITED", /./, /./], "home403.test": ["HTTP_BLOCKED", /./, /./], "homesoft404.test": [null, /./, /./] };
for (const [host, [code, nlText, enText]] of Object.entries(HOME)) {
  for (const language of ["nl", "en", "de"]) {
    const { res, j } = await scan(host, language);
    rows.push({ host, language, http: res.status, code: j.code, score: j.overallScore ?? null, error: String(j.error || "").slice(0, 90) });
    if (res.status === 200 || typeof j.overallScore === "number") problems.push(`${host} [${language}]: scored ${j.overallScore} (HTTP ${res.status})`);
    if (code && j.code !== code) problems.push(`${host} [${language}]: code ${j.code}, expected ${code}`);
    if (language === "nl" && !nlText.test(j.error || "")) problems.push(`${host} [nl]: message "${j.error}"`);
    if (language === "en" && !enText.test(j.error || "")) problems.push(`${host} [en]: message "${j.error}"`);
    // Non-Dutch messages name the status-specific cause, not one generic sentence.
    if (language === "de" && ["home404.test", "home500.test"].includes(host) && /kann nicht zuverlässig analysiert werden/.test(j.error || "")) problems.push(`${host} [de]: generic message "${j.error}"`);
  }
}
// Internal links and sampled pages on a working site.
{
  const { res, j } = await scan("linksite.test");
  const bl = [...(j.seo?.checks || [])].find((c) => c.key === "broken_links");
  rows.push({ host: "linksite.test", http: res.status, code: j.code, score: j.overallScore, brokenLinks: bl ? `${bl.status}: ${bl.message}` : null });
  if (res.status !== 200) problems.push(`linksite.test: HTTP ${res.status} ${j.code}`);
  else {
    if (!bl || bl.status !== "warning") problems.push(`linksite.test: broken_links ${bl?.status}, expected warning`);
    const m = bl?.message || "";
    for (const p of ["/weg", "/oud", "/verdwenen"]) if (!m.includes(p)) problems.push(`linksite.test: missing page ${p} not named in "${m}"`);
    if (!/storing[^·]*500|500[^·]*storing/i.test(m) || !/serverfout/i.test(m)) problems.push(`linksite.test: server error /storing not reported as server error: "${m}"`);
    if (!/(prive|druk)/.test(m) || !/niet te bevestigen/i.test(m)) problems.push(`linksite.test: 403/429 links not reported as unconfirmed: "${m}"`);
    if (/account\/login/.test(m)) problems.push(`linksite.test: login link reported: "${m}"`);
    if (!/(herstel|redirect)/i.test(bl?.fix || "")) problems.push(`linksite.test: no action in fix "${bl?.fix}"`);
    // Referring page named in message, action and structured evidence.
    if (!m.includes("op https://linksite.test/")) problems.push(`linksite.test: referring page not named in "${m}"`);
    if (!(bl?.fix || "").includes("op https://linksite.test/")) problems.push(`linksite.test: referring page not in action "${bl?.fix}"`);
    const weg = (bl?.links || []).find((l) => l.url.endsWith("/weg"));
    if (!weg || weg.httpStatus !== 404 || weg.outcome !== "missing" || weg.referringPage !== "https://linksite.test/") problems.push(`linksite.test: structured link evidence ${JSON.stringify(weg)}`);
    const soft = (bl?.links || []).find((l) => l.url.endsWith("/verdwenen"));
    if (!soft || soft.httpStatus !== 200 || !soft.softNotFound || soft.outcome !== "missing") problems.push(`linksite.test: soft 404 evidence ${JSON.stringify(soft)}`);
    if ((bl?.links || []).some((l) => l.url.includes("/account/"))) problems.push("linksite.test: skipped login link in evidence list");
    // Sampled pages: a 404 sample is not an assessed content page.
    for (const audit of j.multiPage?.pageAudits || []) {
      const path = new URL(audit.url).pathname.replace(/\/$/, "");
      if ([404, 410, 500, 429].includes(audit.httpStatus) && audit.status === "audited") problems.push(`linksite.test: sample ${path} (HTTP ${audit.httpStatus}) scored as audited`);
      if (audit.httpStatus === 404 && !/bestaat niet/i.test(audit.evidenceChecks?.[0]?.details || "")) problems.push(`linksite.test: sample ${path} 404 says "${audit.evidenceChecks?.[0]?.details}"`);
      if (path === "/verdwenen" && audit.status === "audited") problems.push("linksite.test: soft-404 sample scored as audited");
    }
  }
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length }));
process.exit(0);
