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
type Result = { overallScore: number; summary?:{passed:number;issues:number;notApplicable:number;unableToConfirm:number;pendingFixes:number}; rendering?:{mode:string;javascriptExecuted:boolean;note:string}; pageTypeEvidence?:{type:string;confidence:string;evidence:string[]}; seo?: { score:number;checks?:Check[] }; geo?: { score:number;checks?:Check[] } };
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
  const [health,setHealth]=useState<{improvements:number;regressions:number;priorityRegressions:number;persistent:number;needsAttention:boolean}|null>(null);
  const [monitoring,setMonitoring]=useState(false);
  const [monitorBusy,setMonitorBusy]=useState(false);
  const [monitorMessage,setMonitorMessage]=useState("");
  const [language, setLanguage] = useState<Locale>("nl");
  const t = auditCopy[language];
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
        fetch("/api/health?url="+encodeURIComponent(data.scan.scanned_url),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(h=>{if(h)setHealth({improvements:h.improvements||0,regressions:h.regressions||0,priorityRegressions:h.priorityRegressions||0,persistent:h.persistent||0,needsAttention:!!h.needsAttention});}).catch(()=>{});
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
      if(!response.ok) throw new Error(data.error||"Monitoring kon niet worden aangepast.");
      setMonitoring(!!data.enabled);
      setMonitorMessage(data.enabled?"Monitoring staat aan. RankFix controleert deze website wekelijks.":"Monitoring staat uit.");
    }catch(cause){setMonitorMessage(cause instanceof Error?cause.message:"Monitoring kon niet worden aangepast.");}
    finally{setMonitorBusy(false);}
  }

  const checks = [...(scan?.result?.seo?.checks || []), ...(scan?.result?.geo?.checks || [])];
  const problems = checks.filter(check => check.status === "fail" || check.status === "warning")
    .sort((a, b) => (a.severity === "CRITICAL" ? -1 : a.severity === "HIGH" ? 0 : 1) - (b.severity === "CRITICAL" ? -1 : b.severity === "HIGH" ? 0 : 1));
  const passed = checks.filter(check => check.status === "pass");
  const notApplicable = checks.filter(check => check.status === "not_applicable");
  const unableToConfirm = checks.filter(check => check.status === "unable_to_confirm");
  const pendingCount = checks.filter(check => check.fix_status === "WAITING").length;
  const weightReason=(check:Check)=>"Weging: maximaal "+(check.maxPoints??"—")+" punten. Hogere gewichten zijn voor controles met grotere SEO/GEO-impact; alleen bewezen, toepasselijke controles tellen mee.";

  return <main className="rf-page" lang={language}>
    <div className="rf-shell">
      <header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard" className="rf-back">← {t.back}</a></header>
      <DashboardNav current={1} />
      <div className="rf-body">
        {loading && <p role="status">{t.loading}</p>}
        {error && <p role="alert" className="rf-alert">{error}</p>}
        {scan && <>
          <div className="rf-audit-heading"><div><p className="rf-eyebrow">{t.detail}</p><h1>{(() => { try { return new URL(scan.scanned_url).hostname; } catch { return scan.scanned_url; } })()}</h1><p>{t.scanned} {new Date(scan.created_at).toLocaleString(language, { dateStyle: "long", timeStyle: "short" })}</p></div><a href={`/${language}/scan`} className="rf-primary-link">{t.newScan}</a></div>
          <div className="rf-stats rf-audit-stats"><div className="rf-card"><span>{t.score}</span><strong>{scan.result.overallScore}<small> / 100</small></strong><small>{pendingCount} voorstel{pendingCount===1?"":"len"} nog niet live bevestigd</small></div><div className="rf-card"><span>{t.improvements}</span><strong className={problems.length ? "rf-danger" : ""}>{problems.length}</strong><small>{unableToConfirm.length} niet te bevestigen · {notApplicable.length} n.v.t.</small></div></div>
          <p className="rf-audit-subscore">SEO {scan.result.seo?.score ?? "—"} · GEO {scan.result.geo?.score ?? "—"} · {t.snapshot}</p>
          {(scan.result.rendering||scan.result.pageTypeEvidence)&&<div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300"><strong>Scanbewijs:</strong> {scan.result.rendering?.mode==="raw_html"?"Raw HTML · JavaScript niet uitgevoerd":"JavaScript-gerenderd"}{scan.result.pageTypeEvidence?" · paginatype "+scan.result.pageTypeEvidence.type+" ("+scan.result.pageTypeEvidence.confidence+")":""}<div className="mt-1 text-xs text-slate-500">{scan.result.rendering?.note}</div></div>}<div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm"><div className="mr-auto"><strong>Website monitoring</strong><div className="text-slate-400">{monitoring?"Actief · wekelijkse veilige controle":"Uitgeschakeld"}</div></div><button type="button" onClick={toggleMonitoring} disabled={monitorBusy} className="rf-primary-link">{monitorBusy?"Even wachten…":monitoring?"Monitoring uitschakelen":"Monitoring inschakelen"}</button>{monitorMessage&&<div className="w-full text-slate-300" role="status">{monitorMessage}</div>}</div>{health?.needsAttention && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100"><strong>Aandacht nodig:</strong> {health.priorityRegressions} belangrijke technische regressie{health.priorityRegressions===1?"":"s"} sinds eerdere scans. RankFix heeft niets automatisch gewijzigd.</div>}{health && (health.improvements>0 || health.regressions>0) && <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm"><strong>Sinds eerdere scans:</strong> <span className="text-emerald-300">{health.improvements} verbeterd</span> · <span className={health.regressions?"text-amber-300":"text-slate-400"}>{health.regressions} nieuw probleem{health.regressions===1?"":"en"}</span> · <span className="text-slate-300">{health.persistent} aanhoudend</span></div>}
          <section className="rf-audit-list"><h2>{t.issues}</h2>{problems.length ? problems.map((check, index) => <article key={index} className="rf-audit-issue">
            <div className="rf-audit-row"><h3>{check.title} <span title={weightReason(check)} className="cursor-help text-slate-500">ⓘ</span></h3><span className={check.severity === "CRITICAL" ? "rf-badge danger" : "rf-badge warning"}>{label(check,t)}</span></div>
            <p>{check.message}</p>{check.fix && <p><strong>{t.next}</strong> {check.fix}</p>}
            {check.evidence?.details && check.evidence.details !== check.message && <details><summary>{t.evidence}</summary><p>{check.evidence.details}</p></details>}
            {fixHref(check,scan) && check.fix_status !== "DONE" && <a href={fixHref(check,scan)} className="rf-primary-link">Laat RankFix dit oplossen →</a>}
          </article>) : <p className="rf-empty">{t.empty}</p>}</section>
          <section className="rf-audit-list"><h2>{t.good}</h2><details><summary>{passed.length} {t.passedChecks}</summary><div className="rf-checks">{passed.map((check, index) => <article key={index}><strong>{check.title} <span title={weightReason(check)} className="cursor-help text-slate-500">ⓘ</span></strong><span>{label(check,t)}</span><p>{check.message}</p></article>)}</div></details></section>
          {(unableToConfirm.length>0||notApplicable.length>0)&&<section className="rf-audit-list"><h2>Geen bewezen probleem</h2>{unableToConfirm.length>0&&<details><summary>{unableToConfirm.length} niet te bevestigen — telt niet mee in de score</summary><div className="rf-checks">{unableToConfirm.map((check,index)=><article key={index}><strong>{check.title}</strong><span className="rf-badge">Niet te bevestigen</span><p>{check.message}</p></article>)}</div></details>}{notApplicable.length>0&&<details><summary>{notApplicable.length} niet van toepassing — telt niet mee in de score</summary><div className="rf-checks">{notApplicable.map((check,index)=><article key={index}><strong>{check.title}</strong><span className="rf-badge">N.v.t.</span><p>{check.message}</p></article>)}</div></details>}</section>}
          <p className="rf-audit-footnote">{t.note}</p>
        </>}
      </div>
    </div>
    <AiAssistant dashboard scanId={id} />
  </main>;
}
