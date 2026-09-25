"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AiAssistant from "@/components/ai-assistant";
import DashboardNav from "../../nav";
import "../../dashboard.css";
import "./audit.css";

type Check = { title: string; status: string; severity?: string; message: string; fix?: string; fix_status?: string; evidence?: { details?: string; found?: string | number | boolean | null } };
type Result = { overallScore: number; seo?: { score: number; checks?: Check[] }; geo?: { score: number; checks?: Check[] } };
type Scan = { scanned_url: string; created_at: string; result: Result };

function label(check: Check) {
  if (check.fix_status === "DONE") return "Live bevestigd";
  if (check.fix_status === "WAITING") return "Codevoorstel · nog niet live bevestigd";
  if (check.status === "pass") return "In orde";
  if (check.severity === "CRITICAL") return "Kritiek";
  return check.status === "fail" ? "Belangrijk" : "Aandacht nodig";
}

export default function AuditDetail() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    fetch("/api/history/" + encodeURIComponent(id), { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (response.status === 401) { location.href = "/account"; return; }
        if (!response.ok) throw new Error(data.error || "Audit laden mislukt.");
        setScan(data.scan);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : "Audit laden mislukt."))
      .finally(() => setLoading(false));
  }, [id]);

  const checks = [...(scan?.result?.seo?.checks || []), ...(scan?.result?.geo?.checks || [])];
  const problems = checks.filter(check => check.status === "fail" || check.status === "warning")
    .sort((a, b) => (a.severity === "CRITICAL" ? -1 : a.severity === "HIGH" ? 0 : 1) - (b.severity === "CRITICAL" ? -1 : b.severity === "HIGH" ? 0 : 1));
  const passed = checks.filter(check => check.status === "pass");

  return <main className="rf-page">
    <div className="rf-shell">
      <header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard" className="rf-back">← Overzicht</a></header>
      <div className="rf-body">
        {loading && <p role="status">Audit laden…</p>}
        {error && <p role="alert" className="rf-alert">{error}</p>}
        {scan && <>
          <div className="rf-audit-heading"><div><p className="rf-eyebrow">AUDIT-DETAIL</p><h1>{(() => { try { return new URL(scan.scanned_url).hostname; } catch { return scan.scanned_url; } })()}</h1><p>Gescand op {new Date(scan.created_at).toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" })}</p></div><a href="/#scan" className="rf-primary-link">Nieuwe scan starten</a></div>
          <div className="rf-stats rf-audit-stats"><div className="rf-card"><span>Totaalscore</span><strong>{scan.result.overallScore}<small> / 100</small></strong></div><div className="rf-card"><span>Verbeterpunten</span><strong className={problems.length ? "rf-danger" : ""}>{problems.length}</strong></div></div>
          <p className="rf-audit-subscore">SEO {scan.result.seo?.score ?? "—"} · GEO {scan.result.geo?.score ?? "—"} · Score van deze scan</p>
          <section className="rf-audit-list"><h2>Wat vraagt aandacht?</h2>{problems.length ? problems.map((check, index) => <article key={index} className="rf-audit-issue">
            <div className="rf-audit-row"><h3>{check.title}</h3><span className={check.severity === "CRITICAL" ? "rf-badge danger" : "rf-badge warning"}>{label(check)}</span></div>
            <p>{check.message}</p>{check.fix && <p><strong>Volgende stap:</strong> {check.fix}</p>}
            {check.evidence?.details && check.evidence.details !== check.message && <details><summary>Bekijk bewijs</summary><p>{check.evidence.details}</p></details>}
          </article>) : <p className="rf-empty">Deze scan vond geen actieve verbeterpunten.</p>}</section>
          <section className="rf-audit-list"><h2>Wat gaat goed?</h2><details><summary>{passed.length} geslaagde controles bekijken</summary><div className="rf-checks">{passed.map((check, index) => <article key={index}><strong>{check.title}</strong><span>{label(check)}</span><p>{check.message}</p></article>)}</div></details></section>
          <p className="rf-audit-footnote">Een codevoorstel verandert je live website pas na publicatie. Voer daarna een nieuwe scan uit om de fix te controleren.</p>
        </>}
      </div>
      <DashboardNav current={1} />
    </div>
    <AiAssistant dashboard scanId={id} />
  </main>;
}
