"use client";
import { useEffect,useState } from "react";
import { usePathname } from "next/navigation";
import { type Locale } from "@/lib/locales";

const labels:Record<Locale,string[]>={
 nl:["Overzicht","Scannen","Fixes","Historie","Meer"],
 en:["Overview","Scan","Fixes","History","More"],
 fr:["Aperçu","Scanner","Correctifs","Historique","Plus"],
 es:["Resumen","Escanear","Mejoras","Historial","Más"],
 it:["Panoramica","Scansiona","Modifiche","Cronologia","Altro"],
 de:["Übersicht","Scannen","Fixes","Verlauf","Mehr"]
};
const siteLabels:Record<Locale,string>={nl:"Terug naar site",en:"Back to site",fr:"Retour au site",es:"Volver al sitio",it:"Torna al sito",de:"Zurück zur Website"};
const flagCodes:Record<Locale,string>={nl:"nl",en:"gb",de:"de",fr:"fr",it:"it",es:"es"};
const languageOrder:Locale[]=["nl","en","de","fr","it","es"];
const desktop=["/dashboard","/dashboard/scan","/dashboard/github","/dashboard/history","/dashboard/more"];
const paths=["M3 10l9-7 9 7v10H3z M9 20v-7h6v7","M12 3v18 M3 12h18","M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.3 2.3-3-3L14.7 6.3z","M4 6h16 M4 12h16 M4 18h10","M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"];

function activeIndex(pathname:string){
 if(pathname==="/dashboard") return 0;
 if(pathname.startsWith("/dashboard/scan")) return 1;
 if(pathname.startsWith("/dashboard/github")||pathname.startsWith("/dashboard/fix")) return 2;
 if(pathname.startsWith("/dashboard/history")||pathname.startsWith("/dashboard/audit")||pathname.startsWith("/dashboard/reports")) return 3;
 if(pathname.startsWith("/dashboard/")) return 4;
 return 0;
}

export default function DashboardNav({current:legacyCurrent}:{current?:number}){
 const pathname=usePathname()||"/dashboard";
 const current=activeIndex(pathname);
 const [language,setLanguage]=useState<Locale>("nl");
 useEffect(()=>{fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in labels)setLanguage(d.language)}).catch(()=>{})},[]);
 useEffect(()=>{const brand=document.querySelector<HTMLAnchorElement>(".rf-brand");if(brand){brand.href="/"+language;brand.setAttribute("aria-label","RankFix AI home")}},[language]);
 async function changeLanguage(next:Locale){setLanguage(next);await fetch("/api/account/language",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({language:next})}).catch(()=>{});window.dispatchEvent(new CustomEvent("rankfix-language",{detail:next}));location.reload()}
 const siteHref="/"+language;
 return <><nav className="rf-desktop-nav" aria-label="Dashboard menu"><div className="rf-desktop-main">{desktop.map((href,i)=><a key={href} href={href} aria-current={current===i?"page":undefined}>{labels[language][i]}</a>)}</div><div className="rf-desktop-tools"><div className="rf-desktop-languages" aria-label="Language">{languageOrder.map(l=><button key={l} type="button" className="rf-language-chip" aria-current={language===l?"true":undefined} onClick={()=>changeLanguage(l)}><span className={"rf-flag rf-flag-"+flagCodes[l]} aria-hidden="true"/><span>{l.toUpperCase()}</span></button>)}</div><a className="rf-site-link" href={siteHref}>← {siteLabels[language]}</a></div></nav>
 <a className="rf-mobile-site-link" href={siteHref}>← {siteLabels[language]}</a>
 <nav className="rf-nav" aria-label="Mobiele dashboardnavigatie">{desktop.map((href,i)=><a key={href} href={href} aria-current={current===i?"page":undefined}><span className="rf-nav-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[i]}/></svg></span><span className="rf-nav-label">{labels[language][i]}</span></a>)}</nav></>
}
