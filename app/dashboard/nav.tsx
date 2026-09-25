"use client";
import { useEffect,useState } from "react";
import { type Locale } from "@/lib/locales";

const mobileLabels:Record<Locale,string[]>={nl:["Overzicht","Websites","Scannen","Fixes","Meer"],en:["Overview","Websites","Scan","Fixes","More"],fr:["Aperçu","Sites","Scanner","Correctifs","Plus"],es:["Resumen","Sitios","Escanear","Mejoras","Más"],it:["Panoramica","Siti","Scansiona","Modifiche","Altro"],de:["Übersicht","Websites","Scannen","Fixes","Mehr"]};
const desktopExtra:Record<Locale,string[]>={nl:["Zo werkt het","Reviews","Contact","Naar RankFix-site"],en:["How it works","Reviews","Contact","RankFix site"],fr:["Comment ça marche","Avis","Contact","Site RankFix"],es:["Cómo funciona","Reseñas","Contacto","Sitio RankFix"],it:["Come funziona","Recensioni","Contatti","Sito RankFix"],de:["So funktioniert es","Bewertungen","Kontakt","RankFix-Seite"]};
const links=["/dashboard","/dashboard#websites","scan","/dashboard/github","/dashboard/more"];
const paths=["M3 10l9-7 9 7v10H3z M9 20v-7h6v7","M3 5h18v14H3z M3 10h18 M9 10v9","M12 3v18 M3 12h18","M7 4l10 16 M17 4L7 20","M5 12h14 M12 5v14"];
export default function DashboardNav({current}:{current:number}){
 const [language,setLanguage]=useState<Locale>("nl");
 useEffect(()=>{fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in mobileLabels)setLanguage(d.language)}).catch(()=>{})},[]);
 const base=`/${language}`;
 return <><nav className="rf-desktop-nav" aria-label="Dashboard menu">
   <div className="rf-desktop-main">
    {links.slice(0,4).map((href,i)=><a key={href} href={href==="scan"?base+"/scan":href} aria-current={current===i?"page":undefined}>{mobileLabels[language][i]}</a>)}
    <a href={base+"#how"}>{desktopExtra[language][0]}</a>
    <a href="/dashboard/reviews">{desktopExtra[language][1]}</a>
    <a href={base+"/contact"}>{desktopExtra[language][2]}</a>
    <a href="/dashboard/more">{mobileLabels[language][4]}</a>
   </div>
   <a className="rf-site-link" href={base}>← {desktopExtra[language][3]}</a>
  </nav>
  <nav className="rf-nav" aria-label="Mobiele dashboardnavigatie">{links.map((href,index)=><a key={index} className={index===2?"rf-nav-scan":undefined} href={href==="scan"?base+"/scan":href} aria-current={current===index?"page":undefined}><span className="rf-nav-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[index]}/></svg></span><span className="rf-nav-label">{mobileLabels[language][index]}</span></a>)}</nav></>;
}