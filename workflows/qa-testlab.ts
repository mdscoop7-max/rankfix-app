import {sleep} from "workflow";
import {getDb} from "@/lib/db";
import {ensureQaTables,qaSites,scopeSites,signWorker,failure,qaReady,type QaResult} from "@/lib/qa-testlab-backend";

// Durable continuation: workflow state lives at Vercel, results live in QA Postgres.
// Each step does one remote scan, so closing the browser cannot cancel it.
export async function executeQaTestlab(jobId:string){
 "use workflow";
 for(let count=0;count<144;count++){
  const outcome=await processNextSite(jobId);
  if(!outcome)break;
  await sleep("8s");
 }
}
async function processNextSite(jobId:string):Promise<boolean>{
 "use step";
 if(!qaReady())throw Error("QA_WORKFLOW_NOT_AUTHORIZED");
 await ensureQaTables();
 const db=getDb();
 const found=await db.query("SELECT id,user_id,commit_sha,scope,status FROM qa_testlab_runs WHERE id=$1",[jobId]);
 const run=found.rows[0];
 if(!run||run.status==="paused"||run.status==="error"||run.status==="complete")return false;
 if(run.status==="starting"){
  await db.query("UPDATE qa_testlab_runs SET status='running',updated_at=NOW() WHERE id=$1 AND status='starting'",[jobId]);
 }else if(run.status!=="running")return false;
 const selected=scopeSites(run.scope);
 if(!selected.length)throw Error("QA_EMPTY_SCOPE");
 const existing=await db.query("SELECT host FROM qa_testlab_results WHERE run_id=$1",[jobId]);
 const done=new Set(existing.rows.map(r=>r.host));
 const site=selected.find(s=>!done.has(s.host));
 if(!site){
  await db.query("UPDATE qa_testlab_runs SET status='complete',finished_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='running'",[jobId]);
  return false;
 }
 const started=Date.now();
 let result:QaResult;
 try{
  const ts=Date.now();
  // The unique preview deployment URL is SSO-protected. The fixed QA alias is public.
  // HMAC and job/commit validation still restrict actual scan execution to internal QA.
  const host="rankfix-app-git-qa-rankfix-shared-preview-scoop5.vercel.app";
  const response=await fetch("https://"+host+"/api/scan",{
   method:"POST",headers:{
    "Content-Type":"application/json",
    "x-rankfix-qa-job":jobId,
    "x-rankfix-qa-time":String(ts),
    "x-rankfix-qa-signature":signWorker(jobId,site.host,ts),
   },
   body:JSON.stringify({url:"https://"+site.host+"/",mode:"both",dashboard:true,language:"nl"}),
   signal:AbortSignal.timeout(285000)
  });
  const data=await response.json().catch(()=>({code:"NON_JSON_SCAN_RESPONSE"}));
  const ok=response.ok&&data?.success===true;
  const code=String(data?.code||data?.errorCode||"");
  const status=ok?"succes":failure(response.status,code);
  result={host:site.host,status,expected:site.expected,
   sector:ok?(data.sectorProfile?.sector||null):null,
   confidence:ok?(data.sectorProfile?.confidenceScore??null):null,
   score:ok?(data.overallScore??null):null,
   seo:ok?(data.seo?.score??null):null,
   geo:ok?(data.geo?.score??null):null,
   http:response.status,
   reason:ok?"":code||String(data.error||"Scan niet bevestigd").slice(0,180),
   elapsedMs:Date.now()-started,
   scanId:ok?(data.scanId||null):null,
   at:new Date().toISOString(),sourceSha:run.commit_sha.trim()};
 }catch(e){
  result={host:site.host,status:"netwerkfout",expected:site.expected,
   sector:null,confidence:null,score:null,seo:null,geo:null,http:0,
   reason:e instanceof Error?e.message.slice(0,180):"Onbekende netwerkfout",
   elapsedMs:Date.now()-started,scanId:null,at:new Date().toISOString(),sourceSha:run.commit_sha.trim()};
 }
 await db.query("INSERT INTO qa_testlab_results(run_id,host,payload,source) VALUES($1,$2,$3,'server_workflow') ON CONFLICT(run_id,host) DO NOTHING",
  [jobId,site.host,JSON.stringify(result)]);
 await db.query("UPDATE qa_testlab_runs SET updated_at=NOW() WHERE id=$1",[jobId]);
 if(["quota","login","infrastructuur"].includes(result.status)){
  await db.query("UPDATE qa_testlab_runs SET status='paused',error=$2,updated_at=NOW() WHERE id=$1",[jobId,"Automatische pauze na "+result.status]);
  return false;
 }
 return true;
}
