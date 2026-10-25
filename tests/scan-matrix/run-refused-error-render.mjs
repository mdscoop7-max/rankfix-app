// QA 144 round 2 (TestLab @ 290f692c, 25 Oct): a bank homepage answered RankFix
// with HTTP 403; the bounded browser visit received the site's own error template
// ("Sorry, er gaat iets niet goed…", 41 words, no internal links). It was accepted
// as "browser recovered" and scored 66/100. Neutral hosts, no site rules.
//   errorpage.test   403 + error template in NL present tense  -> 422 HTTP_BLOCKED, no score
//   shortpage.test   403 + short page without error wording and without own links -> report,
//                    flagged "zonder eigen navigatie" with a score caution (real homepages
//                    can render without links: engine-3.5 airline field case)
//   botwall2.test    403 + real page with navigation            -> report (browser recovery)
//   shortnav.test    403 + short real page WITH own navigation  -> report
// Plus page-gate unit cases for the new multilingual error wording.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const nav = (n) => Array.from({ length: n }, (_, i) => `<a href="/sectie-${i}">Sectie ${i}</a>`).join(" ");
const page = ({ title, h1, body, links = 0, description = "" }) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title>${description ? `<meta name="description" content="${description}">` : ""}</head><body><header>${nav(links)}</header><h1>${h1}</h1><main>${body}</main></body></html>`;
const words = (n, w = "tekst") => `<p>${Array.from({ length: n }, () => w).join(" ")}</p>`;
const ERROR = page({ title: "Sorry, er gaat iets niet goed…", h1: "Sorry, er gaat iets niet goed…", body: words(30, "Probeer het later nog eens of ga terug naar de vorige pagina") + `<a href="tel:0880000000">Bel ons</a>` });
const SHORT_NO_LINKS = page({ title: "Welkom", h1: "Welkom", body: words(60, "Informatie") });
const REAL = page({ title: "Bank Twee | Betalen, sparen en lenen", description: "Betalen, sparen, lenen en hypotheek bij Bank Twee.", h1: "Welkom bij Bank Twee", links: 30, body: words(300, "Betalen sparen lenen hypotheek verzekeren") });
const SHORT_WITH_NAV = page({ title: "Atelier Drie | Meubelmakerij", description: "Atelier Drie maakt meubels op maat.", h1: "Meubels op maat", links: 6, body: words(70, "Meubels maatwerk hout") });
// Field classes from the QA databases (25 Oct): "maintenance" 112 words 0 own links
// (scored 68); a brand-only interstitial with 173 words and 0 own links (scored 80).
const MAINT = page({ title: "maintenance", h1: "We'll be back soon", body: words(11, "Our website is temporarily unavailable please come back later") + `<a href="https://status.elders.example/">status</a>` });
const INTERSTITIAL = page({ title: "Merk", h1: "Even geduld", body: words(170, "Kies je land en taal om verder te gaan") + `<a href="https://elders.example/nl">NL</a><a href="https://elders.example/be">BE</a>` });
// Real small sites behind a refusal must still recover: a one-page site with
// in-page section navigation, and a short site with three own pages.
const ONEPAGE = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Bakkerij Vier | Ambachtelijk brood</title><meta name="description" content="Ambachtelijke bakkerij in Utrecht."></head><body><nav><a href="#brood">Brood</a> <a href="#gebak">Gebak</a> <a href="#contact">Contact</a></nav><h1>Bakkerij Vier</h1><section id="brood">${words(40, "Vers brood elke ochtend")}</section><section id="gebak">${words(30, "Taarten en gebak")}</section><section id="contact"><a href="tel:0301234567">Bel</a> Dorpsstraat 1</section></body></html>`;
const SMALL3 = page({ title: "Kapsalon Vijf | Knippen en kleuren", description: "Kapsalon in Zwolle.", h1: "Kapsalon Vijf", links: 3, body: words(55, "Knippen kleuren afspraak") });
const SITES = { "errorpage.test": ERROR, "shortpage.test": SHORT_NO_LINKS, "botwall2.test": REAL, "shortnav.test": SHORT_WITH_NAV, "maint.test": MAINT, "interstitial.test": INTERSTITIAL, "onepage.test": ONEPAGE, "small3.test": SMALL3 };
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (!SITES[u.host]) return new Response("nf", { status: 404 });
  if (u.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
  return new Response("<html><head><title>Forbidden</title></head><body>Forbidden</body></html>", { status: 403, headers: { "content-type": "text/html" } });
};
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url);
  const html = SITES[u.host];
  if (!html || u.pathname !== "/") throw new Error("RENDER_UNAVAILABLE_IN_TEST");
  return { html, finalUrl: url, elapsedMs: 900, requests: 8, titlePixelWidth: 200, domAccessibility: { controls: 0, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
};
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const { classifyNonContentPage } = await import(ROOT + "/lib/page-gate.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
const rows = [];
// "flag": accepted, but reported as a recovery without own navigation + caution.
for (const [host, expectReport] of [["errorpage.test", false], ["maint.test", false], ["shortpage.test", "flag"], ["interstitial.test", "flag"], ["botwall2.test", true], ["shortnav.test", true], ["onepage.test", true], ["small3.test", true]]) {
  const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${host}/`, mode: "both", language: "nl" }) }));
  const j = await res.json();
  rows.push({ host, status: res.status, code: j.code || null, score: j.overallScore ?? null, origin: j.incident?.originHttpStatus ?? j.recovery?.originalHttpStatus ?? null, browser: j.incident?.browserRender?.outcome || (j.recovery?.browserRecovered ? "recovered" : null) });
  if (expectReport) {
    if (res.status !== 200) problems.push(`${host}: expected a report via browser recovery, got ${res.status} ${j.code}`);
    else if (!j.access?.rankfixBlocked) problems.push(`${host}: report does not say RankFix was refused`);
    else if (expectReport === "flag" && (!j.access?.recoveryWithoutNavigation || !/zonder eigen navigatie/.test(j.scoreModel?.scope?.caution || ""))) problems.push(`${host}: recovery without navigation not flagged (${j.access?.recoveredOwnLinks} links, caution ${j.scoreModel?.scope?.caution})`);
    else if (expectReport === true && j.access?.recoveryWithoutNavigation) problems.push(`${host}: real site with navigation flagged as without navigation`);
  } else {
    if (res.status === 200) problems.push(`${host}: error/unproven page scored ${j.overallScore}`);
    if (res.status !== 422 || !["HTTP_BLOCKED", "CHALLENGE_OR_INTERSTITIAL"].includes(j.code)) problems.push(`${host}: expected 422 HTTP_BLOCKED, got ${res.status} ${j.code}`);
    if (j.incident?.originHttpStatus !== 403) problems.push(`${host}: incident origin ${j.incident?.originHttpStatus}`);
    if (j.incident?.browserRender?.outcome === "recovered") problems.push(`${host}: browser outcome reported as recovered`);
  }
}
for (const title of ["Sorry, er gaat iets niet goed…", "Er ging iets mis", "Oeps, er is iets niet goed gegaan", "Something is going wrong", "Da ist etwas schiefgegangen", "Une erreur est survenue", "Qualcosa è andato storto", "Algo salió mal", "Algo correu mal"]) {
  if (classifyNonContentPage({ title, text: "Probeer het later opnieuw.", words: 40 })?.kind !== "error") problems.push(`page gate: "${title}" not recognised as error page`);
}
for (const title of ["maintenance", "Onderhoud"]) if (classifyNonContentPage({ title, text: "Kom later terug.", words: 100 })?.kind !== "maintenance") problems.push(`page gate: "${title}" not recognised as maintenance page`);
// Real content about errors or maintenance stays content: short local-trade pages
// whose title asks a question or names the trade's own service.
for (const title of ["Er gaat iets mis met je cv-ketel? | Loodgieter Jansen", "Er ging iets mis met mijn bestelling - Klantenservice", "Something went wrong with your car? We fix it | Garage", "Onderhoud | Garage Jansen", "Onderhoud aan uw cv-ketel | Installateur", "Wartung - Autohaus Müller"]) {
  if (classifyNonContentPage({ title, text: "Bel ons voor een afspraak. ".repeat(10), words: 80 })) problems.push(`page gate: short real page "${title}" rejected`);
}
// Real content about errors stays content (long page, article context).
for (const title of ["Wat te doen als er iets mis gaat met je betaling | Bank", "Something went wrong with your order? Here is how returns work"]) {
  if (classifyNonContentPage({ title, text: "Uitleg en stappen. ".repeat(250), words: 800 })) problems.push(`page gate: long help page "${title}" rejected`);
}
for (const r of rows) console.log(JSON.stringify(r));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: rows.length, failed: problems.length, rows }));
process.exit(0);
