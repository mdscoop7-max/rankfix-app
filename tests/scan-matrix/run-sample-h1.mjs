// Sampled-page H1 (30 Oct 2026, nu.nl audit): a missing H1 in server HTML is a
// warning only when the page could not add one with JavaScript. Neutral host.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const p = (title, h1, scripts, body) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} — nieuws en achtergronden uit binnen- en buitenland."><link rel="canonical" href="/">${scripts}</head><body>${h1 ? `<h1>${h1}</h1>` : ""}<p>${(body + " ").repeat(40)}</p><a href="/algemeen">Algemeen</a> <a href="/statisch">Statisch</a></body></html>`;
const js = Array.from({ length: 4 }, (_, i) => `<script src="/app-${i}.js"></script>`).join("");
const S = { "/": p("Nieuws Voorbeeld | Het laatste nieuws", "Het laatste nieuws", js, "Nieuws van vandaag."), "/algemeen": p("Algemeen | Nieuws Voorbeeld", "", js, "Algemeen nieuws."), "/statisch": p("Statisch | Nieuws Voorbeeld", "", "", "Statische pagina.") };
globalThis.fetch = async (i) => { const u = new URL(typeof i === "string" ? i : i.url); const b = u.host === "h1.test" ? S[u.pathname.replace(/\/$/, "") || "/"] : undefined; return b ? new Response(b, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const j = await (await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://h1.test/", mode: "both", language: "nl" }) }))).json();
const h1Of = (path) => (j.multiPage?.pageAudits || []).find((x) => new URL(x.url).pathname === path)?.evidenceChecks?.find((e) => e.key === "h1");
const problems = [];
if (h1Of("/algemeen")?.status !== "UNABLE_TO_CONFIRM") problems.push(`/algemeen (scripts, not rendered): ${JSON.stringify(h1Of("/algemeen"))}`);
if (h1Of("/statisch")?.status !== "WARNING") problems.push(`/statisch (no scripts): ${JSON.stringify(h1Of("/statisch"))}`);
for (const x of problems) console.log(" - " + x);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 2, failed: problems.length }));
process.exit(0);
