import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export type JobType="SCAN"|"AI_FIX"|"GITHUB_FIX"|"SEARCH_CONSOLE_SYNC";
export type QueueJob={id:string;user_id:string|null;job_type:JobType;payload:unknown;attempts:number;max_attempts:number};

export async function enqueueJob(input:{userId?:string|null;jobType:JobType;payload?:unknown;dedupeKey?:string|null;priority?:number;maxAttempts?:number}){
 const db=getDb(); const maxAttempts=Math.min(10,Math.max(1,input.maxAttempts??4)); const priority=Math.min(1000,Math.max(0,input.priority??100));
 const result=await db.query(`INSERT INTO background_jobs (user_id,job_type,payload,dedupe_key,priority,max_attempts) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (job_type,dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('QUEUED','RUNNING','RETRY') DO NOTHING RETURNING id,status`,[input.userId??null,input.jobType,JSON.stringify(input.payload??{}),input.dedupeKey??null,priority,maxAttempts]);
 return result.rows[0]??null;
}
export async function claimJobs(limit=5,workerId=randomUUID()):Promise<{workerId:string;jobs:QueueJob[]}>{
 const safeLimit=Math.min(20,Math.max(1,limit)); const result=await getDb().query(`WITH claim AS (SELECT id FROM background_jobs WHERE status IN ('QUEUED','RETRY') AND available_at<=NOW() AND (locked_at IS NULL OR locked_at<NOW()-INTERVAL '15 minutes') ORDER BY priority ASC,created_at ASC FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE background_jobs AS j SET status='RUNNING',locked_at=NOW(),locked_by=$2,attempts=j.attempts+1,updated_at=NOW() FROM claim WHERE j.id=claim.id RETURNING j.id,j.user_id,j.job_type,j.payload,j.attempts,j.max_attempts`,[safeLimit,workerId]);
 return {workerId,jobs:result.rows as QueueJob[]};
}
export async function completeJob(id:string,workerId:string){const result=await getDb().query(`UPDATE background_jobs SET status='SUCCEEDED',finished_at=NOW(),locked_at=NULL,locked_by=NULL,last_error=NULL,updated_at=NOW() WHERE id=$1 AND status='RUNNING' AND locked_by=$2 RETURNING id`,[id,workerId]);return result.rowCount===1;}
export async function failJob(id:string,workerId:string,error:unknown){
 const message=(error instanceof Error?error.message:String(error||"JOB_FAILED")).slice(0,500);
 const result=await getDb().query(`UPDATE background_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'FAILED' ELSE 'RETRY' END,available_at=CASE WHEN attempts>=max_attempts THEN available_at ELSE NOW()+(LEAST(60,POWER(2,LEAST(attempts,5)))::text||' minutes')::interval END,finished_at=CASE WHEN attempts>=max_attempts THEN NOW() ELSE NULL END,locked_at=NULL,locked_by=NULL,last_error=$3,updated_at=NOW() WHERE id=$1 AND status='RUNNING' AND locked_by=$2 RETURNING id,status,attempts,max_attempts,available_at`,[id,workerId,message]);
 return result.rows[0]??null;
}
export async function releaseStaleJobs(){return getDb().query(`UPDATE background_jobs SET status='RETRY',locked_at=NULL,locked_by=NULL,available_at=NOW(),updated_at=NOW(),last_error=COALESCE(last_error,'Worker lease expired') WHERE status='RUNNING' AND locked_at<NOW()-INTERVAL '15 minutes'`);}
