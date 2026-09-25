"use client";
import { useEffect,useState } from "react";
import DashboardNav from "../nav";
import AiAssistant from "@/components/ai-assistant";
import type { Locale } from "@/lib/locales";
import { copy } from "@/lib/locales";
import "../dashboard.css";
type Result={overallScore:number;seo?:{score:number;checks:Array<{status:string}>};geo?:{score:number;checks:Array<{status:string}>}};
export default function DashboardScan(){
 const [language,setLanguage]=useState<Locale>("nl"),[url,setUrl]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null);
 useEffect(()=>{fetch("/api/auth/me").then(r=>r.json()).then(d=>{if(!d.user)location.href="/account"});fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language)setLanguage(d.language)}).catch(()=>{})},[]);
 const t=copy[language];
 async function run(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setResult(null);try{const r=await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,mode:"both"})});const d=await r.json();if(!r.ok)throw new Error(d.error||t.error);setResult(d)}catch(e){setError(e instanceof Error?e.message:t.error)}finally{setBusy(false)}}
 const checks=[...(result?.seo?.checks||[]),...(result?.geo?.checks||[])],issues=checks.filter(c=>c.status==="fail"||c.status==="warning").length;
 return <main className="rf-page" lang={language}><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard" className="rf-back">← Dashboard</a></header><DashboardNav current={2}/><div className="rf-body"><div className="rf-heading"><h1>{t.run}</h1><p>{t.intro}</p></div><form onSubmit={run} className="rf-dashboard-scan"><label htmlFor="dashboard-url">{t.url}</label><input id="dashboard-url" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" required/><button className="rf-primary" disabled={busy}>{busy?t.running:"SEO + GEO scan starten"}</button></form>{error&&<p className="rf-alert">{error}</p>}{result&&<section className="rf-report"><div className="rf-section-head"><h2>{t.score}: {result.overallScore}/100</h2><a className="rf-primary-link" href="/dashboard">Naar overzicht</a></div><div className="rf-status-grid"><div className="rf-card"><span>SEO</span><strong>{result.seo?.score??"—"}</strong></div><div className="rf-card"><span>GEO</span><strong>{result.geo?.score??"—"}</strong></div><div className="rf-card"><span>{t.issues}</span><strong>{issues}</strong></div><div className="rf-card"><span>Geslaagd</span><strong>{checks.length-issues}</strong></div></div></section>}</div></div><AiAssistant dashboard/></main>
}