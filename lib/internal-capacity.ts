import { getDb } from "./db";

export type CapacityLevel="green"|"orange"|"red";
export type CapacitySignal={key:string;label:string;level:CapacityLevel;message:string;value:number;unit:string;orangeAt:number;redAt:number};

function level(value:number,orangeAt:number,redAt:number):CapacityLevel{return value>=redAt?"red":value>=orangeAt?"orange":"green"}
function signal(key:string,label:string,value:number,unit:string,orangeAt:number,redAt:number,message:string):CapacitySignal{return {key,label,value,unit,orangeAt,redAt,level:level(value,orangeAt,redAt),message}}

export async function getInternalCapacitySignals():Promise<CapacitySignal[]>{
 const db=getDb();
 const [queue,dbStats]=await Promise.all([
  db.query(`SELECT
   COUNT(*) FILTER (WHERE status IN ('QUEUED','RETRY'))::int AS waiting,
   COUNT(*) FILTER (WHERE status='RUNNING')::int AS running,
   COUNT(*) FILTER (WHERE status='FAILED' AND finished_at>NOW()-INTERVAL '24 hours')::int AS failed_24h,
   COALESCE(EXTRACT(EPOCH FROM (NOW()-MIN(created_at) FILTER (WHERE status IN ('QUEUED','RETRY'))))/60,0)::float AS oldest_wait_minutes
   FROM background_jobs`),
  db.query(`SELECT
   (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname=current_database()) AS connections,
   pg_database_size(current_database())::float AS database_bytes,
   (SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max_connections`)
 ]);
 const q=queue.rows[0]||{},d=dbStats.rows[0]||{};
 const waiting=Number(q.waiting||0),oldest=Math.round(Number(q.oldest_wait_minutes||0)),failed=Number(q.failed_24h||0),connections=Number(d.connections||0),dbMb=Math.round(Number(d.database_bytes||0)/1024/1024);
 const maxConnections=Math.max(1,Number(d.max_connections||100));
 const connectionWarnAt=Math.max(10,Math.floor(maxConnections*0.70));
 const connectionCriticalAt=Math.max(connectionWarnAt+1,Math.floor(maxConnections*0.90));
 return [
  signal("queue_waiting","Wachtrij",waiting,"jobs",50,200,waiting===0?"Geen wachtende achtergrondtaken.":`${waiting} taken wachten op verwerking.`),
  signal("queue_age","Oudste job",oldest,"min",10,30,oldest===0?"Geen wachttijd.":`Oudste wachtende taak is ${oldest} minuten oud.`),
  signal("queue_failures","Mislukte jobs (24u)",failed,"jobs",5,20,failed===0?"Geen mislukte jobs in de laatste 24 uur.":`${failed} jobs zijn in 24 uur definitief mislukt.`),
  signal("db_connections","Databaseconnecties",connections,"connecties",connectionWarnAt,connectionCriticalAt,`${connections} actieve PostgreSQL-connecties zichtbaar; waarschuwing vanaf ${connectionWarnAt} van maximaal ${maxConnections}.`),
  signal("db_size","Databasegrootte",dbMb,"MB",500,900,`RankFix gebruikt ongeveer ${dbMb} MB databaseopslag.`)
 ];
}

export function overallCapacity(signals:CapacitySignal[]):CapacityLevel{return signals.some(s=>s.level==="red")?"red":signals.some(s=>s.level==="orange")?"orange":"green"}
