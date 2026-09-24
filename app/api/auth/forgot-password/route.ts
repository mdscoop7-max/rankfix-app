import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

export async function POST(request: Request) {
  const generic = "Als er een RankFix-account met dit e-mailadres bestaat, hebben we een resetlink gestuurd. Controleer ook je spam.";

  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 400 });
    }

    await ensureDatabase();
    const result = await getDb().query("SELECT id,name,email FROM users WHERE email=$1", [email]);
    const user = result.rows[0];

    if (!user) return NextResponse.json({ success: true, message: generic });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expires = new Date(Date.now() + 30 * 60 * 1000);

    await getDb().query("DELETE FROM password_reset_tokens WHERE user_id=$1", [user.id]);
    await getDb().query(
      "INSERT INTO password_reset_tokens (token_hash,user_id,expires_at) VALUES ($1,$2,$3)",
      [tokenHash,user.id,expires]
    );

    const base = (process.env.APP_URL || "https://rankfix-app.onrender.com").replace(/\/$/,"");
    const resetUrl = `${base}/account/reset-password?token=${encodeURIComponent(token)}`;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.SCAN_REPORT_FROM || process.env.RESEND_FROM;

    if (!apiKey || !from) {
      console.error("Password reset mail is not configured.");
      return NextResponse.json({ error: "De herstelmail is momenteel niet geconfigureerd." }, { status: 503 });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        from,
        to:[user.email],
        subject:"RankFix — wachtwoord herstellen",
        text:[
          `Hallo ${user.name},`,
          "",
          "Je hebt gevraagd om je RankFix-wachtwoord te herstellen.",
          "",
          `Open deze link om een nieuw wachtwoord in te stellen: ${resetUrl}`,
          "",
          "Deze link is 30 minuten geldig. Heb je dit niet aangevraagd, dan kun je deze e-mail negeren."
        ].join("\n"),
        html:`
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">
            <h2>RankFix — wachtwoord herstellen</h2>
            <p>Hallo ${escapeHtml(user.name)},</p>
            <p>Je hebt gevraagd om je RankFix-wachtwoord te herstellen.</p>
            <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:8px">Nieuw wachtwoord instellen</a></p>
            <p>Deze link is 30 minuten geldig.</p>
            <p>Heb je dit niet aangevraagd, dan kun je deze e-mail negeren.</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Resend password reset error:", details);
      return NextResponse.json({ error: "De herstelmail kon niet worden verzonden." }, { status: 502 });
    }

    return NextResponse.json({ success:true, message:generic });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error:"De herstelmail kon niet worden verzonden." }, { status:500 });
  }
}
