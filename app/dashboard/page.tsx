"use client";

import { useEffect, useState } from "react";

type User = { id:string; email:string; name:string; credits:number };
type Scan = { id:string; scanned_url:string; final_url:string|null; overall_score:number; seo_score:number; geo_score:number; created_at:string };

export default function Dashboard() {
  const [user,setUser]=useState<User|null>(null);
  const [scans,setScans]=useState<Scan[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{ (async()=>{ const r=await fetch("/api/auth/me"); const d=await r.json(); if(!d.user){ location.href="/account"; return; } setUser(d.user); const h=await fetch("/api/history"); const x=await h.json(); if(h.ok){setScans(x.scans);setUser((u)=>u?{...u,credits:x.credits}:u);} else setError(x.error||"History laden mislukt."); })(); },[]);
  async function logout(){await fetch("/api/auth/logout",{method:"POST"}); location.href="/";}
  return <main className="min-h-screen bg-[#050816] text-white"><nav className="mx-auto flex max-w-6xl items-center justify-between border-b border-white/10 px-5 py-5"><a href="/" className="font-bold">RankFix <span className="text-cyan-300">AI</span></a><button onClick={logout} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Uitloggen</button></nav><section className="mx-auto max-w-6xl px-5 py-12"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="text-xs uppercase tracking-widest text-cyan-300">Dashboard</div><h1 className="mt-2 text-4xl font-black">Welkom, {user?.name}.</h1><p className="mt-2 text-slate-500">{user?.email}</p></div><div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-6 py-4"><div className="text-xs uppercase tracking-widest text-cyan-300">Credits</div><div className="mt-1 text-3xl font-black">{user?.credits ?? "—"}</div></div></div><div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Scan history</h2><a href="/#scan" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950">Nieuwe scan</a></div>{error&&<p className="mt-4 text-red-300">{error}</p>}<div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-500"><tr><th className="py-3">URL</th><th>Overall</th><th>SEO</th><th>GEO</th><th>Datum</th></tr></thead><tbody>{scans.map(s=><tr key={s.id} className="border-t border-white/5"><td className="max-w-[360px] truncate py-4">{s.scanned_url}</td><td className="font-bold text-cyan-300">{s.overall_score}</td><td>{s.seo_score}</td><td>{s.geo_score}</td><td className="text-slate-500">{new Date(s.created_at).toLocaleString("nl-NL")}</td></tr>)}{!scans.length&&<tr><td colSpan={5} className="py-10 text-center text-slate-500">Nog geen opgeslagen scans.</td></tr>}</tbody></table></div></div></section></main>;
}
