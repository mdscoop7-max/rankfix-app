// QA #186 (check 3): a logged-in scan of a page full of emoji and a NUL character
// must be stored in the REAL PostgreSQL scans table. The engine cuts text with
// fixed-length slices; before the jsonb guard a slice through an emoji left a lone
// UTF-16 surrogate and PostgreSQL rejected the whole report (SCAN_HISTORY_SAVE_FAILED).
// Run: RF_REAL_DB=1 DATABASE_URL=postgres://... node --experimental-strip-types --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-save-pg.mjs
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { getDb } = await import(ROOT + "/lib/db.ts");
const { ensureDatabase } = await import(ROOT + "/lib/db-init.ts");
const db = getDb();
await ensureDatabase();
const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

const email = `save-${Date.now()}@rankfix.test`;
const user = (await db.query("INSERT INTO users (email, password_hash, name, plan_code, customer_id) VALUES ($1,'x','QA','agency','RF-' || UPPER(REPLACE(gen_random_uuid()::text,'-',''))) RETURNING id", [email])).rows[0];
globalThis.__RF_USER = { id: user.id, email };

// Emoji at every position, so that every fixed-length slice (title, description,
// identity text, evidence details) cuts at least one of them in half; plus a NUL.
const promo = "🎃👻🧛 Halloween ".repeat(3);
const emojiText = Array.from({ length: 400 }, (_, i) => `${"x".repeat(i % 7)}🍬 Snoep ${i} 🍫`).join(" ");
const title = `${promo}Supermarkt online boodschappen 🎃 | Winkel`;
const html = (path) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}${path === "/" ? "" : " " + path}</title><meta name="description" content="${promo.repeat(4)} Boodschappen online bestellen met korting 🎃🎃🎃"><link rel="canonical" href="https://emoji.test${path}"></head><body><h1>${promo} aanbiedingen</h1><p>${emojiText}\u0000</p><div class="product-card">Snoep 🍬 <span>€ 2,99</span><form action="/cart/add" method="post"><button>In winkelwagen</button></form></div><a href="/aanbiedingen">Aanbiedingen 🎃</a> <a href="/contact">Contact 👻</a></body></html>`;
// Sampled pages store the first 3000 characters of their text. Two pages whose
// emoji run starts one character apart guarantee that one of them is cut inside
// an emoji at that boundary, whatever the exact text offset of the template.
const emojiRun = (prefix) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Aanbiedingen | Winkel</title><meta name="description" content="Aanbiedingen van deze week."></head><body><h1>Aanbiedingen</h1><p>${prefix}${"🎃".repeat(2200)}</p></body></html>`;
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (u.host !== "emoji.test") return new Response("nf", { status: 404 });
  if (/\.(?:txt|xml)$/.test(u.pathname)) return new Response("nf", { status: 404 });
  const body = u.pathname === "/aanbiedingen" ? emojiRun("") : u.pathname === "/contact" ? emojiRun("x") : html(u.pathname);
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
};
globalThis.__RF_RENDER = async () => { throw new Error("RENDER_UNAVAILABLE_IN_TEST"); };
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
const s = [console.info, console.warn, console.error]; console.info = console.warn = () => {}; const errors = []; console.error = (...a) => errors.push(a);
const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://emoji.test/", mode: "both", language: "nl", dashboard: true }) }));
[console.info, console.warn, console.error] = s;
const body = await res.json();
check(res.status === 200, `HTTP ${res.status} ${body.code || ""} ${String(body.error || "").slice(0, 160)} ${JSON.stringify(errors.find((e) => /history write failed/.test(String(e[0])))?.[1] || "").slice(0, 300)}`);
const rows = (await db.query("SELECT id, result FROM scans WHERE user_id=$1", [user.id])).rows;
check(rows.length === 1, `stored scans: ${rows.length}`);
if (rows[0]) {
  const text = JSON.stringify(rows[0].result);
  check(text.includes("🎃"), "emoji were removed instead of preserved");
  check(!/\\u0000/.test(text), "NUL stored");
  check(typeof rows[0].result?.seo?.checks?.length === "number", "stored report incomplete");
}
// The verified-check update (jsonb_set) and health events use the same guard.
const events = (await db.query("SELECT count(*)::int AS n FROM website_health_events WHERE user_id=$1", [user.id])).rows[0]?.n ?? 0;
check(events >= 1, `health events written: ${events}`);
await db.query("DELETE FROM website_health_events WHERE user_id=$1", [user.id]);
await db.query("DELETE FROM usage_events WHERE user_id=$1", [user.id]);
await db.query("DELETE FROM scan_attempts WHERE user_id=$1", [user.id]);
await db.query("DELETE FROM scans WHERE user_id=$1", [user.id]);
await db.query("DELETE FROM users WHERE id=$1", [user.id]);
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 1, failed: problems.length }));
await db.end?.();
process.exit(0);
