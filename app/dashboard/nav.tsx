"use client";
import { useEffect, useState } from "react";
import { type Locale } from "@/lib/locales";
const labels: Record<Locale,[string,string,string,string,string]> = {
 nl:["Overzicht","Websites","Scan","Fixes","Account"], en:["Overview","Websites","Scan","Fixes","Account"], fr:["Aperçu","Sites","Audit","Correctifs","Compte"], es:["Resumen","Sitios","Analizar","Mejoras","Cuenta"], it:["Panoramica","Siti","Analisi","Modifiche","Account"], de:["Übersicht","Websites","Scan","Fixes","Konto"]
};
const links = ["/dashboard","/dashboard#websites","", "/dashboard/github", "/dashboard/account"];
const paths = ["M3 10l9-7 9 7v10H3z M9 20v-7h6v7","M3 5h18v14H3z M3 10h18 M9 10v9","M12 3v18 M3 12h18","M7 4l10 16 M17 4L7 20","M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-2a8 8 0 0 1 16 0v2"];
export default function DashboardNav({ current }: { current: number }) {
 const [language,setLanguage] = useState<Locale>("nl");
 useEffect(() => { fetch("/api/account/language").then(r => r.ok ? r.json() : null).then(d => { if(d?.language && d.language in labels) setLanguage(d.language); }).catch(() => {}); },[]);
 return <nav className="rf-nav" aria-label="Dashboard navigation">{links.map((href,index) => <a key={index} className={index === 2 ? "rf-nav-scan" : undefined} href={index === 2 ? `/${language}/scan` : href} aria-current={current === index ? "page" : undefined}><span className="rf-nav-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[index]}/></svg></span><span className="rf-nav-label">{labels[language][index]}</span></a>)}</nav>;
}
