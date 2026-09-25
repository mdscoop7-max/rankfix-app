import { notFound } from "next/navigation";
import LocaleShell from "../shell";
import { copy,isLocale } from "@/lib/locales";

export default async function ContactPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;
 if(!isLocale(raw))notFound();
 const locale=raw;
 const t=copy[locale];
 return <LocaleShell locale={locale} page="contact">
  <section className="lc-container lc-hero">
   <p className="lc-kicker">RankFix AI</p>
   <h1>{t.nav[4]}</h1>
   <p className="lc-lead">{t.contact}</p>
   <div className="lc-card" style={{marginTop:24}}>
    <h2 style={{marginBottom:10}}>{locale==="nl"?"Waar kunnen we mee helpen?":"How can we help?"}</h2>
    <p className="lc-lead">{locale==="nl"?"Voor vragen over scans, je account, fixes of RankFix AI kun je vanuit je dashboard direct hulp krijgen.":"For questions about scans, your account, fixes or RankFix AI, you can get help directly from your dashboard."}</p>
    <div className="lc-actions">
     <a className="lc-primary" href="/dashboard/help">{locale==="nl"?"Open Help & RankFix AI":"Open Help & RankFix AI"} →</a>
     <a className="lc-secondary" href={"/"+locale}>{locale==="nl"?"Terug naar website":"Back to website"}</a>
    </div>
   </div>
  </section>
 </LocaleShell>;
}