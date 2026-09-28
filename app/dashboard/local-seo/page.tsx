"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import type {Locale} from "@/lib/locales";
import DashboardNav from "../nav";
import "../dashboard.css";
type Check={id:string;title:string;status:string;detail:string};
type Result={url:string;score:number;checks:Check[];notice:string;crawl:{pages:number}};
const ui:Record<Locale,string[]>={nl:["Local SEO Scan","Controleer de belangrijkste lokale SEO-signalen die RankFix rechtstreeks op je website kan bevestigen.","Website URL","Local SEO controleren…","Local SEO controleren","pagina’s gecontroleerd","Lokale controles","Scan mislukt."],en:["Local SEO Scan","Check the main local SEO signals RankFix can confirm directly on your website.","Website URL","Checking Local SEO…","Check Local SEO","pages checked","Local checks","Scan failed."],de:["Local SEO Scan","Prüfe die wichtigsten lokalen SEO-Signale, die RankFix direkt auf deiner Website bestätigen kann.","Website-URL","Local SEO wird geprüft…","Local SEO prüfen","Seiten geprüft","Lokale Prüfungen","Scan fehlgeschlagen."],fr:["Analyse SEO local","Vérifiez les principaux signaux SEO locaux que RankFix peut confirmer directement sur votre site.","URL du site","Analyse SEO local…","Vérifier le SEO local","pages contrôlées","Contrôles locaux","L’analyse a échoué."],it:["Scansione SEO locale","Controlla i principali segnali SEO locali che RankFix può confermare direttamente sul tuo sito.","URL sito","Controllo SEO locale…","Controlla SEO locale","pagine controllate","Controlli locali","Scansione non riuscita."],es:["Análisis SEO local","Comprueba las principales señales SEO locales que RankFix puede confirmar directamente en tu web.","URL del sitio","Comprobando SEO local…","Comprobar SEO local","páginas revisadas","Controles locales","El análisis ha fallado."]};
export default function LocalSeoPage(){
 const params=useSearchParams(); const[language,setLanguage]=useState<Locale>("nl"); const[url,setUrl]=useState("");const[busy,setBusy]=useState(false);const[error,setError]=useState("");const[result,setResult]=useState<Result|null>(null);
 useEffect(()=>{setUrl(params.get("url")||"");fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in ui)setLanguage(d.language)}).catch(()=>{})},[params]); const t=ui[language];
 async function run(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setResult(null);try{const r=await fetch("/api/local-seo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});const d=await r.json();if(!r.ok)throw new Error(d.error||t[7]);setResult(d)}catch(x){setError(x instanceof Error?x.message:t[7])}finally{setBusy(false)}}
 const mark=(s:string)=>s==="PASS"?"✓":s==="FAIL"?"×":"!";
 return <main className="rf-page" lang={language}><div className="rf-shell"><header className="rf-header"><a href="/" className="rf-brand" aria-label="RankFix AI home">RankFix <span>AI</span></a></header><DashboardNav/><div className="rf-body">
  <div className="rf-heading"><h1>{t[0]}</h1><p>{t[1]}</p></div>
  <section className="rf-dashboard-scan"><form onSubmit={run}><label>{t[2]}</label><input type="url" placeholder="https://bedrijf.nl" value={url} onChange={e=>setUrl(e.target.value)} required/><button className="rf-primary" disabled={busy}>{busy?t[3]:t[4]}</button></form></section>
  {error&&<p className="rf-alert">{error}</p>}
  {result&&<><section className="rf-report"><div className="rf-shared-score"><strong>{result.score}</strong><span>/100</span></div><div><span className="rf-eyebrow">Local SEO</span><h2>{result.crawl.pages} {t[5]}</h2><p>{result.notice}</p></div></section>
  <section className="rf-report"><div style={{width:"100%"}}><h2>{t[6]}</h2>{result.checks.map(c=><div key={c.id}><strong>{mark(c.status)} {c.title}</strong><p>{c.detail}</p></div>)}</div></section></>}
 </div></div></main>
}
