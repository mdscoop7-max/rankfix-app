"use client";

import { useEffect, useState } from "react";
import AiAssistant from "@/components/ai-assistant";
import "./dashboard.css";

type User = { id: string; email: string; name: string; credits: number };
type Scan = { id: string; scanned_url: string; overall_score: number; seo_score: number; geo_score: number; created_at: string; open_issues: number; critical_issues: number };
type Check = { title: string; status: string; message: string; severity?: string; fix_status?: string };
type ScanResult = { overallScore: number; seo?: { score: number; checks?: Check[] }; geo?: { score: number; checks?: Check[] } };

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [fixes, setFixes] = useState<Record<string, number>>({});
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadHistory() {
    const response = await fetch("/api/history", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Scanoverzicht laden mislukt.");
    setScans(data.scans || []);
    setFixes(data.fixes || {});
    setUser((current) => current ? { ...current, credits: data.credits } : current);
  }

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/auth/me");
        const data = await response.json();
        if (!data.user) { location.href = "/account"; return; }
        setUser(data.user);
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
      setMessage("Nieuwe scan voltooid. Een voorbereide fix telt pas als opgelost wanneer de nieuwe scan de controle goedkeurt.");
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nieuwe scan mislukt."); }
    finally { setBusy(null); }
  }

  const openIssues = scans.reduce((total, scan) => total + scan.open_issues, 0);
  const average = scans.length ? Math.round(scans.reduce((total, scan) => total + scan.overall_score, 0) / scans.length) : null;
  const steps = 1 + Number(scans.length > 0) + Number((fixes.DONE || 0) > 0);
  const checks = [...(selectedResult?.seo?.checks || []), ...(selectedResult?.geo?.checks || [])];

  return <main className="rf-page">
    <div className="rf-shell">
      <header className="rf-header">
        <a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a>
        <div className="rf-header-right"><span className="rf-credits">{user?.credits ?? "—"} credits</span><a href="/account" className="rf-avatar" aria-label="Account">{user?.name?.charAt(0).toUpperCase() || "?"}</a></div>
      </header>
      <div className="rf-body">
        <div className="rf-heading"><h1>Overzicht</h1><p>Zo staan je websites ervoor.</p></div>
        {steps < 3 && <section className="rf-welcome" aria-label="Aan de slag">
          <div><strong>Welkom, {user?.name || "ondernemer"}</strong><p>{steps} van 3 stappen voltooid · {steps === 1 ? "Scan je eerste website" : "Controleer je eerste verbetering"}</p></div><span aria-hidden="true">☑</span>
        </section>}
        {error && <p className="rf-alert" role="alert">{error}</p>}
        {message && <p className="rf-notice" role="status">{message}</p>}
        <div className="rf-stats">
          <div className="rf-card"><span>Gemiddelde score</span><strong>{average ?? "—"}</strong><small>Laatste scan per website</small></div>
          <div className="rf-card"><span>Verbeterpunten</span><strong className={openIssues ? "rf-danger" : ""}>{openIssues}</strong><small>Uit de laatste scans</small></div>
        </div>
        <section id="websites" className="rf-section">
          <div className="rf-section-head"><h2>Mijn websites</h2><span>{scans.length} {scans.length === 1 ? "website" : "websites"}</span></div>
          <div className="rf-sites">
            {scans.map((scan) => {
              const hostname = (() => { try { return new URL(scan.scanned_url).hostname; } catch { return scan.scanned_url; } })();
              const status = scan.critical_issues ? "Actie nodig" : scan.open_issues ? "Aandacht nodig" : "In orde";
              const tone = scan.critical_issues ? "critical" : scan.open_issues ? "warning" : "good";
              return <article key={scan.id} className="rf-site">
                <div className="rf-site-main"><span className={`rf-dot ${tone}`} aria-hidden="true" /><div className="rf-site-copy"><h3>{hostname}</h3><p>{status} · {scan.open_issues} {scan.open_issues === 1 ? "verbeterpunt" : "verbeterpunten"} · scan {new Date(scan.created_at).toLocaleDateString("nl-NL")}</p></div></div>
                <div className="rf-site-actions"><strong aria-label={`Score ${scan.overall_score} van 100`}>{scan.overall_score}</strong><a href={`/dashboard/audit/${scan.id}`}>Bekijk audit</a><button onClick={() => rescan(scan)} disabled={busy === scan.id}>Opnieuw scannen</button></div>
              </article>;
            })}
            {!scans.length && <p className="rf-empty">Nog geen websites gescand. Voeg je eerste website toe om te zien wat aandacht nodig heeft.</p>}
            <a className="rf-add" href="/#scan"><span aria-hidden="true">＋</span> Website toevoegen</a>
          </div>
        </section>
        <section className="rf-fix-summary" aria-label="Status van fixes"><h2>Fixes</h2><p>{fixes.PREPARED || 0} codevoorstellen wachten op toepassing of controle · {fixes.DONE || 0} verbeteringen bevestigd met een nieuwe scan.</p><a href="/dashboard/github">Bekijk GitHub-fixes →</a></section>
        {selectedResult && <section id="resultaat" className="rf-report"><div className="rf-section-head"><h2>Nieuwe scan voltooid</h2><button onClick={() => setSelectedResult(null)}>Sluiten</button></div><p>Score {selectedResult.overallScore}/100 · SEO {selectedResult.seo?.score ?? "—"} · GEO {selectedResult.geo?.score ?? "—"}</p><div className="rf-checks">{checks.map((check, index) => <article key={index}><strong>{check.title}</strong><span>{check.fix_status === "DONE" ? "Live gecontroleerd" : check.fix_status === "WAITING" ? "Codevoorstel; nog niet bevestigd" : check.status === "pass" ? "In orde" : check.severity === "CRITICAL" ? "Kritiek" : "Aandacht nodig"}</span><p>{check.message}</p></article>)}</div></section>}
      </div>
      <nav className="rf-nav" aria-label="Dashboardnavigatie">
        <a href="/dashboard" aria-current="page"><span aria-hidden="true">⌂</span>Overzicht</a>
        <a href="/dashboard#websites"><span aria-hidden="true">◎</span>Websites</a>
        <a href="/dashboard/github"><span aria-hidden="true">⚒</span>Fixes</a>
        <a href="/#prijzen"><span aria-hidden="true">▣</span>Abonnement</a>
        <a href="/account"><span aria-hidden="true">♙</span>Account</a>
      </nav>
    </div>
    <AiAssistant dashboard />
  </main>;
}
