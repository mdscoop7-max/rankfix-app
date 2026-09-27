"use client";
import {useState} from "react";
import DashboardNav from "../nav";
import "../dashboard.css";

type Site={url:string;scores:{overall:number;technical:number;onPage:number;content:number;structuredData:number;internalLinks:number};issues:number;pages:number};
type Result={website:Site;competitor:Site;opportunities:Array<{rule_id:string;title:string;severity:string;recommendation:string}>};

export default function CompetitorPage(){
 const[website,setWebsite]=useState("");const[competitor,setCompetitor]=useState("");const[busy,setBusy]=useState(false);const[error,setError]=useState("");const[result,setResult]=useState<Result|null>(null);
 async function run(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setResult(null);try{const r=await fetch("/api/competitor-scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({website,competitor})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Vergelijking mislukt.");setResult(d)}catch(x){setError(x instanceof Error?x.message:"Vergelijking mislukt.")}finally{setBusy(false)}}
 const rows:[string,keyof Site["scores"]][]=[["Overall","overall"],["Techniek","technical"],["On-page","onPage"],["Content","content"],["Structured data","structuredData"],["Interne links","internalLinks"]];
 return <main className="rf-page"><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a></header><DashboardNav/><div className="rf-body">
  <div className="rf-heading"><h1>Concurrent Scan</h1><p>Vergelijk twee websites met dezelfde RankFix audit-engine. RankFix toont concrete punten die jouw site mist en de concurrent al goed heeft.</p></div>
  <section className="rf-dashboard-scan"><form onSubmit={run}><label>Jouw website</label><input type="url" placeholder="https://jouwsite.nl" value={website} onChange={e=>setWebsite(e.target.value)} required/><label>Concurrent</label><input type="url" placeholder="https://concurrent.nl" value={competitor} onChange={e=>setCompetitor(e.target.value)} required/><button className="rf-primary" disabled={busy}>{busy?"Vergelijken…":"Vergelijk websites"}</button></form></section>
  {error&&<p className="rf-alert">{error}</p>}
  {result&&<><section className="rf-report"><div><span className="rf-eyebrow">Vergelijking</span><h2>{result.website.scores.overall}/100 tegenover {result.competitor.scores.overall}/100</h2><p>{result.website.pages} pagina's gecontroleerd · {result.website.issues} aandachtspunten op jouw site.</p></div></section>
  <section className="rf-report"><div style={{width:"100%"}}><h2>Scores naast elkaar</h2>{rows.map(([label,key])=><p key={key}><strong>{label}</strong>: {result.website.scores[key]} / {result.competitor.scores[key]} <small>(jij / concurrent)</small></p>)}</div></section>
  <section className="rf-report"><div><h2>Kansen voor jouw website</h2>{result.opportunities.length?result.opportunities.map(x=><div key={x.rule_id}><strong>{x.title}</strong><p>{x.recommendation}</p></div>):<p>In deze quick scan zijn geen punten gevonden die alleen bij jouw website ontbreken. Dit betekent niet dat beide sites volledig gelijk zijn.</p>}</div></section></>}
 </div></div></main>
}
