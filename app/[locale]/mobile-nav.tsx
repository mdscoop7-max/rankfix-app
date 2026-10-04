"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { copy, type Locale } from "@/lib/locales";

const publicIcons=[
"M3 10l9-7 9 7v10H3z M9 20v-7h6v7","M12 3v18 M3 12h18","M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2","M3 7h18v12H3z M3 11h18 M7 15h4","M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-2a8 8 0 0 1 16 0v2"];
const appIcons=[
"M3 10l9-7 9 7v10H3z M9 20v-7h6v7","M12 3v18 M3 12h18","M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.3 2.3-3-3L14.7 6.3z","M4 6h16 M4 12h16 M4 18h10","M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"];
const home:Record<Locale,string>={nl:"Home",en:"Home",fr:"Accueil",es:"Inicio",it:"Home",de:"Start"};
const appLabels:Record<Locale,string[]>={nl:["Overzicht","Scannen","Fixes","Historie","Meer"],en:["Overview","Scan","Fixes","History","More"],fr:["Aperçu","Scanner","Correctifs","Historique","Plus"],es:["Resumen","Escanear","Mejoras","Historial","Más"],it:["Panoramica","Scansiona","Modifiche","Cronologia","Altro"],de:["Übersicht","Scannen","Fixes","Verlauf","Mehr"]};

export default function MobileNav({locale,page}:{locale:Locale;page:string}){
 const t=copy[locale]; const [signedIn,setSignedIn]=useState(false); const [ready,setReady]=useState(false);
 const initialActive=page==="scan"?1:page===""?0:-1; const [active,setActive]=useState(initialActive);
 useEffect(()=>{fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).then(d=>{setSignedIn(Boolean(d?.user));setReady(true)}).catch(()=>setReady(true))},[]);
 useEffect(()=>{const sync=()=>{if(page==="scan")return setActive(1);const hash=window.location.hash;setActive(hash==="#how"?2:hash==="#pricing"?3:0)};sync();window.addEventListener("hashchange",sync);return()=>window.removeEventListener("hashchange",sync)},[page]);
 if(ready&&signedIn){
  const links=["/dashboard","/dashboard/scan","/dashboard/github","/dashboard/history","/dashboard/more"];
  return <nav className="lc-bottom-nav lc-bottom-nav-app" aria-label="RankFix app navigation">{links.map((href,index)=><Link key={href} href={href}><span className="lc-bottom-icon"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={appIcons[index]}/></svg></span><span>{appLabels[locale][index]}</span></Link>)}</nav>
 }
 const links=[`/${locale}`,`/${locale}/scan`,`/${locale}#how`,`/${locale}#pricing`,`/account?lang=${locale}`];
 const labels=[home[locale],t.nav[0],t.nav[1],t.nav[3],t.signIn];
 return <nav className="lc-bottom-nav" aria-label="Mobile navigation">{links.map((href,index)=><Link key={index} href={href} onClick={()=>setActive(index)} aria-current={index===active?"page":undefined}><span className="lc-bottom-icon"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={publicIcons[index]}/></svg></span><span>{labels[index]}</span></Link>)}</nav>
}