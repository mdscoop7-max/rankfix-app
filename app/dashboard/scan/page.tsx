"use client";
import { useEffect,useState } from "react";
import DashboardNav from "../nav";
import AiAssistant from "@/components/ai-assistant";
import type { Locale } from "@/lib/locales";
import { copy } from "@/lib/locales";
import "../dashboard.css";
type AdsKeywords={intent?:string;campaignGoal?:string|null;targetArea?:string|null;targetCountries?:string[];adLanguages?:string[];keywordGroups?:Array<{theme:string;intent:string;landingPage:string;keywords:string[]}>;negativeKeywordCandidates?:Array<{term:string;source?:string;requiresReview:boolean;reason:string}>;metrics?:{searchVolume:null;cpc:null;competition:null;source:null};disclaimer?:string};
type Result={overallScore:number;seo?:{score:number;checks:Array<{status:string}>};geo?:{score:number;checks:Array<{status:string}>};adsKeywordIntelligence?:AdsKeywords};
export default function DashboardScan(){
 const [language,setLanguage]=useState<Locale>("nl"),[url,setUrl]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null);
 const [showAdsProfile,setShowAdsProfile]=useState(false);
 const [adsProfile,setAdsProfile]=useState({industry:"",primaryOffer:"",targetArea:"",targetCountries:"",campaignGoal:"",audience:"",adLanguages:"",excludeIntent:""});
 const setAds=(key:keyof typeof adsProfile,value:string)=>setAdsProfile(current=>({...current,[key]:value}));
 useEffect(()=>{fetch("/api/auth/me").then(r=>r.json()).then(d=>{if(!d.user)location.href="/account"});fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language)setLanguage(d.language)}).catch(()=>{})},[]);
 const t=copy[language];
 async function run(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setResult(null);try{const r=await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,mode:"both",adsProfile})});const d=await r.json();if(!r.ok)throw new Error(d.error||t.error);setResult(d)}catch(e){setError(e instanceof Error?e.message:t.error)}finally{setBusy(false)}}
 const checks=[...(result?.seo?.checks||[]),...(result?.geo?.checks||[])];
 const issues=checks.filter(c=>c.status==="fail"||c.status==="warning").length;
 const passed=checks.filter(c=>c.status==="pass").length;
 const notApplicable=checks.filter(c=>c.status==="not_applicable").length;
 const unableToConfirm=checks.filter(c=>c.status==="unable_to_confirm").length;
 return <main className="rf-page" lang={language}><div className="rf-shell"><header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard" className="rf-back">← Dashboard</a></header><DashboardNav current={2}/><div className="rf-body"><div className="rf-heading"><h1>{t.run}</h1><p>{t.intro}</p></div><form onSubmit={run} className="rf-dashboard-scan"><label htmlFor="dashboard-url">{t.url}</label><input id="dashboard-url" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" required/>
<button type="button" className="rf-back" onClick={()=>setShowAdsProfile(v=>!v)}>{showAdsProfile?"Verberg Google Ads-profiel":"Maak Google Ads-analyse nauwkeuriger (optioneel)"}</button>
{showAdsProfile&&<div className="rf-card"><p><strong>Google Ads-profiel</strong><br/>Alleen invullen wat nuttig is. RankFix analyseert de website ook automatisch.</p>
<label>Branche</label><input value={adsProfile.industry} onChange={e=>setAds("industry",e.target.value)} maxLength={120} placeholder="Bijv. webshop, loodgieter, SaaS"/>
<label>Belangrijkste product of dienst</label><input value={adsProfile.primaryOffer} onChange={e=>setAds("primaryOffer",e.target.value)} maxLength={160} placeholder="Wat wil je vooral promoten?"/>
<label>Doelgebied</label><input value={adsProfile.targetArea} onChange={e=>setAds("targetArea",e.target.value)} maxLength={120} placeholder="Bijv. Nederland, Amsterdam, EU"/><label>Doelland(en)</label><input value={adsProfile.targetCountries} onChange={e=>setAds("targetCountries",e.target.value)} maxLength={160} placeholder="Bijv. Nederland, België, Duitsland"/>
<label>Campagnedoel</label><select value={adsProfile.campaignGoal} onChange={e=>setAds("campaignGoal",e.target.value)}><option value="">Automatisch bepalen</option><option value="sales">Verkoop</option><option value="leads">Leads / offertes</option><option value="calls">Telefoontjes</option><option value="appointments">Afspraken</option><option value="store_visits">Winkelbezoek</option></select>
<label>Doelgroep</label><select value={adsProfile.audience} onChange={e=>setAds("audience",e.target.value)}><option value="">Automatisch bepalen</option><option value="consumer">Particulieren</option><option value="business">Bedrijven</option><option value="both">Beide</option></select>
<label>Advertentietaal/talen</label><input value={adsProfile.adLanguages} onChange={e=>setAds("adLanguages",e.target.value)} maxLength={80} placeholder="Bijv. NL, EN"/>
<label>Niet promoten (optioneel)</label><input value={adsProfile.excludeIntent} onChange={e=>setAds("excludeIntent",e.target.value)} maxLength={160} placeholder="Bijv. vacatures, tweedehands"/>
</div>}
<button className="rf-primary" disabled={busy}>{busy?t.running:"SEO + GEO scan starten"}</button></form>{error&&<p className="rf-alert">{error}</p>}{result&&<section className="rf-report"><div className="rf-section-head"><h2>{t.score}: {result.overallScore}/100</h2><a className="rf-primary-link" href="/dashboard">Naar overzicht</a></div><div className="rf-status-grid"><div className="rf-card"><span>SEO</span><strong>{result.seo?.score??"—"}</strong></div><div className="rf-card"><span>GEO</span><strong>{result.geo?.score??"—"}</strong></div><div className="rf-card"><span>{t.issues}</span><strong>{issues}</strong></div><div className="rf-card"><span>Geslaagd</span><strong>{passed}</strong></div></div>{(notApplicable>0||unableToConfirm>0)&&<p className="rf-scan-coverage">Niet van toepassing: {notApplicable} · Niet te bevestigen: {unableToConfirm}. Deze controles worden niet als geslaagd geteld en beïnvloeden de score niet.</p>}
{result.adsKeywordIntelligence&&<div className="rf-card" style={{marginTop:16}}>
<div className="rf-section-head"><div><span>Google Ads</span><h2>Zoekwoorden</h2></div></div>
<p>Intentie: <strong>{result.adsKeywordIntelligence.intent||"—"}</strong>{result.adsKeywordIntelligence.campaignGoal?` · Doel: ${result.adsKeywordIntelligence.campaignGoal}`:""}</p>
{((result.adsKeywordIntelligence.targetCountries?.length||0)>0||(result.adsKeywordIntelligence.adLanguages?.length||0)>0)&&<p>Markt: <strong>{result.adsKeywordIntelligence.targetCountries?.join(", ")||result.adsKeywordIntelligence.targetArea||"—"}</strong> · Taal: <strong>{result.adsKeywordIntelligence.adLanguages?.join(", ")||"—"}</strong></p>}
{result.adsKeywordIntelligence.keywordGroups?.map((group,index)=><div className="rf-card" key={`${group.theme}-${index}`} style={{marginTop:12}}><strong>{group.theme}</strong><p>{group.keywords.length?group.keywords.join(" · "):"Nog geen betrouwbare zoekwoorden voor deze groep."}</p><small>Landingspagina: {group.landingPage}</small></div>)}
{(result.adsKeywordIntelligence.negativeKeywordCandidates?.length||0)>0&&<div style={{marginTop:16}}><strong>Negatieve zoekwoorden — eerst controleren</strong><p>{result.adsKeywordIntelligence.negativeKeywordCandidates?.map(item=>item.term).join(" · ")}</p></div>}
<p className="rf-alert" style={{marginTop:16}}>{result.adsKeywordIntelligence.disclaimer||"Zoekvolume en CPC worden alleen getoond met een actuele databron."}</p>
</div>}
</section>}</div></div><AiAssistant dashboard/></main>
}