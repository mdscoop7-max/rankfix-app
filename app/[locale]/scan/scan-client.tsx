"use client";
import { fetchScanResponse, readScanJson } from "@/lib/scan-request-client";
import { useStoredString } from "@/lib/browser-snapshot";
import Link from "next/link";
import { useState } from "react";
import { copy, type Locale } from "@/lib/locales";
import { ScoreQualifier } from "@/components/score-qualifier";
import SpeedAudit from "@/components/speed-audit";
import ScanProgress from "@/components/scan-progress";
import type { WebsiteSpeed } from "@/lib/pagespeed";
import { dimensionScoreText, headlineDisplay } from "@/lib/score-qualifier";
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
type Result = { websiteSpeed?: WebsiteSpeed | null; overallScore: number; seo?: { score: number; checks: Array<{ status: string }> }; geo?: { score: number; checks: Array<{ status: string }> }; security?: { score: number } };
export default function ScanClient({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const free = freeInfo[locale];
  const u = scanUi[locale];
  const rememberedUrl = useStoredString("rankfix:last-scan-url");
  const [urlOverride, setUrl] = useState<string|null>(null);
  const url = urlOverride ?? rememberedUrl;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  async function run(event: React.FormEvent) {
    event.preventDefault();
    // One scan at a time: a second click or Enter while scanning starts nothing.
    if (busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetchScanResponse({ url: /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`, mode: "both", language: locale });
      const data = await readScanJson<ReturnType<typeof JSON.parse>>(response);
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
  return <div className="lc-container lc-prose"><h1>{t.run}</h1><p>{t.intro}</p>
    <section className="lc-card lc-free-scope"><strong>{free.title}</strong><div className="lc-free-scope-grid">{free.items.map(item=><span key={item}>✓ {item}</span>)}</div></section>
    <p className="lc-note">{({
      nl:"Inbegrepen: snelheid mobiel + desktop via Google PageSpeed, gemeten tijdens dezelfde scan. Antwoordt Google niet op tijd, dan staat er eerlijk 'Niet gemeten'. Een scan duurt meestal 15–60 seconden; grote websites tot 2 minuten.",
      en:"Included: mobile + desktop speed via Google PageSpeed, measured during the same scan. If Google does not answer in time, it honestly says 'Not measured'. A scan usually takes 15–60 seconds; large websites up to 2 minutes.",
      de:"Enthalten: Mobil- und Desktop-Geschwindigkeit über Google PageSpeed, im selben Scan gemessen. Antwortet Google nicht rechtzeitig, steht dort ehrlich 'Nicht gemessen'. Ein Scan dauert meist 15–60 Sekunden, große Websites bis zu 2 Minuten.",
      fr:"Inclus : vitesse mobile et ordinateur via Google PageSpeed, mesurée pendant la même analyse. Si Google ne répond pas à temps, la mention est honnêtement « Non mesuré ». Une analyse dure en général 15 à 60 secondes ; jusqu’à 2 minutes pour les grands sites.",
      it:"Incluso: velocità mobile e desktop tramite Google PageSpeed, misurata nella stessa scansione. Se Google non risponde in tempo, viene indicato onestamente 'Non misurato'. Una scansione dura di solito 15–60 secondi; i siti grandi fino a 2 minuti.",
      es:"Incluido: velocidad móvil y de escritorio con Google PageSpeed, medida en el mismo análisis. Si Google no responde a tiempo, se indica con honestidad 'Sin medir'. Un análisis suele tardar 15–60 segundos; los sitios grandes hasta 2 minutos.",
    } as Record<Locale,string>)[locale]}</p>
    <form onSubmit={run} className="lc-scan-box"><label htmlFor="lc-url">{t.url}</label><input id="lc-url" value={url} onChange={event => { const next=event.target.value; const embedded=next.slice(1).search(/https?:\/\//i); setUrl(embedded>=0?next.slice(embedded+1):next); }} onFocus={event=>event.currentTarget.select()} placeholder="https://example.com" required /><button type="submit" disabled={busy} className="lc-primary">{busy ? t.running : t.run}</button></form>
    {error && <p role="alert" className="lc-note">{error}</p>}
    {busy && <section className="lc-scan-visual" aria-live="polite"><div className="lc-meter lc-meter-running"><div className="lc-meter-core"><strong>AI</strong><span>{t.running}</span></div></div><div><h2>{t.running}</h2><ScanProgress locale={locale}/><p className="lc-note">{u.scope}</p></div></section>}
    {result && <SpeedAudit locale={locale} speed={result.websiteSpeed} dark />}
    {result && <section className="lc-scan-results" aria-live="polite"><div className="lc-scan-visual"><div className="lc-meter" style={{"--score":result.overallScore} as React.CSSProperties}><div className="lc-meter-core"><strong>{headlineDisplay(result as never)}</strong><span>/100</span></div></div><div><h2>{t.score}</h2><p>SEO {dimensionScoreText(result as never,"seo",locale)} · GEO {dimensionScoreText(result as never,"geo",locale)} · Security {result.security?.score ?? "—"} · {issues} {t.issues.toLowerCase()}</p><ScoreQualifier result={result as never} locale={locale}/></div></div><div className="lc-grid"><div className="lc-card"><strong>SEO</strong>{dimensionScoreText(result as never,"seo",locale)}/100</div><div className="lc-card"><strong>GEO</strong>{dimensionScoreText(result as never,"geo",locale)}/100</div><div className="lc-card"><strong>Security</strong>{result.security?.score ?? "—"}/100</div><div className="lc-card"><strong>{t.issues}</strong>{issues}</div></div><p>{t.success}: {passed}</p>{(notApplicable > 0 || unableToConfirm > 0) && <p className="lc-note">{u.na}: {notApplicable} · {u.unconfirmed}: {unableToConfirm}. {u.scoreNote}</p>}<p>{t.next}</p><Link className="lc-secondary" href="/dashboard">{t.signIn}</Link></section>}
  </div>;
}
