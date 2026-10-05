"use client";
import { useEffect,useState } from "react";
import { usePathname } from "next/navigation";
import { type Locale } from "@/lib/locales";

const labels:Record<Locale,string[]>={
 nl:["Overzicht","Websites","Scannen","Fixes","Historie","Meer"],
 en:["Overview","Websites","Scan","Fixes","History","More"],
 fr:["Aperçu","Sites","Scanner","Correctifs","Historique","Plus"],
 es:["Resumen","Webs","Escanear","Mejoras","Historial","Más"],
 it:["Panoramica","Siti","Scansiona","Modifiche","Cronologia","Altro"],
 de:["Übersicht","Websites","Scannen","Fixes","Verlauf","Mehr"]
};
const siteLabels:Record<Locale,string>={nl:"Terug naar site",en:"Back to site",fr:"Retour au site",es:"Volver al sitio",it:"Torna al sito",de:"Zurück zur Website"};
const languageLabels:Record<Locale,string>={nl:"Taal kiezen",en:"Choose language",fr:"Choisir la langue",es:"Elegir idioma",it:"Scegli lingua",de:"Sprache wählen"};
const flagCodes:Record<Locale,string>={nl:"nl",en:"gb",de:"de",fr:"fr",it:"it",es:"es"};
const languageOrder:Locale[]=["nl","en","de","fr","it","es"];
const desktop=["/dashboard","/dashboard#websites","/dashboard/scan","/dashboard/github","/dashboard/history","/dashboard/more"];
const mobileIndexes=[0,1,2,3,5];
const paths=[
 "M4 13h5l2-8 3 14 2-6h4",
 "M4 5h16v14H4z M8 9h8 M8 13h5 M17 3v4 M7 17v4",
 "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
 "M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.3 2.3-3-3L14.7 6.3z M18 3v3 M16.5 4.5h3",
 "M4 6h16 M4 12h10 M4 18h7 M18 14v6 M15 17h6",
 "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z"
];

function activeIndex(pathname:string){
 if(pathname==="/dashboard") return 0;
 if(pathname.startsWith("/dashboard/scan")) return 2;
 if(pathname.startsWith("/dashboard/github")||pathname.startsWith("/dashboard/fix")) return 3;
 if(pathname.startsWith("/dashboard/history")||pathname.startsWith("/dashboard/reports")) return 4;
 if(pathname.startsWith("/dashboard/help")) return 5;
 if(pathname.startsWith("/dashboard/audit")) return 0;
 if(pathname.startsWith("/dashboard/")) return 5;
 return 0;
}

export default function DashboardNav({current:currentOverride}:{current?:number}){
 const pathname=usePathname()||"/dashboard";
 const current=activeIndex(pathname);
 const [language,setLanguage]=useState<Locale>("nl");
 const [languageOpen,setLanguageOpen]=useState(false);
 useEffect(()=>{fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in labels)setLanguage(d.language)}).catch(()=>{})},[]);
 useEffect(()=>{const brand=document.querySelector<HTMLAnchorElement>(".rf-brand");if(brand){brand.href="/"+language;brand.setAttribute("aria-label","RankFix AI home")}},[language]);
 async function changeLanguage(next:Locale){setLanguage(next);await fetch("/api/account/language",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({language:next})}).catch(()=>{});window.dispatchEvent(new CustomEvent("rankfix-language",{detail:next}));location.reload()}
 const siteHref="/"+language;
 return <><nav className="rf-desktop-nav" aria-label={language==="nl"?"Dashboardmenu":language==="de"?"Dashboard-Menü":language==="fr"?"Menu du tableau de bord":language==="it"?"Menu dashboard":language==="es"?"Menú del panel":"Dashboard menu"}><div className="rf-desktop-main">{desktop.map((href,i)=><a key={href} href={href} aria-current={current===i?"page":undefined}>{labels[language][i]}</a>)}</div><div className="rf-desktop-tools"><div className="rf-desktop-language-menu"><button type="button" className="rf-language-chip rf-language-trigger" aria-label={languageLabels[language]} aria-expanded={languageOpen} onClick={()=>setLanguageOpen(v=>!v)}><span className={"rf-flag rf-flag-"+flagCodes[language]} aria-hidden="true"/><span>{language.toUpperCase()}</span><span aria-hidden="true">⌄</span></button>{languageOpen&&<div className="rf-language-dropdown" role="menu">{languageOrder.map(l=><button key={l} type="button" role="menuitem" className="rf-language-chip" aria-current={language===l?"true":undefined} onClick={()=>{setLanguageOpen(false);void changeLanguage(l)}}><span className={"rf-flag rf-flag-"+flagCodes[l]} aria-hidden="true"/><span>{l.toUpperCase()}</span></button>)}</div>}</div><a className="rf-site-link" href={siteHref}>← {siteLabels[language]}</a></div></nav>
 <a className="rf-mobile-site-link" href={siteHref}>← {siteLabels[language]}</a>
 <nav className="rf-nav" aria-label={language==="nl"?"Mobiele dashboardnavigatie":language==="de"?"Mobile Dashboard-Navigation":language==="fr"?"Navigation mobile du tableau de bord":language==="it"?"Navigazione mobile dashboard":language==="es"?"Navegación móvil del panel":"Mobile dashboard navigation"}>{mobileIndexes.map(i=>{const href=desktop[i];return <a key={href} className={`rf-nav-${["overview","websites","scan","fixes","history","more"][i]}`} href={href} aria-current={current===i?"page":undefined}><span className={`rf-nav-icon rf-nav-icon-${["overview","websites","scan","fixes","history","more"][i]}`}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[i]||paths[4]}/></svg></span><span className="rf-nav-label">{labels[language][i]}</span></a>})}</nav></>
}

