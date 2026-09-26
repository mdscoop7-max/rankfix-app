"use client";

import { useEffect, useState } from "react";
import DashboardNav from "../nav";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";

type Check = { status: string };
type Result = {
  overallScore: number;
  grade?: string;
  seo?: { score: number; checks?: Check[] };
  geo?: { score: number; checks?: Check[] };
};

const text: Record<Locale,{title:string;intro:string;url:string;run:string;running:string;score:string;issues:string;passed:string;next:string}> = {
  nl:{title:"SEO + GEO scan",intro:"Dezelfde RankFix-scan als de gratis scan, nu binnen je dashboard. Nieuwe scans worden aan je historie gekoppeld.",url:"Website URL",run:"Scan starten",running:"Scan wordt uitgevoerd…",score:"Overall score",issues:"verbeterpunten",passed:"controles geslaagd",next:"Na de scan kun je het volledige auditrapport, historie en beschikbare fixes vanuit je dashboard openen."},
  en:{title:"SEO + GEO scan",intro:"The same RankFix scan as the free scan, now inside your dashboard. New scans are linked to your history.",url:"Website URL",run:"Start scan",running:"Scan in progress…",score:"Overall score",issues:"improvements",passed:"checks passed",next:"After the scan you can open the full audit report, history and available fixes from your dashboard."},
  fr:{title:"Scan SEO + GEO",intro:"Le même scan RankFix que le scan gratuit, maintenant dans votre tableau de bord.",url:"URL du site",run:"Lancer le scan",running:"Analyse en cours…",score:"Score global",issues:"améliorations",passed:"contrôles réussis",next:"Après le scan, ouvrez le rapport complet, l’historique et les correctifs depuis le tableau de bord."},
  de:{title:"SEO + GEO Scan",intro:"Derselbe RankFix-Scan wie der kostenlose Scan, jetzt direkt im Dashboard.",url:"Website-URL",run:"Scan starten",running:"Scan läuft…",score:"Gesamtscore",issues:"Verbesserungen",passed:"Prüfungen bestanden",next:"Danach kannst du Audit, Verlauf und verfügbare Fixes direkt im Dashboard öffnen."},
  it:{title:"Scansione SEO + GEO",intro:"La stessa scansione RankFix gratuita, ora direttamente nella dashboard.",url:"URL sito",run:"Avvia scansione",running:"Scansione in corso…",score:"Punteggio totale",issues:"miglioramenti",passed:"controlli superati",next:"Dopo la scansione puoi aprire audit, cronologia e fix dalla dashboard."},
  es:{title:"Análisis SEO + GEO",intro:"El mismo análisis gratuito de RankFix, ahora dentro de tu panel.",url:"URL del sitio",run:"Iniciar análisis",running:"Analizando…",score:"Puntuación general",issues:"mejoras",passed:"controles superados",next:"Después puedes abrir la auditoría, el historial y las correcciones desde tu panel."}
};

export default function DashboardScan() {
  const [language,setLanguage]=useState<Locale>("nl");
  const [url,setUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  useEffect(()=>{fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in text)setLanguage(d.language)}).catch(()=>{})},[]);
  const t=text[language];
  async function run(event:React.FormEvent){
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try{
      const response=await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,mode:"both"})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Scan mislukt.");
      setResult(data);
    }catch(cause){setError(cause instanceof Error?cause.message:"Scan mislukt.");}
    finally{setBusy(false);}
  }
  const checks=[...(result?.seo?.checks||[]),...(result?.geo?.checks||[])];
  const issues=checks.filter(c=>c.status==="fail"||c.status==="warning").length;
  const passed=checks.filter(c=>c.status==="pass").length;
  return <main className="rf-page" lang={language}><div className="rf-shell">
    <header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard/account" className="rf-avatar" aria-label="Account">D</a></header>
    <DashboardNav current={1}/>
    <div className="rf-body">
      <div className="rf-heading"><h1>{t.title}</h1><p>{t.intro}</p></div>
      <section className="rf-dashboard-scan rf-shared-scan">
        <div className="rf-shared-scan-badge">SEO + GEO · Google & AI Search</div>
        <form onSubmit={run}><label htmlFor="dashboard-scan-url">{t.url}</label><div className="rf-shared-scan-form"><input id="dashboard-scan-url" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" required/><button className="rf-primary" type="submit" disabled={busy}>{busy?t.running:t.run}</button></div></form>
        <div className="rf-shared-scan-meta"><span>✓ SEO</span><span>✓ GEO</span><span>✓ Techniek</span><span>✓ Webshop</span><span>✓ Ads & analytics</span></div>
      </section>
      {error&&<p className="rf-alert" role="alert">{error}</p>}
      {busy&&<section className="rf-scan-progress" aria-live="polite"><div className="rf-scan-spinner"/><div><strong>{t.running}</strong><p>SEO · GEO · techniek · webshop · Ads & analytics</p></div></section>}
      {result&&<section className="rf-report rf-shared-result" aria-live="polite"><div className="rf-shared-score" style={{"--rf-score":result.overallScore} as React.CSSProperties}><strong>{result.overallScore}</strong><span>/100</span></div><div><span className="rf-eyebrow">{t.score}</span><h2>SEO {result.seo?.score??"—"} · GEO {result.geo?.score??"—"}</h2><p>{passed} {t.passed} · {issues} {t.issues}</p><p>{t.next}</p><div className="rf-shared-actions"><a className="rf-primary-link" href="/dashboard/history">Historie</a><a className="rf-back" href="/dashboard">← Dashboard</a></div></div></section>}
    </div>
  </div></main>;
}
