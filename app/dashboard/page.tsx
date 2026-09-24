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

    <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Overzicht</div>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Welkom, {user?.name} 👋</h1>
          <p className="mt-2 text-slate-500">Je RankFix-overzicht: zie wat goed gaat, wat klaarstaat en wat nog aandacht nodig heeft.</p>
        </div>
        <a href="/#scan" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100">+ Website toevoegen</a>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="font-semibold">Je onboarding</span>
          <span className="text-slate-500">2 van 3 stappen voltooid</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-cyan-300" /></div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="text-emerald-300">✓ Account aangemaakt</div>
          <div className="text-emerald-300">✓ Website toegevoegd</div>
          <div className="text-slate-400">○ Eerste verbetering controleren</div>
        </div>
      </div>

      {error&&<p className="mt-5 rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
      {rescanMessage&&<p className="mt-5 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200">{rescanMessage}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"><div className="text-xs text-slate-500">Gem. score</div><div className="mt-2 text-4xl font-black text-cyan-300">{scans.length ? Math.round(scans.reduce((sum,s)=>sum+s.overall_score,0)/scans.length) : "—"}</div><div className="mt-1 text-xs text-slate-500">over je websites</div></div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"><div className="text-xs text-slate-500">Open fixes</div><div className="mt-2 text-4xl font-black">{scans.reduce((sum,s)=>sum+(s.overall_score<90?1:0),0)}</div><div className="mt-1 text-xs text-slate-500">websites met aandacht</div></div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"><div className="text-xs text-slate-500">Automatisch opgelost</div><div className="mt-2 text-4xl font-black text-emerald-300">—</div><div className="mt-1 text-xs text-slate-500">volgt uit je Fix Engine</div></div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"><div className="text-xs text-slate-500">Wacht op controle</div><div className="mt-2 text-4xl font-black text-amber-300">—</div><div className="mt-1 text-xs text-slate-500">na je volgende scan</div></div>
      </div>

      <div className="mt-10 flex items-end justify-between gap-4">
        <div><h2 className="text-2xl font-black">Mijn websites</h2><p className="mt-1 text-sm text-slate-500">Bekijk per website wat RankFix als volgende stap ziet.</p></div>
        <div className="hidden text-sm text-slate-500 sm:block">Credits: <span className="font-bold text-white">{user?.credits ?? "—"}</span></div>
      </div>

      <div className="mt-5 grid gap-4">
        {scans.map(s=>{
          const score=s.overall_score;
          const tone=score>=90?"emerald":score>=80?"amber":"red";
          const label=score>=90?"Goed":score>=80?"Verbeteren":"Actie nodig";
          const action=score>=90?"Bekijk resultaat":score>=80?"Bekijk verbeteringen":"Bekijk actiepunten";
          return <div key={s.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-cyan-400/20">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3"><span className="text-lg">🌐</span><h3 className="truncate font-bold">{s.scanned_url}</h3></div>
                <p className="mt-2 text-sm text-slate-500">Laatste scan: {new Date(s.created_at).toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"})}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/10 px-3 py-1 text-slate-400">SEO {s.seo_score}</span><span className="rounded-full border border-white/10 px-3 py-1 text-slate-400">GEO {s.geo_score}</span><span className={`rounded-full border px-3 py-1 ${tone==="emerald"?"border-emerald-400/20 text-emerald-300":tone==="amber"?"border-amber-400/20 text-amber-300":"border-red-400/20 text-red-300"}`}>{label}</span></div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right"><div className="text-4xl font-black">{score}</div><div className="text-xs text-slate-500">/ 100</div></div>
                <div className="flex gap-2"><button onClick={()=>viewScan(s.id)} className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950">{action} →</button><button onClick={()=>rescan(s)} disabled={rescanning===s.id} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50">{rescanning===s.id?"Scant…":"Opnieuw scannen"}</button></div>
              </div>
            </div>
          </div>;
        })}
        {!scans.length&&<div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-slate-500">Nog geen websites. Voeg je eerste website toe om je RankFix-resultaat te zien.</div>}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <a href="/dashboard/github" className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-6 transition hover:bg-cyan-400/[0.07]"><div className="text-2xl">🔧</div><h3 className="mt-3 font-bold">Fixes</h3><p className="mt-2 text-sm text-slate-500">Bekijk welke verbeteringen automatisch kunnen worden klaargezet.</p></a>
        <a href="/#prijzen" className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:bg-white/[0.05]"><div className="text-2xl">💳</div><h3 className="mt-3 font-bold">Abonnement</h3><p className="mt-2 text-sm text-slate-500">Bekijk je huidige gebruik en toekomstige abonnementen.</p></a>
        <a href="/account" className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:bg-white/[0.05]"><div className="text-2xl">👤</div><h3 className="mt-3 font-bold">Account</h3><p className="mt-2 text-sm text-slate-500">Beheer je profiel, taal en accountinstellingen.</p></a>
      </div>

      {(loadingResult||selectedResult)&&<section className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-6">
        <div className="flex items-center justify-between gap-4"><div><div className="text-xs uppercase tracking-widest text-cyan-300">Scanresultaat</div><h2 className="mt-1 text-2xl font-black">Resultaat in RankFix</h2></div>{selectedScanId&&<button onClick={()=>{setSelectedScanId(null);setSelectedResult(null)}} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Sluiten</button>}</div>
        {loadingResult?<p className="mt-5 text-slate-400">Resultaat laden…</p>:selectedResult&&<div className="mt-5">
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs text-slate-500">Overall</div><div className="mt-1 text-3xl font-black text-cyan-300">{selectedResult.overallScore}</div><div className="text-xs text-slate-500">Grade {selectedResult.grade}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs text-slate-500">SEO</div><div className="mt-1 text-2xl font-black">{selectedResult.seo?.score ?? "—"}</div><div className="text-xs text-slate-500">Grade {selectedResult.seo?.grade ?? "—"}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs text-slate-500">GEO</div><div className="mt-1 text-2xl font-black">{selectedResult.geo?.score ?? "—"}</div><div className="text-xs text-slate-500">Grade {selectedResult.geo?.grade ?? "—"}</div></div></div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">{[...(selectedResult.seo?.checks||[]),...(selectedResult.geo?.checks||[])].map((c,i)=><div key={i} className="rounded-2xl border border-white/10 bg-black/10 p-4"><div className="flex items-center justify-between gap-3"><div className="font-semibold">{c.title}</div><span className="text-xs uppercase text-slate-500">{c.status}</span></div><p className="mt-2 text-sm text-slate-400">{c.message}</p></div>)}</div>
        </div>}
      </section>}

      <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
        <div className="grid grid-cols-5 text-center text-xs font-semibold text-slate-400"><a href="/dashboard" className="border-b-2 border-cyan-300 px-3 py-4 text-cyan-200">Overzicht</a><a href="/dashboard" className="px-3 py-4 hover:text-white">Websites</a><a href="/dashboard/github" className="px-3 py-4 hover:text-white">Fixes</a><a href="/#prijzen" className="px-3 py-4 hover:text-white">Abonnement</a><a href="/account" className="px-3 py-4 hover:text-white">Account</a></div>
      </div>
    </section>
    <AiAssistant dashboard scanId={selectedScanId} />
  </main>;
}
