import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { consumeRateLimit, requestIp } from "@/lib/rate-limit";
import { classifyLoginInfrastructureFailure } from "@/lib/login-infrastructure";
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
    // Do not log account names, passwords, DB connection strings or tokens.
    const infrastructure = classifyLoginInfrastructureFailure(error);
    console.error("[rankfix-login] Login service error", {
      step,
      kind: infrastructure || "technical",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    if (infrastructure) {
      const messages=tr(language,{
        nl:"Inloggen is tijdelijk niet mogelijk: de RankFix-testdatabase is niet beschikbaar. Dit betekent niet dat je wachtwoord onjuist is. Probeer opnieuw zodra de database is hersteld.",
        en:"Login is temporarily unavailable: the RankFix test database cannot be reached. This does not mean your password is wrong. Please retry when the database is restored.",
        de:"Anmeldung vorübergehend nicht möglich: Die RankFix-Testdatenbank ist nicht erreichbar. Dies bedeutet nicht, dass dein Passwort falsch ist.",
        fr:"Connexion temporairement impossible : la base de données de test RankFix est indisponible. Cela ne signifie pas que votre mot de passe est incorrect.",
        it:"Accesso temporaneamente non disponibile: il database di test RankFix non è accessibile. Questo non significa che la password sia errata.",
        es:"Inicio de sesión temporalmente no disponible: no se puede acceder a la base de datos de pruebas de RankFix. Esto no significa que la contraseña sea incorrecta."
      });
      return NextResponse.json({
        error:messages,
        code:infrastructure==="quota"?"DATABASE_QUOTA_EXCEEDED":"LOGIN_DATABASE_UNAVAILABLE",
        retryable:false,charged:false
      },{status:503});
    }
    return NextResponse.json({
      error:tr(language,{
        nl:"Inloggen kan tijdelijk niet worden voltooid door een technische storing. Dit betekent niet dat je wachtwoord onjuist is.",
        en:"Login cannot be completed because of a temporary technical error. This does not mean your password is incorrect.",
        de:"Die Anmeldung konnte wegen eines technischen Fehlers nicht abgeschlossen werden. Dein Passwort ist dadurch nicht als falsch bestätigt.",
        fr:"La connexion n’a pas pu être effectuée en raison d’un problème technique. Votre mot de passe n’a pas été déclaré incorrect.",
        it:"Accesso non completato a causa di un errore tecnico. La password non è stata verificata come errata.",
        es:"No se pudo completar el inicio de sesión por un error técnico. No se ha confirmado que la contraseña sea incorrecta."
      }),
      code:"LOGIN_TECHNICAL_ERROR",retryable:true,charged:false
    },{status:500});
  }
}
