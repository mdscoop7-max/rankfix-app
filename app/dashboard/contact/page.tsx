"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardNav from "../nav";
import AiAssistant from "@/components/ai-assistant";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";

const copy:Record<Locale,{back:string;title:string;intro:string;name:string;email:string;company:string;optional:string;message:string;send:string;sending:string;sent:string;failed:string}>={
nl:{back:"Dashboard",title:"Contact",intro:"Een vraag over je scan, account of fix? Stuur ons direct een bericht.",name:"Naam",email:"E-mail",company:"Bedrijf",optional:"optioneel",message:"Bericht",send:"Bericht verzenden",sending:"Verzenden…",sent:"Bericht verzonden. We nemen zo snel mogelijk contact met je op.",failed:"Verzenden mislukt."},
en:{back:"Dashboard",title:"Contact",intro:"A question about your scan, account or fix? Send us a message.",name:"Name",email:"Email",company:"Company",optional:"optional",message:"Message",send:"Send message",sending:"Sending…",sent:"Message sent. We will contact you as soon as possible.",failed:"Could not send message."},
de:{back:"Dashboard",title:"Kontakt",intro:"Eine Frage zu deinem Scan, Konto oder Fix? Schreib uns direkt.",name:"Name",email:"E-Mail",company:"Unternehmen",optional:"optional",message:"Nachricht",send:"Nachricht senden",sending:"Senden…",sent:"Nachricht gesendet. Wir melden uns so schnell wie möglich.",failed:"Nachricht konnte nicht gesendet werden."},
fr:{back:"Tableau de bord",title:"Contact",intro:"Une question sur votre analyse, votre compte ou un correctif ? Envoyez-nous un message.",name:"Nom",email:"E-mail",company:"Entreprise",optional:"facultatif",message:"Message",send:"Envoyer le message",sending:"Envoi…",sent:"Message envoyé. Nous vous contacterons dès que possible.",failed:"Impossible d’envoyer le message."},
it:{back:"Dashboard",title:"Contatti",intro:"Hai una domanda sulla scansione, sull’account o su una correzione? Inviaci un messaggio.",name:"Nome",email:"E-mail",company:"Azienda",optional:"facoltativo",message:"Messaggio",send:"Invia messaggio",sending:"Invio…",sent:"Messaggio inviato. Ti contatteremo il prima possibile.",failed:"Impossibile inviare il messaggio."},
es:{back:"Panel",title:"Contacto",intro:"¿Tienes alguna pregunta sobre tu análisis, cuenta o corrección? Envíanos un mensaje.",name:"Nombre",email:"Correo electrónico",company:"Empresa",optional:"opcional",message:"Mensaje",send:"Enviar mensaje",sending:"Enviando…",sent:"Mensaje enviado. Nos pondremos en contacto contigo lo antes posible.",failed:"No se pudo enviar el mensaje."}
};

export default function Contact(){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(""),[language,setLanguage]=useState<Locale>("nl");
 const t=copy[language];
 useEffect(()=>{fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in copy)setLanguage(d.language)}).catch(()=>{})},[]);
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget;setBusy(true);setStatus("");const data=Object.fromEntries(new FormData(form));
  try{const r=await fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw new Error(d.error||t.failed);setStatus(t.sent);form.reset()}
  catch(e){setStatus(e instanceof Error?e.message:t.failed)}finally{setBusy(false)}
 }
 return <main className="rf-page" lang={language}><div className="rf-shell"><header className="rf-header"><Link href="/" className="rf-brand" aria-label="RankFix AI home">RankFix <span>AI</span></Link><Link href="/dashboard" className="rf-back">← {t.back}</Link></header><DashboardNav current={6}/><div className="rf-body"><div className="rf-heading"><h1>{t.title}</h1><p>{t.intro}</p></div><form className="rf-review-form" onSubmit={submit}><label>{t.name}<input name="name" required/></label><label>{t.email}<input name="email" type="email" required/></label><label>{t.company} <small>({t.optional})</small><input name="company"/></label><label>{t.message}<textarea name="message" rows={6} required/></label><button className="rf-primary" disabled={busy}>{busy?t.sending:t.send}</button>{status&&<p className="rf-review-status" role="status">{status}</p>}</form></div></div><AiAssistant dashboard/></main>
}
