import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { getDb } from "./db";

const scrypt = promisify(scryptCallback);
const COOKIE = "rankfix_session";
const REMEMBER_COOKIE = "rankfix_remember";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [prefix, salt, hex] = stored.split(":");
  if (prefix !== "scrypt" || !salt || !hex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function tokenHash(token: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || "change-me").update(token).digest("hex");
}

export async function createSession(userId: string, rememberMe = true) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await getDb().query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)",
    [tokenHash(token), userId, expires]
  );
  const store = await cookies();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(rememberMe ? { expires } : {}),
  };
  store.set(COOKIE, token, cookieOptions);
  store.set(REMEMBER_COOKIE, rememberMe ? "1" : "0", cookieOptions);
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await getDb().query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
  store.delete(COOKIE);
  store.delete(REMEMBER_COOKIE);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const result = await getDb().query(
    `SELECT u.id, u.email, u.name, u.credits, u.created_at, s.expires_at
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > NOW()`,
    [tokenHash(token)]
  );
  const user = result.rows[0];
  if (!user) return null;

  const rememberMe = store.get(REMEMBER_COOKIE)?.value !== "0";
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await getDb().query("UPDATE sessions SET expires_at=$1 WHERE token_hash=$2", [expires, tokenHash(token)]);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(rememberMe ? { expires } : {}),
  };
  const store2 = await cookies();
  store2.set(COOKIE, token, cookieOptions);
  store2.set(REMEMBER_COOKIE, rememberMe ? "1" : "0", cookieOptions);
  return user;
}
