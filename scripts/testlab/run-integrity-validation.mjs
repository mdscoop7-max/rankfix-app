#!/usr/bin/env node
// Local QA only: immutable run directory, pinned code/catalog, no ground-truth claims.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {classifyScanAnswer,stopsRun} from '../../lib/testlab-outcome.mjs';
const opt=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1]};
const base=opt('base','http://127.0.0.1:3002'),out=resolve(opt('out','qa-results/integrity-'+Date.now()));
const workers=Number(opt('workers','1'));
if(![1,2].includes(workers))throw Error('Use one or two workers only');
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('LOCAL_QA_ONLY');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
if(branch!=='qa/codex-evidence-integrity-20261109')throw Error('QA_BRANCH_REQUIRED');
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw Error('CLEAN_TRACKED_INPUT_REQUIRED');
const token=readFileSync(opt('token-file','/tmp/rankfix-integrity-session/RankFix-QA/local-session-token.txt'),'utf8').trim();
if(!/^[a-f0-9]{64}$/i.test(token))throw Error('LOCAL_QA_TOKEN_REQUIRED');
const headers={cookie:'rankfix_local_qa='+token,'content-type':'application/json'};
async function request(path,body){
 const response=await fetch(base+path,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(body?360000:30000)});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw Error('NON_JSON_API_RESPONSE:'+response.status)}
 return {status:response.status,data};
}
const version=await request('/api/scan/version');
if(version.status!==200||version.data.environment!=='local'||version.data.commitSha!==sha)throw Error('QA_RUNTIME_COMMIT_MISMATCH');
const catalog=await request('/api/testlab/catalog?catalog=fresh144');
if(catalog.status!==200||catalog.data.catalogId!=='fresh144'||catalog.data.sites?.length!==144)throw Error('INTACT_FRESH144_REQUIRED');
if(existsSync(out))throw Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
mkdirSync(out,{recursive:true});mkdirSync(join(out,'audits'));
const digest=v=>createHash('sha256').update(v).digest('hex');
const catalogRaw=JSON.stringify(catalog.data);writeFileSync(join(out,'catalog.json'),catalogRaw);
const run={format:'rankfix-evidence-integrity-run-v1',commit:sha,branch,runtime:version.data,workers,catalogSha256:digest(catalogRaw),startedAt:new Date().toISOString(),independentValidation:false,accuracy:{industry:null,scanCompleteness:null,errorDetection:null,evidence:null},results:[],state:'running'};
let next=0,infraStops=0,stop=false;
const save=()=>writeFileSync(join(out,'run.json'),JSON.stringify(run,null,2));save();
function measurements(d){
 const pages=d.multiPage?.pageAudits||[];
 const checks=[...(d.seo?.checks||[]).map(c=>({...c,dimension:'seo'})),...(d.geo?.checks||[]).map(c=>({...c,dimension:'geo'}))];
 const unperformed=checks.filter(c=>['unable_to_confirm','not_applicable'].includes(c.status)).map(c=>({dimension:c.dimension,key:c.key,status:c.status,reasonCode:c.reasonCode??null,reason:c.message,source:c.evidence??null}));
 const assessed=checks.filter(c=>['pass','warning','fail'].includes(c.status));
 const recorded=assessed.filter(c=>c.evidence?.url&&c.evidence.found!==null&&c.evidence.found!==undefined&&c.evidence.source);
 return {industry:{sector:d.sectorProfile?.sector??null,key:d.sectorProfile?.key??null,confidence:d.sectorProfile?.confidenceScore??null,operatingRole:d.websiteProfile?.operatingRole??null,correct:null,reviewed:false},
  completeness:{selected:pages.length,contentAssessed:pages.filter(p=>p.status==='audited'&&!p.partialHead&&!p.nonContent).length,headOnly:pages.filter(p=>p.partialHead).length,unconfirmed:pages.filter(p=>p.status!=='audited').length,pages:pages.map(p=>({url:p.url,httpStatus:p.httpStatus,status:p.status,partialHead:p.partialHead||false,nonContent:p.nonContent??null,responseEvidence:p.responseEvidence??null,limitations:p.evidenceChecks?.filter(c=>c.status==='UNABLE_TO_CONFIRM')||[]})),rendering:d.rendering??null},
  evidence:{assessed:assessed.length,recordedFindingShape:recorded.length,independentlyVerified:0,semanticCorrectness:null},
  scores:{seo:d.seo?.score??null,geo:d.geo?.score??null,overall:d.overallScore??null,model:d.scoreModel??null,coverage:d.coverage??null},unperformed};
}
async function worker(){
 while(!stop){
  const index=next++;if(index>=catalog.data.sites.length)return;const site=catalog.data.sites[index],started=Date.now();
  console.log(`${index+1}/144 START ${site.host}`);
  let row;
  try{
   const r=await request('/api/scan',{url:'https://'+site.host+'/',mode:'both',dashboard:true,language:'nl'}),d=r.data;
   const bytes=gzipSync(JSON.stringify(d)),file=site.host.replace(/[^a-z0-9.-]/gi,'_')+'.json.gz';writeFileSync(join(out,'audits',file),bytes);
   const outcome=classifyScanAnswer({ok:r.status>=200&&r.status<300,status:r.status,data:d});
   row={index,host:site.host,expectedProposed:site.expected,apiStatus:r.status,success:r.status===200&&d.success===true,outcome,code:d.code??null,raw:{path:'audits/'+file,sha256:digest(bytes)},...(d.success?measurements(d):{failure:d,unperformed:[{status:'unable_to_confirm',reason:'SCAN_NOT_COMPLETED',code:d.code??null}]}),elapsedMs:Date.now()-started,at:new Date().toISOString()};
   if(!row.success&&stopsRun(outcome)){infraStops++;if(infraStops>=2)stop=true;}else infraStops=0;
  }catch(error){row={index,host:site.host,success:false,runnerError:String(error.message),elapsedMs:Date.now()-started,at:new Date().toISOString(),unperformed:[{status:'unable_to_confirm',reason:'RUNNER_DID_NOT_RECEIVE_SCAN'}]};infraStops++;if(infraStops>=2)stop=true;}
  run.results.push(row);run.results.sort((a,b)=>a.index-b.index);run.updatedAt=new Date().toISOString();save();console.log(`${index+1}/144 END ${site.host} ${row.success?'scan_received':row.code||row.runnerError}`);
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
}
await Promise.all(Array.from({length:workers},worker));
run.state=run.results.length===144?'completed':'stopped_infrastructure';run.finishedAt=new Date().toISOString();
run.summary={attempted:run.results.length,successfulResponses:run.results.filter(r=>r.success).length,failed:run.results.filter(r=>!r.success).length,remaining:144-run.results.length,independentlyReviewed:0};save();console.log(JSON.stringify(run.summary));
if(run.state!=='completed')process.exitCode=1;
