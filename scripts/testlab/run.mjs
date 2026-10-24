#!/usr/bin/env node
// QA-only authenticated regression runner. Never changes sites or production.
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareSector,failureCategory} from './labels.mjs';
import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2);
const arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const dir=fileURLToPath(new URL('../../tests/fixtures/testlab-96/',import.meta.url));
const legacyPlans=['round-a.json','round-b.json','round-c-nieuw.json','round-d-nieuw.json'].map(f=>JSON.parse(readFileSync(join(dir,f),'utf8')));
const newDir=fileURLToPath(new URL('../../tests/fixtures/testlab-144/',import.meta.url));
const newPlans=['round-e-service-retail.json','round-f-service-retail.json'].map(f=>JSON.parse(readFileSync(join(newDir,f),'utf8')));
const legacy=legacyPlans.flatMap(p=>p.sites.map(s=>({...s,round:p.id})));
const extra=newPlans.flatMap(p=>p.sites.map(s=>({...s,round:p.id})));
const all=[...legacy,...extra];
if(legacy.length!==96||extra.length!==48||all.length!==144||new Set(all.map(s=>s.hosts[0].replace(/^www\./,''))).size!==144)throw Error('TestLab needs 144 unique websites (96 baseline + 48 new)');
const phase=arg('--phase','targeted');
if(!['targeted','all','new48','lab144'].includes(phase))throw Error('Use --phase targeted, all (legacy 96), new48, or lab144');
// Existing targeted/all baseline is preserved. The 144-lab is manually started.
const selected=phase==='all'?legacy:phase==='lab144'?all:phase==='new48'?extra:legacy.filter(s=>s.round.endsWith('-nieuw'));
// --local explicitly opts into a loopback-only runner. The default remains QA-preview-only.
const local=args.includes('--local');
const base=local?(process.env.RF_BASE_URL||'http://localhost:3000'):(process.env.RF_BASE_URL||'https://rankfix-app-git-qa-rankfix-shared-preview-scoop5.vercel.app');
const origin=new URL(base);
if(origin.origin!==base||origin.pathname!=='/'||origin.search||origin.hash)throw Error('RF_BASE_URL must be an origin without a path');
if(local){
 if(origin.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw Error('--local permits loopback HTTP only, never a remote host');
} else if(origin.hostname!=='rankfix-app-git-qa-rankfix-shared-preview-scoop5.vercel.app'||origin.protocol!=='https:')throw Error('Only the fixed QA preview is allowed');

if(!['targeted','all','new48','lab144'].includes(phase))throw Error('Unknown phase');
if(args.includes('--dry-run')){console.log(JSON.stringify({phase,total:selected.length,uniqueTotal:all.length,base,labels:'proposed_not_independently_verified',sites:selected},null,2));process.exit(0)}
const sha=local?execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim():process.env.RF_DEPLOYMENT_SHA;
if(!/^[a-f0-9]{40}$/i.test(sha||''))throw Error('A verified full QA commit is required');
if(local){
 const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
 if(branch!=='qa/rankfix-shared-preview')throw Error('Local TestLab requires the qa/rankfix-shared-preview branch');
}
if(!/^[a-f0-9]{64}$/.test(process.env.RF_SESSION||''))throw Error('An authenticated RF_SESSION for the isolated QA tester is required');
const headers={'content-type':'application/json',cookie:'rankfix_session='+process.env.RF_SESSION,
 ...(process.env.VERCEL_BYPASS?{'x-vercel-protection-bypass':process.env.VERCEL_BYPASS}:{}),
 ...(process.env.VERCEL_OIDC_TOKEN?{'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}:{})};
async function request(path,body,timeout=25000){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers,redirect:'manual',signal:AbortSignal.timeout(timeout),...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await r.json()}catch{throw Error('Non-JSON QA response; check preview access')}
 return {status:r.status,data};
}
const auth=await request('/api/auth/me');if(auth.status!==200||!auth.data?.user)throw Error('QA authentication not confirmed; no scans started');
const version=await request('/api/scan/version');if(version.status!==200||version.data?.commitSha!==sha||version.data?.environment!==(local?'local':'preview'))throw Error('QA version/environment not confirmed; no scans started');
const output=resolve(arg('--output',local?join(process.env.LOCALAPPDATA||process.env.TEMP||'.',`rankfix-testlab-${sha.slice(0,8)}`):`/tmp/rankfix-testlab-${sha.slice(0,8)}`));mkdirSync(output,{recursive:true});
const lock=join(output,'.running.lock');
const lockFd=openSync(lock,'wx');
try {
const filename=join(output,phase+'.json');
const report=existsSync(filename)?JSON.parse(readFileSync(filename,'utf8')):{phase,runtime:version.data,startedAt:new Date().toISOString(),finishedAt:null,sites:[]};
if(report.runtime.commitSha!==sha)throw Error('Output belongs to another commit');
if(phase==='all'){
 const prior=join(output,'targeted.json');
 if(!existsSync(prior)||JSON.parse(readFileSync(prior,'utf8')).runtime.commitSha!==sha||!JSON.parse(readFileSync(prior,'utf8')).finishedAt)throw Error('Complete targeted retests on the same SHA before all 96');
}
const save=()=>{writeFileSync(filename+'.tmp',JSON.stringify(report,null,2));renameSync(filename+'.tmp',filename)};
for(const site of selected){
 // Final rows (report or a website outcome) are kept; a pending row (RankFix
 // session/quota/infrastructure or lost connection) is scanned again.
 if(report.sites.some(r=>r.host===site.hosts[0]&&!r.pending))continue;
 const started=Date.now();let r;
 try{r=await request('/api/scan',{url:'https://'+site.hosts[0]+'/',mode:'both',language:'nl',dashboard:true},330000)}catch(e){r={status:0,data:{code:'CLIENT_TIMEOUT_OR_NETWORK',error:e.message}}}
 if(r.data?.success&&r.data?.runtime?.commitSha!==sha)throw Error('QA changed during the test; no comparison is valid');
 const success=r.status===200&&r.data?.success===true;
 const row={host:site.hosts[0],name:site.name,country:site.country,round:site.round,status:success?'success':failureCategory(r.status,r.data?.code||''),httpStatus:r.status,code:r.data?.code||null,diagnosis:success?null:(r.data?.diagnosis||null),
  // Why a scan ended without report, or how the report was obtained (no secrets).
  failure:success?null:{blockKind:r.data?.blockKind||null,nonContent:r.data?.nonContent||null,saveFailure:r.data?.saveFailure||null,recovery:r.data?.recovery||null},
  access:success?(r.data?.access||null):null,rendering:success?{mode:r.data?.rendering?.mode||null,fallbackReason:r.data?.rendering?.fallbackReason||null}:null,
  sampleRetryPass:success?(r.data?.multiPage?.sampleRetryPass||null):null,elapsedMs:Date.now()-started,
  comparison:success?compareSector(site.expected,r.data.sectorProfile):null,
  score:success?{overall:r.data.overallScore,seo:r.data.seo?.score,geo:r.data.geo?.score,evidenceLevel:r.data.scoreModel?.evidenceLevel}:null,
  coverage:r.data.multiPage?.coverageDimensions||null,sectorEvidence:r.data.sectorProfile||null,speed:r.data.websiteSpeed||null,
  // Website status, RankFix API status, reason code and who caused it, kept apart.
  incident:success?null:(r.data?.incident||{traceId:r.data?.traceId||null,originHttpStatus:typeof r.data?.httpStatus==='number'?r.data.httpStatus:null,apiHttpStatus:r.status,reasonCode:r.data?.code||null,attribution:null,phase:null}),
  pending:['quota','auth','infrastructure'].includes(failureCategory(r.status,r.data?.code||'',r.data?.incident?.attribution))||r.status===0};
 if(!success)row.status=failureCategory(r.status,r.data?.code||'',r.data?.incident?.attribution);
 report.sites=report.sites.filter(r=>r.host!==row.host);report.sites.push(row);save();
 console.log(`${phase} ${report.sites.length}/${selected.length} ${row.name}: ${row.status}`);
 if(row.pending)throw Error(`Stopped on QA ${row.status}; ${row.host} not judged and will be scanned again on resume`);
 await new Promise(r=>setTimeout(r,8000));
}
report.finishedAt=new Date().toISOString();
report.summary={attempted:report.sites.length,completed:report.sites.filter(r=>r.status==='success').length,sectorAgreement:report.sites.filter(r=>r.comparison?.sectorMatch).length,subtypeAgreement:report.sites.filter(r=>r.comparison?.subtypeMatch).length,unconfirmed:report.sites.filter(r=>r.comparison?.observed==='unknown').length};save();console.log(JSON.stringify(report.summary));

} finally {closeSync(lockFd);unlinkSync(lock)}
