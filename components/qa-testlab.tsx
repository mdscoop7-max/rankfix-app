"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import DashboardNav from "@/app/dashboard/nav";

type Site={host:string;name:string;country:string;group:string;expected:string;round:string};
type SiteResult={host:string;status:string;expected:string;sector:string|null;confidence:number|null;score:number|null;seo:number|null;geo:number|null;http:number;reason:string;elapsedMs:number;scanId:string|null;at:string};
type Catalog={sites:Site[];count:number;runtime:{commitSha:string|null;environment:string}};
const family:Record<string,string>={
 retail:"ecommerce",payments:"financial_services",banking:"financial_services",insurance:"financial_services",
 beauty:"beauty",healthcare:"health_wellness",veterinary_animal_care:"health_wellness",
 legal_services:"professional_services",architecture_design:"professional_services",
 charities_nonprofits:"nonprofit",museums_culture:"events_culture",travel:"transport_travel",
 logistics:"transport_travel",software:"saas_b2b",energy:"energy_utilities",telecom:"telecom_technology",
 recruitment_staffing:"recruitment",
};
function classify(code:string,http:number) {
 if(/SITE_RATE_LIMITED|HTTP_AUTH_REQUIRED|BLOCKED|CHALLENGE|CAPTCHA|ROBOTS/.test(code))return "site_geblokkeerd";
 if(/WEBSITE_LIMIT|SCAN_LIMIT|QUOTA|RATE_LIMIT/.test(code)||http===402||http===429)return "quota";
 if(http===401 || (http===403&&/AUTH|SESSION|LOGIN/.test(code)))return "login";
 if(/DATABASE|INFRASTRUCTURE|DB_|SERVER_CONFIG/.test(code))return "infrastructuur";
 if(/HTTP_NOT_FOUND|HTTP_SERVER_ERROR|SITE_ERROR_PAGE|NON_CONTENT/.test(code))return "site_onbereikbaar";
 if(/TIMEOUT|TIMED_OUT/.test(code))return "timeout";
 return "scan_mislukt";
}
const storageKey=(sha:string)=>"rankfix-qa-testlab-144:"+sha;
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
 const [scope,setScope]=useState("new48");
 const [results,setResults]=useState<SiteResult[]>([]);
 const [running,setRunning]=useState(false);
 const [query,setQuery]=useState("");
 const [job,setJob]=useState<{id:string;status:string;scope:string;error?:string}|null>(null);
 const migrationDone=useRef(false);
 const mounted=useRef(true);
 useEffect(()=>{
  mounted.current=true;
  async function sync(){
   try{
    const response=await fetch("/api/testlab/jobs",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok)return;
    const data=await response.json();
    if(!mounted.current)return;
    setResults(Array.isArray(data.results)?data.results:[]);
    setJob(data.run||null);
    setRunning(["starting","running"].includes(data.run?.status));
   }catch{}
  }
  async function load(){
   try{
    const [catalogResponse,version]=await Promise.all([
      fetch("/api/testlab/catalog",{cache:"no-store"}),fetch("/api/scan/version",{cache:"no-store"}).then(r=>r.json())
    ]);
    const data=await catalogResponse.json();
    if(!catalogResponse.ok||!Array.isArray(data.sites))throw Error("Alleen de aangemelde interne QA-tester heeft toegang.");
    if(data.sites.length!==144||version.environment!=="preview"||!version.commitSha||
       version.commitSha!==data.runtime?.commitSha)throw Error("QA-versie of catalogus kon niet worden bevestigd.");
    if(!mounted.current)return;
    setCatalog(data);
    if(!migrationDone.current){
     migrationDone.current=true;
     const entries: {sourceSha:string;rows:SiteResult[]}[]=[];
     for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||"";
      if(!key.startsWith("rankfix-qa-testlab-144:"))continue;
      try{
       const rows=JSON.parse(localStorage.getItem(key)||"[]");
       if(Array.isArray(rows)&&rows.length)entries.push({sourceSha:key.slice("rankfix-qa-testlab-144:".length),rows:rows.slice(0,144)});
      }catch{}
     }
     if(entries.length){
      const imported=await fetch("/api/testlab/jobs",{method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({action:"import",entries:entries.slice(0,8)})});
      if(!imported.ok){
       setError("Bestaande browserresultaten konden nog niet naar de QA-database worden overgezet. Ze blijven veilig in deze browser; er wordt niets gewist.");
      }else{
       const migrated=await imported.json();
       setNotice("Browserresultaten overgenomen: "+migrated.treated+" opgeslagen in de QA-database. Sluiten van het tabblad stopt toekomstige servertests niet.");
      }
     }else setNotice("Klaar. De server houdt de resultaten bij, ook wanneer je laptop uitstaat.");
    }
    await sync();
   }catch(e){
    if(mounted.current){setError(e instanceof Error?e.message:"QA-verbinding mislukt");setNotice("");}
   }
  }
  void load();
  const timer=window.setInterval(()=>void sync(),5000);
  return()=>{mounted.current=false;window.clearInterval(timer);};
 },[]);
 const sites=catalog?.sites||[];
 const scoped=useMemo(()=>sites.filter(s=>
  scope==="all" || scope==="new48" && /round-[ef]-/.test(s.round) ||
  scope==="hair_salon"&&s.group==="hair_salon" || scope==="optician"&&s.group==="optician" ||
  scope===s.country || scope===s.round
 ),[scope,sites]);
 const visible=useMemo(()=>scoped.filter(s=>[s.name,s.host,s.country,s.group,s.expected].join(" ").toLowerCase().includes(query.toLowerCase())),[scoped,query]);
 const byHost=useMemo(()=>new Map(results.map(r=>[r.host,r])),[results]);
 const finished=scoped.filter(s=>byHost.has(s.host)).length;
 const passed=scoped.filter(s=>byHost.get(s.host)?.status==="succes").length;
 const mismatches=scoped.filter(s=>{const r=byHost.get(s.host);return r?.status==="succes"&&r.sector&&r.sector!==(family[s.expected]||s.expected);}).length;
 const countries=useMemo(()=>[...new Set(sites.map(s=>s.country))].sort(),[sites]);
 const wrongType=(s:Site,r:SiteResult)=>r.status==="succes"&&r.sector!==null&&r.sector!==(family[s.expected]||s.expected);
 async function start(){
  if(!catalog||running)return;
  setError("");
  setNotice("De serverwachtrij wordt gestart…");
  try{
   const response=await fetch("/api/testlab/jobs",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"start",scope})});
   const data=await response.json();
   if(!response.ok)throw Error(data.detail||data.error||"Test niet gestart.");
   setResults(data.results||[]);
   setJob(data.run||null);
   setRunning(["starting","running"].includes(data.run?.status));
   setNotice("Servertest gestart. Je kunt deze pagina en je laptop nu sluiten; de QA-workflow gaat zelfstandig verder.");
  }catch(e){setError(e instanceof Error?e.message:"Serverfout bij het starten.");setRunning(false);}
 }
 async function stopAfterCurrent(){
  setNotice("Pauze aangevraagd. De lopende website wordt eerst afgerond.");
  try{
   const response=await fetch("/api/testlab/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"pause"})});
   if(!response.ok)throw Error("Pauzeren mislukt.");
   const data=await response.json();setResults(data.results||[]);setJob(data.run||null);setRunning(false);
  }catch{setError("Pauzeren kon niet bevestigd worden. Controleer de serverstatus.");}
 }
 function exportResult(fmt:"json"|"csv"){
  if(!catalog)return;
  const complete=sites.map(s=>({...s,result:byHost.get(s.host)||null}));
  if(fmt==="json"){
    saveDownload("rankfix-testlab-144-"+catalog.runtime.commitSha?.slice(0,8)+".json","application/json;charset=utf-8",
      JSON.stringify({commitSha:catalog.runtime.commitSha,generatedAt:new Date().toISOString(),labels:"proposed_not_independently_verified",sites:complete},null,2));
    return;
  }
  const columns=["land","bedrijf","domein","sector_verwacht","subtype_verwacht","gevonden_sector","zekerheid","status","score","seo","geo","http","duur_ms","reden","scan_id"];
  const lines=complete.map(({result:r,...s})=>[s.country,s.name,s.host,s.expected,s.group,r?.sector??"",r?.confidence??"",r?.status??"nog_niet_getest",r?.score??"",r?.seo??"",r?.geo??"",r?.http??"",r?.elapsedMs??"",r?.reason??"",r?.scanId??""].map(csvCell).join(","));
  saveDownload("rankfix-testlab-144-"+catalog.runtime.commitSha?.slice(0,8)+".csv","text/csv;charset=utf-8","\uFEFF"+columns.join(",")+"\n"+lines.join("\n"));
 }
 return <div className="rf-lab">
  <DashboardNav/>
  <header className="rf-lab-hero">
   <div><div className="rf-lab-eyebrow">RankFix • besloten QA</div>
    <h1>TestLab — 144 websites</h1>
    <p>Controleer sectoren, winkels en dienstverleners in verschillende landen. Alle tests zijn alleen-lezen en wijzigen geen klantwebsite.</p>
   </div><div className="rf-lab-count">144<span>unieke websites</span></div>
  </header>
  <section className="rf-lab-panel">
   <div className="rf-lab-table-top"><h2>Test starten</h2><span><code>{catalog?.runtime.commitSha?.slice(0,12)||"Versie controleren"}</code></span></div>
   <div className="rf-lab-controls">
    <label>Testgroep
     <select disabled={running||!catalog} value={scope} onChange={e=>setScope(e.target.value)}>
      <option value="new48">Nieuwe 48 websites</option><option value="all">Alle 144 websites</option>
      <option value="hair_salon">Kapsalons (12)</option><option value="optician">Opticiens (12)</option>
      <optgroup label="Ronde">{[...new Set(sites.map(s=>s.round))].map(x=><option key={x} value={x}>{x}</option>)}</optgroup>
      <optgroup label="Land">{countries.map(x=><option key={x} value={x}>{x}</option>)}</optgroup>
     </select>
    </label>
    <button className="rf-lab-primary" type="button" disabled={!catalog||running||!scoped.length} onClick={()=>void start()}>{running?"Server verwerkt websites…":finished?"Hervat resterende":"Start servertest"}</button>
    <button type="button" disabled={!running} onClick={stopAfterCurrent}>Pauze na huidige scan</button>
    
   </div>
   <div className="rf-lab-stats">
    <div className="rf-lab-stat"><strong>{scoped.length}</strong><span>In selectie</span></div>
    <div className="rf-lab-stat"><strong>{finished}</strong><span>Behandeld</span></div>
    <div className="rf-lab-stat"><strong>{passed}</strong><span>Scanrapport ontvangen</span></div>
    <div className="rf-lab-stat"><strong>{mismatches}</strong><span>Mogelijk andere hoofdsector</span></div>
   </div>
   <div role="status" className={"rf-lab-status"+(error?" rf-lab-error":"")}>{error||notice}{job?.status?" · Serverstatus: "+job.status:""}</div>
   <p className="rf-lab-note">Sectorlabels zijn voorlopig en nog niet onafhankelijk gevalideerd. Geblokkeerde sites en technische problemen tellen niet als sectorfout. Resultaten worden opgeslagen in de QA-database. Een gestart serverproces loopt door als je het tabblad sluit.</p>
   <div className="rf-lab-controls"><button type="button" disabled={!catalog} onClick={()=>exportResult("csv")}>Exporteer CSV</button><button type="button" disabled={!catalog} onClick={()=>exportResult("json")}>Exporteer JSON</button></div>
  </section>
  <section className="rf-lab-panel">
   <div className="rf-lab-table-top"><h2>Websites en resultaten</h2><label>Zoeken<input aria-label="Zoek website" className="rf-lab-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Bedrijf, land, sector…"/></label></div>
   <div className="rf-lab-table-scroll"><table><thead><tr><th>Website</th><th>Land / sector</th><th>Resultaat</th><th>Score</th><th>SEO / GEO</th><th>Rapport</th></tr></thead><tbody>
    {visible.map(site=>{const r=byHost.get(site.host);return <tr key={site.host}>
     <td><strong>{site.name}</strong><small><a href={"https://"+site.host+"/"} target="_blank" rel="noopener noreferrer">{site.host}</a></small></td>
     <td>{site.country}<small>{site.group} · {site.expected}</small></td>
     <td>{!r?<span className="rf-lab-no">Nog niet getest</span>:<span className={wrongType(site,r)?"rf-lab-warn":r.status==="succes"?"rf-lab-good":"rf-lab-no"}>{r.status}</span>}
       {r?.sector&&<small>Gevonden: {r.sector}{wrongType(site,r)?" · beoordelen":""}</small>}
       {r?.reason&&<small title={r.reason}>{r.reason.slice(0,90)}</small>}</td>
     <td>{num(r?.score??null)}</td><td>{num(r?.seo??null)} / {num(r?.geo??null)}</td>
     <td>{r?.scanId?<a href={"/dashboard/audit/"+encodeURIComponent(r.scanId)+"/report"}>Open rapport</a>:"—"}</td>
    </tr>})}
   </tbody></table></div>
  </section>
 </div>;
}
