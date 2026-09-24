import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { createSession, hashPassword } from "@/lib/auth";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!token || token.length < 20) {
      return NextResponse.json({ error:"De resetlink is ongeldig of verlopen." }, { status:400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error:"Het nieuwe wachtwoord moet minimaal 8 tekens bevatten." }, { status:400 });
    }

    await ensureDatabase();
    const result = await getDb().query(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND expires_at>NOW()",
      [hashToken(token)]
    );
    const reset = result.rows[0];

    if (!reset) {
      return NextResponse.json({ error:"De resetlink is ongeldig of verlopen." }, { status:400 });
    }

    const passwordHash = await hashPassword(password);
    await getDb().query("UPDATE users SET password_hash=$1 WHERE id=$2",[passwordHash,reset.user_id]);

    // Invalidate this token and any other outstanding reset tokens for the user.
    await getDb().query("DELETE FROM password_reset_tokens WHERE user_id=$1",[reset.user_id]);

    // Start a fresh authenticated session so the customer can continue immediately.
    await createSession(reset.user_id);

    return NextResponse.json({ success:true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error:"Wachtwoord wijzigen mislukt." }, { status:500 });
  }
}
