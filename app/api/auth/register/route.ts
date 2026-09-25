import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      return NextResponse.json({ error: "Vul een naam, geldig e-mailadres en wachtwoord van minimaal 8 tekens in." }, { status: 400 });
    }

    await ensureDatabase();
    const db = getDb();
    const exists = await db.query("SELECT id FROM users WHERE email=$1", [email]);
    if (exists.rowCount) return NextResponse.json({ error: "Er bestaat al een account met dit e-mailadres." }, { status: 409 });

    const result = await db.query(
      "INSERT INTO users (email,name,password_hash) VALUES ($1,$2,$3) RETURNING id,email,name",
      [email, name, await hashPassword(password)]
    );
    await createSession(result.rows[0].id);
    return NextResponse.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("RankFix registration failed:", error);
    const message = error instanceof Error ? error.message : "Onbekende databasefout.";
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Account aanmaken mislukt. Controleer de databaseconfiguratie." : message }, { status: 500 });
  }
}
