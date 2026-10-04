import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { createSession, hashPassword } from "@/lib/auth";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  let language: "nl"|"en"|"de"|"fr"|"it"|"es" = "nl";
  const fail=()=>({nl:"Wachtwoord wijzigen mislukt.",en:"Could not change the password.",de:"Passwort konnte nicht geändert werden.",fr:"Impossible de modifier le mot de passe.",it:"Impossibile modificare la password.",es:"No se pudo cambiar la contraseña."}[language]);
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const requestedLanguage = typeof body?.language === "string" ? body.language : "nl";
    language = ["nl","en","de","fr","it","es"].includes(requestedLanguage) ? requestedLanguage as "nl"|"en"|"de"|"fr"|"it"|"es" : "nl";
    const msg=(nl:string,en:string,de:string,fr:string,it:string,es:string)=>({nl,en,de,fr,it,es}[language]);

    if (!token || token.length < 20) {
      return NextResponse.json({ error:msg("De resetlink is ongeldig of verlopen.","The reset link is invalid or expired.","Der Reset-Link ist ungültig oder abgelaufen.","Le lien de réinitialisation est invalide ou expiré.","Il link di reimpostazione non è valido o è scaduto.","El enlace de restablecimiento no es válido o ha caducado.") }, { status:400 });
    }
    if (!(password.length>=8 && /[A-Za-z]/.test(password) && /\\d/.test(password) && /[^A-Za-z0-9]/.test(password))) {
      return NextResponse.json({ error:msg("Gebruik minimaal 8 tekens met letters, 1 cijfer en 1 speciaal teken.","Use at least 8 characters with letters, 1 number and 1 special character.","Mindestens 8 Zeichen mit Buchstaben, 1 Zahl und 1 Sonderzeichen verwenden.","Utilisez au moins 8 caractères avec des lettres, 1 chiffre et 1 caractère spécial.","Usa almeno 8 caratteri con lettere, 1 numero e 1 carattere speciale.","Usa al menos 8 caracteres con letras, 1 número y 1 carácter especial.") }, { status:400 });
    }

    await ensureDatabase();
    const result = await getDb().query(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND expires_at>NOW()",
      [hashToken(token)]
    );
    const reset = result.rows[0];

    if (!reset) {
      return NextResponse.json({ error:msg("De resetlink is ongeldig of verlopen.","The reset link is invalid or expired.","Der Reset-Link ist ungültig oder abgelaufen.","Le lien de réinitialisation est invalide ou expiré.","Il link di reimpostazione non è valido o è scaduto.","El enlace de restablecimiento no es válido o ha caducado.") }, { status:400 });
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
    return NextResponse.json({ error:fail() }, { status:500 });
  }
}

