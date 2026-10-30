// End-to-end scan chain against a real PostgreSQL (30 Oct 2026, "RankFix kan niet
// scannen"): free scan (anonymous) and dashboard scan (logged in) of the same
// neutral site → score → stored scan → history list → full audit (history/[id]).
// Run: RF_REAL_DB=1 DATABASE_URL=postgres://… node --experimental-strip-types --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-scan-chain-pg.mjs
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { getDb } = await import(ROOT + "/lib/db.ts");
const { ensureDatabase } = await import(ROOT + "/lib/db-init.ts");
await ensureDatabase();
const db = getDb();
const words = (s, n = 25) => `<p>${(s + " ").repeat(n)}</p>`;
const page = (title, h1, body) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title}: advies en hulp voor ondernemers in de regio Utrecht."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://chain.test${title.startsWith("Contact") ? "/contact" : "/"}"></head><body><header><nav><a href="/diensten">Diensten</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a></nav></header><h1>${h1}</h1>${body}</body></html>`;
const SITE = {
  "/": page("Boekhoudkantoor Voorbeeld | Administratie en belastingadvies", "Administratie uit handen", words("Ons boekhoudkantoor verzorgt administratie, jaarrekeningen en belastingaangiften.") + "<p>Adres: Hoofdstraat 1, 1234 AB Utrecht. Telefoon 030 123 4567.</p>"),
  "/diensten": page("Diensten | Boekhoudkantoor Voorbeeld", "Diensten", words("Administratie, loonadministratie en belastingadvies.")),
  "/contact": page("Contact | Boekhoudkantoor Voorbeeld", "Contact", words("Bel of mail ons. Telefoon 030 123 4567.")),
  "/privacy": page("Privacy | Boekhoudkantoor Voorbeeld", "Privacy", words("Wij verwerken persoonsgegevens volgens de AVG.")),
};
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const body = u.host === "chain.test" ? SITE[u.pathname.replace(/\/$/, "") || "/"] : undefined;
  return body ? new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("nf", { status: 404 });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const history = await import(ROOT + "/app/api/history/route.ts");
const historyItem = await import(ROOT + "/app/api/history/[id]/route.ts");
const quiet = [console.info, console.warn, console.error]; const errors = [];
console.info = () => {}; console.warn = () => {}; console.error = (...a) => errors.push(a.map(String).join(" ").slice(0, 300));
const problems = []; const check = (c, m) => { if (!c) problems.push(m); };
const scan = async (body, ip) => { const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) })); return { status: res.status, j: await res.json().catch(() => ({})) }; };

// 1. Free scan (anonymous)
globalThis.__RF_USER = null;
const free = await scan({ url: "https://chain.test/", mode: "both", language: "nl" }, "198.51.100.7");
check(free.status === 200 && free.j.success === true, `free scan: HTTP ${free.status} ${free.j.code || ""} ${free.j.error || ""}`);
check(typeof free.j.overallScore === "number" && free.j.scoreModel?.headline?.display, "free scan: no score/headline");

// 2. Dashboard scan (logged in) → stored → history → full audit
const email = `chain-${Date.now()}@rankfix.test`;
const user = (await db.query("INSERT INTO users (email,password_hash,name,plan_code,customer_id) VALUES ($1,'x','QA','agency','RF-' || UPPER(REPLACE(gen_random_uuid()::text,'-',''))) RETURNING id,email", [email])).rows[0];
globalThis.__RF_USER = { id: user.id, email: user.email, plan_code: "agency" };
const dash = await scan({ url: "https://chain.test/", mode: "both", language: "nl", dashboard: true }, "198.51.100.8");
check(dash.status === 200 && dash.j.success === true, `dashboard scan: HTTP ${dash.status} ${dash.j.code || ""} ${dash.j.error || ""}`);
check(typeof dash.j.scanId === "string" && dash.j.scanId.length > 0, `dashboard scan: no scanId (${dash.j.scanId})`);
const list = await (await history.GET()).json();
const row = (list.scans || []).find((s) => s.id === dash.j.scanId);
check(Boolean(row), "history: stored scan not listed");
check(row && (row.score_display || row.overall_score != null), "history: no score");
if (dash.j.scanId) {
  const res = await historyItem.GET(new Request(`http://localhost/api/history/${dash.j.scanId}`), { params: Promise.resolve({ id: dash.j.scanId }) });
  const item = await res.json().catch(() => ({}));
  check(res.status === 200, `full audit: HTTP ${res.status} ${JSON.stringify(item).slice(0, 200)}`);
  const result = item.scan?.result || item.result || item.scan;
  check(Boolean(result?.seo?.checks?.length), "full audit: no checks in stored result");
}
[console.info, console.warn, console.error] = quiet;
console.log(JSON.stringify({ free: [free.status, free.j.code, free.j.overallScore], dash: [dash.status, dash.j.code, dash.j.scanId, dash.j.overallScore], historyRow: row ? { id: row.id, score: row.overall_score, display: row.score_display } : null, errors: errors.slice(0, 5) }));
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 2, failed: problems.length }));
process.exit(0);
