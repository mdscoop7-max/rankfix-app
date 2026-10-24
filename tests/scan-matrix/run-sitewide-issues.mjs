// QA 144 (24 Oct 2026): "Verbeterpunten (0)" while sampled subpages had proven
// problems. Neutral host reproducing the pattern (no site rules):
//   /job-alert and /privacy: empty meta description (server HTML has title + H1)
//   /veelgestelde-vragen: no H1
//   /overview/categories: no title, description or H1 in server HTML at all
//     (may be client-rendered) → listed, but "to be confirmed"
// Expect: every point listed with URL, check, evidence and fix; the entered
// page's score unchanged by them; a caution next to a high score.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const HOST = "werkplek.test";
const links = ["/job-alert", "/privacy", "/veelgestelde-vragen", "/overview/categories", "/over-ons", "/contact"];
const nav = links.map((h) => `<a href="${h}">${h.slice(1)}</a>`).join(" ");
const page = ({ title = "", description = null, h1 = "", body = "" }) => `<!doctype html><html lang="nl"><head><meta charset="utf-8">${title ? `<title>${title}</title>` : ""}${description !== null ? `<meta name="description" content="${description}">` : ""}<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="__URL__"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Werkplek","url":"https://${HOST}/"}</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Werkplek","url":"https://${HOST}/"}</script><meta property="og:title" content="${title || "Werkplek"}"><meta property="og:description" content="Werkplek"><meta property="og:image" content="https://${HOST}/og.jpg"><meta name="twitter:card" content="summary"></head><body><header><nav>${nav}</nav></header>${h1 ? `<h1>${h1}</h1>` : ""}<main>${body || `<p>${"Informatie over werken, teams en vacatures bij Werkplek in Nederland. ".repeat(25)}</p>`}</main><footer>Werkplek B.V. · KvK 87654321 · Stationsplein 1, 3511 ED Utrecht · 030 123 4567 · info@werkplek.test</footer></body></html>`;
const PAGES = {
  "/": page({ title: "Werkplek | Kantoorruimte en flexplekken in Utrecht", description: "Werkplek verhuurt kantoorruimte, flexplekken en vergaderzalen in Utrecht. Bekijk beschikbaarheid en prijzen en plan een bezichtiging.", h1: "Kantoorruimte en flexplekken in Utrecht" }),
  "/job-alert": page({ title: "Job alert | Werkplek", description: "", h1: "Job alert" }),
  "/privacy": page({ title: "Privacy | Werkplek", description: "", h1: "Privacyverklaring" }),
  "/veelgestelde-vragen": page({ title: "Veelgestelde vragen | Werkplek", description: "Antwoorden op veelgestelde vragen over huren, flexplekken en vergaderzalen bij Werkplek.", h1: "" }),
  "/overview/categories": page({ title: "", description: null, h1: "", body: `<p>${"Categorieën en overzicht van ruimtes. ".repeat(30)}</p>` }),
  "/over-ons": page({ title: "Over ons | Werkplek", description: "Werkplek is een Utrechtse aanbieder van flexibele kantoorruimte voor zzp'ers en teams.", h1: "Over Werkplek" }),
  "/contact": page({ title: "Contact | Werkplek", description: "Neem contact op met Werkplek voor een bezichtiging of offerte voor kantoorruimte.", h1: "Contact" }),
};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (u.host.replace(/^www\./, "") !== HOST) return new Response("nf", { status: 404 });
  const html = PAGES[u.pathname.replace(/\/$/, "") || "/"];
  if (!html) return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
  return new Response(html.replaceAll("__URL__", u.origin + u.pathname), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const problems = [];
const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${HOST}/`, mode: "both", language: "nl" }) }));
const j = await res.json();
const issues = j.multiPage?.sitewideIssues || [];
const find = (path, check) => issues.find((i) => new URL(i.url).pathname.replace(/\/$/, "") === path && i.check === check);
const row = { status: res.status, score: j.overallScore, pageIssues: j.summary?.issues, sitewide: j.summary?.sitewideIssues, toConfirm: j.summary?.sitewideIssuesToConfirm, caution: j.scoreModel?.scope?.caution || null, issues: issues.map((i) => `${new URL(i.url).pathname} ${i.check} ${i.certainty}`) };
if (res.status !== 200) problems.push(`HTTP ${res.status} ${j.code}`);
else {
  for (const [path, check] of [["/job-alert", "description"], ["/privacy", "description"], ["/veelgestelde-vragen", "h1"]]) {
    const i = find(path, check);
    if (!i) problems.push(`missing sitewide issue ${path} ${check}`);
    else {
      if (i.certainty !== "confirmed") problems.push(`${path} ${check}: certainty ${i.certainty}`);
      if (!i.evidence || !i.recommendation || !i.checkLabel || !i.severity) problems.push(`${path} ${check}: incomplete issue ${JSON.stringify(i)}`);
    }
  }
  const cat = issues.filter((i) => new URL(i.url).pathname === "/overview/categories");
  if (!cat.length) problems.push("/overview/categories: not listed at all");
  else if (cat.some((i) => i.certainty !== "needs_render_confirmation")) problems.push("/overview/categories: absence from raw HTML presented as confirmed");
  if (issues.some((i) => new URL(i.url).pathname === "/")) problems.push("entered page duplicated in sitewide list");
  if ((j.summary?.sitewideIssues || 0) < 3) problems.push(`summary.sitewideIssues ${j.summary?.sitewideIssues}`);
  const scope = j.scoreModel?.scope;
  if (!scope) problems.push("no scoreModel.scope");
  else {
    if (scope.scoreAppliesTo !== "start_page") problems.push("scope does not say the score is for the entered page");
    if (scope.otherPages.issuesConfirmed < 3) problems.push(`scope.otherPages.issuesConfirmed ${scope.otherPages.issuesConfirmed}`);
    if (j.overallScore >= 90 && !scope.caution) problems.push(`score ${j.overallScore} without caution although other pages have issues`);
    if (scope.range && scope.range.statisticalInterval !== false) problems.push("range presented as statistical interval");
  }
}
console.log(JSON.stringify(row, null, 1));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 1, failed: problems.length, rows: [row] }));
process.exit(0);
