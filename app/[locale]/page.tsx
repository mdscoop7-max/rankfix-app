import { notFound } from "next/navigation";
import { copy, isLocale, locales } from "@/lib/locales";
import { localeMetadata } from "@/lib/locale-metadata";
import LocaleShell from "./shell";
export function generateStaticParams() { return locales.map(locale => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; return isLocale(locale) ? localeMetadata(locale) : {}; }
export default async function LocalizedHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  const t = copy[locale];
  return <LocaleShell locale={locale}>
    <section className="lc-container lc-hero"><p className="lc-kicker">SEO · GEO · RankFix AI</p><h1>{t.hero}</h1><p className="lc-lead">{t.intro}</p><div className="lc-actions"><a className="lc-primary" href={"/" + locale + "/scan"}>{t.scan} →</a><a className="lc-secondary" href={"#" + "how"}>{t.nav[1]}</a></div></section>
    <section className="lc-section" id="how"><div className="lc-container"><h2>{t.processTitle}</h2><div className="lc-grid">{t.steps.map((step, index) => <div className="lc-card" key={index}><strong>0{index + 1}</strong>{step}</div>)}</div></div></section>
    <section className="lc-section" id="pricing"><div className="lc-container"><h2>{t.pricingTitle}</h2><p className="lc-lead">{t.pricing}</p><div className="lc-grid" style={{marginTop:24}}>{[["FREE","€0"],["START","€29"],["BUSINESS","€59"],["E-COMMERCE","€79"],["PRO","€89"],["AGENCY","€179"]].map(([name,price])=><div className="lc-card" key={name}><strong>{name}</strong><div style={{fontSize:24,fontWeight:800,marginTop:8}}>{price}{price!=="€0"&&<small style={{fontSize:12,fontWeight:500}}> / maand</small>}</div></div>)}</div><div className="lc-actions" style={{marginTop:24}}><a className="lc-primary" href={"/" + locale + "/scan"}>{t.nav[0]}</a></div></div></section>
    <section className="lc-section" id="audience"><div className="lc-container"><h2>{t.audienceTitle}</h2><div className="lc-grid">{t.audiences.map((item, index) => <div className="lc-card" key={index}>{item}</div>)}</div></div></section>
    <section className="lc-section" id="contact"><div className="lc-container"><h2>{t.nav[4]}</h2><p className="lc-lead">{t.contact}</p><div className="lc-actions"><a className="lc-primary" href={"/" + locale + "/contact"}>{t.nav[4]} →</a></div></div></section>
  </LocaleShell>;
}
