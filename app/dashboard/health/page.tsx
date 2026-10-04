"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import DashboardNav from "../nav";
import AiAssistant from "@/components/ai-assistant";
import "../dashboard.css";

type Level="green"|"orange"|"red";
type Check={key:string;label:string;level:Level;message:string;latencyMs?:number};
type Signal={key:string;label:string;level:Level;message:string;value:number;unit:string};
type Run={overall_level:Level;checks:Check[];created_at:string};
type CapacityRun={overall_level:Level;signals:Signal[];created_at:string};
type Incident={incident_key:string;status:"open"|"resolved";failure_count:number;first_seen_at:string;last_seen_at:string;alerted_at?:string|null;resolved_at?:string|null};
type Guard={key:string;label:string;level:Level;message:string;metrics?:Record<string,number>;details?:Record<string,string|number|boolean|null>};
const labels={green:"Gezond",orange:"Aandacht",red:"Kritiek"};
const dot=(l:Level)=>l==="green"?"●":l==="orange"?"▲":"■";
const statusColor=(l:Level)=>l==="green"?"#22c55e":l==="orange"?"#f59e0b":"#ef4444";
const statusStyle=(l:Level)=>({color:statusColor(l),fontWeight:700} as const);

export default function HealthPage(){
 const [runs,setRuns]=useState<Run[]>([]),[capacity,setCapacity]=useState<CapacityRun[]>([]),[incidents,setIncidents]=useState<Incident[]>([]),[guards,setGuards]=useState<Guard[]>([]),[recovery,setRecovery]=useState<Guard[]>([]),[error,setError]=useState(""),[checking,setChecking]=useState(false),[checkMessage,setCheckMessage]=useState("");
 async function load(){const r=await fetch("/api/health/system",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Control Center laden mislukt.");setRuns(d.runs||[]);setCapacity(d.capacity||[]);setIncidents(d.incidents||[]);setGuards([...(d.operationalGuards||[]),...(d.securityUsageGrowth||[])]);setRecovery(d.recoveryGuards||[])}
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 async function runNow(){setChecking(true);setError("");setCheckMessage("");try{const r=await fetch("/api/health/run-now",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Health-controle mislukt.");await load();setCheckMessage("Controle voltooid.")}catch(e){const message=e instanceof Error?e.message:"Health-controle mislukt.";setError(message);setCheckMessage("Controle mislukt – probeer opnieuw.")}finally{setChecking(false)}}
 const latest=runs[0],cap=capacity[0],open=incidents.filter(i=>i.status==="open");
 const levelRank:Record<Level,number>={green:0,orange:1,red:2};
 const systemLevel:Level=([latest?.overall_level,cap?.overall_level,...guards.map(g=>g.level),...recovery.map(g=>g.level),...(open.length?["red" as Level]:[])].filter(Boolean) as Level[]).reduce((worst,current)=>levelRank[current]>levelRank[worst]?current:worst,"green");
 const checks=latest?.checks||[],signals=cap?.signals||[];
 const group=(keys:string[])=>checks.filter(c=>keys.some(k=>c.key.includes(k)));
 return <main className="rf-page"><div className="rf-shell"><header className="rf-header"><Link href="/dashboard" className="rf-brand">RankFix <span>AI</span></Link></header><DashboardNav/>
 <div className="rf-body rf-health"><Link href="/dashboard/more" className="rf-back-link">← Terug naar Meer</Link>
  <div className="rf-health-head"><div><span className="rf-eyebrow">Alleen beheerder</span><h1>Systeemstatus</h1><p>Alles over de gezondheid van RankFix. We controleren automatisch en melden het als er iets aandacht nodig heeft.</p></div><div className="rf-health-actions">{latest&&<small>Laatste update<br/><strong>{new Date(latest.created_at).toLocaleString("nl-NL")}</strong></small>}<button type="button" className="rf-primary-button" onClick={runNow} disabled={checking} aria-busy={checking}>{checking?"↻ Controleren…":"↻ Nu controleren"}</button></div></div>
  {checkMessage&&<p className="rf-health-message" role="status">{checkMessage}</p>}{error&&<div className="rf-alert">{error}</div>}
  <section className={"rf-health-hero "+systemLevel}><div><span className="rf-eyebrow">Systeemstatus</span><h2>{latest?labels[systemLevel]:"Nog geen controle"}</h2><p>{systemLevel==="green"?"Alle belangrijke systeemcontroles zijn in orde. Er is momenteel geen actie nodig.":systemLevel==="red"?"Er is een kritieke controle die direct aandacht nodig heeft.":"Eén of meer controles hebben aandacht nodig; de overige onderdelen blijven beschikbaar."}</p></div><div className="rf-health-reason"><strong>{systemLevel==="green"?"Alles in orde":"Waarom "+labels[systemLevel].toLowerCase()+"?"}</strong>{[...recovery,...guards].filter(g=>g.level===systemLevel&&g.level!=="green").slice(0,2).map(g=><p key={g.key}><b>{g.label}</b> · {g.message}</p>)}{systemLevel!=="green"&&![...recovery,...guards].some(g=>g.level===systemLevel)&&<p>Bekijk de gemarkeerde controle hieronder voor de concrete oorzaak.</p>}</div></section>
  <h2 className="rf-health-section-title">Belangrijkste statistieken</h2><div className="rf-health-metrics">{signals.slice(0,5).map(s=><article key={s.key}><span>{s.label}</span><strong>{s.value} {s.unit}</strong><small style={statusStyle(s.level)}>● {labels[s.level]}</small><p>{s.message}</p></article>)}</div>
  <div className="rf-health-overview"><section className="rf-health-panel"><div className="rf-health-panel-head"><h2>Recente controles</h2><span>Laatste 5</span></div>{runs.slice(0,5).map((r,i)=><div className="rf-health-row" key={r.created_at+i}><span>{new Date(r.created_at).toLocaleString("nl-NL")}</span><b style={statusStyle(r.overall_level)}>● {labels[r.overall_level]}</b></div>)}</section><section className="rf-health-panel"><div className="rf-health-panel-head"><h2>Incidenten</h2><span>{open.length} actief</span></div>{open.length===0?<div className="rf-health-empty"><strong>✓ Geen actieve incidenten</strong><p>Alle systemen werken normaal.</p></div>:open.slice(0,5).map((i,n)=><div className="rf-health-row" key={i.incident_key+n}><span>{i.incident_key.replace("rankfix-production:","")}</span><b>Actief · {i.failure_count}</b></div>)}</section></div>
  <h2 className="rf-health-section-title">Systeemonderdelen</h2><p className="rf-health-components-intro">Tik op een onderdeel voor de volledige controle-informatie.</p><div className="rf-health-components">
   {[
    {title:"Database (PostgreSQL)",items:guards.filter(g=>g.key==="database_guard")},
    {title:"Queue & Workers",items:guards.filter(g=>g.key==="queue_worker_guard")},
    {title:"External APIs",items:group(["ai","github","google","email"])},
    {title:"RankFix app & Scanner",items:group(["app","scanner"])},
    {title:"Deployment",items:group(["deployment"])},
    {title:"Backup & Recovery",items:recovery},
    {title:"Security & Abuse",items:guards.filter(g=>g.key==="security_abuse")},
    {title:"Usage & Growth",items:guards.filter(g=>g.key==="usage"||g.key==="growth_upgrade")}
   ].map(component=><details className={"rf-health-component-detail "+(component.items.some(i=>i.level!=="green")?"attention":"")} key={component.title}><summary><div><strong>{component.title}</strong><p>{component.items.length?component.items.map(i=>i.message||i.label).slice(0,2).join(" · "):"Geen afwijkingen gevonden."}</p></div><span aria-hidden="true">›</span></summary><div className="rf-health-component-body">{component.items.length?component.items.map(item=><div className="rf-health-component-check" key={item.key}><b style={statusStyle(item.level)}>● {labels[item.level]}</b><strong>{item.label}</strong><p>{item.message}</p>{"latencyMs" in item&&typeof item.latencyMs==="number"&&<small>Reactietijd: {item.latencyMs} ms</small>}{"metrics" in item&&item.metrics&&Object.keys(item.metrics).length>0&&<small>{Object.entries(item.metrics).map(([k,v])=>k+": "+v).join(" · ")}</small>}{"details" in item&&item.details&&Object.keys(item.details).length>0&&<small>{Object.entries(item.details).map(([k,v])=>k+": "+String(v)).join(" · ")}</small>}</div>):<p>Dit onderdeel heeft momenteel geen aanvullende waarschuwingen of meetgegevens.</p>}</div></details>)}
  </div>
  <section className="rf-health-info"><strong>Wat betekent deze status?</strong><p>Systeemstatus geeft aan hoe belangrijke onderdelen van RankFix werken. “Aandacht” betekent dat één of meer controles extra aandacht nodig hebben, maar dat er geen storing is.</p></section>
 </div><AiAssistant dashboard /></div></main>
}