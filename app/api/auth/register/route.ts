import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { consumeRateLimit, requestIp } from "@/lib/rate-limit";
type Lang="nl"|"en"|"de"|"fr"|"it"|"es";
const langOf=(v:unknown):Lang=>typeof v==="string"&&["nl","en","de","fr","it","es"].includes(v)?v as Lang:"nl";
const tr=<T,>(l:Lang,v:Record<Lang,T>)=>v[l];

export async function POST(request: Request) {
 let language:Lang="nl";
 try{
  const body=await request.json(); language=langOf(body?.language); await ensureDatabase();
  if(!await consumeRateLimit("register",requestIp(request),6,3600)) return NextResponse.json({error:tr(language,{nl:"Te veel registratiepogingen. Probeer later opnieuw.",en:"Too many registration attempts. Please try again later.",de:"Zu viele Registrierungsversuche. Bitte versuche es später erneut.",fr:"Trop de tentatives d’inscription. Veuillez réessayer plus tard.",it:"Troppi tentativi di registrazione. Riprova più tardi.",es:"Demasiados intentos de registro. Inténtalo de nuevo más tarde."})},{status:429});
  const name=typeof body?.name==="string"?body.name.trim():""; const email=typeof body?.email==="string"?body.email.trim().toLowerCase():""; const password=typeof body?.password==="string"?body.password:"";
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!(password.length>=8&&/[A-Za-z]/.test(password)&&/\d/.test(password)&&/[^A-Za-z0-9]/.test(password))) return NextResponse.json({error:tr(language,{nl:"Vul een naam, geldig e-mailadres en wachtwoord van minimaal 8 tekens met letters, 1 cijfer en 1 speciaal teken in.",en:"Enter a name, valid email address and a password of at least 8 characters with letters, 1 number and 1 special character.",de:"Gib einen Namen, eine gültige E-Mail-Adresse und ein Passwort mit mindestens 8 Zeichen, Buchstaben, 1 Zahl und 1 Sonderzeichen ein.",fr:"Saisissez un nom, une adresse e-mail valide et un mot de passe d’au moins 8 caractères avec des lettres, 1 chiffre et 1 caractère spécial.",it:"Inserisci un nome, un indirizzo e-mail valido e una password di almeno 8 caratteri con lettere, 1 numero e 1 carattere speciale.",es:"Introduce un nombre, un correo válido y una contraseña de al menos 8 caracteres con letras, 1 número y 1 carácter especial."})},{status:400});
  const db=getDb(); const exists=await db.query("SELECT id FROM users WHERE email=$1",[email]);
  if(exists.rowCount) return NextResponse.json({error:tr(language,{nl:"Er bestaat al een account met dit e-mailadres.",en:"An account already exists with this email address.",de:"Für diese E-Mail-Adresse existiert bereits ein Konto.",fr:"Un compte existe déjà avec cette adresse e-mail.",it:"Esiste già un account con questo indirizzo e-mail.",es:"Ya existe una cuenta con este correo electrónico."})},{status:409});
  const result=await db.query("INSERT INTO users (email,name,password_hash,customer_id) VALUES ($1,$2,$3,'RF-' || UPPER(REPLACE(gen_random_uuid()::text,'-',''))) RETURNING id,customer_id,email,name",[email,name,await hashPassword(password)]);
  await createSession(result.rows[0].id); return NextResponse.json({success:true,user:result.rows[0]});
 }catch(error){console.error("RankFix registration failed:",error);return NextResponse.json({error:tr(language,{nl:"Account aanmaken mislukt. Probeer het opnieuw.",en:"Could not create account. Please try again.",de:"Konto konnte nicht erstellt werden. Bitte versuche es erneut.",fr:"Impossible de créer le compte. Veuillez réessayer.",it:"Impossibile creare l’account. Riprova.",es:"No se pudo crear la cuenta. Inténtalo de nuevo."})},{status:500});}
}