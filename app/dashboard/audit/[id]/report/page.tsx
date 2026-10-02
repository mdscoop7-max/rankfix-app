"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import "./report.css";

type Check={key?:string;category?:string;title:string;status:string;severity?:string;message:string;fix?:string;rule_id?:string;issue_id?:string;confidence?:string;evidence?:{details?:string;found?:unknown};points?:number;maxPoints?:number};
type Scan={id?:string;scanned_url:string;created_at:string;result:any};

const labels:Record<string,string>={fail:"Fout",warning:"Waarschuwing",pass:"Geslaagd",unable_to_confirm:"Niet te bevestigen",not_applicable:"N.v.t."};
const esc=(v:unknown)=>String(v??"");

export default function FullAuditReport(){
  const {id}=useParams<{id:string}>();
  const [scan,setScan]=useState<Scan|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{if(!id)return;fetch("/api/history/"+encodeURIComponent(id),{cache:"no-store"}).then(async r=>{const d=await r.json();if(r.status===401){location.href="/account";return;}if(!r.ok)throw new Error(d.error||"Rapport kon niet worden geladen.");setScan({...d.scan,id});}).catch(e=>setError(e instanceof Error?e.message:"Rapport kon niet worden geladen."));},[id]);
  const checks=useMemo(()=>{
    const raw:Check[]=[...(scan?.result?.seo?.checks||[]),...(scan?.result?.geo?.checks||[])];
    const rank:Record<string,number>={fail:5,warning:4,pass:3,unable_to_confirm:2,not_applicable:1};
    const map=new Map<string,Check>();
    raw.forEach(c=>{const k=[String(c.category||"").toLowerCase(),String(c.rule_id||c.issue_id||c.title).toLowerCase()].join(":");const old=map.get(k);if(!old||(rank[c.status]||0)>(rank[old.status]||0))map.set(k,c);});
    return [...map.values()];
  },[scan]);
  const groups=[
    ["Verbeterpunten",checks.filter(c=>c.status==="fail"||c.status==="warning")],
    ["Geslaagde controles",checks.filter(c=>c.status==="pass")],
    ["Niet te bevestigen",checks.filter(c=>c.status==="unable_to_confirm")],
    ["Niet van toepassing",checks.filter(c=>c.status==="not_applicable")],
  ] as const;
  if(error)return <main className="report-wrap"><p>{error}</p></main>;
  if(!scan)return <main className="report-wrap"><p>Rapport laden…</p></main>;
  const r=scan.result||{}; const profile=r.technologyProfile; const rendering=r.rendering; const pageType=r.pageTypeEvidence;
  return <main className="report-wrap">
    <div className="report-actions"><Link href={"/dashboard/audit/"+encodeURIComponent(id)} className="report-button">← Terug naar audit</Link><button className="report-button primary" onClick={()=>window.print()}>Opslaan als PDF</button></div>
    <header className="report-header"><div><div className="report-brand">RankFix <span>AI</span></div><h1>Volledig scanrapport</h1><p className="muted">Bewijsgericht SEO, GEO en webshoprapport</p></div><div className="score"><b>{r.overallScore??"—"}</b><span>/ 100</span></div></header>
    <section className="summary-grid"><div><span>Website</span><strong>{scan.scanned_url}</strong></div><div><span>Gescand</span><strong>{new Date(scan.created_at).toLocaleString("nl-NL",{dateStyle:"long",timeStyle:"short"})}</strong></div><div><span>SEO</span><strong>{r.seo?.score??"—"} / 100</strong></div><div><span>GEO</span><strong>{r.geo?.score??"—"} / 100</strong></div></section>
    <section><h2>Scanbasis & websiteprofiel</h2><div className="box"><p><b>Scanbewijs:</b> {rendering?.mode==="raw_html"?"Raw HTML":"Rendered"} · JavaScript {rendering?.javascriptExecuted?"uitgevoerd":"niet uitgevoerd"}{pageType?.type?" · paginatype "+pageType.type+" ("+pageType.confidence+")":""}</p>{rendering?.note&&<p>{rendering.note}</p>}<p><b>Websiteprofiel:</b> {profile?.siteType||"Website"} · CMS: {profile?.cms||"Niet bevestigd"} · Platform: {profile?.commercePlatform||"Niet bevestigd"} · Framework: {profile?.framework||"Niet bevestigd"} · zekerheid {profile?.confidence??"—"}%</p>{profile?.evidence?.length>0&&<p><b>Bewijs:</b> {profile.evidence.join(" · ")}</p>}</div></section>
    {r.multiPage?.enabled&&<section><h2>Multi-page scan</h2><div className="box"><p>Representatieve pagina's: {r.multiPage.selectedPages?.length||0} / {r.multiPage.maxPages||6}. De score van deze scan blijft voor de huidige pagina.</p>{r.multiPage.selectedPages?.map((p:any,i:number)=><p key={i}><b>{esc(p.type)}:</b> {esc(p.url)}</p>)}</div></section>}
    {groups.map(([title,list])=><section key={title}><h2>{title} <small>({list.length})</small></h2>{list.length===0?<p className="empty">Geen items.</p>:list.map((c,i)=><article className="finding" key={(c.rule_id||c.title)+i}><div className="finding-head"><h3>{c.title}</h3><span className={"status "+c.status}>{labels[c.status]||c.status}</span></div><p>{c.message}</p>{c.fix&&<p><b>Volgende stap:</b> {c.fix}</p>}<p className="meta">Regel: {c.rule_id||c.issue_id||c.key||"—"} · categorie {c.category||"—"} · zekerheid {c.confidence||"—"}{c.maxPoints!==undefined?" · punten "+(c.points??0)+"/"+c.maxPoints:""}</p>{c.evidence?.details&&<p className="evidence"><b>Bewijs:</b> {c.evidence.details}</p>}</article>)}</section>)}
    <section><h2>Product & webshopdiagnostiek</h2><div className="box pre">{JSON.stringify({productOptimizer:r.metrics?.productOptimizer||null,pricingCurrency:r.metrics?.pricingCurrency||null,euConsumerSignals:r.metrics?.euConsumerSignals||null,checkoutFunnel:r.metrics?.checkoutFunnel||null},null,2)}</div></section>
    <section><h2>Technische scaninformatie</h2><div className="box"><p><b>Pagina:</b> {scan.scanned_url}</p><p><b>Rapport-ID:</b> {scan.id||id}</p><p><b>Rendering:</b> {rendering?.mode||"—"} · JavaScript: {String(rendering?.javascriptExecuted??false)}</p><p><b>Paginatype bewijs:</b> {(pageType?.evidence||[]).join(" · ")||"Niet beschikbaar"}</p></div></section>
    <footer>RankFix AI · Dit rapport beschrijft wat tijdens deze scan aantoonbaar was. Niet te bevestigen en N.v.t. verlagen de score niet. EU/Omnibus-signalen zijn geen juridische conformiteitsverklaring.</footer>
  </main>;
}
