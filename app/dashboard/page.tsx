"use client";

import { useEffect, useState } from "react";
import AiAssistant from "@/components/ai-assistant";
import DashboardNav from "./nav";
import { dashboardCopy } from "@/lib/dashboard-copy";
import type { Locale } from "@/lib/locales";
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
  const [language, setLanguage] = useState<Locale>("nl");
  const t = dashboardCopy[language];

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

  const openIssues = scans.reduce((total, scan) => total + scan.open_issues, 0);
  const average = scans.length ? Math.round(scans.reduce((total, scan) => total + scan.overall_score, 0) / scans.length) : null;
  const steps = 1 + Number(scans.length > 0) + Number((fixes.DONE || 0) > 0);
  const checks = [...(selectedResult?.seo?.checks || []), ...(selectedResult?.geo?.checks || [])];

  return <main className="rf-page" lang={language}>
    <div className="rf-shell">
      <header className="rf-header">
        <a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a>
        <div className="rf-header-right"><span className="rf-credits">{user?.credits ?? "—"} credits</span><a href="/dashboard/account" className="rf-avatar" aria-label="Account">{user?.name?.charAt(0).toUpperCase() || "?"}</a></div>
      </header>
      <div className="rf-body">
        <div className="rf-heading"><h1>{t.overview}</h1><p>{t.intro}</p></div>
        {steps < 3 && <section className="rf-welcome" aria-label="Aan de slag">
          <div><strong>{t.welcome}, {user?.name || "…"}</strong><p>{steps} {t.steps} · {steps === 1 ? t.firstSite : t.firstFix}</p></div><span aria-hidden="true">☑</span>
        </section>}
        {error && <p className="rf-alert" role="alert">{error}</p>}
        {message && <p className="rf-notice" role="status">{message}</p>}
        <div className="rf-stats">
          <div className="rf-card"><span>{t.average}</span><strong>{average ?? "—"}</strong><small>{t.averageHint}</small></div>
          <div className="rf-card"><span>{t.improvements}</span><strong className={openIssues ? "rf-danger" : ""}>{openIssues}</strong><small>{t.improvementsHint}</small></div>
        </div>
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
      <DashboardNav current={0} />
    </div>
    <AiAssistant dashboard />
  </main>;
}
