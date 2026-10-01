import Link from "next/link";

const plans = [
  ["Gratis","€ 0,00","voor kennismaken",["1 website","2 volledige scans / maand","SEO + GEO basis","Actiepunten","Geen AI-fix"]],
  ["Start","€ 24,95","per maand",["1 website","10 scans / maand","AI-fixes inbegrepen","SEO + GEO audit","3 maanden scanhistorie"]],
  ["Business","€ 44,95","per maand",["5 websites","30 scans / maand","AI-fixes inbegrepen","Automatische controles","PDF- en e-mailrapporten · Binnenkort"]],
  ["E-commerce","€ 64,95","per maand",["5 webshops","50 scans / maand","AI-fixes inbegrepen","Shopify, WooCommerce & Next.js/custom","Product-, categorie- en structured-data checks"]],
  ["Pro","€ 94,95","per maand",["15 websites","100 scans / maand","AI-fixes inbegrepen","Uitgebreide automatisering","Tot 5 gebruikers"]],
  ["Agency","€ 159,95","per maand",["50 websites","300 scans / maand","AI-fixes inbegrepen","White-label rapporten · Binnenkort","API + team/workflow"]],
] as const;

export default function PricingPage(){
 return <main className="min-h-screen bg-slate-50 text-slate-950">
  <header className="border-b border-slate-200 bg-[#0b1830] text-white">
   <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
    <Link href="/" className="text-xl font-black">▥ RankFix</Link>
    <div className="flex items-center gap-4"><Link href="/">Home</Link><Link href="/#scan" className="rounded-xl bg-blue-500 px-4 py-2 font-bold">Gratis scan →</Link></div>
   </div>
  </header>
  <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
   <div className="text-center"><div className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Prijzen</div><h1 className="mt-3 text-4xl font-black">Duidelijke prijzen. Kies wat bij je past.</h1><p className="mx-auto mt-4 max-w-2xl text-slate-600">Kies het abonnement dat bij je website of webshop past. AI-fixes zijn inbegrepen in de betaalde pakketten.</p></div>
   <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    {plans.map(([name,price,period,items])=><article key={name} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
     <h2 className="text-lg font-black">{name}</h2><div className="mt-4 text-4xl font-black">{price}</div><div className="mt-1 text-sm text-slate-500">{period}</div>
     <ul className="mt-6 space-y-3 text-sm text-slate-700">{items.map(item=><li key={item}>✓ {item}</li>)}</ul>
     {name==="Gratis"?<Link href="/#scan" className="mt-7 block rounded-xl border border-slate-300 px-4 py-3 text-center font-bold">Gratis scan starten</Link>:<Link href={"/checkout?plan="+name.toLowerCase()} className="mt-7 block rounded-xl bg-[#0b1830] px-4 py-3 text-center font-bold text-white">Kies {name} →</Link>}
    </article>)}
   </div>
  </section>
 </main>
}