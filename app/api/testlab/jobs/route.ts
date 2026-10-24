import {NextResponse} from "next/server";
import {getDb} from "@/lib/db";
import {requireQaTester,ensureQaTables,activeRun,ensureRun,listResults,normalizeImportedResults,scopeSites,qaSites} from "@/lib/qa-testlab-backend";
import {start} from "workflow/api";
import {executeQaTestlab} from "@/workflows/qa-testlab";
export const maxDuration=30;
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
async function snapshot(userId:string) {
 const run=await activeRun(userId);
 const results=run?await listResults(run.id):[];
 return {run:run?{id:run.id,status:run.status,scope:run.scope,commitSha:String(run.commit_sha).trim(),error:run.error,createdAt:run.created_at,updatedAt:run.updated_at}:null,
  results,total:qaSites.length,treated:results.length};
}
export async function GET() {
 const user=await requireQaTester();
 if(!user)return NextResponse.json({error:"QA_INTERNAL_TESTER_REQUIRED"},{status:403,headers:noStore});
 try {return NextResponse.json(await snapshot(user.id),{headers:noStore});}
 catch{return NextResponse.json({error:"QA_DATABASE_UNAVAILABLE"},{status:503,headers:noStore});}
}
export async function POST(request:Request) {
 const user=await requireQaTester();
 if(!user)return NextResponse.json({error:"QA_INTERNAL_TESTER_REQUIRED"},{status:403,headers:noStore});
 const body=await request.json().catch(()=>({}));
 const action=String(body?.action||"");
 try{
  await ensureQaTables();
  if(action==="import"){
   const run=await ensureRun(user.id,"all");

   if(!Array.isArray(body.entries)||body.entries.length>8)return NextResponse.json({error:"IMPORT_FORMAT_INVALID"},{status:400});
   let accepted=0;
   for(const entry of body.entries){
    const sha=typeof entry.sourceSha==="string"?entry.sourceSha:"";
    const rows=normalizeImportedResults(entry.rows,sha);
    for(const row of rows){
     const q=await getDb().query("INSERT INTO qa_testlab_results(run_id,host,payload,source) VALUES($1,$2,$3,'browser_import') ON CONFLICT(run_id,host) DO NOTHING RETURNING host",
       [run.id,row.host,JSON.stringify(row)]);
     accepted+=q.rowCount||0;
    }
   }
   return NextResponse.json({...await snapshot(user.id),imported:accepted},{headers:noStore});
  }
  if(action==="pause"){
   const run=await activeRun(user.id);
   if(run&&["starting","running"].includes(run.status)){
    await getDb().query("UPDATE qa_testlab_runs SET status='paused',updated_at=NOW() WHERE id=$1 AND status IN ('starting','running')",[run.id]);
   }
   return NextResponse.json(await snapshot(user.id),{headers:noStore});
  }
  if(action==="start"){
   const scope=String(body.scope||"all");
   if(!scopeSites(scope).length)return NextResponse.json({error:"INVALID_SCOPE"},{status:400});
   const run=await ensureRun(user.id,scope);
   if(run.status==="starting"||run.status==="running")return NextResponse.json(await snapshot(user.id),{headers:noStore});
   const rows=await listResults(run.id);
   if(scopeSites(scope).every(s=>rows.some(r=>r.host===s.host)))return NextResponse.json(await snapshot(user.id),{headers:noStore});
   // Atomic lease prevents concurrent launches and preserves imported progress.
   const changed=await getDb().query("UPDATE qa_testlab_runs SET status='starting',scope=$2,error=NULL,finished_at=NULL,updated_at=NOW() WHERE id=$1 AND status IN ('paused','error','complete') RETURNING id",[run.id,scope]);
   if(!changed.rows.length)return NextResponse.json(await snapshot(user.id),{headers:noStore});
   try{
    const runHandle=await start(executeQaTestlab,[String(run.id)]);
    await getDb().query("UPDATE qa_testlab_runs SET workflow_run_id=$2,updated_at=NOW() WHERE id=$1",[run.id,String(runHandle.runId)]);
   }catch(e){
    await getDb().query("UPDATE qa_testlab_runs SET status='paused',error=$2,updated_at=NOW() WHERE id=$1",[run.id,"Workflow kon niet worden gestart: "+(e instanceof Error?e.message.slice(0,180):"onbekend")]);
    return NextResponse.json({error:"QA_WORKFLOW_START_FAILED",detail:e instanceof Error?e.message.slice(0,180):""},{status:503,headers:noStore});
   }
   return NextResponse.json(await snapshot(user.id),{headers:noStore});
  }
  return NextResponse.json({error:"UNKNOWN_ACTION"},{status:400});
 }catch(e){
  return NextResponse.json({error:"QA_JOB_FAILED",detail:e instanceof Error?e.message.slice(0,140):""},{status:503,headers:noStore});
 }
}
