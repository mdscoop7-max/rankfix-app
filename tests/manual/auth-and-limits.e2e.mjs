// Local isolated check: wachtwoordherstel en scanlimieten tegen een lokale server en testdatabase.
// Gebruik: zie tests/manual/README.md (sectie "Lokale end-to-end: herstel en scanlimieten").
// Registreert eerst de testaccounts als dat nog niet gebeurd is.
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3100";
const DB = process.env.E2E_DATABASE_URL || "postgres://rankfix_test:local-test-only@127.0.0.1:5432/rankfix_test";
const sql = (q) => execFileSync("psql", [DB, "-At", "-c", q], { encoding: "utf8" }).trim();
// Safety: this script deletes and edits rows. Never point it at a real database or server.
if (!/\/[^/?]*test[^/?]*(\?|$)/.test(DB) || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("Refusing to run: E2E_DATABASE_URL must name a *test* database and E2E_BASE_URL must be localhost.");
  process.exit(1);
}
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); };

const cookieOf = (res) => (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).filter((c) => c.startsWith("rankfix_")).join("; ");
const post = (path, body, cookie = "", extra = {}) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify(body) });
const me = async (cookie) => (await (await fetch(BASE + "/api/auth/me", { headers: cookie ? { cookie } : {} })).json()).user;
const login = (email, password) => post("/api/auth/login", { email, password, language: "nl" });

// ---------- Test accounts (idempotent) ----------
sql("delete from users where email='reset@rankfix.test'"); // fresh reset account each run
for (const role of ["free", "paid", "tester", "reset"]) {
  await post("/api/auth/register", { name: "Test " + role, email: `${role}@rankfix.test`, password: "Start-Wachtw00rd!", language: "nl" });
}
sql("update users set plan_code='start' where email='paid@rankfix.test'");

// ---------- Password reset ----------
const START = "Start-Wachtw00rd!";
const NEW = "Nieuw-Wachtw00rd#2";
const email = "reset@rankfix.test";
const loginRes = await login(email, START);
const oldSession = cookieOf(loginRes);
check("reset: login with original password", loginRes.status === 200 && (await me(oldSession))?.email === email);

const forgot = await post("/api/auth/forgot-password", { email, language: "nl" });
const tokenRows = Number(sql(`select count(*) from password_reset_tokens t join users u on u.id=t.user_id where u.email='${email}' and t.expires_at between now()+interval '29 minutes' and now()+interval '31 minutes'`));
check("reset: request stores one token valid ~30 minutes (mail disabled locally)", tokenRows === 1, `HTTP ${forgot.status}`);
const unknown = await post("/api/auth/forgot-password", { email: "nobody@rankfix.test", language: "nl" });
check("reset: unknown e-mail gives the generic success (no account enumeration)", unknown.status === 200 && (await unknown.json()).success === true);

const userId = sql(`select id from users where email='${email}'`);
const plant = (minutes) => { const token = randomBytes(32).toString("base64url"); sql(`insert into password_reset_tokens (token_hash,user_id,expires_at) values ('${createHash("sha256").update(token).digest("hex")}','${userId}',now()+interval '${minutes} minutes')`); return token; };

const t1 = plant(30);
const weak = await post("/api/auth/reset-password", { token: t1, password: "zwak", language: "nl" });
check("reset: weak password rejected", weak.status === 400);
const digitRule = await post("/api/auth/reset-password", { token: t1, password: "GeenCijfer!!", language: "nl" });
check("reset: password without digit rejected", digitRule.status === 400);
const ok = await post("/api/auth/reset-password", { token: t1, password: NEW, language: "nl" });
const newSession = cookieOf(ok);
check("reset: valid token + strong password succeeds (was impossible before the \\d fix)", ok.status === 200);
check("reset: new session is signed in", (await me(newSession))?.email === email);
check("reset: old session is signed out", (await me(oldSession)) === null);
const reuse = await post("/api/auth/reset-password", { token: t1, password: "Ander-Wachtw00rd!", language: "nl" });
check("reset: token cannot be used twice", reuse.status === 400);
check("reset: old password no longer works", (await login(email, START)).status !== 200);
check("reset: new password works", (await login(email, NEW)).status === 200);

const expired = plant(-1);
check("reset: expired token rejected", (await post("/api/auth/reset-password", { token: expired, password: "Weer-Nieuw-W00rd!", language: "nl" })).status === 400);

const race = plant(30);
const raced = await Promise.all([1, 2, 3].map((i) => post("/api/auth/reset-password", { token: race, password: `Race-Wachtw00rd!${i}`, language: "nl" })));
check("reset: concurrent use of one token succeeds exactly once", raced.filter((r) => r.status === 200).length === 1, raced.map((r) => r.status).join(","));

// ---------- Scan limits ----------
const PROXY_IP = "203.0.113.5"; // what a trusted proxy would append as the real client
const viaProxy = (spoof) => ({ "x-forwarded-for": `${spoof}, ${PROXY_IP}` });
const scan = (cookie, dashboard, headers) => post("/api/scan", { url: "https://example.com/", mode: "both", dashboard, language: "nl" }, cookie, headers);
const sessions = {};
for (const role of ["free", "paid", "tester"]) sessions[role] = cookieOf(await login(`${role}@rankfix.test`, START));

sql("delete from api_rate_limits");
const anon = [];
for (let i = 0; i < 9; i++) anon.push(await scan("", false, viaProxy(`10.0.${i}.1`)));
check("limits: visitor gets 8 attempts per network, 9th is 429", anon.slice(0, 8).every((r) => r.status !== 429) && anon[8].status === 429, anon.map((r) => r.status).join(","));
const anonBody = await anon[8].json();
check("limits: spoofed left-most X-Forwarded-For does not open a new bucket", anon[8].status === 429);
check("limits: 429 carries the real remaining wait", anonBody.code === "PUBLIC_SCAN_RATE_LIMIT" && anonBody.retryAfterSeconds > 3500 && anonBody.retryAfterSeconds <= 3600 && anon[8].headers.get("retry-after") === String(anonBody.retryAfterSeconds) && /ongeveer (59|60) minuten/.test(anonBody.error), `${anonBody.retryAfterSeconds}s: ${anonBody.error}`);

const freePublic = await scan(sessions.free, false, viaProxy("1.1.1.1"));
check("limits: Free account on the public page shares the exhausted network limit", freePublic.status === 429);
const freeDash = [];
sql("delete from api_rate_limits where bucket like 'free-scan:%'");
for (let i = 0; i < 9; i++) freeDash.push(await scan(sessions.free, true, viaProxy("2.2.2.2")));
check("limits: Free account dashboard gets 8 per network, 9th is 429 (e-mail in config does not exempt it)", freeDash.slice(0, 8).every((r) => r.status !== 429) && freeDash[8].status === 429, freeDash.map((r) => r.status).join(","));

const paidDash = [];
for (let i = 0; i < 12; i++) paidDash.push(await scan(sessions.paid, true, viaProxy("3.3.3.3")));
check("limits: paid account dashboard is not held to the network limit (12 attempts)", paidDash.every((r) => r.status !== 429), paidDash.map((r) => r.status).join(","));
const paidPublic = [];
for (let i = 0; i < 31; i++) paidPublic.push(await scan(sessions.paid, false, viaProxy("4.4.4.4")));
check("limits: paid account on the public page is not blocked by the exhausted network", paidPublic[0].status !== 429);
const paid31 = await paidPublic[30].json().catch(() => ({}));
check("limits: paid account public page has a 30/hour per-account limit", paidPublic.slice(0, 30).every((r) => r.status !== 429) && paidPublic[30].status === 429 && paid31.code === "ACCOUNT_SCAN_RATE_LIMIT", paidPublic.filter((r) => r.status === 429).length + " blocked");

const testerRuns = [];
for (let i = 0; i < 12; i++) testerRuns.push(await scan(sessions.tester, i % 2 === 0, viaProxy("5.5.5.5")));
check("limits: configured tester account ID is exempt (dashboard + public, 12 attempts, exhausted network)", testerRuns.every((r) => r.status !== 429), testerRuns.map((r) => r.status).join(","));

const forged = await scan("rankfix_session=forged-token-value", true, viaProxy("6.6.6.6"));
check("limits: forged session cookie gets no dashboard access", forged.status === 401);

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
