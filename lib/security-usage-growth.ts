import { getDb } from "./db";
export type InternalGuardLevel="green"|"orange"|"red";
export type InternalGuard={key:string;label:string;level:InternalGuardLevel;message:string;metrics:Record<string,number>};
const level=(v:number,o:number,r:number):InternalGuardLevel=>v>=r?"red":v>=o?"orange":"green";
export async function getSecurityUsageGrowthGuards():Promise<InternalGuard[]>{
 const db=getDb();
 const [rate,usage,jobs,scans]=await Promise.all([
  db.query(`SELECT COALESCE(SUM(hits),0)::int hits,COUNT(*)::int buckets FROM api_rate_limits WHERE window_start>NOW()-INTERVAL '1 hour'`),
  db.query(`SELECT COUNT(*)::int events,COUNT(DISTINCT user_id)::int users FROM usage_events WHERE created_at>NOW()-INTERVAL '24 hours'`),
  db.query(`SELECT COUNT(*) FILTER (WHERE status IN ('QUEUED','RETRY'))::int waiting,COUNT(*) FILTER (WHERE status='FAILED' AND finished_at>NOW()-INTERVAL '24 hours')::int failed FROM background_jobs`),
  db.query(`SELECT COUNT(*)::int scans,COUNT(DISTINCT user_id)::int users FROM scans WHERE created_at>NOW()-INTERVAL '24 hours'`)
 ]);
 const r=rate.rows[0]||{},u=usage.rows[0]||{},j=jobs.rows[0]||{},s=scans.rows[0]||{};
 const hits=Number(r.hits||0),events=Number(u.events||0),waiting=Number(j.waiting||0),failed=Number(j.failed||0),scanCount=Number(s.scans||0);
 const security=level(hits,1000,3000),usageLevel=level(events,1000,5000);
 const pressure=Math.max(waiting>=200?2:waiting>=50?1:0,failed>=20?2:failed>=5?1:0,scanCount>=2000?2:scanCount>=500?1:0);
 const growth:InternalGuardLevel=pressure===2?"red":pressure===1?"orange":"green";
 return [
  {key:"security_abuse",label:"Security & Abuse Guard",level:security,message:`${hits} rate-limit hits verdeeld over ${Number(r.buckets||0)} buckets in het laatste uur.`,metrics:{rateLimitHits1h:hits,buckets1h:Number(r.buckets||0)}},
  {key:"usage",label:"Usage Guard",level:usageLevel,message:`${events} technische usage-events en ${scanCount} scans in de laatste 24 uur.`,metrics:{events24h:events,usageUsers24h:Number(u.users||0),scans24h:scanCount,scanUsers24h:Number(s.users||0)}},
  {key:"growth_upgrade",label:"Growth & Upgrade Guard",level:growth,message:growth==="green"?"Huidige gemeten workload geeft nog geen structureel upgradesignaal.":growth==="orange"?"Workload groeit; infrastructuurcapaciteit binnenkort beoordelen.":"Workload overschrijdt veilige drempels; infrastructuurupgrade beoordelen.",metrics:{queueWaiting:waiting,failedJobs24h:failed,scans24h:scanCount}}
 ];
}
