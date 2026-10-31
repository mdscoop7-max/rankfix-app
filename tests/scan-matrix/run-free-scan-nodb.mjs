// Local laptop check without DATABASE_URL (30 Oct 2026): an anonymous free scan
// must complete in development (score + headline, not stored); a dashboard scan
// must still refuse with a clear code. Real db/auth modules (RF_REAL_DB=1), no DB.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
delete process.env.DATABASE_URL; delete process.env.VERCEL;
const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Voorbeeld | Advies</title><meta name="description" content="Advies voor ondernemers in de regio, met administratie en belastingaangifte."></head><body><h1>Advies</h1><p>${"Wij adviseren ondernemers over administratie. ".repeat(30)}</p></body></html>`;
globalThis.fetch = async (input) => { const u = new URL(typeof input === "string" ? input : input.url); return u.host === "nodb.test" && u.pathname === "/" ? new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("nf", { status: 404 }); };
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {}; console.error = () => {};
const scan = async (body) => { const r = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) })); return { s: r.status, j: await r.json() }; };
const problems = [];
const free = await scan({ url: "https://nodb.test/", mode: "both", language: "nl" });
if (free.s !== 200 || typeof free.j.overallScore !== "number" || free.j.scanId) problems.push(`free: ${free.s} ${free.j.code} scanId=${free.j.scanId}`);
const dash = await scan({ url: "https://nodb.test/", mode: "both", language: "nl", dashboard: true });
if (dash.s === 200) problems.push("dashboard scan succeeded without a database");
console.log(JSON.stringify({ free: [free.s, free.j.overallScore, free.j.scoreModel?.headline?.display], dash: [dash.s, dash.j.code] }));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 2, failed: problems.length }));
process.exit(0);
