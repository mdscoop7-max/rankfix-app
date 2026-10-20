import type { Locale } from "@/lib/locales";
import "./scan-progress.css";

const copy: Record<Locale, { label: string; title: string; running: string; wait: string; steps: string[] }> = {
  nl: { label: "Website analyseren", title: "We zijn je website aan het controleren", running: "Scannen…", wait: "Je rapport opent zodra de analyse klaar is.", steps: ["Metadata & vindbaarheid", "Laadsnelheid & techniek", "Content & mobiel", "Structured data", "SEO & GEO-signalen"] },
  en: { label: "Website analysis", title: "We are checking your website", running: "Scanning…", wait: "Your report opens when the analysis is complete.", steps: ["Metadata & visibility", "Speed & technology", "Content & mobile", "Structured data", "SEO & GEO signals"] },
  de: { label: "Website analysieren", title: "Wir prüfen deine Website", running: "Scan läuft…", wait: "Dein Bericht öffnet sich nach der Analyse.", steps: ["Metadaten & Sichtbarkeit", "Ladezeit & Technik", "Inhalt & Mobilgeräte", "Strukturierte Daten", "SEO- & GEO-Signale"] },
  fr: { label: "Analyse du site", title: "Nous vérifions votre site", running: "Analyse…", wait: "Votre rapport s’ouvre à la fin de l’analyse.", steps: ["Métadonnées & visibilité", "Vitesse & technique", "Contenu & mobile", "Données structurées", "Signaux SEO & GEO"] },
  it: { label: "Analisi del sito", title: "Stiamo controllando il tuo sito", running: "Scansione…", wait: "Il report si apre al termine dell’analisi.", steps: ["Metadati & visibilità", "Velocità & tecnica", "Contenuti & mobile", "Dati strutturati", "Segnali SEO & GEO"] },
  es: { label: "Análisis del sitio", title: "Estamos comprobando tu sitio", running: "Analizando…", wait: "Tu informe se abrirá al finalizar el análisis.", steps: ["Metadatos & visibilidad", "Velocidad & técnica", "Contenido & móvil", "Datos estructurados", "Señales SEO & GEO"] }
};

export default function ScanProgress({ url, language = "nl", onCancel }: { url: string; language?: Locale; onCancel?: () => void }) {
  const t = copy[language];
  return <div className="rf-live-scan-overlay"><section className="rf-live-scan" role="status" aria-live="polite" aria-label={t.running}><header><div className="rf-live-brand"><b>RF</b><span>RankFix AI<small>SEO Scanner</small></span></div><span className="rf-live-badge">LIVE SCAN</span></header><div className="rf-live-grid"><div className="rf-live-meter" aria-hidden="true"><div className="rf-live-ring" /><div className="rf-live-core"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><span>{t.running}</span></div></div><div><span className="rf-live-eyebrow">{t.label}</span><h2>{t.title}</h2><div className="rf-live-url"><i />{url}</div><ul>{t.steps.map(step => <li key={step}><span aria-hidden="true" />{step}</li>)}</ul></div></div><footer><span>SEO · GEO · Performance · Content</span><span>{t.wait}</span>{onCancel&&<button type="button" onClick={onCancel} style={{padding:"8px 12px",border:"1px solid #94a3b8",borderRadius:8,color:"#fff",background:"#334155",cursor:"pointer"}}>{language==="nl"?"Stop scan":"Cancel scan"}</button>}</footer></section></div>;
}
