"use client";
// Read-only: reads TestLab results (localStorage) and stored scan responses
// (IndexedDB) in THIS browser and downloads them as one evidence file.
// It never scans, writes, clears or deletes stored results.
import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {sectorVerdict} from "@/scripts/testlab/labels.mjs";
import {buildEvidenceRow, parseResultKey, summarizeExport, EVIDENCE_EXPORT_VERSION} from "@/lib/testlab-evidence-export.mjs";

type AuditRecord={id:string;host:string;createdAt:string;result:unknown};
type CatalogSite={host:string;expected?:string;name?:string;country?:string;group?:string};
type RunSummary={sha:string;summary:ReturnType<typeof summarizeExport>};
type Row={host:string;status:string;expected:string;sector:string|null;sectorKey?:string|null;websiteType?:string|null;qaAuditId?:string|null;scanId?:string|null;at?:string};

function readAllAudits():Promise<AuditRecord[]>{
 return new Promise((resolve,reject)=>{
  // Open without a version: never triggers an upgrade, never creates stores.
  const open=indexedDB.open("rankfix-testlab-audits");
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result;
   if(!db.objectStoreNames.contains("audits")){db.close();resolve([]);return;}
   const request=db.transaction("audits","readonly").objectStore("audits").getAll();
   request.onsuccess=()=>{db.close();resolve(request.result as AuditRecord[]);};
   request.onerror=()=>{db.close();reject(request.error);};
  };
 });
}

function download(name:string,content:string){
 const url=URL.createObjectURL(new Blob([content],{type:"application/json;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=name;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}

export default function QaEvidenceExport(){
 const params=useSearchParams();
 const catalogId=params.get("catalog")||"fresh144";
 const wantedSha=(params.get("sha")||"").toLowerCase();
 const auto=params.get("auto")==="1";
 const [state,setState]=useState<{text:string;payload?:string;name?:string;runs?:RunSummary[]}>({text:"Bewaarde resultaten lezen…"});
 const done=useRef(false);
 useEffect(()=>{
  (async()=>{
   // 1. All result lists of this catalog, per commit (nothing is filtered away).
   const runs:{key:string;sha:string;rows:Row[]}[]=[];
   for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i)||"";const parsed=parseResultKey(key);
    if(!parsed||parsed.catalogId!==catalogId)continue;
    if(wantedSha&&!parsed.sha.toLowerCase().startsWith(wantedSha))continue;
    try{const rows=JSON.parse(localStorage.getItem(key)||"[]");if(Array.isArray(rows))runs.push({key,sha:parsed.sha,rows});}catch{}
   }
   const audits=await readAllAudits();
   const byId=new Map(audits.map(a=>[a.id,a]));
   if(!runs.length){setState({text:`Geen TestLab-resultaten voor catalogus "${catalogId}" in deze browser gevonden. Gebruik dezelfde browser en hetzelfde profiel als bij de test (adres 127.0.0.1:3002). Opgeslagen scanrapporten in deze browser: ${audits.length}.`});return;}
   // 2. Catalog labels (name/country/group) when the QA session allows it; optional.
   let catalogSites:CatalogSite[]=[];
   try{const r=await fetch("/api/testlab/catalog?catalog="+encodeURIComponent(catalogId),{credentials:"same-origin"});if(r.ok){const d=await r.json();if(Array.isArray(d.sites))catalogSites=d.sites;}}catch{}
   const siteByHost=new Map(catalogSites.map(s=>[s.host,s]));
   // 3. Latest run = most rows; ties → most recent result timestamp.
   const latest=(r:{rows:Row[]})=>r.rows.reduce((m,x)=>x.at&&x.at>m?x.at:m,"");
   runs.sort((a,b)=>b.rows.length-a.rows.length||latest(b).localeCompare(latest(a)));
   const exportRuns=runs.map(run=>{
    const hosts=new Set([...run.rows.map(r=>r.host),...catalogSites.map(s=>s.host)]);
    const rows=[...hosts].map(h=>{
     const result=run.rows.find(r=>r.host===h)||null;
     const site:CatalogSite=siteByHost.get(h)||(result?{host:h,expected:result.expected}:{host:h});
     const verdict=result&&result.status==="succes"&&site.expected?sectorVerdict(site.expected,{sector:result.sector,key:result.sectorKey,websiteType:result.websiteType}).verdict:null;
     return buildEvidenceRow({site,result,audit:result?.qaAuditId?byId.get(result.qaAuditId)||null:null,verdict});
    });
    return {storageKey:run.key,commitSha:run.sha,summary:summarizeExport(rows),rows};
   });
   const primary=exportRuns[0];
   const name=`rankfix-${catalogId}-evidence-${primary.commitSha.slice(0,8)}.json`;
   const payload=JSON.stringify({
    exportVersion:EVIDENCE_EXPORT_VERSION,catalogId,generatedAt:new Date().toISOString(),
    labels:"proposed_not_independently_verified",readOnly:true,
    note:"Alleen bestaande resultaten uit deze browser; geen nieuwe scans. Ontbrekend bewijs staat per site in evidenceState.",
    storedAuditsInBrowser:audits.length,catalogLabelsLoaded:catalogSites.length>0,
    runs:exportRuns,
   },null,1);
   setState({text:"Export klaar.",payload,name,runs:exportRuns.map(r=>({sha:r.commitSha,summary:r.summary}))});
   if(auto&&!done.current){done.current=true;download(name,payload);}
  })().catch(e=>setState({text:"Export mislukt: "+String(e)}));
 },[catalogId,wantedSha,auto]);
 return <main style={{maxWidth:900,margin:"40px auto",padding:24,fontFamily:"system-ui"}}>
  <Link href="/dashboard/testlab">Terug naar TestLab</Link>
  <h1>RankFix QA — bewijs exporteren ({catalogId})</h1>
  <p>Alleen-lezen: deze pagina leest bestaande resultaten uit deze browser. Er worden geen scans gestart en niets wordt gewist.</p>
  <p role="status">{state.text}</p>
  {state.payload&&state.name&&<>
   <button type="button" onClick={()=>download(state.name!,state.payload!)}>Download {state.name}</button>
   <h2>Samenvatting per testronde</h2>
   <pre style={{whiteSpace:"pre-wrap",background:"#f3f4f6",color:"#111827",padding:16,borderRadius:8}}>{JSON.stringify(state.runs,null,2)}</pre>
  </>}
 </main>;
}
