"use client";
import { useEffect,useState } from "react";
import { type Locale } from "@/lib/locales";
const labels:Record<Locale,string[]>={nl:["Overzicht & websites","Scannen","Fixes","Zo werkt het","Reviews","Contact","Meer"],en:["Overview & websites","Scan","Fixes","How it works","Reviews","Contact","More"],fr:["Aperçu & sites","Scanner","Correctifs","Comment ça marche","Avis","Contact","Plus"],es:["Resumen y sitios","Escanear","Mejoras","Cómo funciona","Reseñas","Contacto","Más"],it:["Panoramica e siti","Scansiona","Modifiche","Come funziona","Recensioni","Contatti","Altro"],de:["Übersicht & Websites","Scannen","Fixes","So funktioniert es","Bewertungen","Kontakt","Mehr"]};
const flags:Record<Locale,string>={nl:"🇳🇱",en:"🇬🇧",fr:"🇫🇷",de:"🇩🇪",it:"🇮🇹",es:"🇪🇸"};
const desktop=["/dashboard","/dashboard/scan","/dashboard/github","/dashboard/how","/dashboard/reviews","/dashboard/contact","/dashboard/more"];
const mobile=[0,1,2,6];
const paths=["M3 10l9-7 9 7v10H3z M9 20v-7h6v7","M12 3v18 M3 12h18","M7 4l10 16 M17 4L7 20","M5 12h14 M12 5v14"];
export default function DashboardNav({current}:{current:number}){
 const [language,setLanguage]=useState<Locale>("nl");

 useEffect(()=>{fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in labels)setLanguage(d.language)}).catch(()=>{})},[]);
 async function changeLanguage(next:Locale){setLanguage(next);await fetch("/api/account/language",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({language:next})}).catch(()=>{});window.dispatchEvent(new CustomEvent("rankfix-language",{detail:next}));location.reload()}
 return <><nav className="rf-desktop-nav" aria-label="Dashboard menu"><div className="rf-desktop-main">{desktop.map((href,i)=><a key={href} href={href} aria-current={current===i?"page":undefined}>{labels[language][i]}</a>)}</div><div className="rf-desktop-tools"><select className="rf-dashboard-language" value={language} onChange={e=>changeLanguage(e.target.value as Locale)} aria-label="Taal">{(Object.keys(flags) as Locale[]).map(l=><option key={l} value={l}>{flags[l]} {l.toUpperCase()}</option>)}</select><a className="rf-site-link" href={`/${language}`}>← RankFix-site</a></div></nav>
 <nav className="rf-nav" aria-label="Mobiele dashboardnavigatie">{mobile.map((desktopIndex,mobileIndex)=><a key={desktopIndex} className={desktopIndex===1?"rf-nav-scan":undefined} href={desktop[desktopIndex]} aria-current={current===desktopIndex?"page":undefined}><span className="rf-nav-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[mobileIndex]}/></svg></span><span className="rf-nav-label">{labels[language][desktopIndex]}</span></a>)}</nav></>
}