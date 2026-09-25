"use client";

import { useEffect, useState } from "react";
import AiAssistant from "@/components/ai-assistant";
import DashboardNav from "./nav";
import { dashboardCopy } from "@/lib/dashboard-copy";
import type { Locale } from "@/lib/locales";
import "./dashboard.css";

type User = { id: string; email: string; name: string };
type Scan = { id: string; scanned_url: string; overall_score: number; seo_score: number; geo_score: number; created_at: string; open_issues: number; critical_issues: number };
type Check = { title: string; status: string; message: string; severity?: string; fix_status?: string };
type ScanResult = { overallScore: number; seo?: { score: number; checks?: Check[] }; geo?: { score: number; checks?: Check[] } };
const dashboardExtras: Record<Locale, {latest:string;scanned:string;newScan:string;seoAudit:string;geoAudit:string;openIssues:string;confirmedSolved:string;scoreChange:string;previousScan:string;nextTitle:string;nextIntro:string;recent:string;recentIntro:string;history:string;firstIssue:string;firstIssueHint:string;newControl:string;newControlHint:string;codeProposals:string;askAi:string;askAiHint:string}> = {
 nl:{latest:"Laatste controle",scanned:"Gescand",newScan:"Nieuwe scan starten",seoAudit:"Bekijk SEO-audit",geoAudit:"Bekijk GEO-audit",openIssues:"Open verbeterpunten",confirmedSolved:"bevestigd opgelost",scoreChange:"Scoreverandering",previousScan:"tegenover vorige scan",nextTitle:"Wat moet ik nu doen?",nextIntro:"De belangrijkste volgende acties.",recent:"Recente scans",recentIntro:"Je laatste 5 controles.",history:"Bekijk historie",firstIssue:"Bekijk de nieuwste verbeterpunten",firstIssueHint:"punten vragen aandacht",newControl:"Start een nieuwe controle",newControlHint:"Controleer of je website nog steeds goed staat",codeProposals:"Controleer je codevoorstellen",askAi:"Vraag RankFix AI",askAiHint:"Laat je score of een probleem in gewone taal uitleggen"},
 en:{latest:"Latest check",scanned:"Scanned",newScan:"Start new scan",seoAudit:"View SEO audit",geoAudit:"View GEO audit",openIssues:"Open improvements",confirmedSolved:"confirmed solved",scoreChange:"Score change",previousScan:"vs previous scan",nextTitle:"What should I do now?",nextIntro:"Your most important next actions.",recent:"Recent scans",recentIntro:"Your last 5 checks.",history:"View history",firstIssue:"Review the latest improvements",firstIssueHint:"items need attention",newControl:"Start a new check",newControlHint:"Check whether your website is still in good shape",codeProposals:"Review your code proposals",askAi:"Ask RankFix AI",askAiHint:"Have your score or an issue explained in plain language"},
 fr:{latest:"Dernier contrôle",scanned:"Analysé",newScan:"Lancer une nouvelle analyse",seoAudit:"Voir l’audit SEO",geoAudit:"Voir l’audit GEO",openIssues:"Améliorations ouvertes",confirmedSolved:"confirmées résolues",scoreChange:"Évolution du score",previousScan:"par rapport à l’analyse précédente",nextTitle:"Que dois-je faire maintenant ?",nextIntro:"Les prochaines actions les plus importantes.",recent:"Analyses récentes",recentIntro:"Vos 5 derniers contrôles.",history:"Voir l’historique",firstIssue:"Voir les dernières améliorations",firstIssueHint:"points nécessitent votre attention",newControl:"Lancer un nouveau contrôle",newControlHint:"Vérifiez si votre site est toujours en ordre",codeProposals:"Vérifiez vos propositions de code",askAi:"Demander à RankFix AI",askAiHint:"Faites expliquer votre score ou un problème simplement"},
 de:{latest:"Letzte Kontrolle",scanned:"Gescannt",newScan:"Neuen Scan starten",seoAudit:"SEO-Audit ansehen",geoAudit:"GEO-Audit ansehen",openIssues:"Offene Verbesserungen",confirmedSolved:"bestätigt gelöst",scoreChange:"Score-Veränderung",previousScan:"gegenüber dem vorherigen Scan",nextTitle:"Was soll ich jetzt tun?",nextIntro:"Die wichtigsten nächsten Schritte.",recent:"Letzte Scans",recentIntro:"Deine letzten 5 Kontrollen.",history:"Verlauf ansehen",firstIssue:"Neueste Verbesserungen ansehen",firstIssueHint:"Punkte benötigen Aufmerksamkeit",newControl:"Neue Kontrolle starten",newControlHint:"Prüfe, ob deine Website weiterhin gut aufgestellt ist",codeProposals:"Codevorschläge prüfen",askAi:"RankFix AI fragen",askAiHint:"Lass dir deinen Score oder ein Problem einfach erklären"},
 it:{latest:"Ultimo controllo",scanned:"Analizzato",newScan:"Avvia nuova scansione",seoAudit:"Apri audit SEO",geoAudit:"Apri audit GEO",openIssues:"Migliorie aperte",confirmedSolved:"confermate risolte",scoreChange:"Variazione punteggio",previousScan:"rispetto alla scansione precedente",nextTitle:"Cosa devo fare ora?",nextIntro:"Le prossime azioni più importanti.",recent:"Scansioni recenti",recentIntro:"Gli ultimi 5 controlli.",history:"Vedi cronologia",firstIssue:"Controlla le ultime migliorie",firstIssueHint:"punti richiedono attenzione",newControl:"Avvia un nuovo controllo",newControlHint:"Controlla se il sito è ancora in ordine",codeProposals:"Controlla le proposte di codice",askAi:"Chiedi a RankFix AI",askAiHint:"Fatti spiegare il punteggio o un problema in modo semplice"},
 es:{latest:"Último control",scanned:"Analizado",newScan:"Iniciar nuevo análisis",seoAudit:"Ver auditoría SEO",geoAudit:"Ver auditoría GEO",openIssues:"Mejoras abiertas",confirmedSolved:"confirmadas como resueltas",scoreChange:"Cambio de puntuación",previousScan:"frente al análisis anterior",nextTitle:"¿Qué debo hacer ahora?",nextIntro:"Las próximas acciones más importantes.",recent:"Análisis recientes",recentIntro:"Tus últimos 5 controles.",history:"Ver historial",firstIssue:"Revisa las últimas mejoras",firstIssueHint:"puntos requieren atención",newControl:"Inicia un nuevo control",newControlHint:"Comprueba si tu web sigue en buen estado",codeProposals:"Revisa tus propuestas de código",askAi:"Pregunta a RankFix AI",askAiHint:"Haz que te explique tu puntuación o un problema de forma sencilla"}
};


export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [history, setHistory] = useState<Scan[]>([]);
  const [fixes, setFixes] = useState<Record<string, number>>({});
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState<Locale>("nl");
  const t = dashboardCopy[language];
  const x = dashboardExtras[language];

  async function loadHistory() {
    const response = await fetch("/api/history", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Scanoverzicht laden mislukt.");
    setScans(data.scans || []);
    setHistory(data.history || data.scans || []);
    setFixes(data.fixes || {});
  }

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/auth/me");
        const data = await response.json();
        if (!data.user) { location.href = "/account"; return; }
        setUser(data.user);
        const preference = await fetch("/api/account/language").then(r => r.ok ? r.json() : null);
        if (preference?.language && preference.language in dashboardCopy) setLanguage(preference.language);
        await loadHistory();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Dashboard laden mislukt."); }
    })();
  }, []);

  async function rescan(scan: Scan) {
    setBusy(scan.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: scan.scanned_url, mode: "both" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nieuwe scan mislukt.");
      setSelectedResult(data);
      setMessage(t.scanDone);
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nieuwe scan mislukt."); }
    finally { setBusy(null); }
  }

  const steps = 1 + Number(scans.length > 0) + Number((fixes.DONE || 0) > 0);
  const checks = [...(selectedResult?.seo?.checks || []), ...(selectedResult?.geo?.checks || [])];
  const latest = history[0] || scans[0];
  const previous = latest ? history.find((scan) => scan.scanned_url === latest.scanned_url && scan.id !== latest.id) : undefined;
  const scoreChange = latest && previous ? latest.overall_score - previous.overall_score : null;
  const recentHistory = history.slice(0, 5);
  const latestHost = latest ? (() => { try { return new URL(latest.scanned_url).hostname; } catch { return latest.scanned_url; } })() : null;

  return <main className="rf-page" lang={language}>
    <div className="rf-shell">
      <header className="rf-header">
        <a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a>
        <div className="rf-header-right"><a href="/dashboard/account" className="rf-avatar" aria-label="Account">{user?.name?.charAt(0).toUpperCase() || "?"}</a></div>
      </header>
      <DashboardNav current={0} />
      <div className="rf-body">
        <div className="rf-heading"><h1>{t.overview}</h1><p>{t.intro}</p></div>
        {scans.length === 0 && <section className="rf-welcome" aria-label="Aan de slag">
          <div><strong>{t.welcome}, {user?.name || "…"}</strong><p>{steps} {t.steps} · {steps === 1 ? t.firstSite : t.firstFix}</p></div><span aria-hidden="true">☑</span>
        </section>}
        {error && <p className="rf-alert" role="alert">{error}</p>}
        {message && <p className="rf-notice" role="status">{message}</p>}
        <section className="rf-dashboard-status">
          <div className="rf-dashboard-hero">
            <div className="rf-dashboard-latest">{latest && <div className="rf-overall-meter" style={{"--rf-score":latest.overall_score} as React.CSSProperties}><div><strong>{latest.overall_score}</strong><span>/100</span></div></div>}<div><span className="rf-eyebrow">{x.latest}</span><h2>{latestHost || "Voeg je eerste website toe"}</h2><p>{latest ? `${x.scanned} ${new Date(latest.created_at).toLocaleString(language)}` : "Start een SEO + GEO-audit om je dashboard te vullen."}</p></div></div>
            <a className="rf-primary-link rf-scan-cta" href={`/${language}/scan`}>＋ {x.newScan}</a>
          </div>
          <div className="rf-status-grid">
            <a className="rf-card rf-score-card" href={latest ? `/dashboard/audit/${latest.id}` : `/${language}/scan`}><span>SEO-score</span><strong>{latest?.seo_score ?? "—"}<small>/100</small></strong><small>{x.seoAudit} →</small></a>
            <a className="rf-card rf-score-card" href={latest ? `/dashboard/audit/${latest.id}` : `/${language}/scan`}><span>GEO-score</span><strong>{latest?.geo_score ?? "—"}<small>/100</small></strong><small>{x.geoAudit} →</small></a>
            <div className="rf-card"><span>{x.openIssues}</span><strong>{latest?.open_issues ?? 0}</strong><small>{fixes.DONE || 0} {x.confirmedSolved}</small></div>
            <div className="rf-card"><span>{x.scoreChange}</span><strong className={scoreChange !== null && scoreChange < 0 ? "rf-danger" : ""}>{scoreChange === null ? "—" : `${scoreChange > 0 ? "+" : ""}${scoreChange}`}</strong><small>{x.previousScan}</small></div>
          </div>
        </section>
        <section className="rf-section">
          <div className="rf-section-head"><div><h2>{x.nextTitle}</h2><p>{x.nextIntro}</p></div></div>
          <div className="rf-next-actions">
            {latest?.open_issues ? <a href={`/dashboard/audit/${latest.id}`}><b>1. {x.firstIssue}</b><span>{latest.open_issues} {x.firstIssueHint} →</span></a> : <a href={`/${language}/scan`}><b>1. {x.newControl}</b><span>{x.newControlHint} →</span></a>}
            {(fixes.PREPARED || 0) > 0 && <a href="/dashboard/github"><b>2. {x.codeProposals}</b><span>{fixes.PREPARED} wachten op publicatie of controle →</span></a>}
            <a href="/dashboard/help"><b>{(fixes.PREPARED || 0) > 0 ? "3" : "2"}. {x.askAi}</b><span>{x.askAiHint} →</span></a>
          </div>
        </section>
        <section className="rf-section">
          <div className="rf-section-head"><div><h2>{x.recent}</h2><p>{x.recentIntro}</p></div><a href="/dashboard/history">{x.history} →</a></div>
          <div className="rf-history-list">{recentHistory.map((scan,index)=><a key={scan.id} href={`/dashboard/audit/${scan.id}`}><div><b>{(()=>{try{return new URL(scan.scanned_url).hostname}catch{return scan.scanned_url}})()}</b><span>{new Date(scan.created_at).toLocaleString(language)} · SEO {scan.seo_score} · GEO {scan.geo_score} · {scan.open_issues} verbeterpunten</span></div><strong>{scan.overall_score}</strong>{index===0&&<em>Nieuwste</em>}</a>)}</div>
        </section>
        <section id="websites" className="rf-section">
          <div className="rf-section-head"><h2>{t.websites}</h2><span>{scans.length}</span></div>
          <div className="rf-sites">
            {scans.map((scan) => {
              const hostname = (() => { try { return new URL(scan.scanned_url).hostname; } catch { return scan.scanned_url; } })();
              const status = scan.critical_issues ? t.critical : scan.open_issues ? t.warning : t.good;
              const tone = scan.critical_issues ? "critical" : scan.open_issues ? "warning" : "good";
              return <article key={scan.id} className="rf-site">
                <div className="rf-site-main"><span className={`rf-dot ${tone}`} aria-hidden="true" /><div className="rf-site-copy"><h3>{hostname}</h3><p>{status} · {scan.open_issues} {scan.open_issues === 1 ? t.point : t.points} · {t.scanned} {new Date(scan.created_at).toLocaleDateString(language)}</p></div></div>
                <div className="rf-site-actions"><strong aria-label={`${t.average} ${scan.overall_score}/100`}>{scan.overall_score}</strong><a href={`/dashboard/audit/${scan.id}`}>{t.view}</a><button onClick={() => rescan(scan)} disabled={busy === scan.id}>{busy === scan.id ? t.rescanning : t.rescan}</button></div>
              </article>;
            })}
            {!scans.length && <p className="rf-empty">{t.empty}</p>}
            <a className="rf-add" href={`/${language}/scan`}><span aria-hidden="true">＋</span> {t.add}</a>
          </div>
        </section>
        <section className="rf-fix-summary" aria-label={t.fixes}><h2>{t.fixes}</h2><p>{fixes.PREPARED || 0} {t.prepared} · {fixes.DONE || 0} {t.confirmed}.</p><a href="/dashboard/github">{t.fixLink} →</a></section>
        {selectedResult && <section id="resultaat" className="rf-report"><div className="rf-section-head"><h2>{t.result}</h2><button onClick={() => setSelectedResult(null)}>{t.close}</button></div><p>{selectedResult.overallScore}/100 · SEO {selectedResult.seo?.score ?? "—"} · GEO {selectedResult.geo?.score ?? "—"}</p><div className="rf-checks">{checks.map((check, index) => <article key={index}><strong>{check.title}</strong><span>{check.fix_status === "DONE" ? t.live : check.fix_status === "WAITING" ? t.proposal : check.status === "pass" ? t.passed : check.severity === "CRITICAL" ? t.critical : t.needsAttention}</span><p>{check.message}</p></article>)}</div></section>}
      </div>
    </div>
    <AiAssistant dashboard />
  </main>;
}
