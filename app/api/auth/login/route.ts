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
  let step = "parse-request";
  try {
    const body=await request.json(); language=langOf(body?.language);
    step = "database-init";
    await ensureDatabase();
    step = "rate-limit";
    if(!await consumeRateLimit("login",requestIp(request),12,900)) return NextResponse.json({error:tr(language,{nl:"Te veel inlogpogingen. Probeer later opnieuw.",en:"Too many login attempts. Please try again later.",de:"Zu viele Anmeldeversuche. Bitte versuche es später erneut.",fr:"Trop de tentatives de connexion. Veuillez réessayer plus tard.",it:"Troppi tentativi di accesso. Riprova più tardi.",es:"Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde."})},{status:429});
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const password=typeof body?.password==="string"?body.password:""; const rememberMe=body?.rememberMe!==false;
    step = "account-lookup";
    const result=await getDb().query("SELECT id,email,name,password_hash FROM users WHERE email=$1",[email]); const user=result.rows[0];
    step = "password-verification";
    if(!user||!(await verifyPassword(password,user.password_hash))) return NextResponse.json({error:tr(language,{nl:"E-mailadres of wachtwoord klopt niet.",en:"Email address or password is incorrect.",de:"E-Mail-Adresse oder Passwort ist falsch.",fr:"L’adresse e-mail ou le mot de passe est incorrect.",it:"L’indirizzo e-mail o la password non sono corretti.",es:"El correo electrónico o la contraseña son incorrectos."})},{status:401});
    step = "session-creation";
    await createSession(user.id,rememberMe); return NextResponse.json({success:true,user:{id:user.id,email:user.email,name:user.name}});
  } catch (error) {
    // QA-safe diagnostics: never log credentials, request bodies, session tokens or DB error messages.
    console.error("[rankfix-login] Internal login error", { step, errorType: error instanceof Error ? error.name : "UnknownError" });
    const infrastructureFailure = error instanceof Error && /(?:\b402\b|quota|exceeded.*limit|database.+(?:unavailable|timeout)|connection.+(?:timeout|refused))/i.test(error.message);
    if(infrastructureFailure) return NextResponse.json({error:tr(language,{
      nl:"Inloggen is tijdelijk niet mogelijk door een storing in de testdatabase. Dit betekent niet dat je wachtwoord fout is. Probeer het later opnieuw.",
      en:"Login is temporarily unavailable because of a test database outage. This does not mean your password is incorrect. Please try again later.",
      de:"Die Anmeldung ist vorübergehend wegen einer Störung der Testdatenbank nicht möglich. Dein Passwort muss nicht falsch sein. Bitte versuche es später erneut.",
      fr:"La connexion est temporairement indisponible à cause de la base de données de test. Cela ne signifie pas que votre mot de passe est incorrect. Réessayez plus tard.",
      it:"L'accesso non è temporaneamente disponibile a causa del database di test. Questo non significa che la password sia errata. Riprova più tardi.",
      es:"El inicio de sesión no está disponible temporalmente debido a la base de datos de pruebas. Esto no significa que la contraseña sea incorrecta. Inténtalo más tarde."
    }),code:"DATABASE_TEMPORARILY_UNAVAILABLE"},{status:503});
    return NextResponse.json({error:tr(language,{nl:"Inloggen mislukt.",en:"Login failed.",de:"Anmeldung fehlgeschlagen.",fr:"Échec de la connexion.",it:"Accesso non riuscito.",es:"No se pudo iniciar sesión."})},{status:500});
  }
}