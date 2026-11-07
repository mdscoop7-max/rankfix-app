"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import DashboardNav from "../nav";
import type {Locale} from "@/lib/locales";
import "../dashboard.css";

type Scan={id:string;scanned_url:string;created_at:string;open_issues:number;overall_score:number};
const names:Record<Locale,string[]> = {
 nl:["Mijn Fixes","Kies de nieuwste scan van je website. In het rapport selecteer je het probleem voor de veilige Fix. Oude resultaten zijn geen actuele bevestiging.","Scans laden…","Je hebt nog geen opgeslagen scan. Start een controle om verbeterpunten te kiezen.","Bekijk verbeterpunten →","Opnieuw scannen","open verbeterpunten","Nieuwe scan","Scans laden mislukt.","Terug naar overzicht","Nieuwste scan"],
 en:["My Fixes","Choose your newest website scan and select the issue in its report. Older results do not prove a current fix.","Loading scans…","No saved scans yet. Scan a site to choose an issue.","View improvements →","Scan again","open improvements","New scan","Could not load scans.","Back to overview","Latest scan"],
 de:["Meine Fixes","Wähle den neuesten Scan und danach einen Punkt im Bericht.","Scans werden geladen…","Noch keine Scans. Starte einen Scan.","Verbesserungen ansehen →","Erneut scannen","offene Punkte","Neuer Scan","Fehler beim Laden.","Zurück zur Übersicht","Neuester Scan"],
 fr:["Mes corrections","Choisissez la dernière analyse, puis un point du rapport.","Chargement…","Aucune analyse. Analysez votre site.","Voir les points →","Réanalyser","points ouverts","Nouvelle analyse","Erreur de chargement.","Retour au tableau de bord","Dernière analyse"],
 it:["Le mie correzioni","Scegli l'ultima scansione e il problema da correggere.","Caricamento…","Nessuna scansione. Avvia un'analisi.","Vedi miglioramenti →","Ripeti scansione","problemi aperti","Nuova scansione","Errore di caricamento.","Torna alla panoramica","Ultima scansione"],
 es:["Mis correcciones","Selecciona el análisis más reciente y el problema del informe.","Cargando…","No hay análisis. Inicia uno.","Ver mejoras →","Analizar de nuevo","problemas pendientes","Nuevo análisis","Error al cargar.","Volver al resumen","Último análisis"]
};
const host=(u:string)=>{try{return new URL(u).hostname.toLowerCase().replace(/^www\./,"")}catch{return u.toLowerCase()}};
export default function FixesHome(){
 const [language,setLanguage]=useState<Locale>("nl"),[history,setHistory]=useState<Scan[]>([]),[plan,setPlan]=useState("free"),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  Promise.all([fetch("/api/history",{cache:"no-store"}),fetch("/api/account/language",{cache:"no-store"})])
  .then(async([r,l])=>{
    if(r.status===401){window.location.replace("/account?next="+encodeURIComponent("/dashboard/fixes"));return}
    const d=await r.json();if(!r.ok)throw Error(d.error||"HISTORY_FAILED");
    const loc=l.ok?await l.json():null;
    if(active){setHistory(Array.isArray(d.history)?d.history:[]);setPlan(String(d.usage?.plan||"free").toLowerCase());if(loc?.language&&loc.language in names)setLanguage(loc.language as Locale)}
  }).catch(()=>{if(active)setError("HISTORY_FAILED")}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[]);
 const t=names[language];
 const scans=useMemo(()=>{
  const visible=plan==="free"?history.slice(0,1):history;
  const latestBySite=new Set<string>();
  return [...visible].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).filter(scan=>{
    const key=host(scan.scanned_url);
    if(latestBySite.has(key))return false;
    latestBySite.add(key);return true;
  });
 },[history,plan]);
 return <main className="rf-page" lang={language}><div className="rf-shell">
   <header className="rf-header"><Link href="/dashboard" className="rf-brand">RankFix <span>AI</span></Link></header>
   <DashboardNav current={3}/>
   <div className="rf-body"><Link className="rf-page-back" href="/dashboard">← {t[9]}</Link>
     <div className="rf-heading"><h1>{t[0]}</h1><p>{t[1]}</p></div>
     <div className="my-5"><Link href="/dashboard/scan" className="rf-primary-link inline-flex min-h-11 items-center px-4">{t[7]} →</Link></div>
     {loading&&<p role="status" className="rf-empty">{t[2]}</p>}
     {error&&<p role="alert" className="rf-alert">{t[8]}</p>}
     {!loading&&!error&&!scans.length&&<section className="rf-card p-5"><p>{t[3]}</p><Link href="/dashboard/scan" className="rf-primary-link mt-3 inline-flex min-h-11 items-center px-4">{t[7]} →</Link></section>}
     {!loading&&!error&&scans.length>0&&<div className="grid gap-4 md:grid-cols-2">{scans.map(scan=>
       <article key={scan.id} className="rf-card min-w-0 p-5">
         <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{t[10]}</span>
         <h2 className="mt-2 break-all text-lg font-bold">{host(scan.scanned_url)}</h2>
         <p className="mt-1 text-sm text-slate-400">{new Date(scan.created_at).toLocaleString(language)} · {scan.open_issues} {t[6]} · {scan.overall_score}/100</p>
         <div className="mt-4 flex flex-wrap gap-3">
           <Link href={"/dashboard/audit/"+encodeURIComponent(scan.id)} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#5DCAA5] px-4 py-3 text-center text-sm font-bold text-[#04342C]">{t[4]}</Link>
           <Link href={"/dashboard/scan?url="+encodeURIComponent(scan.scanned_url)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 px-4 py-3 text-center text-sm font-semibold">{t[5]}</Link>
         </div>
       </article>)}</div>}
   </div>
 </div></main>;
}
