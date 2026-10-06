import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { consumeRateLimit, requestIp } from "@/lib/rate-limit";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

export async function POST(request: Request) {
  let language: "nl"|"en"|"de"|"fr"|"it"|"es" = "nl";
  try {
    const body = await request.json();
    const requestedLanguage = typeof body?.language === "string" ? body.language : "nl";
    language = ["nl","en","de","fr","it","es"].includes(requestedLanguage) ? requestedLanguage as "nl"|"en"|"de"|"fr"|"it"|"es" : "nl";
    const tr=<T,>(values:Record<"nl"|"en"|"de"|"fr"|"it"|"es",T>)=>values[language];
    const generic=tr({nl:"Als er een RankFix-account met dit e-mailadres bestaat, hebben we een resetlink gestuurd. Controleer ook je spam.",en:"If a RankFix account exists for this email address, we sent a reset link. Please also check your spam folder.",de:"Wenn für diese E-Mail-Adresse ein RankFix-Konto existiert, haben wir einen Reset-Link gesendet. Prüfe auch deinen Spam-Ordner.",fr:"Si un compte RankFix existe pour cette adresse e-mail, nous avons envoyé un lien de réinitialisation. Vérifiez aussi vos spams.",it:"Se esiste un account RankFix per questo indirizzo e-mail, abbiamo inviato un link di reimpostazione. Controlla anche lo spam.",es:"Si existe una cuenta RankFix para este correo, hemos enviado un enlace de restablecimiento. Revisa también el spam."});
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error:tr({nl:"Vul een geldig e-mailadres in.",en:"Enter a valid email address.",de:"Gib eine gültige E-Mail-Adresse ein.",fr:"Saisissez une adresse e-mail valide.",it:"Inserisci un indirizzo e-mail valido.",es:"Introduce una dirección de correo válida."}) }, { status: 400 });
    }

    await ensureDatabase();
    if (!await consumeRateLimit("forgot-password",requestIp(request),5,3600)) {
      return NextResponse.json({ error:tr({nl:"Te veel herstelverzoeken. Probeer later opnieuw.",en:"Too many recovery requests. Try again later.",de:"Zu viele Wiederherstellungsanfragen. Versuche es später erneut.",fr:"Trop de demandes de récupération. Réessayez plus tard.",it:"Troppe richieste di recupero. Riprova più tardi.",es:"Demasiadas solicitudes de recuperación. Inténtalo más tarde."}) }, { status:429 });
    }
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
    const resetUrl = `${base}/account/reset-password?token=${encodeURIComponent(token)}&lang=${language}`;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.SCAN_REPORT_FROM || process.env.RESEND_FROM;

    if (!apiKey || !from) {
      console.error("Password reset mail is not configured.");
      return NextResponse.json({ error:tr({nl:"De herstelmail is momenteel niet geconfigureerd.",en:"Password recovery email is currently unavailable.",de:"Die E-Mail zur Passwortwiederherstellung ist derzeit nicht verfügbar.",fr:"L’e-mail de récupération du mot de passe est actuellement indisponible.",it:"L’e-mail per il recupero della password non è al momento disponibile.",es:"El correo de recuperación de contraseña no está disponible en este momento."}) }, { status: 503 });
    }

    const mail=tr({
      nl:{subject:"RankFix — wachtwoord herstellen",hello:"Hallo",intro:"Je hebt gevraagd om je RankFix-wachtwoord te herstellen.",button:"Nieuw wachtwoord instellen",valid:"Deze link is 30 minuten geldig.",ignore:"Heb je dit niet aangevraagd, dan kun je deze e-mail negeren."},
      en:{subject:"RankFix — reset your password",hello:"Hello",intro:"You requested a reset of your RankFix password.",button:"Set new password",valid:"This link is valid for 30 minutes.",ignore:"If you did not request this, you can ignore this email."},
      de:{subject:"RankFix — Passwort zurücksetzen",hello:"Hallo",intro:"Du hast angefordert, dein RankFix-Passwort zurückzusetzen.",button:"Neues Passwort festlegen",valid:"Dieser Link ist 30 Minuten gültig.",ignore:"Wenn du dies nicht angefordert hast, kannst du diese E-Mail ignorieren."},
      fr:{subject:"RankFix — réinitialiser votre mot de passe",hello:"Bonjour",intro:"Vous avez demandé la réinitialisation de votre mot de passe RankFix.",button:"Définir un nouveau mot de passe",valid:"Ce lien est valable pendant 30 minutes.",ignore:"Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail."},
      it:{subject:"RankFix — reimposta la password",hello:"Ciao",intro:"Hai richiesto di reimpostare la password di RankFix.",button:"Imposta nuova password",valid:"Questo link è valido per 30 minuti.",ignore:"Se non hai richiesto questa modifica, puoi ignorare questa e-mail."},
      es:{subject:"RankFix — restablecer contraseña",hello:"Hola",intro:"Has solicitado restablecer tu contraseña de RankFix.",button:"Establecer nueva contraseña",valid:"Este enlace es válido durante 30 minutos.",ignore:"Si no has solicitado este cambio, puedes ignorar este correo."}
    });
    const response = await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        from,to:[user.email],subject:mail.subject,
        text:[`${mail.hello} ${user.name},`,"",mail.intro,"",`${mail.button}: ${resetUrl}`,"",mail.valid,mail.ignore].join("\n"),
        html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>${escapeHtml(mail.subject)}</h2><p>${escapeHtml(mail.hello)} ${escapeHtml(user.name)},</p><p>${escapeHtml(mail.intro)}</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">${escapeHtml(mail.button)}</a></p><p>${escapeHtml(mail.valid)}</p><p>${escapeHtml(mail.ignore)}</p></div>`
      })
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Resend password reset error:", details);
      return NextResponse.json({ error:tr({nl:"De herstelmail kon niet worden verzonden.",en:"The recovery email could not be sent.",de:"Die Wiederherstellungs-E-Mail konnte nicht gesendet werden.",fr:"L’e-mail de récupération n’a pas pu être envoyé.",it:"Non è stato possibile inviare l’e-mail di recupero.",es:"No se pudo enviar el correo de recuperación."}) }, { status: 502 });
    }

    return NextResponse.json({ success:true, message:generic });
  } catch (error) {
    console.error("Forgot password error:", error);
    const errors={nl:"De herstelmail kon niet worden verzonden.",en:"The recovery email could not be sent.",de:"Die Wiederherstellungs-E-Mail konnte nicht gesendet werden.",fr:"L’e-mail de récupération n’a pas pu être envoyé.",it:"Non è stato possibile inviare l’e-mail di recupero.",es:"No se pudo enviar el correo de recuperación."};
    return NextResponse.json({ error:errors[language] }, { status:500 });
  }
}
