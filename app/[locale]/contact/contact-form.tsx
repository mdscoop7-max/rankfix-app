"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locales";

const labels: Record<Locale,{name:string;email:string;company:string;message:string;send:string;sending:string;success:string}> = {
 nl:{name:"Naam",email:"E-mailadres",company:"Bedrijf (optioneel)",message:"Waar kunnen we mee helpen?",send:"Bericht versturen",sending:"Versturen…",success:"Bedankt. Je bericht is verzonden."},
 en:{name:"Name",email:"Email address",company:"Company (optional)",message:"How can we help?",send:"Send message",sending:"Sending…",success:"Thanks. Your message has been sent."},
 fr:{name:"Nom",email:"Adresse e-mail",company:"Entreprise (facultatif)",message:"Comment pouvons-nous vous aider ?",send:"Envoyer",sending:"Envoi…",success:"Merci. Votre message a été envoyé."},
 de:{name:"Name",email:"E-Mail-Adresse",company:"Unternehmen (optional)",message:"Wie können wir helfen?",send:"Nachricht senden",sending:"Senden…",success:"Danke. Deine Nachricht wurde gesendet."},
 it:{name:"Nome",email:"Indirizzo e-mail",company:"Azienda (opzionale)",message:"Come possiamo aiutarti?",send:"Invia messaggio",sending:"Invio…",success:"Grazie. Il messaggio è stato inviato."},
 es:{name:"Nombre",email:"Correo electrónico",company:"Empresa (opcional)",message:"¿Cómo podemos ayudarte?",send:"Enviar mensaje",sending:"Enviando…",success:"Gracias. Tu mensaje ha sido enviado."}
};
export default function ContactForm({locale}:{locale:Locale}){
 const t=labels[locale]; const [busy,setBusy]=useState(false); const [status,setStatus]=useState(""); const [ok,setOk]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault(); setBusy(true); setStatus(""); setOk(false);
  const form=new FormData(e.currentTarget);
  try{
   const r=await fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:form.get("name"),email:form.get("email"),company:form.get("company"),message:form.get("message")})});
   const d=await r.json();
   if(!r.ok) throw new Error(d.error||"Message could not be sent.");
   setOk(true); setStatus(t.success); e.currentTarget.reset();
  }catch(err){setStatus(err instanceof Error?err.message:"Message could not be sent.");}
  finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="mt-6 grid gap-4">
  <label className="grid gap-2 text-sm font-semibold">{t.name}<input name="name" required maxLength={120} className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-emerald-300"/></label>
  <label className="grid gap-2 text-sm font-semibold">{t.email}<input name="email" type="email" required maxLength={180} className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-emerald-300"/></label>
  <label className="grid gap-2 text-sm font-semibold">{t.company}<input name="company" maxLength={180} className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-emerald-300"/></label>
  <label className="grid gap-2 text-sm font-semibold">{t.message}<textarea name="message" required minLength={10} maxLength={3000} rows={6} className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none focus:border-emerald-300"/></label>
  <button disabled={busy} className="lc-primary justify-self-start disabled:opacity-60">{busy?t.sending:t.send}</button>
  {status&&<p role="status" className={ok?"text-emerald-300":"text-red-300"}>{status}</p>}
 </form>;
}