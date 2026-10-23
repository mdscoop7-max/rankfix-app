// Integration test with a REAL PostgreSQL database (DATABASE_URL): runs the real
// scan route through module hooks (no network, stub user) and checks that every
// attempt lands in scan_attempts with the right outcome, code and category,
// including an upgrade from the first scan_attempts schema.
// Run: RF_REAL_DB=1 DATABASE_URL=postgres://... node --experimental-strip-types --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-attempts-pg.mjs
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { getDb } = await import(ROOT + "/lib/db.ts");
const db = getDb();
const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

// 1. Start from the FIRST version of the table (as deployed earlier on the preview).
// A database left by an earlier deployment has no fingerprint of the current schema,
// so the full migration runs once and upgrades the table in place.
await db.query("DROP TABLE IF EXISTS rankfix_schema_versions");
await db.query("DROP TABLE IF EXISTS scan_attempts");
await db.query(`CREATE TABLE IF NOT EXISTS scan_attempts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, requested_url TEXT NOT NULL, http_status INTEGER NOT NULL, outcome TEXT NOT NULL, error TEXT, duration_ms INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
const { ensureDatabase } = await import(ROOT + "/lib/db-init.ts");
await ensureDatabase();
const cols = (await db.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='scan_attempts'")).rows;
for (const c of ["category", "error_code", "final_url", "scan_id", "finished_at"]) check(cols.some((r) => r.column_name === c), `column ${c} missing after upgrade`);
check(cols.find((r) => r.column_name === "http_status")?.is_nullable === "YES", "http_status still NOT NULL");

// 2. A test user.
const email = `attempts-${Date.now()}@rankfix.test`;
const user = (await db.query("INSERT INTO users (email, password_hash, name, plan_code, customer_id) VALUES ($1,'x','QA','agency','RF-' || UPPER(REPLACE(gen_random_uuid()::text,'-',''))) RETURNING id", [email])).rows[0];
globalThis.__RF_USER = { id: user.id, email };
await db.query("DELETE FROM scan_attempts WHERE user_id=$1", [user.id]);

// 3. Controlled websites.
const page = (title) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} – informatie over onze diensten en contact."><link rel="canonical" href="https://ok.test/"></head><body><h1>${title}</h1><p>${"Wij helpen klanten met advies en diensten. ".repeat(40)}</p><a href="/contact">Contact</a></body></html>`;
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const html = (b, st = 200, h = {}) => new Response(b, { status: st, headers: { "content-type": "text/html; charset=utf-8", ...h } });
  if (u.host === "ok.test") return u.pathname === "/" ? html(page("Adviesbureau Test")) : html(page("Contact"), u.pathname === "/robots.txt" ? 404 : 200);
  if (u.host === "missing.test") return html("not found", 404);
  if (u.host === "blocked.test") return html("<html><head><title>Access denied</title></head><body>Access denied</body></html>", 403);
  if (u.host === "slow.test") { const e = new Error("This operation was aborted"); e.name = "AbortError"; throw e; }
  // Consent redirect loop that only ends when the cookie is sent back.
  if (u.host === "cookie.test") {
    const cookie = new Headers(init?.headers || {}).get("cookie") || "";
    return u.pathname === "/" && !/consent=1/.test(cookie) ? new Response("", { status: 302, headers: { location: "https://cookie.test/", "set-cookie": "consent=1; Path=/" } }) : html(page("Cookie Test"));
  }
  return html("nf", 404);
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };

const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const quiet = () => { const s = [console.info, console.warn, console.log, console.error]; console.info = console.warn = console.error = () => {}; return () => { [console.info, console.warn, console.log, console.error] = s; }; };
const run = async (url) => { const restore = quiet(); try { const r = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, mode: "both", language: "nl", dashboard: true }) })); return { status: r.status, body: await r.json() }; } finally { restore(); } };

const cases = [
  { url: "https://ok.test/", status: 200, outcome: "success", category: "success" },
  { url: "https://missing.test/", status: 422, outcome: "failed", category: "site_unavailable", code: "HTTP_NOT_FOUND" },
  { url: "https://blocked.test/", status: 422, outcome: "failed", category: "site_blocked", code: "HTTP_BLOCKED" },
  { url: "https://slow.test/", status: 502, outcome: "failed", category: "network", code: "FETCH_TIMEOUT" },
  { url: "nonsense url with spaces", status: 400, outcome: "failed", category: "input" },
];
for (const c of cases) {
  const r = await run(c.url);
  check(r.status === c.status, `${c.url}: HTTP ${r.status} (expected ${c.status}) ${JSON.stringify(r.body).slice(0, 200)}`);
}
// The cookie redirect site: the engine must reach the page (cookie jar), whatever its score.
const cookieRun = await run("https://cookie.test/");
check(cookieRun.status === 200, `cookie redirect site: HTTP ${cookieRun.status} ${JSON.stringify(cookieRun.body).slice(0, 160)}`);

const rows = (await db.query("SELECT requested_url, http_status, outcome, category, error_code, final_url, scan_id, finished_at, duration_ms FROM scan_attempts WHERE user_id=$1 ORDER BY created_at", [user.id])).rows;
check(rows.length === cases.length + 1, `attempt rows ${rows.length} != ${cases.length + 1}`);
for (const c of cases) {
  const row = rows.find((r) => r.requested_url === c.url);
  if (!row) { problems.push(`no attempt row for ${c.url}`); continue; }
  check(row.outcome === c.outcome, `${c.url}: outcome ${row.outcome}`);
  check(row.category === c.category, `${c.url}: category ${row.category} (expected ${c.category})`);
  if (c.code) check(row.error_code === c.code, `${c.url}: error_code ${row.error_code} (expected ${c.code})`);
  check(row.finished_at !== null && row.duration_ms !== null, `${c.url}: not finished`);
}
const okRow = rows.find((r) => r.requested_url === "https://ok.test/");
check(okRow?.scan_id && okRow?.final_url, "success attempt lacks scan_id/final_url");
if (okRow?.scan_id) check((await db.query("SELECT 1 FROM scans WHERE id=$1", [okRow.scan_id])).rows.length === 1, "scan_id does not point to the stored scan");

await db.query("DELETE FROM scans WHERE user_id=$1", [user.id]);
await db.query("DELETE FROM users WHERE id=$1", [user.id]);
for (const p of problems) console.log(" - " + p);
console.log(`${rows.length} attempts recorded; ${problems.length} problems`);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: cases.length + 1, failed: problems.length }));
await db.end?.();
process.exit(0);
