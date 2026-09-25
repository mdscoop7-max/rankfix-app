"use client";
import { useEffect,useMemo,useState } from "react";
import DashboardNav from "../nav";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";

type Scan={id:string;scanned_url:string;overall_score:number;seo_score:number;geo_score:number;created_at:string;open_issues:number;critical_issues:number};
const host=(url:string)=>{try{return new URL(url).hostname}catch{return url}};
export default function HistoryPage(){
 const [history,setHistory]=useState<Scan[]>([]),[language,setLanguage]=useState<Locale>("nl"),[query,setQuery]=useState(""),[score,setScore]=useState("all"),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{Promise.all([fetch("/api/history",{cache:"no-store"}).then(r=>r.json()),fetch("/api/account/language").then(r=>r.ok?r.json():null)]).then(([d,p])=>{if(d.error)throw new Error(d.error);setHistory(d.history||[]);if(p?.language)setLanguage(p.language)}).catch(e=>setError(e.message||"Historie laden mislukt.")).finally(()=>setLoading(false))},[]);
 const sites=useMemo(()=>Array.from(new Set(history.map(s=>host(s.scanned_url)))),[history]);
 const filtered=history.filter(s=>(!query||host(s.scanned_url)===query)&&(score==="all"||(score==="good"?s.overall_score>=80:score==="attention"?s.overall_score>=60&&s.overall_score<80:s.overall_score<60)));
 return <main className="rf-page" lang={language}><div className="rf-shell">
  <header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard" className="rf-back">← Overzicht</a></header>
  <DashboardNav current={1}/>
  <div className="rf-body"><div className="rf-heading"><h1>Scanhistorie</h1><p>Vergelijk controles en zie of je website vooruitgaat.</p></div>
   <div className="rf-history-filters"><label>Website<select value={query} onChange={e=>setQuery(e.target.value)}><option value="">Alle websites</option>{sites.map(x=><option key={x}>{x}</option>)}</select></label><label>Score<select value={score} onChange={e=>setScore(e.target.value)}><option value="all">Alle scores</option><option value="good">80–100</option><option value="attention">60–79</option><option value="low">0–59</option></select></label><a className="rf-primary-link" href={`/${language}/scan`}>＋ Nieuwe scan</a></div>
   {loading&&<p className="rf-empty">Scans laden…</p>}{error&&<p className="rf-alert">{error}</p>}
   {!loading&&!error&&<div className="rf-history-cards">{filtered.map((scan,i)=>{const prev=history.slice(i+1).find(x=>host(x.scanned_url)===host(scan.scanned_url));const delta=prev?scan.overall_score-prev.overall_score:null;return <a href={`/dashboard/audit/${scan.id}`} className="rf-history-card" key={scan.id}><div className="rf-history-main"><strong>{host(scan.scanned_url)}</strong><span>{new Date(scan.created_at).toLocaleString(language)} · {scan.open_issues} verbeterpunten</span></div><div className="rf-history-scores"><span>SEO <b>{scan.seo_score}</b></span><span>GEO <b>{scan.geo_score}</b></span><span>Totaal <b>{scan.overall_score}</b></span><em className={delta!==null&&delta<0?"down":""}>{delta===null?"—":`${delta>0?"+":""}${delta}`}</em></div></a>})}{!filtered.length&&<p className="rf-empty">Geen scans gevonden met deze filters.</p>}</div>}
  </div>
 </div></main>
}