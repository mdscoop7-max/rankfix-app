"use client";

import { useEffect, useState } from "react";

export default function ResetPassword() {
  const [token,setToken]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [done,setDone]=useState(false);

  useEffect(()=>{
    const value=new URLSearchParams(window.location.search).get("token")||"";
    setToken(value);
  },[]);

  async function submit(e:React.FormEvent){
    e.preventDefault();
    setError("");
    if(password!==confirm){
      setError("De wachtwoorden komen niet overeen.");
      return;
    }
    setBusy(true);
    try{
      const r=await fetch("/api/auth/reset-password",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,password})
      });
      const d=await r.json();
      if(!r.ok){
        setError(d.error||"Wachtwoord wijzigen mislukt.");
        setBusy(false);
        return;
      }
      setDone(true);
      window.setTimeout(()=>window.location.replace("/dashboard"),900);
    }catch{
      setError("Er ging iets mis. Probeer het opnieuw.");
    }finally{
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1220] px-5 py-12 text-white">
      <div className="mx-auto max-w-md">
        <a href="/" className="text-lg font-bold">RankFix <span className="text-emerald-300">AI</span></a>
        <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
          <h1 className="text-3xl font-black">Nieuw wachtwoord</h1>
          {done ? (
            <div className="mt-6 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Je wachtwoord is gewijzigd. Je wordt automatisch naar je dashboard gestuurd.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-7 space-y-4">
              <input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Nieuw wachtwoord (min. 8 tekens)" autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/>
              <input required minLength={8} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Herhaal wachtwoord" autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/>
              {error&&<div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
              <button disabled={busy||!token} className="w-full rounded-xl bg-white px-4 py-3 font-bold text-slate-950 disabled:opacity-50">
                {busy?"Even geduld…":"Wachtwoord opslaan →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
