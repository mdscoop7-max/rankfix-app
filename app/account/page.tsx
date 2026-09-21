"use client";

import { useState } from "react";

export default function Account() {
  const [mode,setMode]=useState<"login"|"register">("register");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");const endpoint=mode==="login"?"/api/auth/login":"/api/auth/register";const body=mode==="login"?{email,password}:{name,email,password};const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){setError(d.error||"Actie mislukt.");setBusy(false);return;}location.href="/dashboard";}
  return <main className="min-h-screen bg-[#050816] px-5 py-12 text-white"><div className="mx-auto max-w-md"><a href="/" className="text-lg font-bold">RankFix <span className="text-cyan-300">AI</span></a><div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.04] p-7"><div className="flex rounded-xl bg-black/20 p-1"><button onClick={()=>setMode("register")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode==="register"?"bg-white text-slate-950":"text-slate-400"}`}>Account maken</button><button onClick={()=>setMode("login")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode==="login"?"bg-white text-slate-950":"text-slate-400"}`}>Inloggen</button></div><h1 className="mt-8 text-3xl font-black">{mode==="register"?"Start met RankFix AI":"Welkom terug"}</h1><p className="mt-2 text-sm text-slate-500">{mode==="register"?"Je krijgt 25 gratis credits om te beginnen.":"Log in om je scans en credits te bekijken."}</p><form onSubmit={submit} className="mt-7 space-y-4">{mode==="register"&&<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Naam" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/>}<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mailadres" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/><input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Wachtwoord (min. 8 tekens)" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none"/>{error&&<div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}<button disabled={busy} className="w-full rounded-xl bg-white px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{busy?"Even geduld…":mode==="register"?"Account aanmaken →":"Inloggen →"}</button></form></div></div></main>;
}
