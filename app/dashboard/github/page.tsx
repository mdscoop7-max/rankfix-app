"use client";

import { useEffect, useState } from "react";
import DashboardNav from "../nav";
import "../dashboard.css";

type Repo={full_name:string;default_branch:string;private:boolean};
type ValidationResult={valid?:boolean;errors?:string[];warnings?:string[]};

export default function GithubPage(){
  const [connected,setConnected]=useState(false);
  const [login,setLogin]=useState("");
  const [repos,setRepos]=useState<Repo[]>([]);
  const [repo,setRepo]=useState("");
  const [path,setPath]=useState("");
  const [siteUrl,setSiteUrl]=useState("");
  const [scanId,setScanId]=useState("");
  const [issueId,setIssueId]=useState("");
  const [mapped,setMapped]=useState(false);
  const [issue,setIssue]=useState("");
  const [context,setContext]=useState("");
  const [baseBranch,setBaseBranch]=useState("main");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [validation,setValidation]=useState<ValidationResult|null>(null);

  useEffect(()=>{
    const params=new URLSearchParams(location.search);
    setIssue(params.get("issue")||"");
    setContext(params.get("context")||"");
    const incomingScanId=params.get("scan_id")||""; setScanId(incomingScanId); setIssueId(params.get("issue_id")||"");
    let incomingUrl=params.get("url")||"";
    (async()=>{
      if(incomingScanId){
        try{
          const sr=await fetch("/api/history/"+encodeURIComponent(incomingScanId),{cache:"no-store"});
          const sd=await sr.json();
          if(sr.ok&&sd?.scan?.scanned_url){ incomingUrl=sd.scan.scanned_url; setSiteUrl(incomingUrl); }
        }catch{}
      } else setSiteUrl(incomingUrl);
      const r=await fetch("/api/github/status"); const d=await r.json();
      if(d.connected){
        setConnected(true);setLogin(d.connection.github_login);
        const rr=await fetch("/api/github/repos"); const rd=await rr.json();
        if(rr.ok){setRepos(rd.repos); if(incomingUrl){ const mr=await fetch("/api/github/site-repository?url="+encodeURIComponent(incomingUrl)); const md=await mr.json(); if(mr.ok&&md.mapped){setRepo(md.repository);setBaseBranch(md.baseBranch||"main");setMapped(true);} } }
        else if(/bad credentials|authenticatie|verbinden/i.test(rd.error||"")) { setConnected(false); setError("De GitHub-koppeling is ongeldig. Verbind GitHub opnieuw."); }
      } else if(d.reauthorize || d.error) {
        setConnected(false);
        setError(d.error || "GitHub kan niet worden geverifieerd. Verbind GitHub opnieuw.");
      }
    })();
  },[]);

  async function createFix(e:React.FormEvent){
    e.preventDefault();
    if(busy) return;
    const cleanRepo=repo.trim();
    const cleanPath=path.trim();
    const cleanIssue=issue.trim();
    if(!cleanRepo || !issueId || !scanId){
      setError("Open deze fix vanuit een RankFix-audit en kies bij de eerste koppeling alleen de repository.");
      return;
    }
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanRepo)){
      setError("Repository moet in het formaat owner/repository staan, bijvoorbeeld mdscoop7-max/Trendmix.");
      return;
    }
    setBusy(true);setError("");setMessage("");setValidation(null);
    try{
      const r=await fetch("/api/github/fix",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repo:cleanRepo,path:cleanPath,baseBranch,scan_id:scanId,issue_id:issueId})});
      const text=await r.text();
      let d:any={};
      try{d=JSON.parse(text);}catch{}
      if(!r.ok){
        const apiError=d.error||"GitHub fix mislukt. Controleer repository en bestand.";
        if(/bad credentials|GitHub-token|GitHub-koppeling|opnieuw verbinden/i.test(apiError)){
          setConnected(false);
          setError("Je GitHub-koppeling is ongeldig. Klik op 'GitHub opnieuw verbinden' en autoriseer RankFix opnieuw.");
        } else {
          setError(apiError);
          if(d.validation) setValidation(d.validation);
        }
        return;
      }
      setPath(d.path || cleanPath);
      setMessage(d.alreadyApplied ? "De gevraagde code staat al in het bestand. Er is niets gewijzigd en er zijn geen credits gebruikt. Controleer de live pagina met een nieuwe scan." : "Codewijziging voorgesteld in PR: "+d.pr.title+" — "+d.pr.url+" | Bestand: "+(d.path || cleanPath)+". Controleer de diff, merge en scan opnieuw om de live fix te bevestigen.");
    }catch(error){
      setError(error instanceof Error?error.message:"Verbinding met GitHub Fix Engine mislukt.");
    }finally{
      setBusy(false);
    }
  }

  return <main className="rf-page">
    <div className="rf-shell">
    <header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard" className="rf-back">← Dashboard</a></header>
    <DashboardNav current={3} />
    <section className="rf-body rf-fix-engine">
      <div className="text-xs uppercase tracking-widest text-emerald-300">GitHub Fix Engine</div>
      <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">Een codevoorstel voor je website.</h1>
      <p className="mt-3 max-w-2xl text-slate-400">RankFix leest alleen het gekozen bestand, maakt de kleinste noodzakelijke wijziging en opent een aparte Pull Request. Er wordt niets automatisch naar productie gemerged.</p>
      {!connected ? <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
        <h2 className="text-xl font-bold">Verbind GitHub</h2>
        <p className="mt-2 text-sm text-slate-500">Je geeft RankFix alleen toegang tot GitHub nadat je dit bij GitHub zelf hebt goedgekeurd.</p>
        <a href="/api/github/connect" className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 font-bold text-slate-950">Verbind met GitHub →</a>
      </div> : <form noValidate onSubmit={createFix} className="mt-8 space-y-5 rounded-3xl border border-[#334155] bg-[#101B2D] p-4 sm:p-7">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
          <span>GitHub verbonden als <b>{login}</b>.</span>
          <a href="/api/github/connect" className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-300/10">GitHub opnieuw verbinden</a>
        </div>
        <label className="block"><span className="text-sm font-semibold">{mapped?"Gekoppelde repository":"Kies eenmalig de repository van deze website"}</span><select required disabled={mapped} value={repo} onChange={e=>{setRepo(e.target.value);const x=repos.find(r=>r.full_name===e.target.value);if(x)setBaseBranch(x.default_branch);}} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"><option value="">Selecteer repository</option>{repos.map(r=><option key={r.full_name} value={r.full_name}>{r.full_name}{r.private?" · privé":""}</option>)}</select><p className="mt-2 text-xs text-slate-500">{mapped?"RankFix gebruikt deze geverifieerde koppeling automatisch.":"Dit hoef je maar één keer per website te doen. RankFix kiest branch, bestand en technische gegevens daarna zelf."}</p></label>
        {siteUrl&&<div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm"><span className="text-slate-500">Website</span><div className="mt-1 font-semibold break-all">{siteUrl}</div></div>}
        <input type="hidden" value={path} readOnly />
        <input type="hidden" value={issue} readOnly />
        <input type="hidden" value={context} readOnly />
        {error&&<div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-200">
          <div className="font-bold">Fix geblokkeerd</div>
          <div className="mt-1">{error}</div>
          {validation?.errors?.length ? <ul className="mt-3 list-disc space-y-1 pl-5">{validation.errors.map((item,i)=><li key={i}>{item}</li>)}</ul> : null}
          {validation?.warnings?.length ? <div className="mt-4"><div className="font-semibold text-amber-200">Waarschuwingen</div><ul className="mt-1 list-disc space-y-1 pl-5 text-amber-100">{validation.warnings.map((item,i)=><li key={i}>{item}</li>)}</ul></div> : null}
        </div>}
        {message&&<div className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200 break-all">{message}</div>}
        <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-[#5DCAA5] px-5 py-3 font-bold text-[#04342C] disabled:opacity-50">{busy?"AI + GitHub zijn bezig…":"Maak GitHub Pull Request — 5 credits"}</button>
      </form>}
    </section>
    </div>
  </main>
}
