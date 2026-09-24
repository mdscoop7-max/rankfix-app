import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const API = "https://api.github.com";
const VERSION = "2026-03-10";

function key() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET ontbreekt in de productieomgeving.");
    }
    return createHash("sha256").update("rankfix-dev-secret").digest();
  }
  return createHash("sha256").update(secret).digest();
}
export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
export async function githubFetch<T>(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: { Accept:"application/vnd.github+json", Authorization:"Bearer " + token, "X-GitHub-Api-Version":VERSION, "Content-Type":"application/json", ...(init.headers || {}) },
    cache:"no-store",
  });
  const text=await response.text();
  let data:any=null; try{data=text?JSON.parse(text):null;}catch{data={message:text};}
  if(!response.ok) throw new Error(data?.message || ("GitHub API error " + response.status));
  return data as T;
}
