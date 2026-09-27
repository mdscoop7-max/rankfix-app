"use client";
import {useState} from "react";
import DashboardNav from "../nav";
import "../dashboard.css";
type Check={id:string;title:string;status:string;detail:string};
type Result={url:string;score:number;checks:Check[];notice:string;crawl:{pages:number}};
export default function LocalSeoPage(){
 const[url,setUrl]=useState("");const[busy,setBusy]=useState(false);const[error,setError]=useState("");const[result,setResult]=useState<Result|null>(null);
 async function run(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setResult(null);try{const r=await fetch("/api/local-seo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Scan mislukt.");setResult(d)}catch(x){setError(x instanceof Error?x.message:"Scan mislukt.")}finally{setBusy(false)}}
 const mark=(s:string)=>s==="PASS"?"✓":s==="FAIL"?"×":"!";
 return <main className="rf-page"><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a></header><DashboardNav/><div className="rf-body">
  <div className="rf-heading"><h1>Local SEO Scan</h1><p>Controleer de belangrijkste lokale SEO-signalen die RankFix rechtstreeks op je website kan bevestigen.</p></div>
  <section className="rf-dashboard-scan"><form onSubmit={run}><label>Website URL</label><input type="url" placeholder="https://bedrijf.nl" value={url} onChange={e=>setUrl(e.target.value)} required/><button className="rf-primary" disabled={busy}>{busy?"Local SEO controleren…":"Local SEO controleren"}</button></form></section>
  {error&&<p className="rf-alert">{error}</p>}
  {result&&<><section className="rf-report"><div className="rf-shared-score"><strong>{result.score}</strong><span>/100</span></div><div><span className="rf-eyebrow">Local SEO</span><h2>{result.crawl.pages} pagina's gecontroleerd</h2><p>{result.notice}</p></div></section>
  <section className="rf-report"><div style={{width:"100%"}}><h2>Lokale controles</h2>{result.checks.map(c=><div key={c.id}><strong>{mark(c.status)} {c.title}</strong><p>{c.detail}</p></div>)}</div></section></>}
 </div></div></main>
}
