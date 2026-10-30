#!/usr/bin/env node
// Local-only, read-only QA runner for the fresh144 catalog. Requires the existing local QA server.
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {summarizeScanResponse,EVIDENCE_EXPORT_VERSION} from '../../lib/testlab-evidence-export.mjs';
import {sectorVerdict} from './labels.mjs';
import {classifyScanAnswer,stopsRun} from '../../lib/testlab-outcome.mjs';
const base='http://127.0.0.1:3002';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tokenPath=join(process.env.LOCALAPPDATA||'', 'RankFix-QA','local-session-token.txt');
if(!existsSync(tokenPath))throw Error('Lokale QA-token ontbreekt. Start eerst Start-RankFix-TestLab.cmd (servervenster open laten).');
const token=readFileSync(tokenPath,'utf8').trim();
if(!/^[a-f0-9]{64}$/i.test(token))throw Error('Ongeldige lokale QA-token.');
const headers={cookie:'rankfix_local_qa='+token,'content-type':'application/json'};
async function request(path,body,timeout=25000){
 const res=await fetch(base+path,{method:body?'POST':'GET',headers,signal:AbortSignal.timeout(timeout),...(body?{body:JSON.stringify(body)}:{})});
 const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{throw Error('Geen JSON van lokale RankFix-server (HTTP '+res.status+')')}
 return {status:res.status,data};
}
const output=resolve('qa-results','fresh144-latest');mkdirSync(output,{recursive:true});
const file=join(output,'fresh144.json');
const report=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{catalogId:'fresh144',startedAt:new Date().toISOString(),results:[]};
const save=()=>{writeFileSync(file+'.tmp',JSON.stringify(report,null,2));renameSync(file+'.tmp',file)};
const fail=(stage,error)=>{report.lastError={stage,message:String(error.message||error),at:new Date().toISOString()};save();console.error('QA fout ('+stage+'): '+report.lastError.message);console.error('Rapport: '+file);process.exit(1)};
report.currentCommit=sha;report.updatedAt=new Date().toISOString();save();
let version;try{version=await request('/api/scan/version')}catch(e){fail('server/version',e)}
if(version.status!==200||version.data.environment!=='local'||version.data.commitSha!==sha)fail('server/version',new Error('QA-server draait niet op deze commit. Sluit oude server af en start opnieuw.'));
let catalog;try{catalog=await request('/api/testlab/catalog?catalog=fresh144')}catch(e){fail('catalog',e)}
if(catalog.status!==200||catalog.data.catalogId!=='fresh144'||catalog.data.sites?.length!==144)fail('catalog',new Error('Geen toegang tot de juiste fresh144-catalogus (HTTP '+catalog.status+').'));
if(report.catalogId!=='fresh144')fail('report',new Error('Onverwachte rapportcatalogus.'));
// Keep earlier runs for before/after comparison instead of dropping them.
const older=report.results.filter(x=>x.commitSha!==sha);
if(older.length){const prevSha=older[0].commitSha||'unknown';const archive=join(output,'fresh144-'+String(prevSha).slice(0,12)+'.json');if(!existsSync(archive))writeFileSync(archive,JSON.stringify({...report,results:older},null,2));}
report.results=report.results.filter(x=>x.commitSha===sha);report.lastError=null;save();
// Full scan responses (success AND failure bodies) per site, for evidence review.
const auditDir=join(output,'audits-'+sha.slice(0,12));mkdirSync(auditDir,{recursive:true});
const auditFile=(host)=>join(auditDir,host.replace(/[^a-z0-9.-]/gi,'_')+'.json.gz');
const siteByHost=new Map(catalog.data.sites.map(x=>[x.host,x]));
const writeEvidence=()=>{
 const rows=catalog.data.sites.map(site=>{
  const r=report.results.find(x=>x.host===site.host)||null;let audit=null;
  if(r&&existsSync(auditFile(site.host))){try{audit=JSON.parse(gunzipSync(readFileSync(auditFile(site.host))).toString('utf8'))}catch{}}
  const ok=r?.status==='success'&&audit?.success===true;
  return {host:site.host,name:site.name??null,expected:site.expected,run:r?{status:r.status,apiStatus:r.apiStatus??null,reason:r.reason??null,elapsedMs:r.elapsedMs,at:r.at}:null,
   verdict:ok?sectorVerdict(site.expected,{sector:audit.sectorProfile?.sector,key:audit.sectorProfile?.key,websiteType:audit.websiteProfile?.websiteType?.value}).verdict:null,
   evidenceState:!r?'not_tested':ok?'available':audit?'scan_not_successful':'no_audit',
   failure:!ok&&audit?{code:audit.code??null,error:String(audit.error||'').slice(0,300),httpStatus:audit.httpStatus??null,incident:audit.incident??null,access:audit.access??null,traceId:audit.traceId??null}:null,
   evidence:ok?summarizeScanResponse(audit):null};
 });
 writeFileSync(join(output,'fresh144-evidence-'+sha.slice(0,12)+'.json'),JSON.stringify({exportVersion:EVIDENCE_EXPORT_VERSION,source:'terminal-runner',commitSha:sha,generatedAt:new Date().toISOString(),labels:'proposed_not_independently_verified',rows},null,1));
};
console.log('RankFix QA: 144 websites | versie '+sha.slice(0,12)+' | resultaten: '+file);
let consecutiveFailures=0;
for(const [index,site] of catalog.data.sites.entries()){
 if(report.results.some(x=>x.host===site.host&&(x.status==='success'||x.status==='website_outcome')))continue;
 console.log((index+1)+'/144 '+site.host);
 const started=Date.now();let row;
 try{
  const response=await request('/api/scan',{url:'https://'+site.host+'/',mode:'both',dashboard:true,language:'nl'},330000);
  const d=response.data;
  const success=response.status===200&&d.success===true;
  // Website outcomes (blocked, timeout, not found) are final results for that site;
  // only RankFix-side problems (session, quota, infrastructure) are retried/stop the run.
  const outcome=classifyScanAnswer({ok:response.status>=200&&response.status<300,status:response.status,data:d});
  const runnerSide=!success&&stopsRun(outcome);
  try{writeFileSync(auditFile(site.host),gzipSync(JSON.stringify(d)))}catch{}
  row={commitSha:sha,host:site.host,expected:site.expected,status:success?'success':runnerSide?'api_error':'website_outcome',apiStatus:response.status,reason:success?null:(d.code||d.error||'UNKNOWN'),outcome,scanId:d.scanId||null,sector:d.sectorProfile?.primarySector||d.sectorProfile?.sector||null,score:d.overallScore??null,seo:d.seo?.score??null,geo:d.geo?.score??null,elapsedMs:Date.now()-started,at:new Date().toISOString(),pending:runnerSide};
 }catch(e){
  row={commitSha:sha,host:site.host,expected:site.expected,status:'connection_error',reason:String(e.message||e),scanId:null,elapsedMs:Date.now()-started,at:new Date().toISOString(),pending:true};
 }
 report.results=report.results.filter(x=>x.host!==site.host);report.results.push(row);
 try{writeEvidence()}catch(e){console.warn('Bewijsbestand niet bijgewerkt: '+e.message)}
 report.updatedAt=new Date().toISOString();
 report.summary={attempted:report.results.length,success:report.results.filter(x=>x.status==='success').length,technicalFailures:report.results.filter(x=>x.pending).length,websiteOutcomes:report.results.filter(x=>x.status==='website_outcome').length,remaining:144-report.results.filter(x=>x.status==='success'||x.status==='website_outcome').length};
 save();
 const csvHeaders=['host','expected','status','apiStatus','reason','scanId','sector','score','seo','geo','elapsedMs','at'];
 const csvValue=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 writeFileSync(join(output,'fresh144.csv'),[csvHeaders.join(','),...report.results.map(x=>csvHeaders.map(k=>csvValue(x[k])).join(','))].join('\n')+'\n');
 if(row.pending){
  consecutiveFailures++;
  console.warn('Technische fout bij '+site.host+': '+row.reason+'; niet als websitefout beoordeeld. JSON bewaard.');
  if(consecutiveFailures>=2){
   console.error('Twee opeenvolgende technische fouten. QA gestopt om de lokale server niet te overbelasten.');
   process.exitCode=1;break;
  }
 }else consecutiveFailures=0;
 await new Promise(r=>setTimeout(r,Number(process.env.RF_QA_PAUSE_MS??8000)));
}
try{writeEvidence()}catch{}
console.log('Resultaten: '+file);
console.log('Bewijs (voeg dit bestand toe in de chat): '+join(output,'fresh144-evidence-'+sha.slice(0,12)+'.json'));
