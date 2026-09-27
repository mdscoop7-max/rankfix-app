"use client";
import { useEffect,useState } from "react";

const baseItems = [
  { href: "/", label: "Home", icon: "M3 10l9-7 9 7v10H3z M9 20v-7h6v7" },
  { href: "/nl/scan", label: "Scan", icon: "M12 3v18 M3 12h18" },
  { href: "/#features", label: "Zo werkt het", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2" },
  { href: "/#pricing", label: "Prijzen", icon: "M4 6h16v12H4z M8 10h8 M8 14h5" }
];
const accountIcon="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-2a8 8 0 0 1 16 0v2";

export default function RootMobileNav({ locale = "nl" }: { locale?: string }) {
 const [signedIn,setSignedIn]=useState(false);
 const [locationKey,setLocationKey]=useState("");
 useEffect(()=>{
   fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).then(d=>setSignedIn(Boolean(d?.user))).catch(()=>setSignedIn(false));
   const sync=()=>setLocationKey(window.location.pathname+window.location.hash);
   sync();
   window.addEventListener("hashchange",sync);
   window.addEventListener("popstate",sync);
   return ()=>{window.removeEventListener("hashchange",sync);window.removeEventListener("popstate",sync)};
 },[]);
 const labels: Record<string,string[]> = {
   nl:["Home","Scan","Zo werkt het","Prijzen","Inloggen"],
   en:["Home","Scan","How it works","Pricing","Log in"],
   de:["Start","Scan","So funktioniert’s","Preise","Anmelden"],
   fr:["Accueil","Scan","Comment ça marche","Tarifs","Connexion"],
   it:["Home","Analisi","Come funziona","Prezzi","Accedi"],
   es:["Inicio","Análisis","Cómo funciona","Precios","Iniciar sesión"]
 };
 const tx=labels[locale]||labels.nl;
 const localizedBase=baseItems.map((item,index)=>({
   ...item,
   href:index===0?"/"+locale:index===1?"/"+locale+"/scan":index===2?"/"+locale+"#features":"/"+locale+"#pricing",
   label:tx[index]
 }));
 const items=[...localizedBase,{href:signedIn?"/dashboard":"/account?lang="+locale,label:signedIn?"Dashboard":tx[4],icon:accountIcon}];
 const activeIndex=(()=>{
   const [pathname,hash=""]=locationKey.split("#");
   if(pathname?.startsWith("/dashboard")) return 4;
   if(pathname?.includes("/scan")) return 1;
   if(hash==="features") return 2;
   if(hash==="pricing") return 3;
   if(/^\\\/(nl|en|de|fr|it|es)\\\/?$/.test(pathname||"")) return 0;
   return pathname==="/"||pathname==="" ? 0 : -1;
 })();
 return <nav className="root-bottom-nav" aria-label="Mobiele navigatie">{items.map((item,index) => <a href={item.href} key={index} onClick={()=>setLocationKey(item.href.split("?")[0])} aria-current={activeIndex===index?"page":undefined}><span className="root-bottom-icon"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg></span><span>{item.label}</span></a>)}</nav>;
}
