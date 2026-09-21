import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __rankfixPool: Pool | undefined;
}

export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ontbreekt.");
  if (!global.__rankfixPool) {
    global.__rankfixPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return global.__rankfixPool;
}
