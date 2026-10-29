"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import DashboardNav from "@/app/dashboard/nav";
import {saveQaAudit} from "@/lib/testlab-audit-store";
import {classifyScanAnswer, isFinalResult, resumeQueue, stopsRun, upsertResult} from "@/lib/testlab-outcome.mjs";
import {sectorVerdict} from "@/scripts/testlab/labels.mjs";

type Site={host:string;name:string;country:string;group:string;expected:string;round:string};
type Incident={traceId:string|null;originHttpStatus:number|null;apiHttpStatus:number;reasonCode:string;attribution:string|null;phase:string|null;finalUrl:string|null;browserRender:unknown};
// pending=true: RankFix/runner stopped (session, quota, infrastructure, connection); the website was not judged and is retried on resume.
type SiteResult={host:string;status:string;expected:string;sector:string|null;sectorKey?:string|null;websiteType?:string|null;commercePlatform?:string|null;industryVertical?:string|null;evidenceLevel?:string|null;confidence:number|null;score:number|null;seo:number|null;geo:number|null;http:number;reason:string;elapsedMs:number;scanId:string|null;qaAuditId?:string|null;at:string;pending?:boolean;incident?:Incident|null};
type Catalog={sites:Site[];count:number;catalogId:string;categoryCounts:{webshops:number;other:number};runtime:{commitSha:string|null;environment:string}};
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
// One verdict per site (exact / equivalent / unconfirmed / mismatch), shared with
// scripts/testlab: a literal label difference is not a sector error (QA #204).
const verdictOf=(s:Site,r:SiteResult)=>r.status==="succes"?sectorVerdict(s.expected,{sector:r.sector,key:r.sectorKey,websiteType:r.websiteType}).verdict as string:null;
const VERDICT_LABEL:Record<string,string>={exact:"exact",equivalent:"taxonomisch equivalent",unconfirmed:"sector onbevestigd",mismatch:"waarschijnlijk fout"};
// Preserve all baseline results under their original key; isolate the new catalog.
const storageKey=(sha:string,catalogId:string)=>catalogId==="baseline"?"rankfix-qa-testlab-144:"+sha:"rankfix-qa-testlab-144:"+catalogId+":"+sha;
const num=(n:number|null)=>n==null?"—":String(Math.round(n));
function csvCell(value:unknown){
 const text=String(value??"");
 const safe=/^[=+\-@\t\r]/.test(text)?"'"+text:text;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function saveDownload(name:string,type:string,content:string){
 const url=URL.createObjectURL(new Blob([content],{type}));
 const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();
 window.setTimeout(()=>URL.revokeObjectURL(url),3000);
}

export default function TestLab144() {
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("Toegang en QA-versie controleren…");
 const [scope,setScope]=useState("all");
 const [results,setResults]=useState<SiteResult[]>([]);
 const [running,setRunning]=useState(false);
 const [query,setQuery]=useState("");
 const stop=useRef(false);
 const mounted=useRef(true);
 useEffect(()=>{
  mounted.current=true;
  const requestedCatalog=new URLSearchParams(window.location.search).get("catalog");
  const catalogId=requestedCatalog==="commerce"||requestedCatalog==="fresh144"?requestedCatalog:"baseline";
  Promise.all([
   fetch("/api/testlab/catalog?catalog="+catalogId,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(12000)}).then(async r=>({ok:r.ok,status:r.status,data:await r.json()})),
   fetch("/api/scan/version",{cache:"no-store",signal:AbortSignal.timeout(12000)}).then(r=>r.json()),
  ]).then(([answer,version])=>{
    if(!mounted.current)return;
    if(!answer.ok || !answer.data?.sites){
      const code=answer.data?.error;
      setError(answer.status===503 && code==="QA_AUTH_UNAVAILABLE"
        ? "RankFix QA kan niet aanmelden: de databaseverbinding ontbreekt of is niet beschikbaar. TestLab start geen scans. Herstel de QA-databaseverbinding of gebruik een afzonderlijk beveiligde lokale QA-modus."
        : answer.status===403 ? "Alleen een aangemelde interne QA-tester heeft toegang tot TestLab."
        : "QA-catalogus niet beschikbaar (HTTP "+answer.status+", "+(code||"onbekende fout")+"). Er worden geen scans gestart.");
      setNotice("");return;
    }
    const next=answer.data as Catalog;
    if(next.sites.length!==144 || !["preview","local"].includes(version.environment) || !version.commitSha || version.commitSha!==next.runtime.commitSha){
      setError("QA-versie of catalogus niet betrouwbaar bevestigd. Er worden geen scans gestart.");
      setNotice("");return;
    }
    // Older catalog answers have no catalogId/categoryCounts: they are the baseline 144.
    if(!next.catalogId)next.catalogId="baseline";
    if(!next.categoryCounts){const webshops=next.sites.filter(s=>["ecommerce","retail"].includes(s.expected)).length;next.categoryCounts={webshops,other:next.sites.length-webshops};}
    setCatalog(next);
    const stored=localStorage.getItem(storageKey(version.commitSha,next.catalogId));
    if(stored){try{const list=JSON.parse(stored);
      if(Array.isArray(list))setResults(list.filter((r:SiteResult)=>next.sites.some(s=>s.host===r.host)).slice(0,144));
    }catch{}}
    setNotice("Klaar. VDL Groep tijdelijk uitgesloten wegens verbindingsproblemen; 143 websites blijven testbaar. "+next.categoryCounts.webshops+" webshops en "+next.categoryCounts.other+" andere websites geselecteerd. Klik één keer op Start test; houd dit tabblad open.");
  }).catch((cause)=>{if(mounted.current){setError("TestLab kon niet laden: "+(cause instanceof Error ? cause.message : "server niet bereikbaar")+". Controleer de lokale QA-aanmelding en herlaad de pagina.");setNotice("");}});
  return()=>{mounted.current=false;stop.current=true;};
 },[]);
 const sites=catalog?.sites||[];
 const isCommerceCatalog=catalog?.catalogId==="commerce";
 // VDL Groep is temporarily excluded from QA runs after repeated RankFix connection failures.
 // Keep its catalog entry and historical result for diagnosis; do not erase evidence.
 const scoped=useMemo(()=>sites.filter(s=>s.host!=="vdlgroep.com" && (
  scope==="all" || scope==="webshops"&&s.expected==="ecommerce" || scope==="other"&&s.expected!=="ecommerce" || scope==="new48" && /round-[ef]-/.test(s.round) ||
  scope==="hair_salon"&&s.group==="hair_salon" || scope==="optician"&&s.group==="optician" ||
  scope===s.country || scope===s.round
 )),[scope,sites]);
 const visible=useMemo(()=>scoped.filter(s=>[s.name,s.host,s.country,s.group,s.expected].join(" ").toLowerCase().includes(query.toLowerCase())),[scoped,query]);
 const byHost=useMemo(()=>new Map(results.map(r=>[r.host,r])),[results]);
 const finished=scoped.filter(s=>isFinalResult(byHost.get(s.host))).length;
 const passed=scoped.filter(s=>{const r=byHost.get(s.host);return r?.status==="succes" && Boolean(r.scanId||r.qaAuditId);}).length;
 const verdictCounts=scoped.reduce((acc,s)=>{const r=byHost.get(s.host);const v=r?verdictOf(s,r):null;if(v)acc[v]=(acc[v]||0)+1;return acc;},{} as Record<string,number>);
 const mismatches=verdictCounts.mismatch||0;
 const countries=useMemo(()=>[...new Set(sites.map(s=>s.country))].sort(),[sites]);
 const wrongType=(s:Site,r:SiteResult)=>verdictOf(s,r)==="mismatch";
 const persist=(list:SiteResult[])=>{setResults(list);if(catalog?.runtime.commitSha)localStorage.setItem(storageKey(catalog.runtime.commitSha,catalog.catalogId),JSON.stringify(list));};
 async function start(){
  if(!catalog||running)return;
  // Never tested, or only a pending (RankFix-side) row: retried, never skipped.
  const queue=resumeQueue(scoped,results);
  if(!queue.length){setNotice("Alles in deze selectie is al getest. Kies een andere groep of wis resultaten.");return;}
  stop.current=false;setRunning(true);setError("");
  setNotice("Test gestart. Eén website tegelijk, met een pauze tussen scans. Je kunt stoppen na de huidige scan.");
  let list=[...results];
  try{
   for(const site of queue){
    if(stop.current || !mounted.current)break;
    const startAt=Date.now();
    let row:SiteResult|null=null;
    for(let attempt=0;attempt<2&&!row;attempt++){
     try{
      // Fail closed if the shared QA alias was redeployed mid-run.
      const v=await fetch("/api/scan/version",{cache:"no-store",signal:AbortSignal.timeout(12000)}).then(r=>r.json());
      if(!["preview","local"].includes(v.environment)||v.environment!==catalog.runtime.environment||v.commitSha!==catalog.runtime.commitSha){throw new Error("QA_DEPLOYMENT_CHANGED");}
      // Session first: an expired RankFix login must stop the run BEFORE the
      // website is scanned, never be stored as the website's result.
      const localMe=await fetch("/api/testlab/local-session",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(12000)});
      const localAuthorized=localMe.ok;
      const me=localAuthorized ? localMe : await fetch("/api/auth/me",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(12000)});
      const meData=localAuthorized ? {user:{id:"local-qa"}} : await me.json().catch(()=>null);
      if(me.status===503){
       row={host:site.host,status:"infrastructuur",expected:site.expected,sector:null,confidence:null,score:null,seo:null,geo:null,http:me.status,reason:"RankFix-accountcontrole tijdelijk niet beschikbaar; website niet gescand",elapsedMs:Date.now()-startAt,scanId:null,at:new Date().toISOString(),pending:true,incident:null};
       break;
      }
      if(!me.ok||!meData?.user){
       row={host:site.host,status:"login",expected:site.expected,sector:null,confidence:null,score:null,seo:null,geo:null,http:me.status,reason:"RankFix-sessie niet geldig; website niet gescand",elapsedMs:Date.now()-startAt,scanId:null,at:new Date().toISOString(),pending:true,incident:null};
       break;
      }
      const response=await fetch("/api/scan",{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
        body:JSON.stringify({url:"https://"+site.host+"/",mode:"both",dashboard:true,language:"nl"}),
        signal:AbortSignal.timeout(285000)
      });
      const data=await response.json();
      const success=response.ok&&data?.success===true;
      const code=String(data?.code||data?.errorCode||"");
      const status=classifyScanAnswer({ok:response.ok,status:response.status,data});
      const inc=data?.incident;
      // Local QA has no database user, so /api/scan may return success with
      // scanId:null. Preserve the full response in IndexedDB for an auditable report.
      let qaAuditId:string|null=null;
      if(success && !data.scanId){
       qaAuditId=crypto.randomUUID();
       try { await saveQaAudit(qaAuditId, data, site.host); }
       catch(e){
        row={host:site.host,status:"infrastructuur",expected:site.expected,sector:null,confidence:null,score:null,seo:null,geo:null,http:response.status,reason:"QA-rapport kon niet lokaal worden opgeslagen: "+String(e).slice(0,100),elapsedMs:Date.now()-startAt,scanId:null,at:new Date().toISOString(),pending:true,incident:null};
        break;
       }
      }
      row={host:site.host,status,expected:site.expected,sector:success?(data.sectorProfile?.sector||null):null,
       sectorKey:success?(data.sectorProfile?.key||null):null,websiteType:success?(data.websiteProfile?.websiteType?.value||null):null,
       commercePlatform:success?(data.websiteProfile?.commercePlatform?.label||data.technologyProfile?.commercePlatform||null):null,
       industryVertical:success?(data.websiteProfile?.industryVertical?.value||null):null,
       evidenceLevel:success?(data.scoreModel?.evidenceLevel||null):null,
       confidence:success?(data.sectorProfile?.confidenceScore??null):null,
       score:success?(data.overallScore??null):null,seo:success?(data.seo?.score??null):null,geo:success?(data.geo?.score??null):null,
       http:response.status,reason:success?"":code||String(data.error||"Scan niet bevestigd").slice(0,200),
       elapsedMs:Date.now()-startAt,scanId:success?(data.scanId||null):null,qaAuditId,at:new Date().toISOString(),
       pending:stopsRun(status),
       incident:success?null:{traceId:inc?.traceId??data?.traceId??null,originHttpStatus:inc?.originHttpStatus??(typeof data?.httpStatus==="number"?data.httpStatus:null),apiHttpStatus:response.status,reasonCode:code,attribution:inc?.attribution??null,phase:inc?.phase??null,finalUrl:inc?.finalUrl??null,browserRender:inc?.browserRender??null}};
     }catch(e){
      const message=e instanceof Error?e.message:"Netwerk- of scanprobleem";
      if(message==="QA_DEPLOYMENT_CHANGED"){setError("QA is tijdens de test veranderd. Test veilig gestopt; vernieuw de pagina.");stop.current=true;break;}
      // "Failed to fetch": the browser lost its connection to RankFix. That says
      // nothing about the website. Retry the same website once, then stop.
      if(attempt===0){setNotice(site.host+" — verbinding met RankFix verbroken; zelfde website wordt opnieuw geprobeerd…");await sleep(10000);continue;}
      row={host:site.host,status:classifyScanAnswer({ok:false,status:0,clientError:message}),expected:site.expected,sector:null,confidence:null,score:null,seo:null,geo:null,
       http:0,reason:("Verbinding met RankFix: "+message).slice(0,180),elapsedMs:Date.now()-startAt,scanId:null,at:new Date().toISOString(),pending:true,incident:null};
     }
    }
    if(!row)break;
    list=upsertResult(list,row) as SiteResult[];persist(list);
    setNotice(site.host+" — "+row.status+(row.pending?" (niet beoordeeld, wordt opnieuw geprobeerd)":"")+" • "+list.filter(r=>isFinalResult(r)&&scoped.some(s=>s.host===r.host)).length+"/"+scoped.length+" afgerond");
    if(row.pending){
      setError("RankFix meldde "+row.status+". Test gestopt; "+site.host+" is niet als eindresultaat opgeslagen (gemarkeerd als opnieuw te testen) en wordt bij hervatten opnieuw gescand.");break;
    }
    if(!stop.current)await sleep(8000);
   }
  }finally{if(mounted.current)setRunning(false);}
 }
 function stopAfterCurrent(){stop.current=true;setNotice("Stop aangevraagd: de lopende websitescan wordt eerst afgerond.");}
 function clearResults(){
  if(running)return;
  if(!window.confirm("Alle lokaal bewaarde resultaten voor deze QA-versie wissen?"))return;
  persist([]);setNotice("Resultaten gewist. Test kan opnieuw worden gestart.");
 }
 function exportResult(fmt:"json"|"csv"){
  if(!catalog)return;
  const complete=sites.map(s=>({...s,result:byHost.get(s.host)||null}));
  const exportName="rankfix-testlab-144-"+catalog.catalogId+"-"+catalog.runtime.commitSha?.slice(0,8);
  if(fmt==="json"){
    saveDownload(exportName+".json","application/json;charset=utf-8",
      JSON.stringify({commitSha:catalog.runtime.commitSha,catalogId:catalog.catalogId,categoryCounts:catalog.categoryCounts,generatedAt:new Date().toISOString(),labels:"proposed_not_independently_verified",verdictCounts,sites:complete.map(x=>({...x,verdict:x.result?verdictOf(x,x.result):null}))},null,2));
    return;
  }
  const columns=["land","bedrijf","domein","sector_verwacht","subtype_verwacht","gevonden_sector","gevonden_subtype","oordeel_sector","websitetype","webshopplatform","branche_webshop","zekerheid","bewijsniveau_score","status","opnieuw_te_testen","score","seo","geo","api_http","website_http","redencode","toewijzing","fase","trace_id","duur_ms","reden","scan_id"];
  const lines=complete.map(({result:r,...s})=>[s.country,s.name,s.host,s.expected,s.group,r?.sector??"",r?.sectorKey??"",r?(verdictOf(s,r)??""):"",r?.websiteType??"",r?.commercePlatform??"",r?.industryVertical??"",r?.confidence??"",r?.evidenceLevel??"",r?.status??"nog_niet_getest",r?.pending?"ja":"",r?.score??"",r?.seo??"",r?.geo??"",r?.http??"",r?.incident?.originHttpStatus??"",r?.incident?.reasonCode??"",r?.incident?.attribution??"",r?.incident?.phase??"",r?.incident?.traceId??"",r?.elapsedMs??"",r?.reason??"",r?.scanId??""].map(csvCell).join(","));
  saveDownload(exportName+".csv","text/csv;charset=utf-8","\uFEFF"+columns.join(",")+"\n"+lines.join("\n"));
 }
 return <div className="rf-lab">
  <DashboardNav/>
  <header className="rf-lab-hero">
   <div><div className="rf-lab-eyebrow">RankFix • besloten QA</div>
    <h1>TestLab — 144 websites</h1>
    <p>{catalog?.catalogId==="fresh144"?"Nieuwe 144 websitekandidaten, zonder overlap met de twee oude catalogi.":isCommerceCatalog?"Commerce-catalogus: 72 webshops en 72 andere websites.":"Bestaande baseline: sectoren, winkels en dienstverleners in verschillende landen."} Alle tests zijn alleen-lezen en wijzigen geen klantwebsite.</p>
   </div><div className="rf-lab-count">{scoped.length}<span>websites in selectie</span></div>
  </header>
  <section className="rf-lab-panel">
   <div className="rf-lab-table-top"><h2>Test starten · {catalog?.catalogId==="fresh144"?"nieuwe 144 websites":isCommerceCatalog?"72 webshops + 72 overige":"baseline 144"}</h2><span><code>{catalog?.runtime.commitSha?.slice(0,12)||"Versie controleren"}</code></span></div>
   <div className="rf-lab-controls">
    <label>Testgroep
     <select disabled={running||!catalog} value={scope} onChange={e=>setScope(e.target.value)}>
      <option value="all">Alle websites behalve VDL ({sites.filter(s=>s.host!=="vdlgroep.com").length})</option>
      {isCommerceCatalog?<><option value="webshops">Webshops (72)</option><option value="other">Andere sectoren (72)</option></>:<><option value="new48">Nieuwe 48 websites</option><option value="hair_salon">Kapsalons (12)</option><option value="optician">Opticiens (12)</option></>}
      <optgroup label="Ronde">{[...new Set(sites.map(s=>s.round))].map(x=><option key={x} value={x}>{x}</option>)}</optgroup>
      <optgroup label="Land">{countries.map(x=><option key={x} value={x}>{x}</option>)}</optgroup>
     </select>
    </label>
    <button className="rf-lab-primary" type="button" disabled={!catalog||running||!scoped.length} onClick={()=>void start()}>{running?"Test draait…":finished?"Doorgaan met resterende":"Start test"}</button>
    <button type="button" disabled={!running} onClick={stopAfterCurrent}>Stop na huidige scan</button>
    <button type="button" disabled={running||!results.length} onClick={clearResults}>Resultaten wissen</button>
   </div>
   <div className="rf-lab-stats">
    <div className="rf-lab-stat"><strong>{scoped.length}</strong><span>In selectie</span></div>
    <div className="rf-lab-stat"><strong>{finished}</strong><span>Behandeld</span></div>
    <div className="rf-lab-stat"><strong>{passed}</strong><span>Scan uitgevoerd</span></div>
    <div className="rf-lab-stat"><strong>{mismatches}</strong><span>Waarschijnlijk andere hoofdsector</span></div>
    <div className="rf-lab-stat"><strong>{verdictCounts.equivalent||0}</strong><span>Taxonomisch equivalent</span></div>
    <div className="rf-lab-stat"><strong>{verdictCounts.unconfirmed||0}</strong><span>Sector onbevestigd</span></div>
   </div>
   <div role="status" className={"rf-lab-status"+(error?" rf-lab-error":"")}>{error||notice}</div>
   <p className="rf-lab-note">{catalog?.catalogId==="fresh144"?"Nieuwe kandidaatcatalogus: bereikbaarheid en verwachte sectoren zijn nog niet onafhankelijk gecontroleerd. ":isCommerceCatalog?"Dit is de 72/72-catalogus; de oude baseline blijft apart beschikbaar. ":""}VDL Groep is tijdelijk uitgesloten van nieuwe scans, maar blijft in de catalogus en eerdere exportresultaten aanwezig. Sectorlabels zijn voorlopig en nog niet onafhankelijk gevalideerd. Geblokkeerde sites en technische problemen tellen niet als sectorfout. Deze test draait in dit browsertabblad op je laptop, niet automatisch op de server. Sluit je het tabblad of gaat de laptop in slaap, dan stopt de test; met "Doorgaan met resterende" gaat hij verder bij de eerste niet-afgeronde website. Resultaten staan alleen in deze browser (per QA-commit): exporteer tussendoor JSON/CSV, want gewiste browsergegevens wissen ook de resultaten.</p>
   <div className="rf-lab-controls"><button type="button" disabled={!catalog} onClick={()=>exportResult("csv")}>Exporteer CSV</button><button type="button" disabled={!catalog} onClick={()=>exportResult("json")}>Exporteer JSON</button></div>
  </section>
  <section className="rf-lab-panel">
   <div className="rf-lab-table-top"><h2>Websites en resultaten</h2><label>Zoeken<input aria-label="Zoek website" className="rf-lab-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Bedrijf, land, sector…"/></label></div>
   <div className="rf-lab-table-scroll"><table><thead><tr><th>Website</th><th>Land / sector</th><th>Resultaat</th><th>Score</th><th>SEO / GEO</th><th>Rapport</th></tr></thead><tbody>
    {visible.map(site=>{const r=byHost.get(site.host);return <tr key={site.host}>
     <td><strong>{site.name}</strong><small><a href={"https://"+site.host+"/"} target="_blank" rel="noopener noreferrer">{site.host}</a></small></td>
     <td>{site.country}<small>{site.group} · {site.expected}</small></td>
     <td>{!r?<span className="rf-lab-no">Nog niet getest</span>:r.pending?<span className="rf-lab-no">Opnieuw te testen ({r.status})</span>:<span className={wrongType(site,r)?"rf-lab-warn":r.status==="succes"?"rf-lab-good":"rf-lab-no"}>{r.status==="succes"?(verdictOf(site,r)==="mismatch"?"Succes — sectorafwijking":verdictOf(site,r)==="unconfirmed"?"Succes — sector onbevestigd":"Succes — sector passend"):r.status}</span>}
       {r?.sector&&<small>Gevonden: {r.sector}{r.sectorKey&&r.sectorKey!==r.sector?` (${r.sectorKey})`:""} · {VERDICT_LABEL[verdictOf(site,r)||""]||""}{r.websiteType==="ecommerce_store"?` · webshop${r.commercePlatform?` (${r.commercePlatform})`:""}`:""}</small>}
       {r?.reason&&<small title={r.reason}>{r.reason.slice(0,90)}</small>}</td>
     <td>{num(r?.score??null)}{r?.evidenceLevel&&r.evidenceLevel!=="complete"&&<small title="Score alleen op bevestigd bewijs; niet sitebreed definitief">{r.evidenceLevel==="insufficient"?"indicatie":"voorlopig"}</small>}</td><td>{num(r?.seo??null)} / {num(r?.geo??null)}</td>
     <td>{r?.scanId?<a href={"/dashboard/audit/"+encodeURIComponent(r.scanId)+"/report"}>Open rapport</a>:r?.qaAuditId?<a href={"/dashboard/testlab/report?id="+encodeURIComponent(r.qaAuditId)}>Open QA-audit</a>:r?.status==="succes"?"Rapport ontbreekt (oude scan)":"—"}</td>
    </tr>})}
   </tbody></table></div>
  </section>
 </div>;
}
