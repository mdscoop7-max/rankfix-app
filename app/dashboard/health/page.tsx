"use client";
import {useEffect,useState} from "react";
import DashboardNav from "../nav";
import "../dashboard.css";
type Check={key:string;label:string;level:"green"|"orange"|"red";message:string;latencyMs?:number};
type Run={overall_level:"green"|"orange"|"red";checks:Check[];created_at:string};
const label={green:"Alles goed",orange:"Aandacht",red:"Kritiek"};
export default function HealthPage(){
 const [runs,setRuns]=useState<Run[]>([]);const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/health/system",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Health status laden mislukt.");setRuns(d.runs||[])}).catch(e=>setError(e.message))},[]);
 const latest=runs[0];
 return <main className="rf-page"><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a></header><DashboardNav/>
 <div className="rf-body"><div className="rf-heading"><h1>Health Guard</h1><p>Interne bewaking van RankFix. Alleen echte kritieke incidenten worden later per e-mail geëscaleerd.</p></div>
 {error&&<div className="rf-alert">{error}</div>}
 <section className="rf-plan-card"><div><span className="rf-eyebrow">Systeemstatus</span><h2>{latest?label[latest.overall_level]:"Nog geen controle"}</h2><p>{latest?"Laatste controle: "+new Date(latest.created_at).toLocaleString("nl-NL"):"De scheduler heeft nog geen health-run opgeslagen."}</p></div></section>
 <div className="rf-grid">{(latest?.checks||[]).map(c=><section className="rf-card" key={c.key}><span className="rf-eyebrow">{c.level.toUpperCase()}</span><h3>{c.label}</h3><p>{c.message}</p>{typeof c.latencyMs==="number"&&<small>{c.latencyMs} ms</small>}</section>)}</div>
 <section className="rf-card"><h2>Recente controles</h2>{runs.slice(0,12).map((r,i)=><p key={r.created_at+i}><strong>{label[r.overall_level]}</strong> · {new Date(r.created_at).toLocaleString("nl-NL")}</p>)}</section>
 </div></div></main>
}