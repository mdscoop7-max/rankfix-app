import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const rememberMe = body?.rememberMe !== false;
    await ensureDatabase();
    const result = await getDb().query("SELECT id,email,name,password_hash FROM users WHERE email=$1", [email]);
    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "E-mailadres of wachtwoord klopt niet." }, { status: 401 });
    }
    await createSession(user.id, rememberMe);
    return NextResponse.json({ success: true, user: { id:user.id,email:user.email,name:user.name } });
  } catch {
    return NextResponse.json({ error: "Inloggen mislukt." }, { status: 500 });
  }
}
