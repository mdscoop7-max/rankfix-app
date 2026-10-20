"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { copy, type Locale } from "@/lib/locales";
import { ScoreQualifier } from "@/components/score-qualifier";
import { headlineDisplay } from "@/lib/score-qualifier";
import { readRecentScanUrls, rememberScanUrl, forgetRecentScanUrls } from "@/lib/recent-scan-urls";
import { downloadQaAuditPdf } from "@/lib/qa-audit-pdf";
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
type Result = { overallScore: number; seo?: { score: number; checks: Array<{ status: string }> }; geo?: { score: number; checks: Array<{ status: string }> }; security?: { score: number } };
export default function ScanClient({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const free = freeInfo[locale];
  const u = scanUi[locale];
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanAbort, setScanAbort] = useState<AbortController | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [recentSites, setRecentSites] = useState<string[]>([]);
  useEffect(() => { const saved=readRecentScanUrls(); setRecentSites(saved); if(saved[0])setUrl(saved[0]); }, []);
  async function run(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    const controller=new AbortController();setScanAbort(controller);
    const scanTimeout=window.setTimeout(()=>controller.abort("timeout"),135_000);
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`, mode: "both", language: locale }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || t.error);
      const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
      try { window.localStorage.setItem("rankfix:last-scan-url", normalized); } catch {}
      setUrl(normalized); setResult(data);
      setRecentSites(rememberScanUrl(normalized));
    } catch (cause) { setError(controller.signal.aborted?(controller.signal.reason==="cancelled"?"Scan gestopt.":"De scan duurt te lang. Probeer later opnieuw."):cause instanceof Error ? cause.message : t.error); } finally { window.clearTimeout(scanTimeout);setScanAbort(null);setBusy(false); }
  }
  function downloadPdf(){if(!result)return;try{downloadQaAuditPdf(result,url,locale)}catch{setError(locale==="nl"?"PDF maken is niet gelukt.":"Could not create the PDF.")}}
  const checks = [...(result?.seo?.checks || []), ...(result?.geo?.checks || [])];
  const issues = checks.filter(check => check.status === "fail" || check.status === "warning").length;
  const passed = checks.filter(check => check.status === "pass").length;
  const notApplicable = checks.filter(check => check.status === "not_applicable").length;
  const unableToConfirm = checks.filter(check => check.status === "unable_to_confirm").length;
  return <div className="lc-container lc-prose"><h1>{t.run}</h1><p>{t.intro}</p>
    <section className="lc-card lc-free-scope"><strong>{free.title}</strong><div className="lc-free-scope-grid">{free.items.map(item=><span key={item}>✓ {item}</span>)}</div></section>
    <form onSubmit={run} className="lc-scan-box"><label htmlFor="lc-url">{t.url}</label><input id="lc-url" value={url} onChange={event => { const next=event.target.value; const embedded=next.slice(1).search(/https?:\/\//i); setUrl(embedded>=0?next.slice(embedded+1):next); }} onFocus={event=>event.currentTarget.select()} placeholder="https://example.com" required /><button type="submit" disabled={busy} className="lc-primary">{busy ? t.running : t.run}</button></form>
    {recentSites.length>0&&<div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,marginTop:12,marginBottom:14}}><strong style={{fontSize:13}}>{locale==="nl"?"Eerder gescand:":"Recent sites:"}</strong>{recentSites.map(site=><button type="button" key={site} title={site} onClick={()=>setUrl(site)} style={{border:"1px solid #94a3b8",borderRadius:20,padding:"6px 12px",fontSize:12,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{site.replace(/^https?:\/\//,"").replace(/\/$/,"")}</button>)}<button type="button" style={{fontSize:12,textDecoration:"underline"}} onClick={()=>{forgetRecentScanUrls();setRecentSites([])}}>{locale==="nl"?"Wis lijst":"Clear list"}</button></div>}
    {error && <p role="alert" className="lc-note">{error}</p>}
    {busy && <button type="button" className="lc-secondary" onClick={()=>scanAbort?.abort("cancelled")}>{locale==="nl"?"Stop scan":"Cancel scan"}</button>}
    {busy && <section className="lc-scan-visual" aria-live="polite"><div className="lc-meter lc-meter-running"><div className="lc-meter-core"><strong>AI</strong><span>{t.running}</span></div></div><div><h2>{t.running}</h2><p>{u.scope}</p></div></section>}
    {result && <section className="lc-scan-results" aria-live="polite"><div className="lc-scan-visual"><div className="lc-meter" style={{"--score":result.overallScore} as React.CSSProperties}><div className="lc-meter-core"><strong>{headlineDisplay(result as never)}</strong><span>/100</span></div></div><div><h2>{t.score}</h2><p>SEO {result.seo?.score ?? "—"} · GEO {result.geo?.score ?? "—"} · Security {result.security?.score ?? "—"} · {issues} {t.issues.toLowerCase()}</p><ScoreQualifier result={result as never} locale={locale}/></div></div><div className="lc-grid"><div className="lc-card"><strong>SEO</strong>{result.seo?.score ?? "—"}/100</div><div className="lc-card"><strong>GEO</strong>{result.geo?.score ?? "—"}/100</div><div className="lc-card"><strong>Security</strong>{result.security?.score ?? "—"}/100</div><div className="lc-card"><strong>{t.issues}</strong>{issues}</div></div><p>{t.success}: {passed}</p>{(notApplicable > 0 || unableToConfirm > 0) && <p className="lc-note">{u.na}: {notApplicable} · {u.unconfirmed}: {unableToConfirm}. {u.scoreNote}</p>}<p>{t.next}</p><button type="button" className="lc-primary" onClick={downloadPdf}>{locale==="nl"?"Download PDF-rapport":"Download PDF report"}</button> <Link className="lc-secondary" href="/dashboard">{t.signIn}</Link></section>}
  </div>;
}
