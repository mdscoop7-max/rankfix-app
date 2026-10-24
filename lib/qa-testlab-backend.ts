import {getDb} from "@/lib/db";
import {ensureDatabase} from "@/lib/db-init";
import {getCurrentUser} from "@/lib/auth";
import {isInternalTester} from "@/lib/scan-access";
import {scanRuntime} from "@/lib/scan-runtime";
import a from "@/tests/fixtures/testlab-96/round-a.json" with {type:"json"};
import b from "@/tests/fixtures/testlab-96/round-b.json" with {type:"json"};
import c from "@/tests/fixtures/testlab-96/round-c-nieuw.json" with {type:"json"};
import d from "@/tests/fixtures/testlab-96/round-d-nieuw.json" with {type:"json"};
import e from "@/tests/fixtures/testlab-144/round-e-service-retail.json" with {type:"json"};
import f from "@/tests/fixtures/testlab-144/round-f-service-retail.json" with {type:"json"};
import {createHmac,timingSafeEqual} from "node:crypto";
export type QaSite={host:string;name:string;country:string;expected:string;group:string;round:string};
export type QaResult={host:string;status:string;expected:string;sector:string|null;confidence:number|null;score:number|null;seo:number|null;geo:number|null;http:number;reason:string;elapsedMs:number;scanId:string|null;at:string;sourceSha?:string};
export const qaSites:QaSite[]=[a,b,c,d,e,f].flatMap(r=>r.sites.map(s=>({host:s.hosts[0],name:s.name,country:s.country,expected:s.expected,group:s.group,round:r.id})));
const allowed=new Set(qaSites.map(s=>s.host));
if(qaSites.length!==144||allowed.size!==144)throw Error("QA_CATALOG_INTEGRITY");
export function qaReady(){
 return process.env.VERCEL_ENV==="preview"&&!!scanRuntime().commitSha&&!!process.env.SESSION_SECRET&&!!process.env.RANKFIX_INTERNAL_TEST_USER_ID;
}
export async function requireQaTester(){
 if(!qaReady())return null;
 try{const u=await getCurrentUser();return u&&isInternalTester(u.id)?u:null;}catch{return null;}
}
let prepared:Promise<void>|null=null;
export function ensureQaTables(){
 if(!prepared)prepared=(async()=>{
  await ensureDatabase();
  const db=getDb();
  await db.query("CREATE TABLE IF NOT EXISTS qa_testlab_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, commit_sha CHAR(40) NOT NULL, scope TEXT NOT NULL DEFAULT 'all', status TEXT NOT NULL DEFAULT 'paused' CHECK(status IN ('paused','starting','running','complete','error')), workflow_run_id TEXT, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ)");
  await db.query("CREATE TABLE IF NOT EXISTS qa_testlab_results (run_id UUID NOT NULL REFERENCES qa_testlab_runs(id) ON DELETE CASCADE, host TEXT NOT NULL, payload JSONB NOT NULL, source TEXT NOT NULL CHECK(source IN ('browser_import','server_workflow')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(run_id,host))");
  await db.query("CREATE INDEX IF NOT EXISTS qa_testlab_user_idx ON qa_testlab_runs(user_id,created_at DESC)");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS qa_testlab_active_user_idx ON qa_testlab_runs(user_id) WHERE status IN ('paused','starting','running')");
 })().catch(e=>{prepared=null;throw e});
 return prepared;
}
export async function activeRun(userId:string){
 await ensureQaTables();
 const r=await getDb().query("SELECT * FROM qa_testlab_runs WHERE user_id=$1 ORDER BY (CASE WHEN status IN ('paused','starting','running') THEN 0 ELSE 1 END),created_at DESC LIMIT 1",[userId]);
 return r.rows[0]||null;
}
export async function ensureRun(userId:string,scope="all"){
 let run=await activeRun(userId);
 if(run)return run;
 const found=await getDb().query("INSERT INTO qa_testlab_runs(user_id,commit_sha,scope) VALUES($1,$2,$3) ON CONFLICT (user_id) WHERE status IN ('paused','starting','running') DO NOTHING RETURNING *",[userId,scanRuntime().commitSha,scope]);
 if(found.rows[0])return found.rows[0];
 run=await activeRun(userId);
 if(!run)throw Error("QA_RUN_CREATE_FAILED");
 return run;
}
export async function listResults(runId:string):Promise<QaResult[]>{
 const r=await getDb().query("SELECT payload FROM qa_testlab_results WHERE run_id=$1 ORDER BY created_at,host",[runId]);
 return r.rows.map(x=>x.payload as QaResult);
}
export function normalizeImportedResults(raw:unknown,sourceSha:string):QaResult[]{
 if(!Array.isArray(raw))return [];
 const items=new Map<string,QaResult>();
 for(const val of raw.slice(0,144)){
  if(!val||typeof val!=="object")continue;
  const row=val as Record<string,unknown>;const host=String(row.host||"");
  if(!allowed.has(host)||items.has(host))continue;
  const str=(v:unknown,n=180)=>typeof v==="string"?v.slice(0,n):"";
  const num=(v:unknown,min=0,max=100)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
  const status=str(row.status,40);
  if(!/^(succes|site_geblokkeerd|quota|login|infrastructuur|site_onbereikbaar|timeout|scan_mislukt|netwerkfout)$/.test(status))continue;
  const site=qaSites.find(x=>x.host===host)!;
  items.set(host,{host,status,expected:site.expected,sector:str(row.sector,80)||null,
    confidence:num(row.confidence),score:num(row.score),seo:num(row.seo),geo:num(row.geo),
    http:num(row.http,0,599)||0,reason:str(row.reason,250),elapsedMs:num(row.elapsedMs,0,600000)||0,
    scanId:/^[a-f0-9-]{36}$/i.test(str(row.scanId,36))?String(row.scanId):null,
    at:typeof row.at==="string"&&!Number.isNaN(Date.parse(row.at))?new Date(row.at).toISOString():new Date().toISOString(),
    sourceSha:/^[a-f0-9]{40}$/i.test(sourceSha)?sourceSha:"unknown"});
 }
 return [...items.values()];
}
export function scopeSites(scope:string){
 if(scope==="all")return qaSites;
 if(scope==="new48")return qaSites.filter(x=>/round-[ef]-/.test(x.round));
 if(["hair_salon","optician"].includes(scope))return qaSites.filter(x=>x.group===scope);
 if(/^[A-Z]{2}$/.test(scope))return qaSites.filter(x=>x.country===scope);
 if(/^round-[a-f]/.test(scope))return qaSites.filter(x=>x.round===scope);
 return [];
}
export function failure(status:number,code:string){
 if(/SITE_RATE_LIMITED|HTTP_AUTH_REQUIRED|BLOCKED|CHALLENGE|CAPTCHA|ROBOTS/.test(code))return "site_geblokkeerd";
 if(/WEBSITE_LIMIT|SCAN_LIMIT|QUOTA|RATE_LIMIT/.test(code)||status===402||status===429)return "quota";
 if(status===401||(status===403&&/AUTH|SESSION|LOGIN/.test(code)))return "login";
 if(/DATABASE|INFRASTRUCTURE|DB_|SERVER_CONFIG/.test(code))return "infrastructuur";
 if(/HTTP_NOT_FOUND|HTTP_SERVER_ERROR|SITE_ERROR_PAGE|NON_CONTENT/.test(code))return "site_onbereikbaar";
 if(/TIMEOUT|TIMED_OUT/.test(code))return "timeout";
 return "scan_mislukt";
}
export function signWorker(jobId:string,host:string,timestamp:number){
 return createHmac("sha256",process.env.SESSION_SECRET||"").update(["qa-testlab-v1",jobId,host,String(timestamp)].join("\n")).digest("hex");
}
export async function trustedWorker(request:Request,url:string){
 if(!qaReady())return null;
 try{
  const host=new URL(url).hostname.toLowerCase().replace(/^www\./,"");
  const jobId=request.headers.get("x-rankfix-qa-job")||"",timestamp=Number(request.headers.get("x-rankfix-qa-time")),sig=request.headers.get("x-rankfix-qa-signature")||"";
  if(!allowed.has(host)||!/^[a-f0-9-]{36}$/i.test(jobId)||!Number.isSafeInteger(timestamp)||Math.abs(Date.now()-timestamp)>300000||!/^[a-f0-9]{64}$/.test(sig))return null;
  if(!timingSafeEqual(Buffer.from(sig,"hex"),Buffer.from(signWorker(jobId,host,timestamp),"hex")))return null;
  await ensureQaTables();
  const job=await getDb().query("SELECT user_id FROM qa_testlab_runs WHERE id=$1 AND status='running' AND commit_sha=$2",[jobId,scanRuntime().commitSha]);
  if(!job.rows.length||!isInternalTester(job.rows[0].user_id))return null;
  const u=await getDb().query("SELECT id,customer_id,email,name,plan_code,subscription_status,created_at FROM users WHERE id=$1",[job.rows[0].user_id]);
  return u.rows[0]||null;
 }catch{return null;}
}
