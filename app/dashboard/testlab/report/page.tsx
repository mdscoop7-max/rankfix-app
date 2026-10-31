"use client";
import {Suspense,useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import {readQaAudit} from "@/lib/testlab-audit-store";
import {scoreDisplay, scoreEvidenceFields} from "@/lib/testlab-score-evidence";
function Report(){
 const params=useSearchParams();
 const id=params.get("id")||"";
 const [record,setRecord]=useState<{host:string;createdAt:string;result:any}|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  if(!id){setError("Geen audit-ID opgegeven.");return;}
  readQaAudit(id).then(r=>{if(r)setRecord(r);else setError("Audit niet gevonden in deze browser. Controleer of je dezelfde browser en hetzelfde profiel gebruikt.");}).catch(e=>setError(String(e)));
 },[id]);
 const download=()=>{
  if(!record)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="rankfix-qa-audit-"+record.host.replace(/[^a-z0-9.-]/gi,"_")+".json";a.click();URL.revokeObjectURL(url);
 };
 return <main style={{maxWidth:1050,margin:"40px auto",padding:24,fontFamily:"system-ui"}}>
  <a href="/dashboard/testlab">Terug naar TestLab</a>
  <h1>RankFix QA — volledige scanbewijzen</h1>
  {error&&<p role="alert">{error}</p>}
  {record&&<>
   <p><strong>Website:</strong> {record.host} · <strong>Opgeslagen:</strong> {record.createdAt}</p>
   <p>Dit is de volledige ruwe scanrespons voor QA, geen onafhankelijk gevalideerd eindrapport.</p>
   <button type="button" onClick={download}>Download volledige audit (JSON)</button>
   <h2>Samenvatting</h2>
   {(()=>{const ev=scoreEvidenceFields(record.result);const d=scoreDisplay(record.result?.overallScore,ev,record.result?.scoreModel?.evidenceLevel);return <p>Score: <strong>{d.main}</strong>{d.detail?` (${d.detail})`:""} · SEO: {record.result?.seo?.score==null?"niet gemeten":ev.seoDisplay}{ev.seoCoveragePercent!=null?` (dekking ${ev.seoCoveragePercent}%)`:""} · GEO: {record.result?.geo?.score==null?"niet gemeten":ev.geoDisplay}{ev.geoCoveragePercent!=null?` (dekking ${ev.geoCoveragePercent}%)`:""}</p>;})()}
   <h2>Scanbewijs</h2>
   <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",background:"#f3f4f6",color:"#111827",padding:16,borderRadius:8}}>{JSON.stringify(record.result,null,2)}</pre>
  </>}
 </main>;
}
export default function Page(){return <Suspense fallback={<p>Audit laden…</p>}><Report/></Suspense>;}
