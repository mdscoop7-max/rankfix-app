"use client";

import { useEffect, useState } from "react";

type Repo={full_name:string;default_branch:string;private:boolean};
type ValidationResult={valid?:boolean;errors?:string[];warnings?:string[]};

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
  const [validation,setValidation]=useState<ValidationResult|null>(null);

  useEffect(()=>{
    const params=new URLSearchParams(location.search);
    setIssue(params.get("issue")||"");
    setContext(params.get("context")||"");
    (async()=>{
      const r=await fetch("/api/github/status"); const d=await r.json();
      if(d.connected){
        setConnected(true);setLogin(d.connection.github_login);
        const rr=await fetch("/api/github/repos"); const rd=await rr.json();
        if(rr.ok){setRepos(rd.repos); if(rd.repos[0]){setRepo(rd.repos[0].full_name);setBaseBranch(rd.repos[0].default_branch);}}
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
    if(!cleanRepo || !cleanIssue){
      setError("Vul Repository en Wat moet RankFix oplossen? in.");
      return;
    }
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanRepo)){
      setError("Repository moet in het formaat owner/repository staan, bijvoorbeeld mdscoop7-max/Trendmix.");
      return;
    }
    setBusy(true);setError("");setMessage("");setValidation(null);
    try{
      const r=await fetch("/api/github/fix",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repo:cleanRepo,path:cleanPath,issue:cleanIssue,context:context.trim(),baseBranch})});
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
      </div> : <form noValidate onSubmit={createFix} className="mt-8 space-y-5 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
          <span>GitHub verbonden als <b>{login}</b>.</span>
          <a href="/api/github/connect" className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-300/10">GitHub opnieuw verbinden</a>
        </div>
        <label className="block"><span className="text-sm font-semibold">Repository</span><input required list="github-repositories" aria-invalid={!repo.trim()} value={repo} onChange={e=>{setRepo(e.target.value);const x=repos.find(r=>r.full_name===e.target.value);if(x)setBaseBranch(x.default_branch);}} placeholder="bijv. mdscoop7-max/Trendmix" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"/><datalist id="github-repositories">{repos.map(r=><option key={r.full_name} value={r.full_name}>{r.private?"private":""}</option>)}</datalist><p className="mt-2 text-xs text-slate-500">Kies een voorgestelde repository of vul zelf owner/repository in.</p></label>
        <label className="block"><span className="text-sm font-semibold">Bestand <span className="text-xs font-normal text-cyan-300">(automatisch als je dit leeg laat)</span></span><input aria-invalid={false} value={path} onChange={e=>setPath(e.target.value)} placeholder="RankFix kiest automatisch het juiste bestand" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"/><p className="mt-2 text-xs text-slate-500">Laat leeg: RankFix zoekt zelf het meest relevante bestand voor deze auditfix.</p></label>
        <label className="block"><span className="text-sm font-semibold">Wat moet RankFix oplossen?</span><textarea required aria-invalid={!issue.trim()} value={issue} onChange={e=>setIssue(e.target.value)} rows={4} placeholder="Bijv. de meta description ontbreekt of is te kort." className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"/></label>
        <label className="block"><span className="text-sm font-semibold">Context uit de audit</span><textarea value={context} onChange={e=>setContext(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"/></label>
        {error&&<div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-200">
          <div className="font-bold">Fix geblokkeerd</div>
          <div className="mt-1">{error}</div>
          {validation?.errors?.length ? <ul className="mt-3 list-disc space-y-1 pl-5">{validation.errors.map((item,i)=><li key={i}>{item}</li>)}</ul> : null}
          {validation?.warnings?.length ? <div className="mt-4"><div className="font-semibold text-amber-200">Waarschuwingen</div><ul className="mt-1 list-disc space-y-1 pl-5 text-amber-100">{validation.warnings.map((item,i)=><li key={i}>{item}</li>)}</ul></div> : null}
        </div>}
        {message&&<div className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200 break-all">{message}</div>}
        <button type="submit" onClick={()=>{if(!busy)setMessage("Klik ontvangen — GitHub Fix Engine start…");}} disabled={busy} className="w-full rounded-xl bg-white px-5 py-3 font-bold text-slate-950 disabled:opacity-50">{busy?"AI + GitHub zijn bezig…":"Maak GitHub Pull Request — 5 credits"}</button>
      </form>}
    </section>
  </main>
}
