"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import DashboardNav from "@/app/dashboard/nav";

type Site={host:string;name:string;country:string;group:string;expected:string;round:string};
type SiteResult={host:string;status:string;expected:string;sector:string|null;confidence:number|null;score:number|null;seo:number|null;geo:number|null;http:number;reason:string;elapsedMs:number;scanId:string|null;at:string};
type Catalog={sites:Site[];count:number;runtime:{commitSha:string|null;environment:string}};
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
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
 const stop=useRef(false);
 const mounted=useRef(true);
 useEffect(()=>{
  mounted.current=true;
  Promise.all([
   fetch("/api/testlab/catalog",{cache:"no-store",credentials:"same-origin"}).then(async r=>({ok:r.ok,data:await r.json()})),
   fetch("/api/scan/version",{cache:"no-store"}).then(r=>r.json()),
  ]).then(([answer,version])=>{
    if(!mounted.current)return;
    if(!answer.ok || !answer.data?.sites){
      setError("Alleen een ingelogde interne QA-tester mag het testlab starten. Meld je aan op de QA-website.");
      setNotice("");return;
    }
    const next=answer.data as Catalog;
    if(next.sites.length!==144 || version.environment!=="preview" || !version.commitSha || version.commitSha!==next.runtime.commitSha){
      setError("QA-versie of catalogus niet betrouwbaar bevestigd. Er worden geen scans gestart.");
      setNotice("");return;
    }
    setCatalog(next);
    const stored=localStorage.getItem(storageKey(version.commitSha));
    if(stored){try{const list=JSON.parse(stored);
      if(Array.isArray(list))setResults(list.filter((r:SiteResult)=>next.sites.some(s=>s.host===r.host)).slice(0,144));
    }catch{}}
    setNotice("Klaar. Start de test handmatig; standaard worden eerst de 48 nieuwe websites geselecteerd.");
  }).catch(()=>{if(mounted.current){setError("QA-catalogus kon niet worden opgehaald.");setNotice("");}});
  return()=>{mounted.current=false;stop.current=true;};
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
 const persist=(list:SiteResult[])=>{setResults(list);if(catalog?.runtime.commitSha)localStorage.setItem(storageKey(catalog.runtime.commitSha),JSON.stringify(list));};
 async function start(){
  if(!catalog||running)return;
  const queue=scoped.filter(s=>!byHost.has(s.host));
  if(!queue.length){setNotice("Alles in deze selectie is al getest. Kies een andere groep of wis resultaten.");return;}
  stop.current=false;setRunning(true);setError("");
  setNotice("Test gestart. Eén website tegelijk, met een pauze tussen scans. Je kunt stoppen na de huidige scan.");
  let list=[...results];
  try{
   for(const site of queue){
    if(stop.current || !mounted.current)break;
    const startAt=Date.now();
    let row:SiteResult;
    try{
      // Fail closed if the shared QA alias was redeployed mid-run.
      const v=await fetch("/api/scan/version",{cache:"no-store"}).then(r=>r.json());
      if(v.environment!=="preview"||v.commitSha!==catalog.runtime.commitSha){throw new Error("QA_DEPLOYMENT_CHANGED");}
      const response=await fetch("/api/scan",{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
        body:JSON.stringify({url:"https://"+site.host+"/",mode:"both",dashboard:true,language:"nl"})
      });
      const data=await response.json();
      const success=response.ok&&data?.success===true;
      const code=String(data?.code||data?.errorCode||"");
      const status=success?"succes":classify(code,response.status);
      row={host:site.host,status,expected:site.expected,sector:success?(data.sectorProfile?.sector||null):null,
       confidence:success?(data.sectorProfile?.confidenceScore??null):null,
       score:success?(data.overallScore??null):null,seo:success?(data.seo?.score??null):null,geo:success?(data.geo?.score??null):null,
       http:response.status,reason:success?"":code||String(data.error||"Scan niet bevestigd").slice(0,200),
       elapsedMs:Date.now()-startAt,scanId:success?(data.scanId||null):null,at:new Date().toISOString()};
    }catch(e){
      const message=e instanceof Error?e.message:"Netwerk- of scanprobleem";
      if(message==="QA_DEPLOYMENT_CHANGED"){setError("QA is tijdens de test veranderd. Test veilig gestopt; vernieuw de pagina.");break;}
      row={host:site.host,status:"netwerkfout",expected:site.expected,sector:null,confidence:null,score:null,seo:null,geo:null,
       http:0,reason:message.slice(0,180),elapsedMs:Date.now()-startAt,scanId:null,at:new Date().toISOString()};
    }
    list=[...list.filter(x=>x.host!==site.host),row];persist(list);
    setNotice(site.host+" — "+row.status+" • "+list.filter(r=>scoped.some(s=>s.host===r.host)).length+"/"+scoped.length+" getest");
    if(["quota","login","infrastructuur"].includes(row.status)){
      setError("QA heeft "+row.status+" gemeld. Test gestopt zonder andere websites als fout te markeren.");break;
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
    <button className="rf-lab-primary" type="button" disabled={!catalog||running||!scoped.length} onClick={()=>void start()}>{running?"Test draait…":finished?"Doorgaan met resterende":"Start test"}</button>
    <button type="button" disabled={!running} onClick={stopAfterCurrent}>Stop na huidige scan</button>
    <button type="button" disabled={running||!results.length} onClick={clearResults}>Resultaten wissen</button>
   </div>
   <div className="rf-lab-stats">
    <div className="rf-lab-stat"><strong>{scoped.length}</strong><span>In selectie</span></div>
    <div className="rf-lab-stat"><strong>{finished}</strong><span>Behandeld</span></div>
    <div className="rf-lab-stat"><strong>{passed}</strong><span>Scanrapport ontvangen</span></div>
    <div className="rf-lab-stat"><strong>{mismatches}</strong><span>Mogelijk andere hoofdsector</span></div>
   </div>
   <div role="status" className={"rf-lab-status"+(error?" rf-lab-error":"")}>{error||notice}</div>
   <p className="rf-lab-note">Sectorlabels zijn voorlopig en nog niet onafhankelijk gevalideerd. Geblokkeerde sites en technische problemen tellen niet als sectorfout. Resultaten worden lokaal in deze browser bewaard per QA-commit. Sluit het tabblad niet tijdens een actieve test.</p>
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
