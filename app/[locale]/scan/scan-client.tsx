"use client";
import { useState } from "react";
import { copy, type Locale } from "@/lib/locales";
const freeInfo: Record<Locale,{title:string;items:string[]}> = {
  nl:{title:"Wat krijg je met de gratis scan?",items:["Controle van belangrijke SEO-, technische en GEO/AI Search-signalen.","Direct een score en concrete verbeterpunten.","Geen betaalkaart nodig en RankFix wijzigt niets automatisch aan je website."]},
  en:{title:"What do you get with the free scan?",items:["Checks of key SEO, technical and GEO/AI Search signals.","An immediate score and concrete improvement points.","No payment card required and RankFix does not automatically change your website."]},
  fr:{title:"Que comprend l’audit gratuit ?",items:["Contrôle des principaux signaux SEO, techniques et GEO/recherche IA.","Un score immédiat et des améliorations concrètes.","Aucune carte bancaire requise et RankFix ne modifie pas automatiquement votre site."]},
  es:{title:"¿Qué incluye el análisis gratuito?",items:["Revisión de señales SEO, técnicas y GEO/búsqueda con IA importantes.","Puntuación inmediata y mejoras concretas.","No se requiere tarjeta y RankFix no modifica automáticamente tu web."]},
  it:{title:"Cosa include la scansione gratuita?",items:["Controllo dei principali segnali SEO, tecnici e GEO/AI Search.","Punteggio immediato e miglioramenti concreti.","Nessuna carta richiesta e RankFix non modifica automaticamente il sito."]},
  de:{title:"Was enthält der kostenlose Scan?",items:["Prüfung wichtiger SEO-, technischer und GEO/AI-Search-Signale.","Sofortige Bewertung und konkrete Verbesserungspunkte.","Keine Zahlungskarte erforderlich und RankFix ändert deine Website nicht automatisch."]}
};
type Result = { overallScore: number; seo?: { score: number; checks: Array<{ status: string }> }; geo?: { score: number; checks: Array<{ status: string }> } };
export default function ScanClient({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const free = freeInfo[locale];
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  async function run(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, mode: "both" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(t.error);
      setResult(data);
    } catch { setError(t.error); } finally { setBusy(false); }
  }
  const checks = [...(result?.seo?.checks || []), ...(result?.geo?.checks || [])];
  const issues = checks.filter(check => check.status === "fail" || check.status === "warning").length;
  return <div className="lc-container lc-prose"><h1>{t.run}</h1><p>{t.intro}</p>
    <section className="lc-card"><strong>{free.title}</strong><ul>{free.items.map(item=><li key={item}>{item}</li>)}</ul></section>
    <form onSubmit={run} className="lc-scan-box"><label htmlFor="lc-url">{t.url}</label><input id="lc-url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" required /><button type="submit" disabled={busy} className="lc-primary">{busy ? t.running : t.run}</button></form>
    {error && <p role="alert" className="lc-note">{error}</p>}
    {busy && <section className="lc-scan-visual" aria-live="polite"><div className="lc-meter lc-meter-running"><div className="lc-meter-core"><strong>AI</strong><span>{t.running}</span></div></div><div><h2>{t.running}</h2><p>SEO · GEO · techniek · webshop · Ads & analytics</p></div></section>}
    {result && <section className="lc-scan-results" aria-live="polite"><div className="lc-scan-visual"><div className="lc-meter" style={{"--score":result.overallScore} as React.CSSProperties}><div className="lc-meter-core"><strong>{result.overallScore}</strong><span>/100</span></div></div><div><h2>{t.score}</h2><p>SEO {result.seo?.score ?? "—"} · GEO {result.geo?.score ?? "—"} · {issues} {t.issues.toLowerCase()}</p></div></div><div className="lc-grid"><div className="lc-card"><strong>SEO</strong>{result.seo?.score ?? "—"}/100</div><div className="lc-card"><strong>GEO</strong>{result.geo?.score ?? "—"}/100</div><div className="lc-card"><strong>{t.issues}</strong>{issues}</div></div><p>{t.success}: {checks.length - issues}</p><p>{t.next}</p><a className="lc-secondary" href="/dashboard">{t.signIn}</a></section>}
  </div>;
}
