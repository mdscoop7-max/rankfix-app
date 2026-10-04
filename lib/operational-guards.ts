import { getDb } from "./db";
export type GuardLevel="green"|"orange"|"red";
export type OperationalGuard={key:string;label:string;level:GuardLevel;message:string;metrics:Record<string,number>};
const lvl=(v:number,o:number,r:number):GuardLevel=>v>=r?"red":v>=o?"orange":"green";
export async function getDatabaseAndQueueGuards():Promise<OperationalGuard[]>{
 const db=getDb(),started=Date.now();
 const ping=await db.query("SELECT 1");
 const latency=Date.now()-started;
 const [activity,jobs]=await Promise.all([
  db.query(`SELECT COUNT(*)::int total,
   COUNT(*) FILTER (WHERE state='active')::int active,
   COUNT(*) FILTER (WHERE state='active' AND wait_event IS NOT NULL)::int waiting
   FROM pg_stat_activity WHERE datname=current_database()`),
  db.query(`SELECT
   COUNT(*) FILTER (WHERE status IN ('QUEUED','RETRY'))::int queued,
   COUNT(*) FILTER (WHERE status='RUNNING')::int running,
   COUNT(*) FILTER (WHERE status='FAILED' AND finished_at>NOW()-INTERVAL '24 hours')::int failed,
   COUNT(*) FILTER (WHERE status='RUNNING' AND locked_at<NOW()-INTERVAL '15 minutes')::int stale
   FROM background_jobs`)
 ]);
 const a=activity.rows[0]||{},j=jobs.rows[0]||{};
 const active=Number(a.active||0),waiting=Number(a.waiting||0),queued=Number(j.queued||0),failed=Number(j.failed||0),stale=Number(j.stale||0);
 const dbPressure=Math.max(lvl(latency,500,1500)==="red"?2:lvl(latency,500,1500)==="orange"?1:0,lvl(waiting,2,5)==="red"?2:lvl(waiting,2,5)==="orange"?1:0);
 const dbLevel:GuardLevel=dbPressure===2?"red":dbPressure===1?"orange":"green";
 const queueLevel:GuardLevel=stale>0||failed>=20||queued>=200?"red":failed>=5||queued>=50?"orange":"green";
 return [
  {key:"database_guard",label:"Database Guard",level:dbLevel,message:ping.rowCount===1?`Database reageert in ${latency} ms; ${active} actieve sessies en ${waiting} wachtend.`:"Databasecontrole mislukt.",metrics:{latencyMs:latency,totalConnections:Number(a.total||0),activeConnections:active,waitingConnections:waiting}},
  {key:"queue_worker_guard",label:"Queue & Worker Guard",level:queueLevel,message:`${queued} wachtend, ${Number(j.running||0)} actief, ${failed} mislukt in 24u, ${stale} verlopen worker leases.`,metrics:{queued,running:Number(j.running||0),failed24h:failed,staleLeases:stale}}
 ];
}
