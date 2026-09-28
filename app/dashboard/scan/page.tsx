"use client";

import { useEffect, useState } from "react";
import DashboardNav from "../nav";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";

type Check = { status: string };
type Result = {
  scanId?: string | null;
  overallScore: number;
  grade?: string;
  seo?: { score: number; checks?: Check[] };
  geo?: { score: number; checks?: Check[] };
};

const text: Record<Locale,{title:string;intro:string;url:string;run:string;running:string;score:string;issues:string;passed:string;next:string;technical:string;shop:string;ads:string;history:string;dashboard:string;failed:string;reportFailed:string}> = {
  nl:{title:"SEO + GEO scan",intro:"Dezelfde RankFix-scan als de gratis scan, nu binnen je dashboard. Nieuwe scans worden aan je historie gekoppeld.",url:"Website URL",run:"Scan starten",running:"Scan wordt uitgevoerd…",score:"Overall score",issues:"verbeterpunten",passed:"controles geslaagd",next:"Na de scan kun je het volledige auditrapport, historie en beschikbare fixes vanuit je dashboard openen.",technical:"Techniek",shop:"Webshop",ads:"Ads & analytics",history:"Historie",dashboard:"Dashboard",failed:"Scan mislukt.",reportFailed:"De scan is uitgevoerd, maar het auditrapport kon niet worden geopend."},
  en:{title:"SEO + GEO scan",intro:"The same RankFix scan as the free scan, now inside your dashboard. New scans are linked to your history.",url:"Website URL",run:"Start scan",running:"Scan in progress…",score:"Overall score",issues:"improvements",passed:"checks passed",next:"After the scan you can open the full audit report, history and available fixes from your dashboard.",technical:"Technical",shop:"Online store",ads:"Ads & analytics",history:"History",dashboard:"Dashboard",failed:"Scan failed.",reportFailed:"The scan completed, but the audit report could not be opened."},
  fr:{title:"Scan SEO + GEO",intro:"Le même scan RankFix que le scan gratuit, maintenant dans votre tableau de bord.",url:"URL du site",run:"Lancer le scan",running:"Analyse en cours…",score:"Score global",issues:"améliorations",passed:"contrôles réussis",next:"Après le scan, ouvrez le rapport complet, l’historique et les correctifs depuis le tableau de bord.",technical:"Technique",shop:"Boutique en ligne",ads:"Ads & analytics",history:"Historique",dashboard:"Tableau de bord",failed:"Analyse échouée.",reportFailed:"L’analyse est terminée, mais le rapport d’audit n’a pas pu être ouvert."},
  de:{title:"SEO + GEO Scan",intro:"Derselbe RankFix-Scan wie der kostenlose Scan, jetzt direkt im Dashboard.",url:"Website-URL",run:"Scan starten",running:"Scan läuft…",score:"Gesamtscore",issues:"Verbesserungen",passed:"Prüfungen bestanden",next:"Danach kannst du Audit, Verlauf und verfügbare Fixes direkt im Dashboard öffnen.",technical:"Technik",shop:"Onlineshop",ads:"Ads & Analytics",history:"Verlauf",dashboard:"Dashboard",failed:"Scan fehlgeschlagen.",reportFailed:"Der Scan wurde ausgeführt, aber der Auditbericht konnte nicht geöffnet werden."},
  it:{title:"Scansione SEO + GEO",intro:"La stessa scansione RankFix gratuita, ora direttamente nella dashboard.",url:"URL sito",run:"Avvia scansione",running:"Scansione in corso…",score:"Punteggio totale",issues:"miglioramenti",passed:"controlli superati",next:"Dopo la scansione puoi aprire audit, cronologia e fix dalla dashboard.",technical:"Tecnica",shop:"Negozio online",ads:"Ads e analytics",history:"Cronologia",dashboard:"Dashboard",failed:"Scansione non riuscita.",reportFailed:"La scansione è stata completata, ma non è stato possibile aprire il report di audit."},
  es:{title:"Análisis SEO + GEO",intro:"El mismo análisis gratuito de RankFix, ahora dentro de tu panel.",url:"URL del sitio",run:"Iniciar análisis",running:"Analizando…",score:"Puntuación general",issues:"mejoras",passed:"controles superados",next:"Después puedes abrir la auditoría, el historial y las correcciones desde tu panel.",technical:"Técnica",shop:"Tienda online",ads:"Ads y analítica",history:"Historial",dashboard:"Panel",failed:"El análisis ha fallado.",reportFailed:"El análisis terminó, pero no se pudo abrir el informe de auditoría."}
};

export default function DashboardScan() {
  const [language,setLanguage]=useState<Locale>("nl");
  const [url,setUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [usage,setUsage]=useState<{plan:string;used:number;limit:number|null}>({plan:"free",used:0,limit:2});
  useEffect(()=>{fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in text)setLanguage(d.language)}).catch(()=>{});fetch("/api/history",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(d?.usage)setUsage(d.usage)}).catch(()=>{})},[]);
  const t=text[language];
  async function run(event:React.FormEvent){
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try{
      const response=await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,mode:"both",dashboard:true,language})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||t.failed);
      if(data.scanId){ location.href="/dashboard/audit/"+encodeURIComponent(data.scanId); return; }
      throw new Error(t.reportFailed);
    }catch(cause){setError(cause instanceof Error?cause.message:t.failed);}
    finally{setBusy(false);}
  }
  const checks=[...(result?.seo?.checks||[]),...(result?.geo?.checks||[])];
  const issues=checks.filter(c=>c.status==="fail"||c.status==="warning").length;
  const passed=checks.filter(c=>c.status==="pass").length;
  return <main className="rf-page" lang={language}><div className="rf-shell">
    <header className="rf-header"><a href="/" className="rf-brand" aria-label="RankFix AI home">RankFix <span>AI</span></a><a href="/dashboard/account" className="rf-avatar" aria-label="Account">D</a></header>
    <DashboardNav current={1}/>
    <div className="rf-body">
      <div className="rf-heading"><h1>{t.title}</h1><p>{t.intro}</p></div>
      {usage.plan==="free"&&<section className="rf-plan-card"><div><span className="rf-eyebrow">Free · €0</span><h2>{usage.used} / {usage.limit??2} {language==="nl"?"scans deze maand":language==="de"?"Scans diesen Monat":language==="fr"?"analyses ce mois-ci":language==="it"?"scansioni questo mese":language==="es"?"análisis este mes":"scans this month"}</h2><p>{usage.used>=(usage.limit??2)?(language==="nl"?"Je gratis scans zijn gebruikt. Je bestaande rapport blijft beschikbaar. Upgrade voor nieuwe scans en Premium-functies.":language==="de"?"Deine kostenlosen Scans sind aufgebraucht. Dein bestehender Bericht bleibt verfügbar. Upgrade für neue Scans und Premium-Funktionen.":language==="fr"?"Vos analyses gratuites sont utilisées. Votre rapport reste disponible. Passez à une offre supérieure pour de nouvelles analyses et les fonctions Premium.":language==="it"?"Hai utilizzato le scansioni gratuite. Il report esistente resta disponibile. Passa a un piano superiore per nuove scansioni e funzioni Premium.":language==="es"?"Has utilizado tus análisis gratuitos. Tu informe sigue disponible. Mejora el plan para nuevos análisis y funciones Premium.":"Your free scans have been used. Your existing report remains available. Upgrade for new scans and Premium features."):(language==="nl"?"Free bevat 1 website en 2 volledige scans per maand.":language==="de"?"Free enthält 1 Website und 2 vollständige Scans pro Monat.":language==="fr"?"L’offre gratuite comprend 1 site et 2 analyses complètes par mois.":language==="it"?"Free include 1 sito e 2 scansioni complete al mese.":language==="es"?"Free incluye 1 web y 2 análisis completos al mes.":"Free includes 1 website and 2 full scans per month.")}</p></div>{usage.used>=(usage.limit??2)&&<a className="rf-primary-link" href={`/${language}#pricing`}>{language==="nl"?"Bekijk abonnementen":language==="de"?"Tarife ansehen":language==="fr"?"Voir les offres":language==="it"?"Vedi i piani":language==="es"?"Ver planes":"View plans"}</a>}</section>}
      <section className="rf-dashboard-scan rf-shared-scan">
        <div className="rf-shared-scan-badge">SEO + GEO · Google & AI Search</div>
        <form onSubmit={run}><label htmlFor="dashboard-scan-url">{t.url}</label><div className="rf-shared-scan-form"><input id="dashboard-scan-url" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" required/><button className="rf-primary" type="submit" disabled={busy||(usage.plan==="free"&&usage.used>=(usage.limit??2))}>{busy?t.running:t.run}</button></div></form>
        <div className="rf-shared-scan-meta"><span>✓ SEO</span><span>✓ GEO</span><span>✓ {t.technical}</span><span>✓ {t.shop}</span><span>✓ {t.ads}</span></div>
      </section>
      {error&&<p className="rf-alert" role="alert">{error}</p>}
      {busy&&<section className="rf-scan-progress" aria-live="polite"><div className="rf-scan-spinner"/><div><strong>{t.running}</strong><p>SEO · GEO · {t.technical} · {t.shop} · {t.ads}</p></div></section>}
      {result&&<section className="rf-report rf-shared-result" aria-live="polite"><div className="rf-shared-score" style={{"--rf-score":result.overallScore} as React.CSSProperties}><strong>{result.overallScore}</strong><span>/100</span></div><div><span className="rf-eyebrow">{t.score}</span><h2>SEO {result.seo?.score??"—"} · GEO {result.geo?.score??"—"}</h2><p>{passed} {t.passed} · {issues} {t.issues}</p><p>{t.next}</p><div className="rf-shared-actions"><a className="rf-primary-link" href="/dashboard/history">{t.history}</a><a className="rf-back" href="/dashboard">← {t.dashboard}</a></div></div></section>}
    </div>
  </div></main>;
}
