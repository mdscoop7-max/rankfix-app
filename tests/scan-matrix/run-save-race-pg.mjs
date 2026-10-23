// QA #186 (TestLab 23-10 evening): SCAN_HISTORY_SAVE_FAILED on eir and Coolblue BE.
// Mechanism reproduced on real PostgreSQL: a new serverless instance ran the full
// schema migration (ALTER TABLE users ..., ALTER TABLE scans ...) in one
// transaction while another instance stored a scan; the scan INSERT holds its
// lock on scans and waits for users (foreign key), the migration waits for
// scans -> "deadlock detected" (40P01) and the scan save failed.
// This test checks the two repairs:
//  1. a schema that is already applied is never migrated again (no DDL locks);
//  2. the scan insert is idempotent and repeated after a transient error, so a
//     deadlock victim or a broken connection still results in exactly one row.
// Run: RF_REAL_DB=1 DATABASE_URL=postgres://... node --experimental-strip-types --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-save-race-pg.mjs
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { getDb, withDbRetry } = await import(ROOT + "/lib/db.ts");
const { ensureDatabase, schemaFingerprint } = await import(ROOT + "/lib/db-init.ts");
const pg = (await import(ROOT + "/node_modules/pg/lib/index.js")).default;
const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
const db = getDb();
await ensureDatabase();

// 1. Fingerprint stored; a fresh instance (new module state) reads it and runs no
//    DDL, even while a long-running scan insert holds a lock on scans.
const stored = (await db.query("SELECT version FROM rankfix_schema_versions WHERE version=$1", [schemaFingerprint()])).rows.length;
check(stored === 1, `schema fingerprint stored: ${stored}`);
const holder = new pg.Client({ connectionString: process.env.DATABASE_URL });
await holder.connect();
await holder.query("BEGIN");
await holder.query("LOCK TABLE scans IN ROW EXCLUSIVE MODE"); // what an INSERT holds
const fresh = await import(ROOT + "/lib/db-init.ts?fresh=" + Date.now());
const t0 = Date.now();
const outcome = await Promise.race([
  fresh.ensureDatabase().then(() => "ok", (e) => `error ${e.code || e.message}`),
  new Promise((r) => setTimeout(() => r("blocked"), 5000)),
]);
check(outcome === "ok", `fresh instance schema init while a scan insert runs: ${outcome} after ${Date.now() - t0} ms`);
await holder.query("ROLLBACK");
await holder.end();

// 2. Idempotent insert with retry: the first attempt is aborted as deadlock victim.
const email = `race-${Date.now()}@rankfix.test`;
const user = (await db.query("INSERT INTO users (email, password_hash, name, plan_code, customer_id) VALUES ($1,'x','QA','agency','RF-' || UPPER(REPLACE(gen_random_uuid()::text,'-',''))) RETURNING id", [email])).rows[0];
const { randomUUID } = await import("node:crypto");
const id = randomUUID();
let calls = 0;
const savedId = await withDbRetry(async () => {
  calls++;
  const inserted = await db.query("INSERT INTO scans (id, user_id, scanned_url, result) VALUES ($1,$2,'https://race.test/','{}') ON CONFLICT (id) DO NOTHING RETURNING id", [id, user.id]);
  // The statement reached the server and was stored, but the client saw the
  // connection break: the retry must not create a second row.
  if (calls === 1) { const e = new Error("Connection terminated unexpectedly"); throw e; }
  if (inserted.rows[0]?.id) return String(inserted.rows[0].id);
  const existing = await db.query("SELECT id FROM scans WHERE id=$1 AND user_id=$2", [id, user.id]);
  return existing.rows[0]?.id ? String(existing.rows[0].id) : null;
}, { wait: async () => {} });
const rows = (await db.query("SELECT count(*)::int AS n FROM scans WHERE user_id=$1", [user.id])).rows[0].n;
check(savedId === id && rows === 1, `idempotent retry: saved=${savedId === id} rows=${rows} calls=${calls}`);
let victim = 0;
const afterDeadlock = await withDbRetry(async () => { victim++; if (victim === 1) { const e = new Error("deadlock detected"); e.code = "40P01"; throw e; } return "stored"; }, { wait: async () => {} });
check(afterDeadlock === "stored" && victim === 2, "deadlock victim retried once");
let plain = 0;
await withDbRetry(async () => { plain++; const e = new Error('invalid input syntax for type json'); e.code = "22P02"; throw e; }, { wait: async () => {} }).catch(() => {});
check(plain === 1, `non-transient errors are never retried (${plain} calls)`);

await db.query("DELETE FROM scans WHERE user_id=$1", [user.id]);
await db.query("DELETE FROM users WHERE id=$1", [user.id]);
for (const p of problems) console.log(" - " + p);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total: 5, failed: problems.length }));
await db.end?.();
process.exit(0);
