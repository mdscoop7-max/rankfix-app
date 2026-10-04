import { getDb } from "./db";
import type { CapacityLevel,CapacitySignal } from "./internal-capacity";

export type CapacityTrend={key:string;label:string;current:CapacityLevel;effective:CapacityLevel;orangeSamples:number;redSamples:number;samples:number;message:string};

function rank(level:CapacityLevel){return level==="red"?2:level==="orange"?1:0}
export async function getCapacityTrends(current:CapacitySignal[],sampleWindow=5):Promise<CapacityTrend[]>{
 const limit=Math.min(12,Math.max(3,sampleWindow));
 const result=await getDb().query("SELECT signals FROM rankfix_capacity_runs ORDER BY created_at DESC LIMIT $1",[limit]);
 const history=result.rows.flatMap(row=>Array.isArray(row.signals)?[row.signals as CapacitySignal[]]:[]);
 return current.map(signal=>{
  const levels:CapacityLevel[]=[signal.level,...history.map(run=>run.find(s=>s.key===signal.key)?.level).filter((v):v is CapacityLevel=>v==="green"||v==="orange"||v==="red")].slice(0,limit);
  const redSamples=levels.filter(v=>v==="red").length,orangeSamples=levels.filter(v=>rank(v)>=1).length;
  // A single spike remains visible as the current level, but escalation requires persistence.
  const effective:CapacityLevel=redSamples>=3?"red":orangeSamples>=3?"orange":"green";
  const message=effective==="red"?`${signal.label} is in minstens 3 recente metingen kritiek.`:effective==="orange"?`${signal.label} staat in minstens 3 recente metingen onder druk.`:`${signal.label} toont nog geen structurele capaciteitsdruk.`;
  return {key:signal.key,label:signal.label,current:signal.level,effective,orangeSamples,redSamples,samples:levels.length,message};
 });
}
export function overallCapacityTrend(trends:CapacityTrend[]):CapacityLevel{return trends.some(t=>t.effective==="red")?"red":trends.some(t=>t.effective==="orange")?"orange":"green"}
