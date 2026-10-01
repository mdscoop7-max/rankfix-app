"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { copy, type Locale } from "@/lib/locales";
import LanguageSelect from "./language-select";

const dashboard:Record<Locale,string>={nl:"Dashboard",en:"Dashboard",fr:"Tableau de bord",es:"Panel",it:"Dashboard",de:"Dashboard"};

export default function PublicHeader({locale,page}:{locale:Locale;page:string}){
 const t=copy[locale]; const [user,setUser]=useState<any>(null); const [ready,setReady]=useState(false);
 useEffect(()=>{fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).then(d=>{setUser(d?.user||null);setReady(true)}).catch(()=>setReady(true))},[]);
 return <header className="lc-header"><div className="lc-container">
   <Link className="lc-brand" href={"/"+locale}><span className="lc-brand-mark">RF</span><b>RankFix <em>AI</em></b></Link>
   <div className="lc-header-actions">
    <LanguageSelect locale={locale} page={page}/>
    <Link className="lc-auth-link" href={user?"/dashboard":"/account?lang="+locale}>{ready?(user?dashboard[locale]:t.signIn):t.signIn}</Link>
    <details className="lc-mobile-menu"><summary aria-label="Menu"><svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16 M4 12h16 M4 18h16"/></svg></summary><div className="lc-mobile-links"><Link href={"/"+locale+"/scan"}>{t.nav[0]}</Link><Link href={"/"+locale+"#how"}>{t.nav[1]}</Link><Link href={"/"+locale+"#audience"}>{t.nav[2]}</Link><Link href={"/"+locale+"#pricing"}>{t.nav[3]}</Link><Link href={"/"+locale+"#contact"}>{t.nav[4]}</Link><Link href={user?"/dashboard":"/account?lang="+locale}>{user?dashboard[locale]:t.signIn}</Link></div></details>
   </div>
   <nav className="lc-nav" aria-label="Main navigation"><Link href={"/"+locale+"/scan"}>{t.nav[0]}</Link><Link href={"/"+locale+"#how"}>{t.nav[1]}</Link><Link href={"/"+locale+"#audience"}>{t.nav[2]}</Link><Link href={"/"+locale+"#pricing"}>{t.nav[3]}</Link><Link href={"/"+locale+"#contact"}>{t.nav[4]}</Link></nav>
 </div></header>
}