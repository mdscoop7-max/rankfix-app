"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AiAssistant from "@/components/ai-assistant";
import DashboardNav from "../../nav";
import { auditCopy } from "@/lib/audit-copy";
import type { Locale } from "@/lib/locales";
import "../../dashboard.css";
import "./audit.css";

type Check = { title: string; status: string; severity?: string; message: string; fix?: string; fix_status?: string; issue_id?: string; rule_id?: string; points?:number; maxPoints?:number; confidence?:string; evidence?: { details?: string; found?: string | number | boolean | null } };
type Result = { overallScore: number; summary?:{passed:number;issues:number;notApplicable:number;unableToConfirm:number;pendingFixes:number}; rendering?:{mode:string;javascriptExecuted:boolean;note:string}; pageTypeEvidence?:{type:string;confidence:string;evidence:string[]}; technologyProfile?:{siteType?:"Webshop"|"Landingpage"|"Website";cms:string|null;commercePlatform:string|null;framework:string|null;isCommerce:boolean;confidence:number;confidenceLabel:"high"|"medium"|"low";evidence:string[]}; seo?: { score:number;checks?:Check[] }; geo?: { score:number;checks?:Check[] } };
type Scan = { id?: string; scanned_url: string; created_at: string; result: Result };

const FIXABLE = new Set(["META_TITLE_MISSING","META_TITLE_GUIDANCE","META_DESCRIPTION_MISSING","META_DESCRIPTION_GUIDANCE","H1_MISSING","IMAGE_ALT_MISSING","SOCIAL_METADATA_INCOMPLETE","social","STRUCTURED_DATA_MISSING","breadcrumbs","canonical","headings"]);
function idForFix(scan:Scan){ return (scan as Scan & {id?:string}).id||""; }
function fixHref(check:Check,scan:Scan){
  const issueId=check.issue_id||check.rule_id||"";
  if(!issueId||!FIXABLE.has(issueId)) return "";
  const context=[check.message,check.fix||"",check.evidence?.details||""].filter(Boolean).join("\n");
  const q=new URLSearchParams({scan_id:String(idForFix(scan)),issue_id:issueId});
  return "/dashboard/github?"+q.toString();
}

function label(check: Check, t: Record<string,string>) {
  if (check.fix_status === "DONE") return t.done;
  if (check.fix_status === "WAITING") return t.waiting;
  if (check.status === "pass") return t.pass;
  if (check.severity === "CRITICAL") return t.critical;
  return check.status === "fail" ? t.important : t.warning;
}

export default function AuditDetail() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [health,setHealth]=useState<{improvements:number;regressions:number;priorityRegressions:number;persistent:number;needsAttention:boolean;recurringPatterns?:Array<{rule_id:string;title:string;pageCount:number;examples:string[]}>}|null>(null);
  const [monitoring,setMonitoring]=useState(false);
  const [monitorBusy,setMonitorBusy]=useState(false);
  const [monitorMessage,setMonitorMessage]=useState("");
  const [language, setLanguage] = useState<Locale>("nl");
  const t = auditCopy[language];
  const tr=(v:Record<Locale,string>)=>v[language];
  useEffect(() => {
    if (!id) return;
    fetch("/api/account/language").then(r => r.ok ? r.json() : null).then(data => {
      if (data?.language && data.language in auditCopy) setLanguage(data.language);
    }).catch(() => {});
    fetch("/api/history/" + encodeURIComponent(id), { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (response.status === 401) { location.href = "/account"; return; }
        if (!response.ok) throw new Error(data.error || "Could not load audit.");
        setScan({...data.scan,id});
        fetch("/api/health?url="+encodeURIComponent(data.scan.scanned_url),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(h=>{if(h)setHealth({improvements:h.improvements||0,regressions:h.regressions||0,priorityRegressions:h.priorityRegressions||0,persistent:h.persistent||0,needsAttention:!!h.needsAttention,recurringPatterns:h.recurringPatterns||[]});}).catch(()=>{});
        fetch("/api/monitor?url="+encodeURIComponent(data.scan.scanned_url),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(m=>{if(m)setMonitoring(!!m.enabled);}).catch(()=>{});
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : "Could not load audit."))
      .finally(() => setLoading(false));
  }, [id]);

  async function toggleMonitoring(){
    if(!scan||monitorBusy) return;
    setMonitorBusy(true); setMonitorMessage("");
    try{
      const response=await fetch("/api/monitor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:scan.scanned_url,enabled:!monitoring})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||tr({nl:"Monitoring kon niet worden aangepast.",en:"Monitoring could not be updated.",de:"Monitoring konnte nicht aktualisiert werden.",fr:"La surveillance n’a pas pu être mise à jour.",it:"Impossibile aggiornare il monitoraggio.",es:"No se pudo actualizar la monitorización."}));
      setMonitoring(!!data.enabled);
      setMonitorMessage(data.enabled?tr({nl:"Monitoring staat aan. RankFix controleert deze website wekelijks.",en:"Monitoring is on. RankFix checks this website weekly.",de:"Monitoring ist aktiv. RankFix prüft diese Website wöchentlich.",fr:"La surveillance est active. RankFix contrôle ce site chaque semaine.",it:"Il monitoraggio è attivo. RankFix controlla questo sito ogni settimana.",es:"La monitorización está activa. RankFix comprueba este sitio cada semana."}):tr({nl:"Monitoring staat uit.",en:"Monitoring is off.",de:"Monitoring ist deaktiviert.",fr:"La surveillance est désactivée.",it:"Il monitoraggio è disattivato.",es:"La monitorización está desactivada."}));
    }catch(cause){setMonitorMessage(cause instanceof Error?cause.message:tr({nl:"Monitoring kon niet worden aangepast.",en:"Monitoring could not be updated.",de:"Monitoring konnte nicht aktualisiert werden.",fr:"La surveillance n’a pas pu être mise à jour.",it:"Impossibile aggiornare il monitoraggio.",es:"No se pudo actualizar la monitorización."}));}
    finally{setMonitorBusy(false);}
  }

  const checks = [...(scan?.result?.seo?.checks || []), ...(scan?.result?.geo?.checks || [])];
  const problems = checks.filter(check => check.status === "fail" || check.status === "warning")
    .sort((a, b) => (a.severity === "CRITICAL" ? -1 : a.severity === "HIGH" ? 0 : 1) - (b.severity === "CRITICAL" ? -1 : b.severity === "HIGH" ? 0 : 1));
  const passed = checks.filter(check => check.status === "pass");
  const notApplicable = checks.filter(check => check.status === "not_applicable");
  const unableToConfirm = checks.filter(check => check.status === "unable_to_confirm");
  const pendingCount = checks.filter(check => check.fix_status === "WAITING").length;
  const weightReason=(check:Check)=>tr({nl:"Weging: maximaal "+(check.maxPoints??"—")+" punten. Hogere gewichten zijn voor controles met grotere SEO/GEO-impact; alleen bewezen, toepasselijke controles tellen mee.",en:"Weight: maximum "+(check.maxPoints??"—")+" points. Higher weights are used for checks with greater SEO/GEO impact; only proven, applicable checks count.",de:"Gewichtung: maximal "+(check.maxPoints??"—")+" Punkte. Höhere Gewichte gelten für Prüfungen mit größerer SEO/GEO-Wirkung; nur bestätigte, anwendbare Prüfungen zählen.",fr:"Pondération : maximum "+(check.maxPoints??"—")+" points. Les contrôles ayant plus d’impact SEO/GEO ont un poids supérieur ; seuls les contrôles confirmés et applicables comptent.",it:"Peso: massimo "+(check.maxPoints??"—")+" punti. I controlli con maggiore impatto SEO/GEO hanno un peso maggiore; contano solo i controlli verificati e applicabili.",es:"Peso: máximo "+(check.maxPoints??"—")+" puntos. Las comprobaciones con mayor impacto SEO/GEO tienen más peso; solo cuentan las verificadas y aplicables."});

  return <main className="rf-page" lang={language}>
    <div className="rf-shell">
      <header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a></header>
      <DashboardNav current={0} />
      <div className="rf-body">
        {loading && <p role="status">{t.loading}</p>}
        {error && <p role="alert" className="rf-alert">{error}</p>}
        {scan && <>
          <div className="rf-audit-heading"><div><p className="rf-eyebrow">{t.detail}</p><h1>{(() => { try { return new URL(scan.scanned_url).hostname; } catch { return scan.scanned_url; } })()}</h1><p>{t.scanned} {new Date(scan.created_at).toLocaleString(language, { dateStyle: "long", timeStyle: "short" })}</p></div><div className="flex flex-wrap gap-2"><a href="/dashboard" className="rf-primary-link">← {t.dashboard}</a><a href="/dashboard/scan" className="rf-primary-link">{t.newScan}</a></div></div>
          <div className="rf-stats rf-audit-stats"><div className="rf-card"><span>{t.score}</span><strong>{scan.result.overallScore}<small> / 100</small></strong><small>{pendingCount} {t.pending}</small></div><div className="rf-card"><span>{t.improvements}</span><strong className={problems.length ? "rf-danger" : ""}>{problems.length}</strong><small>{unableToConfirm.length} {t.unconfirmed} · {notApplicable.length} {t.na}</small></div></div>
          <p className="rf-audit-subscore">SEO {scan.result.seo?.score ?? "—"} · GEO {scan.result.geo?.score ?? "—"} · {t.snapshot}</p>
          {(scan.result.rendering||scan.result.pageTypeEvidence)&&<div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300"><strong>{t.proof}:</strong> {scan.result.rendering?.mode==="raw_html"?t.raw:t.rendered}{scan.result.pageTypeEvidence?" · "+t.pageType+" "+scan.result.pageTypeEvidence.type+" ("+scan.result.pageTypeEvidence.confidence+")":""}<div className="mt-1 text-xs text-slate-500">{scan.result.rendering?.note}</div></div>}{scan.result.technologyProfile&&<div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300"><strong>{t.profile}:</strong> {scan.result.technologyProfile.siteType||(scan.result.technologyProfile.isCommerce?"Webshop":"Website")} · CMS: {scan.result.technologyProfile.cms||t.notConfirmed} · Platform: {scan.result.technologyProfile.commercePlatform||t.notConfirmed} · Framework: {scan.result.technologyProfile.framework||t.notConfirmed} · confidence {scan.result.technologyProfile.confidence}%{scan.result.technologyProfile.evidence.length>0&&<div className="mt-1 text-xs text-slate-500">{t.proofLabel}: {scan.result.technologyProfile.evidence.join(" · ")}</div>}</div>}<div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm"><div className="mr-auto"><strong>{t.monitor}</strong><div className="text-slate-400">{monitoring?t.active:t.off}</div></div><button type="button" onClick={toggleMonitoring} disabled={monitorBusy} className="rf-primary-link">{monitorBusy?t.wait:monitoring?t.disable:t.enable}</button>{monitorMessage&&<div className="w-full text-slate-300" role="status">{monitorMessage}</div>}</div>{health?.needsAttention && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100"><strong>{t.attention}</strong> {health.priorityRegressions} {tr({nl:health.priorityRegressions===1?"belangrijke technische regressie sinds eerdere scans. RankFix heeft niets automatisch gewijzigd.":"belangrijke technische regressies sinds eerdere scans. RankFix heeft niets automatisch gewijzigd.",en:health.priorityRegressions===1?"important technical regression since earlier scans. RankFix changed nothing automatically.":"important technical regressions since earlier scans. RankFix changed nothing automatically.",de:health.priorityRegressions===1?"wichtige technische Regression seit früheren Scans. RankFix hat nichts automatisch geändert.":"wichtige technische Regressionen seit früheren Scans. RankFix hat nichts automatisch geändert.",fr:health.priorityRegressions===1?"régression technique importante depuis les analyses précédentes. RankFix n’a rien modifié automatiquement.":"régressions techniques importantes depuis les analyses précédentes. RankFix n’a rien modifié automatiquement.",it:health.priorityRegressions===1?"regressione tecnica importante rispetto alle scansioni precedenti. RankFix non ha modificato nulla automaticamente.":"regressioni tecniche importanti rispetto alle scansioni precedenti. RankFix non ha modificato nulla automaticamente.",es:health.priorityRegressions===1?"regresión técnica importante desde análisis anteriores. RankFix no ha cambiado nada automáticamente.":"regresiones técnicas importantes desde análisis anteriores. RankFix no ha cambiado nada automáticamente."})}</div>}{health && (health.improvements>0 || health.regressions>0) && <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm"><strong>{t.since}</strong> <span className="text-emerald-300">{health.improvements} {t.improved}</span> · <span className={health.regressions?"text-amber-300":"text-slate-400"}>{health.regressions} {tr({nl:health.regressions===1?"nieuw probleem":"nieuwe problemen",en:health.regressions===1?"new issue":"new issues",de:health.regressions===1?"neues Problem":"neue Probleme",fr:health.regressions===1?"nouveau problème":"nouveaux problèmes",it:health.regressions===1?"nuovo problema":"nuovi problemi",es:health.regressions===1?"problema nuevo":"problemas nuevos"})}</span> · <span className="text-slate-300">{health.persistent} {t.persistent}</span></div>}{(health?.recurringPatterns?.length||0)>0&&<div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-4 text-sm"><strong>{tr({nl:"Waarschijnlijk gedeeld patroon",en:"Likely shared pattern",de:"Wahrscheinlich gemeinsames Muster",fr:"Modèle partagé probable",it:"Probabile schema condiviso",es:"Probable patrón compartido"})}</strong><p className="mt-1 text-slate-400">{tr({nl:"Dezelfde bevinding komt op meerdere gescande URL’s terug. Controleer eerst een gedeeld template/component voordat je pagina’s afzonderlijk wijzigt.",en:"The same finding appears on multiple scanned URLs. Check a shared template or component before changing pages individually.",de:"Derselbe Befund erscheint auf mehreren gescannten URLs. Prüfe zuerst ein gemeinsames Template oder eine Komponente, bevor du einzelne Seiten änderst.",fr:"Le même constat apparaît sur plusieurs URL analysées. Vérifiez d’abord un modèle ou composant partagé avant de modifier les pages séparément.",it:"Lo stesso problema compare su più URL analizzati. Controlla prima un template o componente condiviso prima di modificare le singole pagine.",es:"El mismo hallazgo aparece en varias URL analizadas. Revisa primero una plantilla o componente compartido antes de modificar páginas por separado."})}</p><ul className="mt-2 space-y-1">{health?.recurringPatterns?.map(item=><li key={item.rule_id}>{item.title} · {item.pageCount} {tr({nl:"pagina’s",en:"pages",de:"Seiten",fr:"pages",it:"pagine",es:"páginas"})}</li>)}</ul></div>}
          <section className="rf-audit-list"><h2>{t.issues}</h2>{problems.length ? problems.map((check, index) => <article key={index} className="rf-audit-issue">
            <div className="rf-audit-row"><h3>{check.title} <span title={weightReason(check)} className="cursor-help text-slate-500">ⓘ</span></h3><span className={check.severity === "CRITICAL" ? "rf-badge danger" : "rf-badge warning"}>{label(check,t)}</span></div>
            <p>{check.message}</p>{check.fix && <p><strong>{t.next}</strong> {check.fix}</p>}
            {check.evidence?.details && check.evidence.details !== check.message && <details><summary>{t.evidence}</summary><p>{check.evidence.details}</p></details>}
            {fixHref(check,scan) && check.fix_status !== "DONE" && <div className="mt-3"><a href={fixHref(check,scan)} className="rf-primary-link inline-flex w-auto">{tr({nl:"Maak AI-fix →",en:"Create AI fix →",de:"AI-Fix erstellen →",fr:"Créer un correctif IA →",it:"Crea correzione AI →",es:"Crear corrección con IA →"})}</a></div>}
          </article>) : <p className="rf-empty">{t.empty}</p>}</section>
          <section className="rf-audit-list"><h2>{t.good}</h2><details><summary>{passed.length} {t.passedChecks}</summary><div className="rf-checks">{passed.map((check, index) => <article key={index}><strong>{check.title} <span title={weightReason(check)} className="cursor-help text-slate-500">ⓘ</span></strong><span>{label(check,t)}</span><p>{check.message}</p></article>)}</div></details></section>
          {(unableToConfirm.length>0||notApplicable.length>0)&&<section className="rf-audit-list"><h2>{tr({nl:"Geen bewezen probleem",en:"No proven issue",de:"Kein bestätigtes Problem",fr:"Aucun problème confirmé",it:"Nessun problema confermato",es:"Ningún problema confirmado"})}</h2>{unableToConfirm.length>0&&<details><summary>{unableToConfirm.length} {tr({nl:"niet te bevestigen — telt niet mee in de score",en:"unable to confirm — not included in the score",de:"nicht bestätigbar — zählt nicht zur Bewertung",fr:"impossible à confirmer — non compté dans le score",it:"non confermabile — non incluso nel punteggio",es:"no se puede confirmar — no cuenta en la puntuación"})}</summary><div className="rf-checks">{unableToConfirm.map((check,index)=><article key={index}><strong>{check.title}</strong><span className="rf-badge">{tr({nl:"Niet te bevestigen",en:"Unable to confirm",de:"Nicht bestätigbar",fr:"Impossible à confirmer",it:"Non confermabile",es:"No se puede confirmar"})}</span><p>{check.message}</p></article>)}</div></details>}{notApplicable.length>0&&<details><summary>{notApplicable.length} {tr({nl:"niet van toepassing — telt niet mee in de score",en:"not applicable — not included in the score",de:"nicht anwendbar — zählt nicht zur Bewertung",fr:"non applicable — non compté dans le score",it:"non applicabile — non incluso nel punteggio",es:"no aplicable — no cuenta en la puntuación"})}</summary><div className="rf-checks">{notApplicable.map((check,index)=><article key={index}><strong>{check.title}</strong><span className="rf-badge">{tr({nl:"N.v.t.",en:"N/A",de:"N. zutr.",fr:"N/A",it:"N/D",es:"N/A"})}</span><p>{check.message}</p></article>)}</div></details>}</section>}
          <section className="mt-6 rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.09] to-blue-500/[0.06] p-5">
            <div className="mb-4"><span className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{tr({nl:"Extra analyses",en:"Extra analyses",de:"Zusätzliche Analysen",fr:"Analyses supplémentaires",it:"Analisi aggiuntive",es:"Análisis adicionales"})}</span><h2 className="mt-1 text-xl font-bold text-white">{tr({nl:"Ga verder met RankFix",en:"Continue with RankFix",de:"Mit RankFix fortfahren",fr:"Continuer avec RankFix",it:"Continua con RankFix",es:"Continúa con RankFix"})}</h2><p className="mt-1 text-sm text-slate-400">{tr({nl:"Gebruik deze scan als startpunt voor een vergelijking of lokale SEO-controle.",en:"Use this scan as the starting point for a comparison or Local SEO check.",de:"Nutze diesen Scan als Ausgangspunkt für einen Vergleich oder eine Local-SEO-Prüfung.",fr:"Utilisez cette analyse comme point de départ pour une comparaison ou un contrôle SEO local.",it:"Usa questa scansione come punto di partenza per un confronto o un controllo SEO locale.",es:"Usa este análisis como punto de partida para una comparación o una revisión de SEO local."})}</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              <a href={`/dashboard/competitor?url=${encodeURIComponent(scan.scanned_url)}`} className="rounded-xl border border-blue-300/20 bg-blue-500/10 p-4 transition hover:bg-blue-500/15"><strong className="text-blue-200">{tr({nl:"Concurrent vergelijken →",en:"Compare competitor →",de:"Konkurrent vergleichen →",fr:"Comparer un concurrent →",it:"Confronta concorrente →",es:"Comparar competidor →"})}</strong><p className="mt-1 text-sm text-slate-400">{tr({nl:"Vergelijk deze website met een concurrent en ontdek concrete kansen.",en:"Compare this website with a competitor and discover concrete opportunities.",de:"Vergleiche diese Website mit einem Konkurrenten und entdecke konkrete Chancen.",fr:"Comparez ce site à un concurrent et découvrez des opportunités concrètes.",it:"Confronta questo sito con un concorrente e scopri opportunità concrete.",es:"Compara este sitio con un competidor y descubre oportunidades concretas."})}</p></a>
              <a href={`/dashboard/local-seo?url=${encodeURIComponent(scan.scanned_url)}`} className="rounded-xl border border-violet-300/20 bg-violet-500/10 p-4 transition hover:bg-violet-500/15"><strong className="text-violet-200">{tr({nl:"Local SEO controleren →",en:"Check Local SEO →",de:"Local SEO prüfen →",fr:"Vérifier le SEO local →",it:"Controlla SEO locale →",es:"Comprobar SEO local →"})}</strong><p className="mt-1 text-sm text-slate-400">{tr({nl:"Controleer lokale vindbaarheid en bedrijfssignalen voor deze website.",en:"Check local visibility and business signals for this website.",de:"Prüfe lokale Sichtbarkeit und Unternehmenssignale für diese Website.",fr:"Vérifiez la visibilité locale et les signaux d’entreprise de ce site.",it:"Controlla la visibilità locale e i segnali dell’attività per questo sito.",es:"Comprueba la visibilidad local y las señales de negocio de este sitio."})}</p></a>
            </div>
          </section>
          <p className="rf-audit-footnote">{t.note}</p>
        </>}
      </div>
    </div>
    <AiAssistant dashboard scanId={id} />
  </main>;
}
