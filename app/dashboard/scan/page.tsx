"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardFrame from "../frame";
import ScanProgress from "@/components/scan-progress";
import AiAssistant from "@/components/ai-assistant";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";
import { ScoreQualifier } from "@/components/score-qualifier";
import { headlineDisplay } from "@/lib/score-qualifier";
import { readRecentScanUrls, rememberScanUrl, forgetRecentScanUrls } from "@/lib/recent-scan-urls";
import { downloadQaAuditPdf } from "@/lib/qa-audit-pdf";

type Check = { status: string; title?: string; message?: string; fix?: string };
type Result = {
  scanId?: string | null;
  overallScore: number;
  grade?: string;
  seo?: { score: number; checks?: Check[] };
  geo?: { score: number; checks?: Check[] };
  security?: { score: number };
  sectorProfile?: { label?: string; sector?: string };
  classification?: { sector?: string; websiteType?: string };
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const verificationUrl = searchParams.get("url") || "";
  const verificationIssue = searchParams.get("verify_issue") || "";
  const [language,setLanguage]=useState<Locale>("nl");
  const [url,setUrl]=useState("");
  const [websites,setWebsites]=useState<string[]>([]);
  const [urlError,setUrlError]=useState("");
  const [busy,setBusy]=useState(false);
  const [scanAbort,setScanAbort]=useState<AbortController|null>(null);
  const [error,setError]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [usage,setUsage]=useState<{plan:string;used:number;limit:number|null}>({plan:"free",used:0,limit:2});
  useEffect(()=>{
    const saved=readRecentScanUrls();
    setWebsites(saved);
    const previous=saved[0]||"";
    if(verificationUrl)setUrl(verificationUrl);
    else if(previous)setUrl(previous);
  },[verificationUrl]);
  const t=text[language];
  async function run(event:React.FormEvent){
    event.preventDefault(); setError(""); setUrlError(""); setResult(null);
    const clean=url.trim();
    if(!clean){setUrlError(t.failed);return;}
    const normalized=/^https?:\/\//i.test(clean)?clean:`https://${clean}`;
    let destination:URL;
    try{destination=new URL(normalized);}catch{setUrlError("Vul een geldige website in, bijvoorbeeld coolblue.nl.");return;}
    const host=destination.hostname.toLowerCase().replace(/^www\./,"");
    const scanUrl=destination.toString();
    setUrl(scanUrl); setBusy(true);
    const controller=new AbortController();setScanAbort(controller);
    const scanTimeout=window.setTimeout(()=>controller.abort("timeout"),135_000);
    try{
      const response=await fetch("/api/qa-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:scanUrl,mode:"both",dashboard:false,language}),signal:controller.signal});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||t.failed);
      setWebsites(rememberScanUrl(scanUrl));
      if(data.scanId){ const target="/dashboard/audit/"+encodeURIComponent(data.scanId)+(verificationIssue?"?verify_issue="+encodeURIComponent(verificationIssue):""); router.push(target); return; }
      setResult(data as Result);
    }catch(cause){setError(controller.signal.aborted?(controller.signal.reason==="cancelled"?"Scan gestopt.":"De scan duurt te lang. Probeer een andere website of start opnieuw."):cause instanceof Error?cause.message:t.failed);}
    finally{window.clearTimeout(scanTimeout);setScanAbort(null);setBusy(false);}
  }
  const checks=[...(result?.seo?.checks||[]),...(result?.geo?.checks||[])];
  function downloadPdf(){if(!result)return;try{downloadQaAuditPdf(result,url,language)}catch{setError(language==="nl"?"PDF maken is niet gelukt. Gebruik eventueel de JSON-download.":"Could not create PDF. You can still download JSON.")}}
  function downloadAudit(){if(!result)return;const blob=new Blob([JSON.stringify(result,null,2)],{type:"application/json"});const objectUrl=URL.createObjectURL(blob);const link=document.createElement("a");link.href=objectUrl;link.download="rankfix-audit-"+new Date().toISOString().slice(0,10)+".json";link.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000)}
  const issues=checks.filter(c=>c.status==="fail"||c.status==="warning").length;
  const passed=checks.filter(c=>c.status==="pass").length;
  return <DashboardFrame language={language} title={t.title} intro={t.intro}>
      {verificationIssue&&<div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-100"><strong>{language==="nl"?"Fix controleren":language==="de"?"Fix prüfen":language==="fr"?"Vérifier le correctif":language==="it"?"Verifica correzione":language==="es"?"Verificar corrección":"Verify fix"}</strong><p className="mt-1 text-slate-300">{language==="nl"?"RankFix scant de live website opnieuw en controleert of hetzelfde verbeterpunt nu is opgelost.":language==="de"?"RankFix scannt die Live-Website erneut und prüft, ob derselbe Punkt jetzt gelöst ist.":language==="fr"?"RankFix analyse à nouveau le site en ligne et vérifie si le même point est maintenant résolu.":language==="it"?"RankFix esegue una nuova scansione del sito live e verifica se lo stesso problema è stato risolto.":language==="es"?"RankFix vuelve a analizar la web en vivo y comprueba si el mismo punto está resuelto.":"RankFix rescans the live website and checks whether the same improvement is now resolved."}</p></div>}
      {false && usage.plan==="free"&&<section className="rx-scan-plan"><div><span className="rf-eyebrow">Free · €0</span><h2>{usage.used} / {usage.limit??2} {language==="nl"?"scans deze maand":language==="de"?"Scans diesen Monat":language==="fr"?"analyses ce mois-ci":language==="it"?"scansioni questo mese":language==="es"?"análisis este mes":"scans this month"}</h2><p>{usage.used>=(usage.limit??2)?(language==="nl"?"Je gratis scans zijn gebruikt. Je bestaande rapport blijft beschikbaar. Upgrade voor nieuwe scans en Premium-functies.":language==="de"?"Deine kostenlosen Scans sind aufgebraucht. Dein bestehender Bericht bleibt verfügbar. Upgrade für neue Scans und Premium-Funktionen.":language==="fr"?"Vos analyses gratuites sont utilisées. Votre rapport reste disponible. Passez à une offre supérieure pour de nouvelles analyses et les fonctions Premium.":language==="it"?"Hai utilizzato le scansioni gratuite. Il report esistente resta disponibile. Passa a un piano superiore per nuove scansioni e funzioni Premium.":language==="es"?"Has utilizado tus análisis gratuitos. Tu informe sigue disponible. Mejora el plan para nuevos análisis y funciones Premium.":"Your free scans have been used. Your existing report remains available. Upgrade for new scans and Premium features."):(language==="nl"?"Free bevat 1 website en 2 volledige scans per maand.":language==="de"?"Free enthält 1 Website und 2 vollständige Scans pro Monat.":language==="fr"?"L’offre gratuite comprend 1 site et 2 analyses complètes par mois.":language==="it"?"Free include 1 sito e 2 scansioni complete al mese.":language==="es"?"Free incluye 1 web y 2 análisis completos al mes.":"Free includes 1 website and 2 full scans per month.")}</p></div>{usage.used>=(usage.limit??2)&&<Link className="rf-primary-link" href={`/${language}#pricing`}>{language==="nl"?"Bekijk abonnementen":language==="de"?"Tarife ansehen":language==="fr"?"Voir les offres":language==="it"?"Vedi i piani":language==="es"?"Ver planes":"View plans"}</Link>}</section>}
      <section className="rx-scan-entry">
        <div className="rf-shared-scan-badge">SEO + GEO · Google & AI Search</div>
        <form onSubmit={run}><label htmlFor="dashboard-scan-url">{t.url}</label><div className="rf-shared-scan-form"><input id="dashboard-scan-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={e=>{const next=e.target.value;const embedded=next.slice(1).search(/https?:\/\//i);setUrl(embedded>=0?next.slice(embedded+1):next)}} onFocus={e=>e.currentTarget.select()} placeholder="https://example.com" list="rankfix-saved-websites" required/><datalist id="rankfix-saved-websites">{websites.map(site=><option key={site} value={site}/>)}</datalist><button className="rf-primary" type="submit" disabled={busy}>{busy?t.running:t.run}</button></div></form>
        {websites.length>0&&<div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8,marginTop:12}}><strong style={{fontSize:13}}>Eerder gescand:</strong>{websites.map(site=><button key={site} type="button" title={site} onClick={()=>setUrl(site)} style={{border:"1px solid #64748b",borderRadius:20,padding:"6px 12px",fontSize:12,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{site.replace(/^https?:\/\//,"").replace(/\/$/,"")}</button>)}<button type="button" onClick={()=>{forgetRecentScanUrls();setWebsites([]);}} style={{fontSize:12,textDecoration:"underline",marginLeft:4}}>Wis lijst</button></div>}
        <div className="rf-shared-scan-meta" aria-label="Scanonderdelen"><span>SEO</span><span>GEO</span><span>Security</span><span>{t.technical}</span><span>{t.shop}</span><span>{t.ads}</span></div>
      </section>
      {urlError&&<p className="rf-alert" role="alert">{urlError}</p>}{error&&<p className="rf-alert" role="alert">{error}</p>}
      {busy && <ScanProgress url={url} language={language} onCancel={()=>scanAbort?.abort("cancelled")} />}
      {result&&<section className="rf-report rf-shared-result" aria-live="polite"><div className="rf-shared-score" style={{"--rf-score":result.overallScore} as React.CSSProperties}><strong>{headlineDisplay(result as never)}</strong><span>/100</span></div><div><span className="rf-eyebrow">{t.score}</span><h2>SEO {result.seo?.score??"—"} · GEO {result.geo?.score??"—"} · Security {result.security?.score??"—"}</h2><p>{passed} {t.passed} · {issues} {t.issues}</p><ScoreQualifier result={result as never} locale={language}/><p><strong>Sector:</strong> {result.sectorProfile?.label||result.classification?.sector||"Onbekend"} · {checks.length} controles.</p><p>Dit rapport is niet opgeslagen. Download het voordat je deze pagina verlaat.</p><div className="rf-shared-actions"><button type="button" className="rf-primary-link" onClick={downloadPdf}>Download PDF-rapport</button><button type="button" className="rf-back" onClick={downloadAudit}>Download JSON (technisch)</button><Link className="rf-back" href="/dashboard">← {t.dashboard}</Link></div></div></section>}
    <AiAssistant dashboard/>
  </DashboardFrame>;
}
