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
 const [runs,setRuns]=useState<Run[]>([]),[capacity,setCapacity]=useState<CapacityRun[]>([]),[incidents,setIncidents]=useState<Incident[]>([]),[guards,setGuards]=useState<Guard[]>([]),[recovery,setRecovery]=useState<Guard[]>([]),[error,setError]=useState(""),[checking,setChecking]=useState(false);
 async function load(){const r=await fetch("/api/health/system",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Control Center laden mislukt.");setRuns(d.runs||[]);setCapacity(d.capacity||[]);setIncidents(d.incidents||[]);setGuards([...(d.operationalGuards||[]),...(d.securityUsageGrowth||[])]);setRecovery(d.recoveryGuards||[])}
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 async function runNow(){setChecking(true);setError("");try{const r=await fetch("/api/health/run-now",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Health-controle mislukt.");await load()}catch(e){setError(e instanceof Error?e.message:"Health-controle mislukt.")}finally{setChecking(false)}}
 const latest=runs[0],cap=capacity[0],open=incidents.filter(i=>i.status==="open");
 const checks=latest?.checks||[],signals=cap?.signals||[];
 const group=(keys:string[])=>checks.filter(c=>keys.some(k=>c.key.includes(k)));
 return <main className="rf-page"><div className="rf-shell"><header className="rf-header"><Link href="/dashboard" className="rf-brand">RankFix <span>AI</span></Link></header><DashboardNav/>
 <div className="rf-body"><div className="rf-heading"><span className="rf-eyebrow">Alleen beheerder</span><h1>Internal Control Center</h1><p>Technische bewaking van RankFix zelf: gezondheid, capaciteit, database, verwerking, externe diensten en incidenten.</p><button type="button" className="rf-primary-button mt-4" style={{background:"#16a34a",color:"#fff",borderColor:"#16a34a"}} onClick={runNow} disabled={checking}>{checking?"Controleren…":"↻ Nu controleren"}</button></div>
 {error&&<div className="rf-alert">{error}</div>}
 <section className="rf-plan-card"><div><span className="rf-eyebrow">System Health</span><h2 style={latest?{color:statusColor(latest.overall_level)}:undefined}>{latest?labels[latest.overall_level]:"Nog geen controle"}</h2><p>{latest?"Laatste health-run: "+new Date(latest.created_at).toLocaleString("nl-NL"):"Nog geen health-run opgeslagen."}</p></div><div><strong>{open.length}</strong><p>actieve incidenten</p></div></section>
 <div className="rf-grid">
  <section className="rf-card"><span className="rf-eyebrow">Capacity</span><h3>{cap?<span style={statusStyle(cap.overall_level)}>{dot(cap.overall_level)+" "+labels[cap.overall_level]}</span>:"Geen meting"}</h3>{signals.map(s=><p key={s.key}><strong>{s.label}:</strong> {s.value} {s.unit} · <span style={statusStyle(s.level)}>{labels[s.level]}</span></p>)}</section>
  <section className="rf-card"><span className="rf-eyebrow">Database</span><h3>PostgreSQL</h3>{guards.filter(g=>g.key==="database_guard").map(g=><p key={g.key}>{dot(g.level)} {g.message}</p>)}<p>Capaciteit wordt beoordeeld op werkelijke belasting en groei, niet alleen op klantenaantal.</p></section>
  <section className="rf-card"><span className="rf-eyebrow">Queue & Workers</span><h3>Achtergrondverwerking</h3>{guards.filter(g=>g.key==="queue_worker_guard").map(g=><p key={g.key}>{dot(g.level)} {g.message}</p>)}</section>
  <section className="rf-card"><span className="rf-eyebrow">External APIs</span><h3>Afhankelijkheden</h3>{group(["ai","github","google","email"]).map(c=><p key={c.key}>{dot(c.level)} <strong>{c.label}</strong> · {c.message}</p>)}</section>
  <section className="rf-card"><span className="rf-eyebrow">Performance</span><h3>App & scanner</h3>{group(["app","scanner","deployment"]).map(c=><p key={c.key}>{dot(c.level)} <strong>{c.label}</strong> · {c.message}</p>)}</section>
  <section className="rf-card"><span className="rf-eyebrow">Backup & Recovery</span><h3>Herstelbaarheid</h3>{recovery.map(g=><p key={g.key}>{dot(g.level)} <strong>{g.label}</strong> · {g.message}</p>)}</section>
  <section className="rf-card"><span className="rf-eyebrow">Security & Abuse</span><h3>Bescherming</h3>{guards.filter(g=>g.key==="security_abuse").map(g=><p key={g.key}>{dot(g.level)} {g.message}</p>)}</section>
  <section className="rf-card"><span className="rf-eyebrow">Usage & Growth</span><h3>Technisch gebruik</h3>{guards.filter(g=>g.key==="usage"||g.key==="growth_upgrade").map(g=><p key={g.key}>{dot(g.level)} <strong>{g.label}</strong> · {g.message}</p>)}<p>Euro-kosten koppelen we pas aan definitieve leveranciersplannen.</p></section>
 </div>
 <section className="rf-card"><h2>Incidenten</h2>{incidents.length===0?<p>Geen incidenten geregistreerd.</p>:incidents.slice(0,12).map((i,n)=><p key={i.incident_key+n}><strong>{i.status==="open"?"Actief":"Hersteld"}</strong> · {i.incident_key.replace("rankfix-production:","")} · {i.failure_count} bevestigingen · {new Date(i.last_seen_at).toLocaleString("nl-NL")}{i.alerted_at?" · melding verzonden":""}</p>)}</section>
 <section className="rf-card"><h2>Recente controles</h2>{runs.slice(0,5).map((r,i)=><p key={r.created_at+i}><strong style={statusStyle(r.overall_level)}>{labels[r.overall_level]}</strong> · {new Date(r.created_at).toLocaleString("nl-NL")}</p>)}</section>
 </div><AiAssistant dashboard /></div></main>
}