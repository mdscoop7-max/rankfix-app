"use client";

import { useMemo, useState } from "react";

type Issue = {
  issue_id:string; rule_id:string; category:string; title:string; description:string;
  recommendation:string; severity:string; confidence:string; status:string;
  affected_urls:string[];
  evidence:{total_pages:number;affected_pages:number;examples:Array<{url:string;found?:unknown;expected?:string;details?:string}>};
};
type Audit = {
  startUrl:string; finalUrl:string; mode:string; crawler_version:string; audit_version:string;
  crawl:{pages:number;discovered:number;errors:number;blocked:number;complete:boolean};
  scores:{technical:number;onPage:number;content:number;structuredData:number;internalLinks:number;overall:number;grade:string};
  page_types:Record<string,number>; issues:Issue[];
};

const severityClass=(s:string)=>s==="CRITICAL"||s==="HIGH"?"text-red-300 bg-red-400/10 border-red-400/20":s==="MEDIUM"?"text-amber-300 bg-amber-400/10 border-amber-400/20":"text-slate-300 bg-white/5 border-white/10";

export default function SiteAuditPage(){
  const [url,setUrl]=useState("");
  const [mode,setMode]=useState("STANDARD");
  const [audit,setAudit]=useState<Audit|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("ALL");
  const [selected,setSelected]=useState<Issue|null>(null);

  async function run(){
    setLoading(true);setError("");setAudit(null);setSelected(null);
    try{
      const r=await fetch("/api/site-audit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,mode})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Audit mislukt.");
      setAudit(d);
    }catch(e){setError(e instanceof Error?e.message:"Audit mislukt.");}
    finally{setLoading(false);}
  }

  const visible=useMemo(()=>audit?.issues.filter(i=>filter==="ALL"||i.category===filter)||[],[audit,filter]);
  const issueCount=audit?.issues.filter(i=>i.status==="FAIL"||i.status==="WARNING").length||0;
  const categories=audit?["ALL",...Array.from(new Set(audit.issues.map(i=>i.category)))]:["ALL"];

  return <main className="min-h-screen bg-[#0B1220] text-white">
    <nav className="border-b border-white/10 bg-[#0B1220]/95 px-5 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <a href="/" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300 text-xs font-black text-slate-950">RF</span><span className="font-bold">RankFix <span className="text-emerald-300">AI</span></span></a>
        <a href="/dashboard" className="text-xs text-slate-300 hover:text-white sm:text-sm">← Dashboard</a>
      </div>
    </nav>

    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-5 sm:py-10 lg:px-8">
      <div className="max-w-3xl">
        <div className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">Pro Audit</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Analyseer je hele website.</h1>
        <p className="mt-4 text-slate-400">RankFix crawlt pagina's en koppelt ieder probleem aan concreet bewijs. Scores en issues worden deterministisch berekend.</p>
      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[.035] p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <input aria-label="Websiteadres" value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")run()}} placeholder="https://jouwdomein.nl" className="min-w-0 flex-1 rounded-2xl bg-black/20 px-5 py-4 text-base outline-none placeholder:text-slate-400"/>
          <select aria-label="Auditdiepte" value={mode} onChange={e=>setMode(e.target.value)} className="rounded-2xl border border-white/10 bg-[#0a1020] px-4 py-4 text-base outline-none sm:text-sm">
            <option>QUICK</option><option>STANDARD</option><option>DEEP</option><option>ECOMMERCE</option><option>ENTERPRISE</option>
          </select>
          <button onClick={run} disabled={loading||!url.trim()} className="rounded-2xl bg-white px-7 py-4 text-sm font-black text-slate-950 disabled:opacity-50">{loading?"Website wordt gecrawld…":"Site audit starten →"}</button>
        </div>
      </div>
      {error&&<div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
    </section>

    {audit&&<section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Overall",audit.scores.overall,audit.scores.grade],["Technical",audit.scores.technical,""],["On-page",audit.scores.onPage,""],["Content",audit.scores.content,""],["Structured data",audit.scores.structuredData,""]
        ].map(([name,score,grade])=><div key={name as string} className="rounded-3xl border border-white/10 bg-white/[.035] p-5"><div className="text-xs uppercase tracking-widest text-slate-500">{name}</div><div className="mt-3 text-4xl font-black text-emerald-300">{score}</div>{grade&&<div className="mt-1 text-xs text-slate-500">Grade {grade}</div>}</div>)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-3xl border border-white/10 bg-white/[.035] p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><div className="text-xs uppercase tracking-widest text-slate-500">Issues</div><div className="mt-1 text-2xl font-black">{issueCount} aandachtspunten</div><div className="mt-1 break-all text-xs text-slate-600">{audit.finalUrl} · {audit.crawl.pages} pagina's gecrawld</div></div>
            <div className="flex gap-2 overflow-x-auto pb-1">{categories.map(c=><button key={c} onClick={()=>setFilter(c)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${filter===c?"bg-white text-slate-950":"bg-white/5 text-slate-400"}`}>{c==="ALL"?"Alles":c}</button>)}</div>
          </div>
          <div className="mt-6 space-y-3">
            {visible.map(issue=><button key={issue.issue_id} onClick={()=>setSelected(issue)} className="w-full rounded-2xl border border-white/10 bg-black/15 p-4 text-left transition hover:border-emerald-400/20 hover:bg-white/[.04]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{issue.title}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${severityClass(issue.severity)}`}>{issue.severity}</span></div><p className="mt-2 text-sm leading-6 text-slate-500">{issue.description}</p></div>
                <div className="shrink-0 text-right"><div className={`text-sm font-bold ${issue.status==="FAIL"?"text-red-300":issue.status==="WARNING"?"text-amber-300":"text-emerald-300"}`}>{issue.status}</div><div className="mt-1 text-xs text-slate-600">{issue.affected_urls.length} URL's</div></div>
              </div>
            </button>)}
            {!visible.length&&<div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[.04] p-6 text-sm text-emerald-200">Geen issues in deze categorie.</div>}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><div className="text-xs uppercase tracking-widest text-slate-500">Crawl</div><div className="mt-4 grid grid-cols-2 gap-3">{[["Pagina's",audit.crawl.pages],["Ontdekt",audit.crawl.discovered],["Errors",audit.crawl.errors],["Blocked",audit.crawl.blocked]].map(([k,v])=><div key={k as string} className="rounded-2xl bg-black/20 p-3"><div className="text-xs text-slate-600">{k}</div><div className="mt-1 text-xl font-black">{v}</div></div>)}</div><div className="mt-4 text-xs text-slate-500">{audit.crawl.complete?"Crawl compleet":"Crawl bevat fetch errors"}</div></div>
          <div className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><div className="text-xs uppercase tracking-widest text-slate-500">Pagina types</div><div className="mt-4 space-y-2">{Object.entries(audit.page_types).map(([k,v])=><div key={k} className="flex justify-between border-b border-white/5 pb-2 text-sm"><span className="text-slate-500">{k}</span><span className="font-bold">{v}</span></div>)}</div></div>
          <div className="rounded-3xl border border-emerald-400/10 bg-emerald-400/[.04] p-6"><div className="text-xs uppercase tracking-widest text-emerald-300">Engine</div><div className="mt-3 text-sm text-slate-300">Crawler {audit.crawler_version}</div><div className="mt-1 text-sm text-slate-500">Audit {audit.audit_version}</div></div>
        </aside>
      </div>
    </section>}

    {selected&&<div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={()=>setSelected(null)}>
      <div className="mx-auto mt-10 max-h-[85vh] max-w-3xl overflow-auto rounded-3xl border border-white/10 bg-[#101B2D] p-7 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><div className="text-xs uppercase tracking-widest text-emerald-300">{selected.rule_id}</div><h2 className="mt-2 text-2xl font-black">{selected.title}</h2></div><button onClick={()=>setSelected(null)} className="rounded-xl bg-white/5 px-3 py-2 text-sm">Sluiten</button></div>
        <p className="mt-5 text-sm leading-7 text-slate-400">{selected.description}</p>
        <div className="mt-5 rounded-2xl border border-emerald-400/10 bg-emerald-400/[.04] p-4"><div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Aanbeveling</div><p className="mt-2 text-sm leading-6 text-slate-300">{selected.recommendation}</p></div>
        <div className="mt-6 flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs ${severityClass(selected.severity)}`}>{selected.severity}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">Confidence {selected.confidence}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">{selected.affected_urls.length} affected</span></div>
        <div className="mt-7"><div className="text-xs font-bold uppercase tracking-widest text-slate-500">Evidence</div><div className="mt-3 space-y-2">{selected.evidence.examples.map((e,i)=><div key={e.url+i} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="break-all text-xs font-semibold text-slate-300">{e.url}</div><div className="mt-2 text-xs text-slate-500">{e.details}</div>{e.found!==undefined&&<div className="mt-2 text-xs text-slate-600">Found: {String(e.found)}</div>}{e.expected&&<div className="mt-1 text-xs text-slate-600">Expected: {e.expected}</div>}</div>)}</div></div>
      </div>
    </div>}
  </main>;
}
