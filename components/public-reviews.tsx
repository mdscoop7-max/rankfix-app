"use client";
import { useEffect,useState } from "react";
type Review={id:string;rating:number;review_text:string;company_name?:string;website?:string;name:string};
const copy={
 nl:["Geverifieerde klanten","Wat klanten over RankFix zeggen.","Alleen reviews van ingelogde RankFix-klanten worden hier na controle gepubliceerd.","Geverifieerde RankFix-klant"],
 en:["Verified customers","What customers say about RankFix.","Only reviews from signed-in RankFix customers are published here after review.","Verified RankFix customer"],
 fr:["Clients vérifiés","Ce que les clients disent de RankFix.","Seuls les avis de clients RankFix connectés sont publiés ici après vérification.","Client RankFix vérifié"],
 de:["Verifizierte Kunden","Was Kunden über RankFix sagen.","Nur Bewertungen angemeldeter RankFix-Kunden werden nach Prüfung veröffentlicht.","Verifizierter RankFix-Kunde"],
 it:["Clienti verificati","Cosa dicono i clienti di RankFix.","Solo le recensioni dei clienti RankFix autenticati vengono pubblicate dopo la verifica.","Cliente RankFix verificato"],
 es:["Clientes verificados","Lo que dicen los clientes sobre RankFix.","Solo se publican reseñas de clientes RankFix autenticados después de revisarlas.","Cliente RankFix verificado"]
} as const;
export default function PublicReviews({language="nl"}:{language?:keyof typeof copy}){
 const [reviews,setReviews]=useState<Review[]>([]),[average,setAverage]=useState<number|null>(null); const t=copy[language]||copy.nl;
 useEffect(()=>{fetch("/api/reviews/public",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(d){setReviews(d.reviews||[]);setAverage(d.average??null)}}).catch(()=>{})},[]);
 if(!reviews.length)return null;
 return <section id="reviews" className="border-t border-white/10 bg-white/[0.02] px-5 py-16 lg:px-8"><div className="mx-auto max-w-7xl"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t[0]}</div><h2 className="mt-3 text-3xl font-black">{t[1]}</h2><p className="mt-3 text-sm text-slate-400">{t[2]}</p></div>{average&&<div className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-3"><div className="text-xl text-yellow-300">★★★★★</div><div className="mt-1 text-sm font-bold">{average}/5 · {reviews.length} reviews</div></div>}</div><div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{reviews.slice(0,6).map(r=><article key={r.id} className="rounded-2xl border border-white/10 bg-[#101B2D] p-5"><div className="text-yellow-300">{"★".repeat(r.rating)}<span className="text-slate-700">{"★".repeat(5-r.rating)}</span></div><p className="mt-3 text-sm leading-6 text-slate-300">“{r.review_text}”</p><div className="mt-4 text-xs font-bold text-white">{r.name}{r.company_name?" · "+r.company_name:""}</div><div className="mt-1 text-[11px] text-emerald-300">✓ {t[3]}</div></article>)}</div></div></section>
}