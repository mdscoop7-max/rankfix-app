"use client";
import {Suspense,useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import Link from "next/link";
import {readQaAudit,type QaAuditResult} from "@/lib/testlab-audit-store";
import {scoreDisplay,scoreEvidenceFields} from "@/lib/testlab-score-evidence";

type AnyRecord=Record<string,any>;
const object=(value:unknown):AnyRecord=>value&&typeof value==="object"&&!Array.isArray(value)?value as AnyRecord:{};
const items=(value:unknown):AnyRecord[]=>Array.isArray(value)?value.map(object):[];
const pretty=(value:unknown)=>typeof value==="number"?String(value):value==null?"Niet bevestigd":String(value);
const statusLabel=(status:string)=>({pass:"Goed",warning:"Aandachtspunt",fail:"Probleem",critical:"Kritiek",unable_to_confirm:"Niet bevestigd",not_applicable:"Niet van toepassing"} as Record<string,string>)[status]||status;
const statusColor=(status:string)=>status==="pass"?"#166534":status==="warning"?"#92400e":status==="fail"||status==="critical"?"#991b1b":"#475569";
const panel:React.CSSProperties={background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,padding:22,marginBottom:18,boxShadow:"0 2px 8px #0f172a08"};
const heading:React.CSSProperties={margin:"0 0 12px",fontSize:20,color:"#0f172a"};
function Report(){
 const params=useSearchParams(),id=params.get("id")||"";
 const [record,setRecord]=useState<{host:string;createdAt:string;result:QaAuditResult}|null>(null);
 const [loadError,setError]=useState("");
 useEffect(()=>{if(!id)return;readQaAudit(id).then(r=>{if(r)setRecord(r);else setError("Audit niet gevonden in deze browser. Gebruik dezelfde browser en hetzelfde profiel.");}).catch(e=>setError(String(e)));},[id]);
 const download=()=>{if(!record)return;const url=URL.createObjectURL(new Blob([JSON.stringify(record.result,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="rankfix-qa-audit-"+record.host.replace(/[^a-z0-9.-]/gi,"_")+".json";a.click();URL.revokeObjectURL(url);};
 const data=object(record?.result),sector=object(data.sectorProfile),model=object(data.scoreModel),coverage=object(data.coverage),summary=object(data.summary),scope=object(model.scope),otherPages=object(scope.otherPages),siteScope=object(object(data.scope).multiPage),siteAccess=object(siteScope.siteAccess),pages=object(siteAccess.pages),rendering=object(data.rendering);
 const evidence=record?scoreEvidenceFields(record.result):null;
 const display=record&&evidence?scoreDisplay(record.result.overallScore,evidence,model.evidenceLevel):null;
 const breakdown=items(model.breakdown),problems=breakdown.filter(x=>x.status==="warning"||x.status==="fail"||x.status==="critical"),unconfirmed=breakdown.filter(x=>x.status==="unable_to_confirm");
 const sectorConfirmed=scope.sectorConfirmed===true;
 return <main style={{minHeight:"100vh",background:"#f1f5f9",padding:"28px 18px",fontFamily:"system-ui, sans-serif",color:"#1e293b"}}>
  <div style={{maxWidth:1120,margin:"0 auto"}}>
   <nav style={{marginBottom:20}}><Link href="/dashboard/testlab" style={{color:"#1d4ed8",fontWeight:650}}>← Terug naar TestLab</Link></nav>
   <header style={{marginBottom:22}}><div style={{fontSize:12,letterSpacing:2,fontWeight:800,color:"#2563eb"}}>RANKFIX · QA AUDIT</div><h1 style={{fontSize:32,margin:"6px 0"}}>Website-audit</h1><p style={{margin:0,color:"#64748b"}}>{record?.host||"Audit laden…"} {record?" · "+new Date(record.createdAt).toLocaleString("nl-NL"):""}</p></header>
   {(!id||loadError)&&<div role="alert" style={panel}>{loadError||"Geen audit-ID opgegeven."}</div>}
   {record&&<>
    <section style={panel}>
     <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><h2 style={heading}>Scanoverzicht</h2><button type="button" onClick={download} style={{background:"#1d4ed8",color:"white",border:0,borderRadius:9,padding:"11px 16px",cursor:"pointer",fontWeight:650}}>Download volledige JSON</button></div>
     <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
      {[["Totaalscore",display?.main||"—",display?.detail||"Voorlopige score"],["SEO",evidence?.seoDisplay||"—","Kerncontroles"],["GEO",evidence?.geoDisplay||"—","Kerncontroles"],["Bewijsdekking",coverage.coveragePercent==null?"—":coverage.coveragePercent+"%",pretty(coverage.confirmed)+" van "+pretty(coverage.relevant)+" controles"],["Pagina's",pretty(pages.assessed)+"/"+pretty(pages.selected),"Geselecteerde steekproef"]].map(([label,value,sub])=><div key={label} style={{background:"#f8fafc",border:"1px solid #e2e8f0",padding:16,borderRadius:12}}><div style={{fontSize:13,color:"#64748b"}}>{label}</div><div style={{fontSize:28,fontWeight:800,color:"#0f172a",margin:"4px 0"}}>{value}</div><div style={{fontSize:12,color:"#64748b"}}>{sub}</div></div>)}
     </div>
     <p style={{fontSize:13,color:"#475569",marginBottom:0}}>Een voorlopig scorebereik is geen definitief oordeel. De SEO/GEO-puntenscores gelden voor bevestigde kerncontroles; aanvullende controles en paginabewijs kunnen ontbreken.</p>
    </section>
    <section style={panel}><h2 style={heading}>Bedrijf en branche</h2><p><strong>Gevonden:</strong> {pretty(sector.label||sector.sector)} {sectorConfirmed?<span style={{color:"#166534"}}>· bevestigd</span>:<span style={{color:"#b45309"}}>· branche niet bevestigd</span>}</p><p style={{color:"#64748b",fontSize:14}}>Sectorcode: {pretty(sector.sector)} · Herkende websitefunctie: {pretty(object(object(data.websiteProfile).websiteType).value)}</p>{sector.sector==="ecommerce"&&/paypal/i.test(record.host)&&<p role="alert" style={{padding:12,borderRadius:8,background:"#fff7ed",color:"#9a3412"}}>QA-controle: PayPal wordt hier als retail geclassificeerd, terwijl de gescande pagina's betaaldiensten beschrijven. Deze branche-uitkomst vereist correctie in de scanmotor; dit rapport verandert de classificatie niet.</p>}</section>
    <section style={panel}><h2 style={heading}>Problemen en verbeterpunten ({problems.length})</h2>{problems.length?problems.map((x,i)=><div key={x.key||i} style={{borderTop:"1px solid #e2e8f0",padding:"14px 0"}}><strong>{pretty(x.title||x.key)}</strong> <span style={{color:statusColor(x.status),fontSize:13}}>· {statusLabel(x.status)}</span><div style={{fontSize:13,color:"#64748b",marginTop:4}}>Onderdeel: {pretty(x.category)}{x.rawDeduction!=null?" · Puntenaftrek: "+x.rawDeduction:""}</div></div>):<p>Geen bevestigde waarschuwingen in de beschikbare scorecontroles.</p>}{Number(summary.sitewideIssues||0)>0&&<p style={{color:"#92400e",fontSize:13}}>Daarnaast {summary.sitewideIssues} aandachtspunten op andere pagina's. Deze zijn niet automatisch inbegrepen in de homepage-score.</p>}</section>
    <section style={panel}><h2 style={heading}>Niet bevestigde controles ({unconfirmed.length})</h2><p style={{fontSize:14,color:"#475569"}}>Geen bewijs is niet hetzelfde als een fout. Deze controles krijgen geen verzonnen oordeel.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:8}}>{unconfirmed.map((x,i)=><div key={x.key||i} style={{border:"1px solid #e2e8f0",borderRadius:8,padding:10,fontSize:13}}>{pretty(x.title||x.key)}</div>)}</div></section>
    <section style={panel}><h2 style={heading}>SEO- en GEO-controles</h2>{["seo","geo"].map(group=><div key={group}><h3 style={{textTransform:"uppercase",fontSize:15,marginTop:20}}>{group}</h3>{breakdown.filter(x=>x.category===group).map((x,i)=><div key={x.key||i} style={{display:"flex",justifyContent:"space-between",gap:12,borderTop:"1px solid #e2e8f0",padding:"9px 0",fontSize:14}}><span>{pretty(x.title||x.key)}</span><span style={{color:statusColor(x.status),whiteSpace:"nowrap",fontWeight:650}}>{statusLabel(x.status)}</span></div>)}</div>)}</section>
    <section style={panel}><h2 style={heading}>Technisch scanbewijs</h2><p>HTTP: {pretty(data.httpStatus)} · Rendering: {pretty(rendering.mode)} · JavaScript uitgevoerd: {rendering.javascriptExecuted===true?"Ja":"Nee"} · Pagina's beoordeeld: {pretty(pages.assessed)} / {pretty(pages.selected)}</p><p style={{fontSize:13,color:"#64748b"}}>De volledige technische gegevens en alle ruwe scanbewijzen zijn beschikbaar via de JSON-download. De audit is niet onafhankelijk gevalideerd.</p><details><summary style={{cursor:"pointer",fontWeight:650}}>Toon ruwe scanrespons (JSON)</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",background:"#0f172a",color:"#e2e8f0",padding:16,borderRadius:10,maxHeight:600,overflow:"auto",fontSize:12}}>{JSON.stringify(record.result,null,2)}</pre></details></section>
   </>}
  </div>
 </main>;
}
export default function Page(){return <Suspense fallback={<p>Audit laden…</p>}><Report/></Suspense>;}
