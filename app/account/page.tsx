"use client";

import { useEffect, useState } from "react";

export default function Account() {
  const [mode,setMode]=useState<"login"|"register">("login");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [rememberMe,setRememberMe]=useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.user) window.location.replace("/dashboard");
      })
      .catch(() => {});
  }, []);

  async function submit(e:React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (mode==="register" && password!==confirmPassword) {
      setError("De wachtwoorden komen niet overeen.");
      setBusy(false);
      return;
    }

    const endpoint=mode==="login"?"/api/auth/login":"/api/auth/register";
    const body=mode==="login"?{email,password,rememberMe}:{name,email,password};

    try {
      const r=await fetch(endpoint,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
      const d=await r.json();
      if(!r.ok){
        setError(d.error||"Actie mislukt.");
        setBusy(false);
        return;
      }
      window.location.replace("/dashboard");
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050816] px-5 py-12 text-white">
      <div className="mx-auto max-w-md">
        <a href="/" className="text-lg font-bold">RankFix <span className="text-cyan-300">AI</span></a>
        <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
          <div className="flex rounded-xl bg-black/20 p-1">
            <button onClick={()=>setMode("login")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode==="login"?"bg-white text-slate-950":"text-slate-400"}`}>Inloggen</button>
            <button onClick={()=>setMode("register")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode==="register"?"bg-white text-slate-950":"text-slate-400"}`}>Account maken</button>
          </div>

          <h1 className="mt-8 text-3xl font-black">{mode==="register"?"Start met RankFix AI":"Welkom terug"}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {mode==="register"?"Je krijgt 25 gratis credits om te beginnen.":"Log in om direct naar je dashboard te gaan."}
          </p>

          <form onSubmit={submit} autoComplete="on" className="mt-7 space-y-4">
            {mode==="register"&&(
              <input required value={name} onChange={e=>setName(e.target.value)} placeholder="Naam" autoComplete="name" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/>
            )}
            <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} name="email" placeholder="E-mailadres" autoComplete="username email" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/>
            <input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} name="password" placeholder="Wachtwoord (min. 8 tekens)" autoComplete={mode==="register"?"new-password":"current-password"} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/>

            {mode==="login"&&(
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} className="h-4 w-4 rounded" />
                  Ingelogd blijven
                </label>
                <div>
                <a href="/account/forgot-password" className="text-sm text-cyan-300 hover:text-cyan-200">Wachtwoord vergeten?</a>
                </div>
              </div>
            )}

            {mode==="register"&&(
              <input required minLength={8} type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Herhaal wachtwoord" autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/>
            )}

            {error&&<div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

            <button disabled={busy} className="w-full rounded-xl bg-white px-4 py-3 font-bold text-slate-950 disabled:opacity-50">
              {busy?"Even geduld…":mode==="register"?"Account aanmaken →":"Inloggen →"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
