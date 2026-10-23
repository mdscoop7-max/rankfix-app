#!/usr/bin/env node
// QA-only authenticated regression runner. Never changes sites or production.
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareSector,failureCategory} from './labels.mjs';
const args=process.argv.slice(2);
const arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const dir=fileURLToPath(new URL('../../tests/fixtures/testlab-96/',import.meta.url));
const plans=['round-a.json','round-b.json','round-c-nieuw.json','round-d-nieuw.json'].map(f=>JSON.parse(readFileSync(join(dir,f),'utf8')));
const all=plans.flatMap(p=>p.sites.map(s=>({...s,round:p.id})));
if(all.length!==96||new Set(all.map(s=>s.hosts[0])).size!==96)throw Error('96 unique sites required');
const phase=arg('--phase','targeted');
if(!['targeted','all'].includes(phase))throw Error('Use --phase targeted or all');
// Start with previously problematic sector groups. No hidden holdout is read.
const selected=phase==='all'?all:all.filter(s=>s.round.endsWith('-nieuw'));
const base=process.env.RF_BASE_URL||'https://rankfix-app-git-qa-rankfix-shared-preview-scoop5.vercel.app';
if(new URL(base).origin!==base||new URL(base).hostname!=='rankfix-app-git-qa-rankfix-shared-preview-scoop5.vercel.app')throw Error('Only the fixed QA preview is allowed');
if(args.includes('--dry-run')){console.log(JSON.stringify({phase,total:selected.length,uniqueTotal:all.length,base,labels:'proposed_not_independently_verified',sites:selected},null,2));process.exit(0)}
const sha=process.env.RF_DEPLOYMENT_SHA;
if(!/^[a-f0-9]{40}$/i.test(sha||''))throw Error('RF_DEPLOYMENT_SHA must be the verified full QA commit');
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
const version=await request('/api/scan/version');if(version.status!==200||version.data?.commitSha!==sha||version.data?.environment!=='preview')throw Error('QA version/environment not confirmed; no scans started');
const output=resolve(arg('--output',`/tmp/rankfix-186-${sha.slice(0,8)}`));mkdirSync(output,{recursive:true});
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
 if(report.sites.some(r=>r.host===site.hosts[0]&&r.status==='success'))continue;
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
  coverage:r.data.multiPage?.coverageDimensions||null,sectorEvidence:r.data.sectorProfile||null,speed:r.data.websiteSpeed||null};
 report.sites=report.sites.filter(r=>r.host!==row.host);report.sites.push(row);save();
 console.log(`${phase} ${report.sites.length}/${selected.length} ${row.name}: ${row.status}`);
 if(['quota','auth','infrastructure'].includes(row.status))throw Error(`Stopped on QA ${row.status}; target website not blamed`);
 await new Promise(r=>setTimeout(r,8000));
}
report.finishedAt=new Date().toISOString();
report.summary={attempted:report.sites.length,completed:report.sites.filter(r=>r.status==='success').length,sectorAgreement:report.sites.filter(r=>r.comparison?.sectorMatch).length,subtypeAgreement:report.sites.filter(r=>r.comparison?.subtypeMatch).length,unconfirmed:report.sites.filter(r=>r.comparison?.observed==='unknown').length};save();console.log(JSON.stringify(report.summary));

} finally {closeSync(lockFd);unlinkSync(lock)}
