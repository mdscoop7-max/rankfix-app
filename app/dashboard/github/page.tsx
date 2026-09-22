"use client";

import { useEffect, useState } from "react";

type Repo={full_name:string;default_branch:string;private:boolean};
export default function GithubPage(){
  const [connected,setConnected]=useState(false);
  const [login,setLogin]=useState("");
  const [repos,setRepos]=useState<Repo[]>([]);
  const [repo,setRepo]=useState("");
  const [path,setPath]=useState("");
  const [issue,setIssue]=useState("");
  const [context,setContext]=useState("");
  const [baseBranch,setBaseBranch]=useState("main");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    const params=new URLSearchParams(location.search);
    setIssue(params.get("issue")||"");
    setContext(params.get("context")||"");
    (async()=>{
      const r=await fetch("/api/github/status"); const d=await r.json();
      if(d.connected){setConnected(true);setLogin(d.connection.github_login); const rr=await fetch("/api/github/repos"); const rd=await rr.json(); if(rr.ok){setRepos(rd.repos); if(rd.repos[0]){setRepo(rd.repos[0].full_name);setBaseBranch(rd.repos[0].default_branch);}}}
    })();
  },[]);

  async function createFix(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");setMessage("");
    const r=await fetch("/api/github/fix",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repo,path,issue,context,baseBranch})});
    const d=await r.json();
    if(!r.ok){setError(d.error||"GitHub fix mislukt.");setBusy(false);return;}
    setMessage("PR aangemaakt: "+d.pr.title+" — "+d.pr.url);
    setBusy(false);
  }

  return <main className="min-h-screen bg-[#050816] text-white">
    <nav className="mx-auto flex max-w-6xl items-center justify-between border-b border-white/10 px-5 py-5">
      <a href="/" className="font-bold">RankFix <span className="text-cyan-300">AI</span></a>
      <a href="/" className="text-sm text-slate-400 hover:text-white">← Terug naar RankFix AI</a>
    </nav>
    <section className="mx-auto max-w-4xl px-5 py-12">
      <div className="text-xs uppercase tracking-widest text-cyan-300">GitHub Fix Engine</div>
      <h1 className="mt-2 text-4xl font-black">AI maakt een echte PR voor je website.</h1>
      <p className="mt-3 max-w-2xl text-slate-400">RankFix leest alleen het gekozen bestand, maakt de kleinste noodzakelijke wijziging en opent een aparte Pull Request. Er wordt niets automatisch naar productie gemerged.</p>
      {!connected ? <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
        <h2 className="text-xl font-bold">Verbind GitHub</h2>
        <p className="mt-2 text-sm text-slate-500">Je geeft RankFix alleen toegang tot GitHub nadat je dit bij GitHub zelf hebt goedgekeurd.</p>
        <a href="/api/github/connect" className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 font-bold text-slate-950">Verbind met GitHub →</a>
      </div> : <form onSubmit={createFix} className="mt-8 space-y-5 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-200">GitHub verbonden als <b>{login}</b>.</div>
        <label className="block"><span className="text-sm font-semibold">Repository</span><select value={repo} onChange={e=>{setRepo(e.target.value);const x=repos.find(r=>r.full_name===e.target.value);if(x)setBaseBranch(x.default_branch);}} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3">{repos.map(r=><option key={r.full_name} value={r.full_name}>{r.full_name}{r.private?" · private":""}</option>)}</select></label>
        <label className="block"><span className="text-sm font-semibold">Bestand</span><input required value={path} onChange={e=>setPath(e.target.value)} placeholder="bijv. app/layout.tsx of public/index.html" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"/></label>
        <label className="block"><span className="text-sm font-semibold">Wat moet RankFix oplossen?</span><textarea required value={issue} onChange={e=>setIssue(e.target.value)} rows={4} placeholder="Bijv. de meta description ontbreekt of is te kort." className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"/></label>
        <label className="block"><span className="text-sm font-semibold">Context uit de audit</span><textarea value={context} onChange={e=>setContext(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"/></label>
        {error&&<div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {message&&<div className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200 break-all">{message}</div>}
        <button disabled={busy} className="w-full rounded-xl bg-white px-5 py-3 font-bold text-slate-950 disabled:opacity-50">{busy?"AI + GitHub zijn bezig…":"Maak GitHub Pull Request — 10 credits"}</button>
      </form>}
    </section>
  </main>
}
