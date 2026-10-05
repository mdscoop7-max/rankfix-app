"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AiAssistant from "@/components/ai-assistant";
import DashboardNav from "./nav";
import { dashboardCopy } from "@/lib/dashboard-copy";
import type { Locale } from "@/lib/locales";
import "./dashboard.css";

type User = { id: string; email: string; name: string };
type Scan = { id: string; scanned_url: string; overall_score: number; seo_score: number; geo_score: number; security_score?: number; created_at: string; open_issues: number; critical_issues: number; technology_profile?: { siteType?: string; cms?: string; platform?: string; framework?: string; confidence?: number; evidence?: string[] } | null };
type Check = { title: string; status: string; message: string; severity?: string; fix_status?: string };
type ScanResult = { overallScore: number; seo?: { score: number; checks?: Check[] }; geo?: { score: number; checks?: Check[] } };
const dashboardExtras: Record<Locale, {latest:string;scanned:string;newScan:string;seoAudit:string;geoAudit:string;openIssues:string;confirmedSolved:string;scoreChange:string;previousScan:string;nextTitle:string;nextIntro:string;recent:string;recentIntro:string;history:string;firstIssue:string;firstIssueHint:string;newControl:string;newControlHint:string;codeProposals:string;askAi:string;askAiHint:string;latestReport:string;openLatest:string;waiting:string;compare:string;compareHint:string;local:string;localHint:string;improvements:string;newest:string;firstWebsite:string;startAudit:string;historyError:string;dashboardError:string;scanError:string}> = {
 nl:{latest:"Laatste controle",scanned:"Gescand",newScan:"Nieuwe scan starten",seoAudit:"Bekijk SEO-audit",geoAudit:"Bekijk GEO-audit",openIssues:"Open verbeterpunten",confirmedSolved:"bevestigd opgelost",scoreChange:"Scoreverandering",previousScan:"tegenover vorige scan",nextTitle:"Wat moet ik nu doen?",nextIntro:"De belangrijkste volgende acties.",recent:"Recente scans",recentIntro:"Je laatste 5 controles.",history:"Bekijk historie",firstIssue:"Bekijk de nieuwste verbeterpunten",firstIssueHint:"punten vragen aandacht",newControl:"Start een nieuwe controle",newControlHint:"Controleer of je website nog steeds goed staat",codeProposals:"Controleer je codevoorstellen",askAi:"Vraag RankFix AI",askAiHint:"Laat je score of een probleem in gewone taal uitleggen",latestReport:"Bekijk laatste rapport",openLatest:"open de nieuwste audit",waiting:"wachten op publicatie of controle",compare:"Concurrent vergelijken",compareHint:"Vergelijk je website met een concurrent en ontdek concrete kansen",local:"Local SEO controleren",localHint:"Controleer lokale vindbaarheid en bedrijfssignalen",improvements:"verbeterpunten",newest:"Nieuwste",firstWebsite:"Voeg je eerste website toe",startAudit:"Start een SEO + GEO-audit om je dashboard te vullen.",historyError:"Scanoverzicht laden mislukt.",dashboardError:"Dashboard laden mislukt.",scanError:"Nieuwe scan mislukt."},
 en:{latest:"Latest check",scanned:"Scanned",newScan:"Start new scan",seoAudit:"View SEO audit",geoAudit:"View GEO audit",openIssues:"Open improvements",confirmedSolved:"confirmed solved",scoreChange:"Score change",previousScan:"vs previous scan",nextTitle:"What should I do now?",nextIntro:"Your most important next actions.",recent:"Recent scans",recentIntro:"Your last 5 checks.",history:"View history",firstIssue:"Review the latest improvements",firstIssueHint:"items need attention",newControl:"Start a new check",newControlHint:"Check whether your website is still in good shape",codeProposals:"Review your code proposals",askAi:"Ask RankFix AI",askAiHint:"Have your score or an issue explained in plain language",latestReport:"View latest report",openLatest:"open the latest audit",waiting:"waiting for publication or review",compare:"Compare competitor",compareHint:"Compare your website with a competitor and discover concrete opportunities",local:"Check Local SEO",localHint:"Check local visibility and business signals",improvements:"improvements",newest:"Latest",firstWebsite:"Add your first website",startAudit:"Start an SEO + GEO audit to fill your dashboard.",historyError:"Could not load scan overview.",dashboardError:"Could not load dashboard.",scanError:"New scan failed."},
 fr:{latest:"Dernier contrôle",scanned:"Analysé",newScan:"Lancer une nouvelle analyse",seoAudit:"Voir l’audit SEO",geoAudit:"Voir l’audit GEO",openIssues:"Améliorations ouvertes",confirmedSolved:"confirmées résolues",scoreChange:"Évolution du score",previousScan:"par rapport à l’analyse précédente",nextTitle:"Que dois-je faire maintenant ?",nextIntro:"Les prochaines actions les plus importantes.",recent:"Analyses récentes",recentIntro:"Vos 5 derniers contrôles.",history:"Voir l’historique",firstIssue:"Voir les dernières améliorations",firstIssueHint:"points nécessitent votre attention",newControl:"Lancer un nouveau contrôle",newControlHint:"Vérifiez si votre site est toujours en ordre",codeProposals:"Vérifiez vos propositions de code",askAi:"Demander à RankFix AI",askAiHint:"Faites expliquer votre score ou un problème simplement",latestReport:"Voir le dernier rapport",openLatest:"ouvrir le dernier audit",waiting:"en attente de publication ou de contrôle",compare:"Comparer un concurrent",compareHint:"Comparez votre site à un concurrent et découvrez des opportunités concrètes",local:"Contrôler le SEO local",localHint:"Contrôlez la visibilité locale et les signaux de l’entreprise",improvements:"améliorations",newest:"Dernier",firstWebsite:"Ajoutez votre premier site",startAudit:"Lancez un audit SEO + GEO pour remplir votre tableau de bord.",historyError:"Impossible de charger les analyses.",dashboardError:"Impossible de charger le tableau de bord.",scanError:"La nouvelle analyse a échoué."},
 de:{latest:"Letzte Kontrolle",scanned:"Gescannt",newScan:"Neuen Scan starten",seoAudit:"SEO-Audit ansehen",geoAudit:"GEO-Audit ansehen",openIssues:"Offene Verbesserungen",confirmedSolved:"bestätigt gelöst",scoreChange:"Score-Veränderung",previousScan:"gegenüber dem vorherigen Scan",nextTitle:"Was soll ich jetzt tun?",nextIntro:"Die wichtigsten nächsten Schritte.",recent:"Letzte Scans",recentIntro:"Deine letzten 5 Kontrollen.",history:"Verlauf ansehen",firstIssue:"Neueste Verbesserungen ansehen",firstIssueHint:"Punkte benötigen Aufmerksamkeit",newControl:"Neue Kontrolle starten",newControlHint:"Prüfe, ob deine Website weiterhin gut aufgestellt ist",codeProposals:"Codevorschläge prüfen",askAi:"RankFix AI fragen",askAiHint:"Lass dir deinen Score oder ein Problem einfach erklären",latestReport:"Letzten Bericht ansehen",openLatest:"neuestes Audit öffnen",waiting:"warten auf Veröffentlichung oder Kontrolle",compare:"Mit Wettbewerber vergleichen",compareHint:"Vergleiche deine Website mit einem Wettbewerber und entdecke konkrete Chancen",local:"Local SEO prüfen",localHint:"Prüfe lokale Sichtbarkeit und Unternehmenssignale",improvements:"Verbesserungen",newest:"Neueste",firstWebsite:"Füge deine erste Website hinzu",startAudit:"Starte ein SEO + GEO-Audit, um dein Dashboard zu füllen.",historyError:"Scanübersicht konnte nicht geladen werden.",dashboardError:"Dashboard konnte nicht geladen werden.",scanError:"Neuer Scan fehlgeschlagen."},
 it:{latest:"Ultimo controllo",scanned:"Analizzato",newScan:"Avvia nuova scansione",seoAudit:"Apri audit SEO",geoAudit:"Apri audit GEO",openIssues:"Migliorie aperte",confirmedSolved:"confermate risolte",scoreChange:"Variazione punteggio",previousScan:"rispetto alla scansione precedente",nextTitle:"Cosa devo fare ora?",nextIntro:"Le prossime azioni più importanti.",recent:"Scansioni recenti",recentIntro:"Gli ultimi 5 controlli.",history:"Vedi cronologia",firstIssue:"Controlla le ultime migliorie",firstIssueHint:"punti richiedono attenzione",newControl:"Avvia un nuovo controllo",newControlHint:"Controlla se il sito è ancora in ordine",codeProposals:"Controlla le proposte di codice",askAi:"Chiedi a RankFix AI",askAiHint:"Fatti spiegare il punteggio o un problema in modo semplice",latestReport:"Vedi ultimo rapporto",openLatest:"apri l’audit più recente",waiting:"in attesa di pubblicazione o controllo",compare:"Confronta concorrente",compareHint:"Confronta il sito con un concorrente e scopri opportunità concrete",local:"Controlla Local SEO",localHint:"Controlla visibilità locale e segnali aziendali",improvements:"miglioramenti",newest:"Più recente",firstWebsite:"Aggiungi il tuo primo sito",startAudit:"Avvia un audit SEO + GEO per riempire la dashboard.",historyError:"Impossibile caricare le scansioni.",dashboardError:"Impossibile caricare la dashboard.",scanError:"Nuova scansione non riuscita."},
 es:{latest:"Último control",scanned:"Analizado",newScan:"Iniciar nuevo análisis",seoAudit:"Ver auditoría SEO",geoAudit:"Ver auditoría GEO",openIssues:"Mejoras abiertas",confirmedSolved:"confirmadas como resueltas",scoreChange:"Cambio de puntuación",previousScan:"frente al análisis anterior",nextTitle:"¿Qué debo hacer ahora?",nextIntro:"Las próximas acciones más importantes.",recent:"Análisis recientes",recentIntro:"Tus últimos 5 controles.",history:"Ver historial",firstIssue:"Revisa las últimas mejoras",firstIssueHint:"puntos requieren atención",newControl:"Inicia un nuevo control",newControlHint:"Comprueba si tu web sigue en buen estado",codeProposals:"Revisa tus propuestas de código",askAi:"Pregunta a RankFix AI",askAiHint:"Haz que te explique tu puntuación o un problema de forma sencilla",latestReport:"Ver último informe",openLatest:"abre la auditoría más reciente",waiting:"en espera de publicación o revisión",compare:"Comparar competidor",compareHint:"Compara tu web con un competidor y descubre oportunidades concretas",local:"Comprobar SEO local",localHint:"Comprueba la visibilidad local y las señales de empresa",improvements:"mejoras",newest:"Más reciente",firstWebsite:"Añade tu primera web",startAudit:"Inicia una auditoría SEO + GEO para completar tu panel.",historyError:"No se pudo cargar el resumen de análisis.",dashboardError:"No se pudo cargar el panel.",scanError:"El nuevo análisis ha fallado."}
};


export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [history, setHistory] = useState<Scan[]>([]);
  const [fixes, setFixes] = useState<Record<string, number>>({});
  const [searchConsole, setSearchConsole] = useState<{connected:boolean;siteUrl:string|null;lastSyncAt:string|null;synced:boolean}>({connected:false,siteUrl:null,lastSyncAt:null,synced:false});
  const [usage, setUsage] = useState<{plan:string;used:number;limit:number|null;websiteHost:string|null}>({plan:"free",used:0,limit:2,websiteHost:null});
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
    if (!response.ok) throw new Error(data.error || x.historyError);
    setScans(data.scans || []);
    setHistory(data.history || data.scans || []);
    setFixes(data.fixes || {});
    if (data.searchConsole) setSearchConsole(data.searchConsole);
    if (data.usage) setUsage(data.usage);
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
      } catch (cause) { setError(cause instanceof Error ? cause.message : x.dashboardError); }
    })();
  }, []);

  async function rescan(scan: Scan) {
    setBusy(scan.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: scan.scanned_url, mode: "both", dashboard: true, language }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || x.scanError);
      setSelectedResult(data);
      setMessage(t.scanDone);
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : x.scanError); }
    finally { setBusy(null); }
  }

  const steps = 1 + Number(scans.length > 0) + Number((fixes.DONE || 0) > 0);
  const checks = [...(selectedResult?.seo?.checks || []), ...(selectedResult?.geo?.checks || [])];
  const latest = history[0] || scans[0];
  const previous = latest ? history.find((scan) => scan.scanned_url === latest.scanned_url && scan.id !== latest.id) : undefined;
  const scoreChange = latest && previous ? latest.overall_score - previous.overall_score : null;
  const recentHistory = (usage.plan==="free" ? history.slice(0,1) : history.slice(0,5));
  const latestHost = latest ? (() => { try { return new URL(latest.scanned_url).hostname; } catch { return latest.scanned_url; } })() : null;

  return <main className="rf-page" lang={language}>
    <div className="rf-shell">
      <header className="rf-header">
        <Link href="/dashboard" className="rf-brand">RankFix <span>AI</span></Link>
        <div className="rf-header-right"><Link href="/dashboard/account" className="rf-avatar" aria-label="Account">{user?.name?.charAt(0).toUpperCase() || "?"}</Link></div>
      </header>
      <DashboardNav current={0} />
      <div className="rf-body">
        <div className="rf-heading rf-dashboard-title"><div><h1>{language==="nl"?`Hallo, ${user?.name || ""}`:language==="de"?`Hallo, ${user?.name || ""}`:language==="fr"?`Bonjour, ${user?.name || ""}`:language==="it"?`Ciao, ${user?.name || ""}`:language==="es"?`Hola, ${user?.name || ""}`:`Hello, ${user?.name || ""}`}</h1><p>{t.intro}</p></div><Link className="rf-primary-link" href="/dashboard/scan">＋ {x.newScan}</Link></div>
        <section className="rf-workspace-strip" aria-label="Workspace summary">
          <div><span className="rf-eyebrow">${usage.plan === "free" ? "Free · €0" : usage.plan}</span><strong>${latestHost || x.firstWebsite}</strong><small>${latest ? `${latest.overall_score}/100 · ${latest.open_issues} ${x.improvements}` : x.startAudit}</small></div>
          <div className="rf-workspace-strip-actions"><Link href="/dashboard/history">${x.history} →</Link></div>
        </section>
        {error && <p className="rf-alert" role="alert">{error}</p>}
        {message && <p className="rf-notice" role="status">{message}</p>}
        <section className="rf-dashboard-status rf-command-center">
          <div className="rf-dashboard-hero">
            <div className="rf-dashboard-latest">{latest && <div className="rf-overall-meter" style={{"--rf-score":latest.overall_score} as React.CSSProperties}><div><strong>{latest.overall_score}</strong><span>/100</span></div></div>}<div><span className="rf-eyebrow">{x.latest}</span><h2>{latestHost || x.firstWebsite}</h2><p>{latest ? `${x.scanned} ${new Date(latest.created_at).toLocaleString(language)}` : x.startAudit}</p>{latest?.technology_profile && <p className="rf-profile-line"><strong>{language==="nl"?"Websiteprofiel":language==="de"?"Websiteprofil":language==="fr"?"Profil du site":language==="it"?"Profilo del sito":language==="es"?"Perfil del sitio":"Website profile"}:</strong> {latest.technology_profile.siteType || "Website"} · {latest.technology_profile.framework || latest.technology_profile.platform || latest.technology_profile.cms || (language==="nl"?"Niet bevestigd":"Not confirmed")} · {latest.technology_profile.confidence ?? 40}%</p>}</div></div>
            <Link className="rf-primary-link rf-scan-cta" href="/dashboard/scan">＋ {x.newScan}</Link>
          </div>
          <div className="rf-status-grid rf-overview-metrics">
            <Link className="rf-card rf-score-card" href={latest ? `/dashboard/audit/${latest.id}` : "/#scan"}><span>SEO-score</span><strong>{latest?.seo_score ?? "—"}<small>/100</small></strong><small>{x.seoAudit} →</small></Link>
            <Link className="rf-card rf-score-card" href={latest ? `/dashboard/audit/${latest.id}` : "/#scan"}><span>GEO-score</span><strong>{latest?.geo_score ?? "—"}<small>/100</small></strong><small>{x.geoAudit} →</small></Link>
            <div className="rf-card"><span>{x.openIssues}</span><strong>{latest?.open_issues ?? 0}</strong><small>{fixes.DONE || 0} {x.confirmedSolved}</small></div>
            <div className="rf-card"><span>{x.scoreChange}</span><strong className={scoreChange !== null && scoreChange < 0 ? "rf-danger" : ""}>{scoreChange === null ? "—" : `${scoreChange > 0 ? "+" : ""}${scoreChange}`}</strong><small>{x.previousScan}</small></div>
          </div>
        </section>
        <section className="rf-section rf-gsc-summary">
          <div className="rf-section-head"><div><span className="rf-eyebrow">Google data</span><h2>Google Search Console</h2><p>{searchConsole.connected ? (searchConsole.synced ? (language==="nl"?"Echte Google-data is gekoppeld aan je dashboard.":language==="de"?"Echte Google-Daten sind mit deinem Dashboard verbunden.":language==="fr"?"Les données Google réelles sont connectées à votre tableau de bord.":language==="it"?"I dati Google reali sono collegati alla dashboard.":language==="es"?"Los datos reales de Google están conectados a tu panel.":"Real Google data is connected to your dashboard.") : (language==="nl"?"Property gekoppeld; synchroniseer om prestatiedata te laden.":language==="de"?"Property verbunden; synchronisiere, um Leistungsdaten zu laden.":language==="fr"?"Propriété connectée ; synchronisez pour charger les performances.":language==="it"?"Proprietà collegata; sincronizza per caricare le prestazioni.":language==="es"?"Propiedad conectada; sincroniza para cargar el rendimiento.":"Property connected; sync to load performance data.")) : (language==="nl"?"Koppel Search Console voor klikken, vertoningen, CTR en posities.":language==="de"?"Verbinde Search Console für Klicks, Impressionen, CTR und Positionen.":language==="fr"?"Connectez Search Console pour les clics, impressions, CTR et positions.":language==="it"?"Collega Search Console per clic, impressioni, CTR e posizioni.":language==="es"?"Conecta Search Console para clics, impresiones, CTR y posiciones.":"Connect Search Console for clicks, impressions, CTR and positions.")}</p></div><Link href="/dashboard/search-console">{searchConsole.connected ? (language==="nl"?"Open Search Console":language==="de"?"Search Console öffnen":language==="fr"?"Ouvrir Search Console":language==="it"?"Apri Search Console":language==="es"?"Abrir Search Console":"Open Search Console") : (language==="nl"?"Google koppelen":language==="de"?"Google verbinden":language==="fr"?"Connecter Google":language==="it"?"Collega Google":language==="es"?"Conectar Google":"Connect Google")} →</Link></div>
          {searchConsole.connected && <div className="rf-card"><span>{searchConsole.siteUrl}</span><strong>{searchConsole.synced ? "✓" : "—"}</strong><small>{searchConsole.lastSyncAt ? new Date(searchConsole.lastSyncAt).toLocaleString(language) : (language==="nl"?"Nog niet gesynchroniseerd":language==="de"?"Noch nicht synchronisiert":language==="fr"?"Pas encore synchronisé":language==="it"?"Non ancora sincronizzato":language==="es"?"Aún no sincronizado":"Not synced yet")}</small></div>}
        </section>
        <section className="rf-section rf-dashboard-long-section">
          <div className="rf-section-head"><div><h2>{x.nextTitle}</h2><p>{x.nextIntro}</p></div></div>
          <div className="rf-next-actions">
            {latest && <Link href={`/dashboard/audit/${latest.id}`}><b>{x.latestReport}</b><span>{latest.overall_score}/100 · {x.openLatest} →</span></Link>}
            {latest?.open_issues ? <Link href={`/dashboard/audit/${latest.id}`}><b>1. {x.firstIssue}</b><span>{latest.open_issues} {x.firstIssueHint} →</span></Link> : <Link href="/dashboard/scan"><b>1. {x.newControl}</b><span>{x.newControlHint} →</span></Link>}
            {(fixes.PREPARED || 0) > 0 && <Link href="/dashboard/github"><b>2. {x.codeProposals} {usage.plan==="free"&&<small className="ml-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[11px] font-bold text-blue-200">Premium</small>}</b><span>{fixes.PREPARED} {x.waiting} →</span></Link>}
            <Link href={`/dashboard/competitor${latest ? `?url=${encodeURIComponent(latest.scanned_url)}` : ""}`}><b>{(fixes.PREPARED || 0) > 0 ? "3" : "2"}. {x.compare} {usage.plan==="free"&&<small className="ml-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[11px] font-bold text-blue-200">Premium</small>}</b><span>{x.compareHint} →</span></Link>
            <Link href={`/dashboard/local-seo${latest ? `?url=${encodeURIComponent(latest.scanned_url)}` : ""}`}><b>{(fixes.PREPARED || 0) > 0 ? "4" : "3"}. {x.local} {usage.plan==="free"&&<small className="ml-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[11px] font-bold text-blue-200">Premium</small>}</b><span>{x.localHint} →</span></Link>
            <Link href="/dashboard/help"><b>{(fixes.PREPARED || 0) > 0 ? "5" : "4"}. {x.askAi}</b><span>{x.askAiHint} →</span></Link>
          </div>
        </section>
        <section className="rf-section rf-dashboard-long-section">
          <div className="rf-section-head"><div><h2>{x.recent}</h2><p>{usage.plan==="free"?(language==="nl"?"Je laatste controle. Volledige historie is beschikbaar met een betaald abonnement.":language==="de"?"Deine letzte Kontrolle. Der vollständige Verlauf ist mit einem kostenpflichtigen Tarif verfügbar.":language==="fr"?"Votre dernier contrôle. L’historique complet est disponible avec une offre payante.":language==="it"?"Il tuo ultimo controllo. La cronologia completa è disponibile con un piano a pagamento.":language==="es"?"Tu último control. El historial completo está disponible con un plan de pago.":"Your latest check. Full history is available with a paid plan."):x.recentIntro}</p></div><Link href="/dashboard/history">{x.history} →</Link></div>
          <div className="rf-history-list">{recentHistory.map((scan,index)=><Link key={scan.id} href={`/dashboard/audit/${scan.id}`}><div><b>{(()=>{try{return new URL(scan.scanned_url).hostname}catch{return scan.scanned_url}})()}</b><span>{new Date(scan.created_at).toLocaleString(language)} · SEO {scan.seo_score === 0 && scan.overall_score === 100 ? "—" : scan.seo_score} · GEO {scan.geo_score === 0 && scan.overall_score === 100 ? "—" : scan.geo_score} · Security {scan.security_score || "—"} · {scan.open_issues} {x.improvements}</span></div><strong>{scan.overall_score}</strong>{index===0&&<em>{x.newest}</em>}</Link>)}</div>
        </section>
        <section className="rf-section rf-quick-actions-section"><div className="rf-section-head"><div><h2>{language==="nl"?"Snelle acties":language==="de"?"Schnellaktionen":language==="fr"?"Actions rapides":language==="it"?"Azioni rapide":language==="es"?"Acciones rápidas":"Quick actions"}</h2><p>{language==="nl"?"Alles wat je vaak gebruikt direct bij de hand.":language==="de"?"Deine wichtigsten Werkzeuge direkt zur Hand.":language==="fr"?"Vos outils les plus utilisés à portée de main.":language==="it"?"Gli strumenti più usati sempre a portata di mano.":language==="es"?"Tus herramientas más usadas siempre a mano.":"Your most-used tools in one place."}</p></div></div><div className="rf-quick-actions-grid">{latest&&<Link href={`/dashboard/audit/${latest.id}`}><span>♥</span><b>{language==="nl"?"Website Health":language==="de"?"Website Health":language==="fr"?"Santé du site":language==="it"?"Salute sito":language==="es"?"Salud web":"Website Health"}</b></Link>}<Link href="/dashboard/help"><span>✦</span><b>AI Assistant</b></Link><Link href="/dashboard/github"><span>⌘</span><b>GitHub Fixes</b></Link>{latest?<Link href={`/dashboard/audit/${latest.id}/report`}><span>▤</span><b>{language==="nl"?"PDF rapport":language==="de"?"PDF-Bericht":language==="fr"?"Rapport PDF":language==="it"?"Report PDF":language==="es"?"Informe PDF":"PDF report"}</b></Link>:<Link href="/dashboard/history"><span>▤</span><b>{language==="nl"?"Rapporten":language==="de"?"Berichte":language==="fr"?"Rapports":language==="it"?"Report":language==="es"?"Informes":"Reports"}</b></Link>}</div></section><details id="websites" className="rf-section rf-websites-featured rf-websites-collapsible" open>
          <summary className="rf-websites-summary"><div><h2>{t.websites} <span>({scans.length})</span></h2><p>{x.latestReport} · {x.newControl}</p></div><span className="rf-websites-chevron" aria-hidden="true">⌄</span></summary>
          <div className="rf-sites">
            {scans.map((scan) => {
              const hostname = (() => { try { return new URL(scan.scanned_url).hostname; } catch { return scan.scanned_url; } })();
              const status = scan.critical_issues ? t.critical : scan.open_issues ? t.warning : t.good;
              const tone = scan.critical_issues ? "critical" : scan.open_issues ? "warning" : "good";
              return <article key={scan.id} className="rf-site">
                <div className="rf-site-main"><span className={`rf-dot ${tone}`} aria-hidden="true" /><div className="rf-site-copy"><h3>{hostname}</h3><p>{status} · {scan.open_issues} {scan.open_issues === 1 ? t.point : t.points} · {t.scanned} {new Date(scan.created_at).toLocaleDateString(language)}</p></div></div>
                <div className="rf-site-actions"><strong className="rf-site-score" aria-label={`${t.average} ${scan.overall_score}/100`}>{scan.overall_score}</strong><Link href={`/dashboard/audit/${scan.id}`}>{t.view}</Link><button onClick={() => rescan(scan)} disabled={busy === scan.id}>{busy === scan.id ? t.rescanning : t.rescan}</button><Link href={`/dashboard/audit/${scan.id}/report`}>PDF</Link></div>
              </article>;
            })}
            {!scans.length && <p className="rf-empty">{t.empty}</p>}
            <Link className="rf-add" href="/dashboard/scan"><span aria-hidden="true">＋</span> {t.add}</Link>
          </div>
        </details>
        <section className="rf-fix-summary" aria-label={t.fixes}><h2>{t.fixes} {usage.plan==="free"&&<small className="ml-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[11px] font-bold text-blue-200">Premium</small>}</h2><p>{fixes.PREPARED || 0} {t.prepared} · {fixes.DONE || 0} {t.confirmed}.</p><Link href="/dashboard/github">{t.fixLink} →</Link></section>
        {selectedResult && <section id="resultaat" className="rf-report"><div className="rf-section-head"><h2>{t.result}</h2><button onClick={() => setSelectedResult(null)}>{t.close}</button></div><p>{selectedResult.overallScore}/100 · SEO {selectedResult.seo?.score ?? "—"} · GEO {selectedResult.geo?.score ?? "—"}</p><div className="rf-checks">{checks.map((check, index) => <article key={index}><strong>{check.title}</strong><span>{check.fix_status === "DONE" ? t.live : check.fix_status === "WAITING" ? t.proposal : check.status === "pass" ? t.passed : check.severity === "CRITICAL" ? t.critical : t.needsAttention}</span><p>{check.message}</p></article>)}</div></section>}
      </div>
    </div>
    <AiAssistant dashboard />
  </main>;
}
