import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { consumeRateLimit, requestIp } from "@/lib/rate-limit";
type Lang="nl"|"en"|"de"|"fr"|"it"|"es";
const langOf=(v:unknown):Lang=>typeof v==="string"&&["nl","en","de","fr","it","es"].includes(v)?v as Lang:"nl";
const tr=<T,>(l:Lang,v:Record<Lang,T>)=>v[l];

export async function POST(request: Request) {
  let language:Lang="nl";
  try {
    const body=await request.json(); language=langOf(body?.language);
    await ensureDatabase();
    if(!await consumeRateLimit("login",requestIp(request),12,900)) return NextResponse.json({error:tr(language,{nl:"Te veel inlogpogingen. Probeer later opnieuw.",en:"Too many login attempts. Please try again later.",de:"Zu viele Anmeldeversuche. Bitte versuche es später erneut.",fr:"Trop de tentatives de connexion. Veuillez réessayer plus tard.",it:"Troppi tentativi di accesso. Riprova più tardi.",es:"Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde."})},{status:429});
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const password=typeof body?.password==="string"?body.password:""; const rememberMe=body?.rememberMe!==false;
    const result=await getDb().query("SELECT id,email,name,password_hash FROM users WHERE email=$1",[email]); const user=result.rows[0];
    if(!user||!(await verifyPassword(password,user.password_hash))) return NextResponse.json({error:tr(language,{nl:"E-mailadres of wachtwoord klopt niet.",en:"Email address or password is incorrect.",de:"E-Mail-Adresse oder Passwort ist falsch.",fr:"L’adresse e-mail ou le mot de passe est incorrect.",it:"L’indirizzo e-mail o la password non sono corretti.",es:"El correo electrónico o la contraseña son incorrectos."})},{status:401});
    // Owner-only Agency activation. Store only the SHA-256 digest in server secrets;
    // never ship the activation secret to the browser or accept arbitrary account upgrades.
    const activationCode = typeof body?.activationCode === "string" ? body.activationCode.trim() : "";
    let agencyActivated = false;
    if (activationCode) {
      const ownerEmail = (process.env.RANKFIX_INTERNAL_TEST_EMAIL || "").trim().toLowerCase();
      const ownerId = (process.env.RANKFIX_INTERNAL_TEST_USER_ID || "").trim();
      const expectedDigest = (process.env.RANKFIX_AGENCY_ACTIVATION_SHA256 || "").trim().toLowerCase();
      const ownerMatches = (Boolean(ownerId) && ownerId === user.id) || (Boolean(ownerEmail) && ownerEmail === user.email.toLowerCase());
      const actualDigest = createHash("sha256").update(activationCode).digest("hex");
      const digestMatches = /^[a-f0-9]{64}$/.test(expectedDigest) && timingSafeEqual(Buffer.from(actualDigest, "hex"), Buffer.from(expectedDigest, "hex"));
      if (!ownerMatches || !digestMatches) {
        return NextResponse.json({error:"Activatiecode ongeldig of niet toegestaan voor dit account."},{status:403});
      }
      await getDb().query("UPDATE users SET plan_code='agency' WHERE id=$1", [user.id]);
      agencyActivated = true;
    }
    await createSession(user.id,rememberMe); return NextResponse.json({success:true,agencyActivated,user:{id:user.id,email:user.email,name:user.name}});
  } catch { return NextResponse.json({error:tr(language,{nl:"Inloggen mislukt.",en:"Login failed.",de:"Anmeldung fehlgeschlagen.",fr:"Échec de la connexion.",it:"Accesso non riuscito.",es:"No se pudo iniciar sesión."})},{status:500}); }
}