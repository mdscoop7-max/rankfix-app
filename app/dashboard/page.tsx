"use client";

import { useEffect, useState } from "react";
import AiAssistant from "@/components/ai-assistant";

type User = { id:string; email:string; name:string; credits:number };
type Scan = { id:string; scanned_url:string; final_url:string|null; overall_score:number; seo_score:number; geo_score:number; created_at:string };
type ScanResult = {
  overallScore:number;
  grade:string;
  seo?:{score:number;grade:string;checks?:Array<{title:string;status:string;message:string}>};
  geo?:{score:number;grade:string;checks?:Array<{title:string;status:string;message:string}>};
  responseTime?:number;
  httpStatus?:number;
};

export default function Dashboard() {
  const [user,setUser]=useState<User|null>(null);
  const [scans,setScans]=useState<Scan[]>([]);
  const [error,setError]=useState("");
  const [selectedScanId,setSelectedScanId]=useState<string|null>(null);
  const [selectedResult,setSelectedResult]=useState<ScanResult|null>(null);
  const [loadingResult,setLoadingResult]=useState(false);
  const [rescanning,setRescanning]=useState<string|null>(null);
  const [rescanMessage,setRescanMessage]=useState("");

  async function loadHistory(){
    const h=await fetch("/api/history",{cache:"no-store"});
    const x=await h.json();
    if(h.ok){setScans(x.scans);setUser((u)=>u?{...u,credits:x.credits}:u);}
    else setError(x.error||"History laden mislukt.");
  }

  useEffect(()=>{ (async()=>{
    const r=await fetch("/api/auth/me");
    const d=await r.json();
    if(!d.user){ location.href="/account"; return; }
    setUser(d.user);
    await loadHistory();
  })(); },[]);

  async function logout(){await fetch("/api/auth/logout",{method:"POST"}); location.href="/";}

  async function viewScan(id:string){
    setSelectedScanId(id);
    setLoadingResult(true);
    setRescanMessage("");
    try{
      const r=await fetch("/api/history/"+encodeURIComponent(id),{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Scanresultaat laden mislukt.");
      setSelectedResult(d.scan.result);
    }catch(e){
      setError(e instanceof Error?e.message:"Scanresultaat laden mislukt.");
    }finally{setLoadingResult(false);}
  }

  async function rescan(scan:Scan){
    setRescanning(scan.id);
    setRescanMessage("");
    setError("");
    try{
      const r=await fetch("/api/scan",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({url:scan.scanned_url,mode:"both"})
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Nieuwe scan mislukt.");
      setSelectedScanId(null);
      setSelectedResult(d);
      setRescanMessage("Nieuwe scan uitgevoerd. Dit is nu het actuele resultaat van "+scan.scanned_url+".");
      await loadHistory();
    }catch(e){
      setError(e instanceof Error?e.message:"Nieuwe scan mislukt.");
    }finally{setRescanning(null);}
  }

  return <main className="min-h-screen bg-[#050816] text-white">
    <nav className="border-b border-white/10 bg-[#050816]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <a href="/" className="shrink-0 font-bold">RankFix <span className="text-cyan-300">AI</span></a>
        <div className="hidden items-center gap-5 text-sm text-slate-400 md:flex">
          <a href="/#features" className="hover:text-white">Meer info</a><a href="/#scan" className="hover:text-white">Audit</a><a href="/#prijzen" className="hover:text-white">Prijzen</a><a href="/#resources" className="hover:text-white">Resources</a><a href="/#footer" className="hover:text-white">Contact</a>
        </div>
        <div className="flex items-center gap-2"><a href="/dashboard" className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-950">Dashboard</a><button onClick={logout} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5">Uitloggen</button></div>
      </div>
    </nav>

    <section className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="text-xs uppercase tracking-widest text-cyan-300">Dashboard</div><h1 className="mt-2 text-4xl font-black">Welkom, {user?.name}.</h1><p className="mt-2 text-slate-500">{user?.email}</p></div>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-6 py-4"><div className="text-xs uppercase tracking-widest text-cyan-300">Credits</div><div className="mt-1 text-3xl font-black">{user?.credits ?? "—"}</div></div>
      </div>

      <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div><h2 className="text-xl font-bold">Scan history</h2><p className="mt-1 text-sm text-slate-500">Bekijk een opgeslagen resultaat of scan opnieuw na een GitHub-fix.</p></div>
          <div className="flex gap-2"><a href="/dashboard/github" className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-sm font-bold text-cyan-200">GitHub Fix Engine</a><a href="/#scan" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950">Nieuwe scan</a></div>
        </div>
        {error&&<p className="mt-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
        {rescanMessage&&<p className="mt-4 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200">{rescanMessage}</p>}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-3">URL</th><th>Overall</th><th>SEO</th><th>GEO</th><th>Datum</th><th>Acties</th></tr></thead>
            <tbody>
              {scans.map(s=><tr key={s.id} className="border-t border-white/5">
                <td className="max-w-[360px] truncate py-4">{s.scanned_url}</td><td className="font-bold text-cyan-300">{s.overall_score}</td><td>{s.seo_score}</td><td>{s.geo_score}</td><td className="text-slate-500">{new Date(s.created_at).toLocaleString("nl-NL")}</td>
                <td><div className="flex gap-2"><button onClick={()=>viewScan(s.id)} className="rounded-lg border border-cyan-400/20 px-2 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/10">Bekijk resultaat</button><button onClick={()=>rescan(s)} disabled={rescanning===s.id} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50">{rescanning===s.id?"Scant…":"Opnieuw scannen"}</button></div></td>
              </tr>)}
              {!scans.length&&<tr><td colSpan={6} className="py-10 text-center text-slate-500">Nog geen opgeslagen scans.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {(loadingResult||selectedResult)&&<section className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-6">
        <div className="flex items-center justify-between gap-4"><div><div className="text-xs uppercase tracking-widest text-cyan-300">Scanresultaat</div><h2 className="mt-1 text-2xl font-black">Resultaat in RankFix</h2></div>{selectedScanId&&<button onClick={()=>{setSelectedScanId(null);setSelectedResult(null)}} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Sluiten</button>}</div>
        {loadingResult?<p className="mt-5 text-slate-400">Resultaat laden…</p>:selectedResult&&<div className="mt-5">
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs text-slate-500">Overall</div><div className="mt-1 text-3xl font-black text-cyan-300">{selectedResult.overallScore}</div><div className="text-xs text-slate-500">Grade {selectedResult.grade}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs text-slate-500">SEO</div><div className="mt-1 text-2xl font-black">{selectedResult.seo?.score ?? "—"}</div><div className="text-xs text-slate-500">Grade {selectedResult.seo?.grade ?? "—"}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs text-slate-500">GEO</div><div className="mt-1 text-2xl font-black">{selectedResult.geo?.score ?? "—"}</div><div className="text-xs text-slate-500">Grade {selectedResult.geo?.grade ?? "—"}</div></div></div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">{[...(selectedResult.seo?.checks||[]),...(selectedResult.geo?.checks||[])].map((c,i)=><div key={i} className="rounded-2xl border border-white/10 bg-black/10 p-4"><div className="flex items-center justify-between gap-3"><div className="font-semibold">{c.title}</div><span className="text-xs uppercase text-slate-500">{c.status}</span></div><p className="mt-2 text-sm text-slate-400">{c.message}</p></div>)}</div>
        </div>}
      </section>}
    </section>
    <AiAssistant dashboard scanId={selectedScanId} />
  </main>;
}
