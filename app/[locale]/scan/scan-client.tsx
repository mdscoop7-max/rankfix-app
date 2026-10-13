"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { copy, type Locale } from "@/lib/locales";
import { provisionalScoreMessage } from "@/lib/score-provisional";
import { qaPreviewAuditText, type QaResult } from "@/lib/qa-preview-report";
const freeInfo: Record<Locale,{title:string;items:string[]}> = {
  nl:{title:"Wat controleert de gratis RankFix-scan?",items:["SEO & GEO / AI Search","Security & techniek","Webshop & Merchant Readiness","EU Consumer Rights & Consent Mode","Ads & Analytics · Search Console · Local SEO","Structured Data & Accessibility","Quality & Trust · Broken Links · Redirects","Direct een score met concrete verbeterpunten. Geen betaalkaart nodig; RankFix wijzigt niets automatisch."]},
  en:{title:"What do you get with the free scan?",items:["Checks of key SEO, technical and GEO/AI Search signals.","An immediate score and concrete improvement points.","No payment card required and RankFix does not automatically change your website."]},
  fr:{title:"Que comprend l’audit gratuit ?",items:["Contrôle des principaux signaux SEO, techniques et GEO/recherche IA.","Un score immédiat et des améliorations concrètes.","Aucune carte bancaire requise et RankFix ne modifie pas automatiquement votre site."]},
  es:{title:"¿Qué incluye el análisis gratuito?",items:["Revisión de señales SEO, técnicas y GEO/búsqueda con IA importantes.","Puntuación inmediata y mejoras concretas.","No se requiere tarjeta y RankFix no modifica automáticamente tu web."]},
  it:{title:"Cosa include la scansione gratuita?",items:["Controllo dei principali segnali SEO, tecnici e GEO/AI Search.","Punteggio immediato e miglioramenti concreti.","Nessuna carta richiesta e RankFix non modifica automaticamente il sito."]},
  de:{title:"Was enthält der kostenlose Scan?",items:["Prüfung wichtiger SEO-, technischer und GEO/AI-Search-Signale.","Sofortige Bewertung und konkrete Verbesserungspunkte.","Keine Zahlungskarte erforderlich und RankFix ändert deine Website nicht automatisch."]}
};
const scanUi: Record<Locale,{scope:string;na:string;unconfirmed:string;scoreNote:string}> = {
  nl:{scope:"SEO · GEO/AI Search · Security · techniek · webshop · EU-Omnibus & Consumer Rights · Merchant readiness · Ads & analytics · Search Console · Consent Mode · Local SEO · structured data · accessibility · Quality & Trust · broken links · redirects",na:"N.v.t.",unconfirmed:"Niet te bevestigen",scoreNote:"Deze controles tellen niet als geslaagd en beïnvloeden de score niet."},
  en:{scope:"SEO · GEO/AI Search · Security · technical · ecommerce · EU-Omnibus & Consumer Rights · Merchant readiness · Ads & analytics · Search Console · Consent Mode · Local SEO · structured data · accessibility · Quality & Trust · broken links · redirects",na:"N/A",unconfirmed:"Unable to confirm",scoreNote:"These checks do not count as passed and do not affect the score."},
  de:{scope:"SEO · GEO/AI Search · Security · Technik · Webshop · EU-Omnibus & Consumer Rights · Merchant Readiness · Ads & Analytics · Search Console · Consent Mode · Local SEO · strukturierte Daten · Barrierefreiheit · Quality & Trust · Broken Links · Redirects",na:"N. zutr.",unconfirmed:"Nicht bestätigbar",scoreNote:"Diese Prüfungen zählen nicht als bestanden und beeinflussen die Bewertung nicht."},
  fr:{scope:"SEO · GEO/AI Search · Security · technique · e-commerce · EU-Omnibus & Consumer Rights · Merchant readiness · Ads & analytics · Search Console · Consent Mode · SEO local · données structurées · accessibilité · Quality & Trust · liens cassés · redirections",na:"N/A",unconfirmed:"Impossible à confirmer",scoreNote:"Ces contrôles ne comptent pas comme réussis et n’influencent pas le score."},
  it:{scope:"SEO · GEO/AI Search · Security · tecnica · ecommerce · EU-Omnibus & Consumer Rights · Merchant readiness · Ads e analytics · Search Console · Consent Mode · SEO locale · dati strutturati · accessibilità · Quality & Trust · link non validi · redirect",na:"N/D",unconfirmed:"Non confermabile",scoreNote:"Questi controlli non risultano superati e non influenzano il punteggio."},
  es:{scope:"SEO · GEO/AI Search · Security · técnica · ecommerce · EU-Omnibus & Consumer Rights · Merchant readiness · Ads y analítica · Search Console · Consent Mode · SEO local · datos estructurados · accesibilidad · Quality & Trust · enlaces rotos · redirecciones",na:"N/A",unconfirmed:"No se puede confirmar",scoreNote:"Estas comprobaciones no cuentan como superadas y no afectan a la puntuación."}
};
type Result = QaResult;
export default function ScanClient({ locale, qaPreview = false }: { locale: Locale; qaPreview?: boolean }) {
  const t = copy[locale];
  const free = freeInfo[locale];
  const u = scanUi[locale];
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [qaCopyStatus, setQaCopyStatus] = useState("");
  const [qaShowText, setQaShowText] = useState(false);
  async function copyQaAudit() {
    if (!result) return;
    try { await navigator.clipboard.writeText(qaPreviewAuditText(result)); setQaCopyStatus("Volledige testaudit gekopieerd. Plak hem in ChatGPT."); }
    catch { setQaShowText(true); setQaCopyStatus("Kopiëren niet toegestaan door de browser. Selecteer de tekst hieronder."); }
  }
  useEffect(() => { try { const remembered = window.localStorage.getItem("rankfix:last-scan-url"); if (remembered) setUrl(remembered); } catch {} }, []);
  async function run(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null); setQaCopyStatus(""); setQaShowText(false);
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`, mode: "both", language: locale }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || t.error);
      const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
      try { window.localStorage.setItem("rankfix:last-scan-url", normalized); } catch {}
      setUrl(normalized); setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); } finally { setBusy(false); }
  }
  const checks = [...(result?.seo?.checks || []), ...(result?.geo?.checks || [])];
  const issues = checks.filter(check => check.status === "fail" || check.status === "warning").length;
  const passed = checks.filter(check => check.status === "pass").length;
  const notApplicable = checks.filter(check => check.status === "not_applicable").length;
  const unableToConfirm = checks.filter(check => check.status === "unable_to_confirm").length;
  const provisionalNote = provisionalScoreMessage(result, locale);
  return <div className="lc-container lc-prose"><h1>{t.run}</h1><p>{t.intro}</p>
    <section className="lc-card lc-free-scope"><strong>{free.title}</strong><div className="lc-free-scope-grid">{free.items.map(item=><span key={item}>✓ {item}</span>)}</div></section>
    <form onSubmit={run} className="lc-scan-box"><label htmlFor="lc-url">{t.url}</label><input id="lc-url" value={url} onChange={event => { const next=event.target.value; const embedded=next.slice(1).search(/https?:\/\//i); setUrl(embedded>=0?next.slice(embedded+1):next); }} onFocus={event=>event.currentTarget.select()} placeholder="https://example.com" required /><button type="submit" disabled={busy} className="lc-primary">{busy ? t.running : t.run}</button></form>
    {error && <p role="alert" className="lc-note">{error}</p>}
    {busy && <section className="lc-scan-visual" aria-live="polite"><div className="lc-meter lc-meter-running"><div className="lc-meter-core"><strong>AI</strong><span>{t.running}</span></div></div><div><h2>{t.running}</h2><p>{u.scope}</p></div></section>}
    {result && <section className="lc-scan-results" aria-live="polite">{provisionalNote&&<p role="status" className="lc-note"><strong>{provisionalNote}</strong></p>}<div className="lc-scan-visual"><div className="lc-meter" style={{"--score":result.overallScore} as React.CSSProperties}><div className="lc-meter-core"><strong>{result.overallScore}</strong><span>/100</span></div></div><div><h2>{t.score}</h2><p>SEO {result.seo?.score ?? "—"} · GEO {result.geo?.score ?? "—"} · Security {result.security?.score ?? "—"} · {issues} {t.issues.toLowerCase()}</p></div></div><div className="lc-grid"><div className="lc-card"><strong>SEO</strong>{result.seo?.score ?? "—"}/100</div><div className="lc-card"><strong>GEO</strong>{result.geo?.score ?? "—"}/100</div><div className="lc-card"><strong>Security</strong>{result.security?.score ?? "—"}/100</div><div className="lc-card"><strong>{t.issues}</strong>{issues}</div></div><p>{t.success}: {passed}</p>{(notApplicable > 0 || unableToConfirm > 0) && <p className="lc-note">{u.na}: {notApplicable} · {u.unconfirmed}: {unableToConfirm}. {u.scoreNote}</p>}{qaPreview && <section className="lc-card" aria-label="Volledig QA-testverslag" style={{marginTop:"1.5rem"}}>
      <h3>Volledig QA-testverslag – zonder inloggen</h3>
      <p><strong>Primaire sector:</strong> {result.sectorProfile?.label || "Niet bevestigd"} · Zekerheid {result.sectorProfile?.confidenceScore ?? "—"}%</p>
      <p><strong>Websiteprofiel:</strong> {result.technologyProfile?.siteType || "Niet bevestigd"}</p>
      <p className="lc-note">Deze volledige controleweergave bestaat uitsluitend in de afgescheiden RankFix-testomgeving. Je scans worden hier niet in het dashboard opgeslagen. De normale scanlimieten blijven gelden.</p>
      <button type="button" className="lc-primary" onClick={()=>void copyQaAudit()}>Kopieer volledige testaudit</button>
      {qaCopyStatus && <p role="status" className="lc-note">{qaCopyStatus}</p>}
      {qaShowText && <textarea readOnly aria-label="Volledige testaudit om handmatig te kopiëren" value={qaPreviewAuditText(result)} rows={8} style={{width:"100%",marginTop:"0.75rem"}} onFocus={e=>e.currentTarget.select()} />}
      <details style={{marginTop:"1rem"}}><summary><strong>Sectorbewijs en actieve modules</strong></summary>
        {(result.sectorProfile?.evidence || []).map((entry,i)=><p key={i}>{entry}</p>)}
        <p>Modules: {(result.sectorProfile?.applicableModules || []).join(", ") || "niet bevestigd"}</p>
      </details>
      {([["SEO",result.seo?.checks || []],["GEO",result.geo?.checks || []]] as const).map(([label, entries])=>
        <details key={label} style={{marginTop:"1rem"}}>
          <summary><strong>{label}: alle {entries.length} controles</strong></summary>
          {entries.map((check,i)=><article key={check.key || i} style={{borderTop:"1px solid #64748b55",padding:"0.75rem 0"}}>
            <p><strong>{i+1}. {check.title || check.key || "Controle"}</strong> — {check.status}{check.maxPoints != null ? ` (${check.points ?? 0}/${check.maxPoints})` : ""}</p>
            {check.message && <p>{check.message}</p>}
            {check.fix && <p><strong>Advies:</strong> {check.fix}</p>}
            {check.evidence?.details && <p><strong>Bewijs:</strong> {check.evidence.details}</p>}
            {check.evidence?.url && <p><strong>Bron:</strong> {check.evidence.url}</p>}
          </article>)}
        </details>)}
    </section>}
    <p>{t.next}</p><Link className="lc-secondary" href="/dashboard">{t.signIn}</Link></section>}
  </div>;
}
