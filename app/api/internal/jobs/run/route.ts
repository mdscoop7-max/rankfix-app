import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db-init";
import { claimJobs,completeJob,failJob,releaseStaleJobs } from "@/lib/job-queue";

const DEFAULT_BATCH=3;
function authorized(request:Request){const secret=process.env.MONITOR_SECRET;return Boolean(secret&&request.headers.get("authorization")===`Bearer ${secret}`)}
function batchSize(){const n=Number(process.env.JOB_WORKER_BATCH||DEFAULT_BATCH);return Number.isFinite(n)?Math.min(10,Math.max(1,Math.floor(n))):DEFAULT_BATCH;}

async function execute(job:{job_type:string;payload:unknown}){
  // Worker infrastructure is deliberately fail-closed until each heavy action
  // is migrated from its existing synchronous route. This prevents a queued
  // job from silently duplicating a customer scan/fix.
  switch(job.job_type){
    default: throw new Error("JOB_HANDLER_NOT_ENABLED");
  }
}

async function run(request:Request){
  if(!authorized(request)) return NextResponse.json({error:"Niet toegestaan."},{status:401});
  await ensureDatabase();
  // Recover abandoned leases here too, so queue recovery does not depend on
  // Health Guard being scheduled independently.
  await releaseStaleJobs().catch(error=>console.error("Queue stale-job recovery failed",error instanceof Error?error.message:"QUEUE_RECOVERY_FAILED"));
  const {workerId,jobs}=await claimJobs(batchSize());
  const results:{id:string;status:string}[]=[];
  for(const job of jobs){
    try{await execute(job);await completeJob(job.id,workerId);results.push({id:job.id,status:"SUCCEEDED"});}
    catch(error){const state=await failJob(job.id,workerId,error);results.push({id:job.id,status:String(state?.status||"RETRY")});}
  }
  return NextResponse.json({claimed:jobs.length,results});
}
export async function GET(request:Request){return run(request)}
export async function POST(request:Request){return run(request)}
