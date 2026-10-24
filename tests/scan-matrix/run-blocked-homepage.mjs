// QA 144 (24 Oct 2026): blocked homepage with an accessible subpage.
// Field case (diagnostic only, never a site rule): a webshop homepage refused
// RankFix while a directly entered category page was public. Neutral host.
//   1. Homepage entered → 422 HTTP_BLOCKED, incident keeps website 403 apart
//      from API 422, and the answer suggests another public start page.
//   2. Category page entered → report from that page; the homepage is
//      registered as blocked, only assessed pages count, scan is partial.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const HOST = "shopwall.test";
const nav = ["/schoenen/fitness", "/schoenen/hardlopen", "/over-ons", "/contact", "/", "/klantenservice/retour"].map((h, i) => `<a href="${h}">Link ${i}</a>`).join(" ");
const doc = ({ title, description, h1, body }) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="https://${HOST}${body.path}"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><header><nav>${nav}</nav></header><h1>${h1}</h1><main>${body.html}</main><footer><a href="/privacy">Privacy</a></footer></body></html>`;
const filler = (t) => `<p>${(t + " ").repeat(30)}</p>`;
const product = (n) => `<div class="product"><a href="/p/sportschoen-model-${n}-12345${n}">Sportschoen model ${n}</a><span class="price">€ ${49 + n},99</span><button>In winkelwagen</button></div>`;
const PAGES = {
  "/schoenen/fitness": doc({ title: "Fitness- en dansschoenen kopen | Shopwall", description: "Bekijk ons assortiment fitness- en dansschoenen voor dames en heren. Gratis verzending vanaf 25 euro.", h1: "Fitness- en dansschoenen", body: { path: "/schoenen/fitness", html: Array.from({ length: 8 }, (_, i) => product(i)).join("") + filler("Fitness- en dansschoenen voor elke training in onze webshop.") } }),
  "/schoenen/hardlopen": doc({ title: "Hardloopschoenen kopen | Shopwall", description: "Hardloopschoenen voor elke afstand en ondergrond. Bestel online en haal gratis af in de winkel.", h1: "Hardloopschoenen", body: { path: "/schoenen/hardlopen", html: Array.from({ length: 8 }, (_, i) => product(i + 10)).join("") + filler("Hardloopschoenen voor de weg, het bos en de baan.") } }),
  "/over-ons": doc({ title: "Over ons | Shopwall", description: "Shopwall is een sportwinkel met filialen en een webshop voor sportartikelen.", h1: "Over Shopwall", body: { path: "/over-ons", html: filler("Shopwall verkoopt sportartikelen in winkels en online.") } }),
  "/contact": doc({ title: "Contact | Shopwall", description: "Neem contact op met de klantenservice van Shopwall per telefoon of e-mail.", h1: "Contact", body: { path: "/contact", html: `<p>Bel 010 123 4567 of mail service@shopwall.test</p>` + filler("Onze klantenservice helpt je graag verder.") } }),
};
const CHALLENGE = `<!doctype html><html><head><title>Just a moment...</title></head><body><div id="challenge-platform">Checking your browser before accessing the site.</div></body></html>`;
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...extra } });
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (u.host.replace(/^www\./, "") !== HOST) return new Response("nf", { status: 404 });
  const path = u.pathname.replace(/\/$/, "") || "/";
  if (path === "/") return html(CHALLENGE, 403, { "cf-ray": "abc", server: "cloudflare" });
  if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  if (PAGES[path]) return html(PAGES[path]);
  return html("<html><head><title>Niet gevonden</title></head><body>404</body></html>", 404);
};
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url);
  const path = u.pathname.replace(/\/$/, "") || "/";
  // The browser receives the same challenge: RankFix never gets past it.
  if (path === "/") return { html: CHALLENGE, finalUrl: url, elapsedMs: 300, requests: 3, titlePixelWidth: 100, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
  throw new Error("RENDER_UNAVAILABLE_IN_TEST");
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
const rows = [];
const scan = async (url) => {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, mode: "both", language: "nl" }) }));
  return { res, j: await res.json() };
};

// 1. Homepage as start.
{
  const { res, j } = await scan(`https://${HOST}/`);
  rows.push({ start: "/", api: res.status, code: j.code, origin: j.incident?.originHttpStatus, attribution: j.incident?.attribution });
  if (res.status !== 422 || j.code !== "HTTP_BLOCKED") problems.push(`homepage: expected 422 HTTP_BLOCKED, got ${res.status} ${j.code}`);
  if (j.incident?.apiHttpStatus !== 422) problems.push(`homepage: incident.apiHttpStatus ${j.incident?.apiHttpStatus}`);
  if (j.incident?.originHttpStatus !== 403) problems.push(`homepage: incident.originHttpStatus ${j.incident?.originHttpStatus} (website answered 403)`);
  if (j.incident?.attribution !== "target_site") problems.push(`homepage: attribution ${j.incident?.attribution}`);
  if (!j.incident?.browserRender?.attempted || j.incident.browserRender.outcome === "recovered") problems.push(`homepage: browser attempt not recorded honestly ${JSON.stringify(j.incident?.browserRender)}`);
  if (!j.incident?.traceId || res.headers.get("x-rankfix-trace-id") !== j.incident.traceId) problems.push("homepage: trace id missing or not in header");
  if (!j.alternativeStart?.possible) problems.push("homepage: no alternative-start advice");
  if (j.overallScore != null) problems.push("homepage: a score was produced for a blocked page");
}

// 2. Accessible category page as start.
{
  const { res, j } = await scan(`https://${HOST}/schoenen/fitness`);
  const sa = j.multiPage?.siteAccess;
  rows.push({ start: "/schoenen/fitness", api: res.status, homepage: sa?.homepage?.access, coverage: sa?.scanCoverage, pages: sa?.pages });
  if (res.status !== 200) problems.push(`subpage: expected a report, got ${res.status} ${j.code}`);
  else {
    if (!sa) problems.push("subpage: no siteAccess block");
    else {
      if (sa.startIsHomepage) problems.push("subpage: start page marked as homepage");
      if (sa.homepage.access !== "blocked") problems.push(`subpage: homepage access ${sa.homepage.access}, expected blocked`);
      if (sa.homepage.httpStatus !== 403) problems.push(`subpage: homepage status ${sa.homepage.httpStatus}`);
      if (sa.scanCoverage !== "partial") problems.push(`subpage: coverage ${sa.scanCoverage}, expected partial`);
      if (sa.pages.assessed < 3) problems.push(`subpage: only ${sa.pages.assessed} pages assessed (other public pages should be reached)`);
      if (sa.pages.refused < 1) problems.push("subpage: refused homepage not counted");
      if (!/gedeeltelijk rapport/.test(sa.note) || !/niet dat de hele website toegankelijk/.test(sa.note)) problems.push(`subpage: note does not qualify coverage: ${sa.note}`);
    }
    const home = (j.multiPage?.pageAudits || []).find((p) => (new URL(p.url).pathname.replace(/\/$/, "") || "/") === "/");
    if (home && (home.status === "audited" || home.score != null)) problems.push(`subpage: blocked homepage was scored (${home.status}, ${home.score})`);
    if (j.finalUrl && new URL(j.finalUrl).pathname.replace(/\/$/, "") !== "/schoenen/fitness") problems.push(`subpage: final URL changed to ${j.finalUrl}`);
  }
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
