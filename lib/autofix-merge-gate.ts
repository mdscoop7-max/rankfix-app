import {readServerPolicy,evaluatePolicy,parseRecordedPolicy} from './merge-policy.ts';
import {evaluateCiEvidence,fetchCheckRuns,fetchCommitStatuses,fetchLatestAttempts} from './merge-check-evidence.ts';
type Gh=<T>(path:string,init?:RequestInit)=>Promise<T>;
type Pull={state?:string;merged?:boolean;draft?:boolean;mergeable?:boolean;mergeable_state?:string;head?:{sha?:string;ref?:string};base?:{sha?:string;ref?:string}};
type Expected={repo:string;prNumber:number;baseBranch:string;branch:string;path:string;approvedBlobSha:string;title:string};
/** No mutation unless two complete, agreeing reads prove GitHub-enforced green CI. */
export async function mergeVerifiedPullRequest(gh:Gh,e:Expected):Promise<{merged:boolean;message:string}> {
 try {
  const prefix=`/repos/${e.repo}`,pullPath=`${prefix}/pulls/${e.prNumber}`;
  const read=async()=>{
   const pr=await gh<Pull>(pullPath);
   if(pr.state!=='open'||pr.merged||pr.draft||!pr.head?.sha||!pr.base?.sha||pr.head.ref!==e.branch||pr.base.ref!==e.baseBranch||pr.mergeable!==true||pr.mergeable_state!=='clean')return null;
   const policy=evaluatePolicy({server:await readServerPolicy(gh,e.repo,e.baseBranch),recorded:parseRecordedPolicy(null),snapshot:null});
   if(policy.verdict!=='ok')return null;
   const [checks,statuses,blob,files]=await Promise.all([
    fetchCheckRuns(gh,e.repo,pr.head.sha),fetchCommitStatuses(gh,e.repo,pr.head.sha),
    gh<{sha?:string}>(`${prefix}/contents/${e.path}?ref=${encodeURIComponent(pr.head.sha)}`),
    gh<Array<{filename?:string;status?:string}>>(`${pullPath}/files?per_page=100`),
   ]);
   if(blob.sha!==e.approvedBlobSha||!Array.isArray(files)||files.length!==1||files[0].filename!==e.path||files[0].status!=='modified')return null;
   const attempts=checks.ok?await fetchLatestAttempts(gh,e.repo,pr.head.sha,checks.runs):{};
   const ci=evaluateCiEvidence({headSha:pr.head.sha,required:{checks:policy.required},checkRuns:checks,statuses,attempts});
   if(ci.verdict!=='ok')return null;
   return {sha:pr.head.sha,base:pr.base.sha,policy:policy.fingerprint};
  };
  const first=await read();if(!first)return {merged:false,message:'MERGE_BLOCKED_UNVERIFIED_REQUIRED_CHECKS'};
  const second=await read();if(!second||JSON.stringify(first)!==JSON.stringify(second))return {merged:false,message:'MERGE_BLOCKED_CHANGED_EVIDENCE'};
  const result=await gh<{merged?:boolean;message?:string}>(`${pullPath}/merge`,{method:'PUT',body:JSON.stringify({sha:second.sha,merge_method:'squash',commit_title:e.title})});
  return {merged:result.merged===true,message:result.message||'MERGE_NOT_CONFIRMED'};
 }catch{return {merged:false,message:'MERGE_BLOCKED_UNREADABLE_EVIDENCE'};}
}
