"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { copy, type Locale } from "@/lib/locales";

const icons = [
  "M3 10l9-7 9 7v10H3z M9 20v-7h6v7",
  "M12 3v18 M3 12h18",
  "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2",
  "M3 7h18v12H3z M3 11h18 M7 15h4",
  "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-2a8 8 0 0 1 16 0v2"
];
const home: Record<Locale,string> = { nl:"Home",en:"Home",fr:"Accueil",es:"Inicio",it:"Home",de:"Start" };
const dashboard: Record<Locale,string> = { nl:"Dashboard",en:"Dashboard",fr:"Tableau",es:"Panel",it:"Dashboard",de:"Dashboard" };

export default function MobileNav({ locale, page }: { locale: Locale; page: string }) {
  const t = copy[locale];
  const [signedIn,setSignedIn]=useState(false);
  const initialActive = page === "scan" ? 1 : page === "" ? 0 : -1;
  const [active,setActive]=useState(initialActive);
  useEffect(()=>{fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).then(d=>setSignedIn(Boolean(d?.user))).catch(()=>setSignedIn(false))},[]);
  useEffect(()=>{
    const sync=()=>{ if(page==="scan") return setActive(1); const hash=window.location.hash; setActive(hash==="#how"?2:hash==="#pricing"?3:0); };
    sync(); window.addEventListener("hashchange",sync); return()=>window.removeEventListener("hashchange",sync);
  },[page]);
  const accountHref=signedIn?"/dashboard":"/account?lang="+locale;
  const links = [`/${locale}`,`/${locale}/scan`,`/${locale}#how`, `/${locale}#pricing`,accountHref];
  const labels = [home[locale],t.nav[0],t.nav[1],t.nav[3],signedIn?dashboard[locale]:t.signIn];
  return <nav className="lc-bottom-nav" aria-label="Mobile navigation">{links.map((href,index) => <Link key={index} href={href} onClick={()=>setActive(index)} aria-current={index === active ? "page" : undefined}><span className="lc-bottom-icon"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[index]} /></svg></span><span>{labels[index]}</span></Link>)}</nav>;
}